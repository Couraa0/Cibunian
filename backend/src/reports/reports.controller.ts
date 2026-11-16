import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { dateRange, DateRangeDto } from '../common/date-range.dto.js';
import {
  MovementType,
  OrganicMethod,
  OrganicRecordType,
  PickupStatus,
  Prisma,
  RequestStatus,
  WasteGroup,
  WeighingStatus,
} from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma.service.js';

const ZERO = new Prisma.Decimal(0);
const WIB = 7 * 60 * 60 * 1000; // selisih waktu Indonesia Barat dari UTC
const TREND_MONTHS = 6;
const sum = (values: (Prisma.Decimal | null | undefined)[]) =>
  values.reduce<Prisma.Decimal>((total, v) => total.add(v ?? 0), ZERO);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /** Ringkasan dampak: terkumpul, dipindahkan, terjual, dan hasil pilot pengolahan. */
  async summary(query: DateRangeDto) {
    const range = dateRange(query);
    const [
      categories,
      points,
      byCategory,
      byPoint,
      moved,
      sold,
      organic,
      fedFromStock,
      plastic,
      households,
      compost,
      byHousehold,
    ] =
      await Promise.all([
        this.prisma.wasteCategory.findMany(),
        this.prisma.collectionPoint.findMany({ orderBy: { name: 'asc' } }),
        this.prisma.collectionTransaction.groupBy({
          by: ['wasteCategoryId'],
          where: { recordedAt: range },
          _sum: { weightKg: true },
        }),
        this.prisma.collectionTransaction.groupBy({
          by: ['collectionPointId'],
          where: { recordedAt: range },
          _sum: { weightKg: true },
          _count: true,
        }),
        this.prisma.pickupSchedule.aggregate({
          where: { status: PickupStatus.DONE, scheduledAt: range },
          _sum: { movedWeightKg: true },
          _count: true,
        }),
        this.prisma.sale.aggregate({
          where: { soldAt: range },
          _sum: { weightKg: true, totalAmount: true },
          _count: true,
        }),
        this.prisma.organicRecord.groupBy({
          by: ['type'],
          where: { recordedAt: range },
          _sum: { weightKg: true },
        }),
        // Pakan yang diambil dari stok organik RUNA; sisanya berasal dari mitra (restoran, hotel).
        this.prisma.organicRecord.aggregate({
          where: {
            recordedAt: range,
            type: OrganicRecordType.FEEDING,
            wasteCategoryId: { not: null },
          },
          _sum: { weightKg: true },
        }),
        this.prisma.plasticExperiment.aggregate({
          where: { conductedAt: range },
          _sum: { plasticWeightKg: true, prototypeCount: true },
          _count: true,
        }),
        this.prisma.household.findMany({
          select: { id: true, name: true, rt: true, rw: true, active: true },
        }),
        this.prisma.organicRecord.aggregate({
          where: {
            recordedAt: range,
            type: OrganicRecordType.HARVEST,
            batch: { method: OrganicMethod.KOMPOS },
          },
          _sum: { weightKg: true },
        }),
        // Partisipasi nasabah (pilot per KK): siapa yang setor dalam periode ini.
        this.prisma.collectionTransaction.groupBy({
          by: ['householdId'],
          where: { recordedAt: range, householdId: { not: null } },
          _sum: { weightKg: true, creditAmount: true },
          _count: true,
        }),
      ]);

    const collectedByCategory = byCategory
      .map((row) => {
        const category = categories.find((c) => c.id === row.wasteCategoryId);
        return {
          id: row.wasteCategoryId,
          name: category?.name ?? '-',
          group: category?.group,
          weightKg: row._sum.weightKg ?? ZERO,
        };
      })
      .sort((a, b) => b.weightKg.cmp(a.weightKg));
    const organicKg = (type: OrganicRecordType) =>
      organic.find((o) => o.type === type)?._sum.weightKg ?? ZERO;

    return {
      collected: {
        totalKg: sum(collectedByCategory.map((c) => c.weightKg)),
        count: byPoint.reduce((n, p) => n + p._count, 0),
        byCategory: collectedByCategory,
        // Keempat titik selalu tampil, termasuk yang belum ada aktivitas.
        byPoint: points.map((p) => {
          const row = byPoint.find((b) => b.collectionPointId === p.id);
          return {
            id: p.id,
            name: p.name,
            weightKg: row?._sum.weightKg ?? ZERO,
            count: row?._count ?? 0,
          };
        }),
      },
      moved: { totalKg: moved._sum.movedWeightKg ?? ZERO, count: moved._count },
      sold: {
        totalKg: sold._sum.weightKg ?? ZERO,
        totalAmount: sold._sum.totalAmount ?? ZERO,
        count: sold._count,
      },
      organic: {
        feedingKg: organicKg(OrganicRecordType.FEEDING),
        feedingFromStockKg: fedFromStock._sum.weightKg ?? ZERO,
        // Panen larva = semua panen dikurangi panen kompos.
        harvestKg: organicKg(OrganicRecordType.HARVEST).sub(
          compost._sum.weightKg ?? ZERO,
        ),
        frassKg: organicKg(OrganicRecordType.FRASS),
        compostKg: compost._sum.weightKg ?? ZERO,
      },
      plastic: {
        processedKg: plastic._sum.plasticWeightKg ?? ZERO,
        experiments: plastic._count,
        prototypes: plastic._sum.prototypeCount ?? 0,
      },
      participation: {
        registered: households.filter((h) => h.active).length,
        depositing: byHousehold.length,
        byHousehold: byHousehold
          .map((row) => {
            const h = households.find((x) => x.id === row.householdId);
            return {
              id: row.householdId!,
              name: h?.name ?? '-',
              rt: h?.rt ?? null,
              rw: h?.rw ?? null,
              count: row._count,
              weightKg: row._sum.weightKg ?? ZERO,
              creditAmount: row._sum.creditAmount ?? ZERO,
            };
          })
          .sort((a, b) => b.weightKg.cmp(a.weightKg)),
      },
      previous: await this.previousTotals(query),
    };
  }

  /**
   * Total periode tepat sebelum rentang yang diminta, dengan panjang yang sama, untuk
   * pembanding naik/turun. Hanya bila rentang lengkap (from dan to).
   */
  private async previousTotals({ from, to }: DateRangeDto) {
    if (!from || !to) return null;
    const start = new Date(from).getTime();
    const length = new Date(to).getTime() - start;
    if (!(length > 0)) return null;
    const range = { gte: new Date(start - length), lt: new Date(start) };
    const [collected, sold, depositing] = await Promise.all([
      this.prisma.collectionTransaction.aggregate({
        where: { recordedAt: range },
        _sum: { weightKg: true },
      }),
      this.prisma.sale.aggregate({
        where: { soldAt: range },
        _sum: { weightKg: true, totalAmount: true },
      }),
      this.prisma.collectionTransaction.groupBy({
        by: ['householdId'],
        where: { recordedAt: range, householdId: { not: null } },
      }),
    ]);
    return {
      collectedKg: collected._sum.weightKg ?? ZERO,
      soldKg: sold._sum.weightKg ?? ZERO,
      soldAmount: sold._sum.totalAmount ?? ZERO,
      depositingHouseholds: depositing.length,
    };
  }

  /**
   * Ke mana material yang terkumpul pergi, dihitung dari ledger stok. Kategori kelompok
   * Produk tidak ikut: itu hasil pengolahan, bukan material yang dikumpulkan.
   */
  private async materialFlow() {
    const [categories, sums] = await Promise.all([
      this.prisma.wasteCategory.findMany({ select: { id: true, group: true } }),
      this.prisma.inventoryMovement.groupBy({
        by: ['wasteCategoryId', 'type'],
        _sum: { quantityKg: true },
      }),
    ]);
    const products = new Set(
      categories.filter((c) => c.group === WasteGroup.PRODUK).map((c) => c.id),
    );
    const material = sums.filter((s) => !products.has(s.wasteCategoryId));
    const total = (type?: MovementType) =>
      sum(
        material
          .filter((s) => !type || s.type === type)
          .map((s) => s._sum.quantityKg),
      );
    return {
      soldKg: total(MovementType.SALE).abs(),
      processedKg: total(MovementType.PROCESSING).abs(),
      stockKg: total(),
    };
  }

  /** Tren bulanan (waktu Indonesia Barat): pengumpulan per titik dan kategori, serta penjualan. */
  async analytics() {
    // Tanggal WIB dibaca lewat getter UTC dari waktu yang sudah digeser.
    const now = new Date(Date.now() + WIB);
    const monthStart = (back: number) =>
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1);
    const months = Array.from({ length: TREND_MONTHS }, (_, i) =>
      new Date(monthStart(TREND_MONTHS - 1 - i)).toISOString().slice(0, 7),
    );
    const since = new Date(monthStart(TREND_MONTHS - 1) - WIB);

    const [points, categories, collected, sold] = await Promise.all([
      this.prisma.collectionPoint.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.wasteCategory.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, group: true },
      }),
      this.prisma.$queryRaw<
        { month: string; pointId: string; categoryId: string; weightKg: number }[]
      >`
        SELECT to_char(("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month,
               "collectionPointId" AS "pointId",
               "wasteCategoryId" AS "categoryId",
               SUM("weightKg")::float8 AS "weightKg"
        FROM collection_transactions
        WHERE "recordedAt" >= ${since}
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<
        { month: string; weightKg: number; amount: number }[]
      >`
        SELECT to_char(("soldAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month,
               SUM("weightKg")::float8 AS "weightKg",
               SUM("totalAmount")::float8 AS amount
        FROM sales_transactions
        WHERE "soldAt" >= ${since}
        GROUP BY 1`,
    ]);

    // Dijumlah dalam gram bulat supaya tidak muncul sisa pecahan biner (12.300000000001).
    const monthly = (match: (row: (typeof collected)[number]) => boolean) =>
      months.map(
        (month) =>
          collected
            .filter((row) => row.month === month && match(row))
            .reduce((total, row) => total + Math.round(row.weightKg * 1000), 0) /
          1000,
      );
    return {
      months,
      collectedKg: monthly(() => true),
      // Keempat titik selalu tampil; kategori hanya yang punya pengumpulan.
      byPoint: points.map((p) => ({
        ...p,
        monthlyKg: monthly((row) => row.pointId === p.id),
      })),
      byCategory: categories
        .map((c) => ({
          ...c,
          monthlyKg: monthly((row) => row.categoryId === c.id),
        }))
        .filter((c) => c.monthlyKg.some((kg) => kg > 0)),
      sales: months.map((month) => {
        const row = sold.find((s) => s.month === month);
        return { weightKg: row?.weightKg ?? 0, amount: row?.amount ?? 0 };
      }),
    };
  }

  async dashboard() {
    const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const [summary, flow, stock, upcomingPickups, pendingWeighings, pendingRequests, trend] =
      await Promise.all([
        this.summary({}),
        this.materialFlow(),
        this.inventory.stock(),
        this.prisma.pickupSchedule.findMany({
          where: {
            status: { in: [PickupStatus.SCHEDULED, PickupStatus.IN_PROGRESS] },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 5,
          include: {
            collectionPoint: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        }),
        this.prisma.weighingRecord.count({
          where: { status: WeighingStatus.PENDING },
        }),
        this.prisma.marketplaceRequest.count({
          where: { status: RequestStatus.PENDING },
        }),
        // Total harian 14 hari terakhir, dikelompokkan per hari waktu Indonesia Barat.
        this.prisma.$queryRaw<{ day: string; weightKg: number }[]>`
          SELECT to_char(("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
                 SUM("weightKg")::float8 AS "weightKg"
          FROM collection_transactions
          WHERE "recordedAt" >= ${since}
          GROUP BY 1 ORDER BY 1`,
      ]);
    return {
      ...summary,
      flow,
      stock,
      upcomingPickups,
      pending: { weighings: pendingWeighings, requests: pendingRequests },
      trend,
    };
  }
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('api')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  dashboard() {
    return this.reports.dashboard();
  }

  /** Laporan untuk rentang tanggal (from/to, ISO 8601). Tanpa rentang = seluruh data. */
  @Get('reports')
  summary(@Query() query: DateRangeDto) {
    return this.reports.summary(query);
  }

  /** Tren enam bulan terakhir untuk halaman Laporan. */
  @Get('reports/analytics')
  analytics() {
    return this.reports.analytics();
  }
}
