import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  isUUID,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.guard.js';
import { idempotent } from '../common/idempotency.js';
import {
  BatchStatus,
  MovementType,
  OrganicMethod,
  OrganicRecordType,
  Prisma,
  WasteGroup,
} from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma.service.js';

class CreateBatchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code: string;

  /** BSF (larva) atau KOMPOS. Bawaan BSF. */
  @IsOptional()
  @IsEnum(OrganicMethod)
  method?: OrganicMethod;

  @IsDateString()
  startedAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class UpdateBatchDto {
  @IsOptional()
  @IsEnum(BatchStatus)
  status?: BatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

class CreateRecordDto {
  /**
   * FEEDING = bahan organik masuk, HARVEST = panen (larva untuk BSF, kompos untuk KOMPOS),
   * FRASS = residu/kasgot (hanya BSF), OBSERVATION = catatan.
   */
  @IsEnum(OrganicRecordType)
  type: OrganicRecordType;

  /** Wajib kecuali untuk OBSERVATION. */
  @ValidateIf(
    (o) => o.type !== OrganicRecordType.OBSERVATION || o.weightKg != null,
  )
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(100000)
  weightKg?: number;

  /**
   * Kategori stok terkait (opsional). FEEDING: kategori kelompok Organik, beratnya keluar
   * dari stok. HARVEST/FRASS: kategori kelompok Produk, beratnya masuk stok dan bisa dijual.
   */
  @IsOptional()
  @IsUUID()
  wasteCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsDateString()
  recordedAt: string;
}

const recordInclude = { wasteCategory: { select: { name: true } } } as const;

/**
 * Pencatatan pengolahan sampah organik per batch: Maggot BSF atau kompos.
 * Sistem hanya mencatat, tidak mengendalikan proses pengolahan.
 */
@ApiTags('Organic (Maggot BSF & kompos)')
@ApiBearerAuth()
@Controller('api/organic/batches')
export class OrganicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  @Get()
  list() {
    return this.prisma.organicBatch.findMany({
      orderBy: { startedAt: 'desc' },
      include: {
        records: { orderBy: { recordedAt: 'desc' }, include: recordInclude },
      },
    });
  }

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.prisma.organicBatch.create({
      data: dto,
      include: { records: true },
    });
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBatchDto) {
    return this.prisma.organicBatch.update({ where: { id }, data: dto });
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'UUID buatan klien. Dikirim oleh antrean offline agar kirim ulang tidak menggandakan.',
    required: false,
  })
  @Post(':id/records')
  addRecord(
    @Param('id', ParseUUIDPipe) batchId: string,
    @Body() dto: CreateRecordDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (key !== undefined && !isUUID(key)) {
      throw new BadRequestException('Header Idempotency-Key harus berupa UUID');
    }
    return idempotent(
      async () =>
        key
          ? this.prisma.organicRecord.findUnique({
              where: { clientMutationId: key },
              include: recordInclude,
            })
          : null,
      () => this.createRecord(batchId, dto, user.id, key),
    );
  }

  private async createRecord(
    batchId: string,
    dto: CreateRecordDto,
    userId: string,
    clientMutationId?: string,
  ) {
    const batch = await this.prisma.organicBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    if (batch.status !== BatchStatus.ACTIVE) {
      throw new ConflictException('Batch sudah ditutup');
    }
    if (
      batch.method === OrganicMethod.KOMPOS &&
      dto.type === OrganicRecordType.FRASS
    ) {
      throw new BadRequestException(
        'Batch kompos tidak punya residu/kasgot; catat hasilnya sebagai panen kompos',
      );
    }

    // Arah stok mengikuti jenis catatan: pakan keluar dari stok organik, hasil masuk stok produk.
    const isFeeding = dto.type === OrganicRecordType.FEEDING;
    const stock =
      dto.wasteCategoryId && dto.weightKg != null
        ? { wasteCategoryId: dto.wasteCategoryId, quantityKg: dto.weightKg }
        : null;
    if (dto.wasteCategoryId && !stock) {
      throw new BadRequestException('Catatan tanpa berat tidak mengubah stok');
    }
    if (stock) {
      if (dto.type === OrganicRecordType.OBSERVATION) {
        throw new BadRequestException('Observasi tidak mengubah stok');
      }
      const category = await this.prisma.wasteCategory.findUnique({
        where: { id: stock.wasteCategoryId },
      });
      const expected = isFeeding ? WasteGroup.ORGANIK : WasteGroup.PRODUK;
      if (!category?.active || category.group !== expected) {
        throw new BadRequestException(
          isFeeding
            ? 'Pakan hanya bisa diambil dari stok kelompok Organik'
            : 'Hasil panen hanya bisa masuk ke stok kelompok Produk',
        );
      }
    }

    const save = async (tx: Prisma.TransactionClient) => {
      const record = await tx.organicRecord.create({
        data: {
          batchId,
          type: dto.type,
          weightKg: dto.weightKg,
          wasteCategoryId: dto.wasteCategoryId,
          note: dto.note,
          recordedAt: dto.recordedAt,
          clientMutationId,
        },
        include: recordInclude,
      });
      if (stock) {
        const movement = {
          ...stock,
          recordedById: userId,
          organicRecordId: record.id,
          note: `Batch ${batch.code}`,
        };
        if (isFeeding) {
          await this.inventory.withdraw(tx, {
            ...movement,
            type: MovementType.PROCESSING,
          });
        } else {
          await tx.inventoryMovement.create({
            data: { ...movement, type: MovementType.PRODUCTION },
          });
        }
      }
      return record;
    };
    // Stok keluar perlu transaksi SERIALIZABLE (lihat InventoryService.transaction).
    return stock && isFeeding
      ? this.inventory.transaction(save)
      : this.prisma.$transaction(save);
  }
}
