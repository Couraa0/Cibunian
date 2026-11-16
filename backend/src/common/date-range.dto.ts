import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class DateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Query daftar: rentang tanggal + jumlah baris terbaru. */
export class ListQueryDto extends DateRangeDto {
  /** Bawaan 200 baris terbaru. Ekspor laporan meminta sampai 5000. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}

/** Filter Prisma untuk kolom tanggal, atau undefined bila tanpa rentang. */
export function dateRange({ from, to }: DateRangeDto) {
  return from || to ? { gte: from, lte: to } : undefined;
}
