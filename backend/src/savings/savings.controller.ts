import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { CurrentUser, MANAGERS, Roles } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.guard.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';

class WithdrawalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

const ZERO = new Prisma.Decimal(0);

/**
 * Tabungan nasabah, insentif setoran per KK (bagian Sasa, DSA Cibunian).
 * Saldo = jumlah creditAmount setoran - jumlah penarikan; tidak disimpan sebagai angka total.
 */
@ApiTags('Savings')
@ApiBearerAuth()
@Controller('api/savings')
export class SavingsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Saldo setiap KK, beserta setoran terakhirnya. */
  @Get()
  async list() {
    const [households, credits, withdrawals] = await Promise.all([
      this.prisma.household.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, rt: true, rw: true, active: true },
      }),
      this.prisma.collectionTransaction.groupBy({
        by: ['householdId'],
        where: { householdId: { not: null } },
        _sum: { creditAmount: true },
        _max: { recordedAt: true },
      }),
      this.prisma.savingsWithdrawal.groupBy({
        by: ['householdId'],
        _sum: { amount: true },
      }),
    ]);
    const credit = new Map(credits.map((c) => [c.householdId, c]));
    const withdrawn = new Map(
      withdrawals.map((w) => [w.householdId, w._sum.amount ?? ZERO]),
    );
    return households.map((h) => {
      const c = credit.get(h.id);
      const creditedAmount = c?._sum.creditAmount ?? ZERO;
      const withdrawnAmount = withdrawn.get(h.id) ?? ZERO;
      return {
        ...h,
        creditedAmount,
        withdrawnAmount,
        balance: creditedAmount.sub(withdrawnAmount),
        lastDepositAt: c?._max.recordedAt ?? null,
      };
    });
  }

  /** Riwayat setoran dan penarikan satu KK. */
  @Get(':householdId')
  async history(@Param('householdId', ParseUUIDPipe) householdId: string) {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true, name: true, rt: true, rw: true, active: true },
    });
    if (!household) throw new NotFoundException('Nasabah tidak ditemukan');
    const [deposits, withdrawals, balance] = await Promise.all([
      this.prisma.collectionTransaction.findMany({
        where: { householdId },
        orderBy: { recordedAt: 'desc' },
        select: {
          id: true,
          recordedAt: true,
          weightKg: true,
          creditAmount: true,
          wasteCategory: { select: { name: true, group: true } },
        },
      }),
      this.prisma.savingsWithdrawal.findMany({
        where: { householdId },
        orderBy: { createdAt: 'desc' },
        include: { recordedBy: { select: { name: true } } },
      }),
      balanceOf(this.prisma, householdId),
    ]);
    return { household, balance, deposits, withdrawals };
  }

  /** Catat penarikan. Ditolak bila melebihi saldo, sehingga saldo tidak pernah negatif. */
  @Roles(...MANAGERS)
  @Post(':householdId/withdrawals')
  withdraw(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: WithdrawalDto,
    @CurrentUser() user: AuthUser,
  ) {
    // SERIALIZABLE: dua penarikan bersamaan tidak bisa sama-sama lolos pengecekan saldo.
    return this.prisma.$transaction(
      async (tx) => {
        const balance = await balanceOf(tx, householdId);
        if (balance.lessThan(dto.amount)) {
          throw new ConflictException(
            `Saldo tidak cukup. Saldo saat ini Rp${balance.toFixed(0)}.`,
          );
        }
        return tx.savingsWithdrawal.create({
          data: {
            householdId,
            amount: dto.amount,
            note: dto.note,
            recordedById: user.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

async function balanceOf(
  db: Prisma.TransactionClient,
  householdId: string,
): Promise<Prisma.Decimal> {
  const [credit, withdrawn] = await Promise.all([
    db.collectionTransaction.aggregate({
      where: { householdId },
      _sum: { creditAmount: true },
    }),
    db.savingsWithdrawal.aggregate({
      where: { householdId },
      _sum: { amount: true },
    }),
  ]);
  return (credit._sum.creditAmount ?? ZERO).sub(withdrawn._sum.amount ?? ZERO);
}
