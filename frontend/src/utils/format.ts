import type { Num } from '../types'

const kgFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const rupiahFormat = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

/** Angka tanpa satuan, mis. untuk sel tabel yang satuannya sudah ada di judul. */
export const num = (value: Num) => kgFormat.format(Number(value))

export const kg = (value: Num | null | undefined) =>
  value == null ? '-' : `${kgFormat.format(Number(value))} kg`

export const rupiah = (value: Num | null | undefined) =>
  value == null ? '-' : rupiahFormat.format(Number(value))

export const dateTime = (value: string | number | null | undefined) =>
  value == null ? '-' : dateTimeFormat.format(new Date(value))

const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' })

/** 'YYYY-MM' menjadi "Nov 26". */
export const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00`))

/** Nilai untuk <input type="datetime-local"> dalam zona waktu perangkat. */
export function toLocalInput(date: Date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PENGURUS: 'Pengurus',
  PETUGAS: 'Petugas',
  MITRA: 'Mitra',
  ANORGANIK: 'Anorganik',
  ORGANIK: 'Organik',
  RESIDU: 'Residu',
  PRODUK: 'Produk olahan',
  POINT_COLLECTION: 'Di titik',
  HOME_PICKUP: 'Jemput',
  DROP_OFF: 'Setor',
  COLLECTION: 'Pengumpulan',
  SALE: 'Penjualan',
  PROCESSING: 'Pengolahan',
  PRODUCTION: 'Hasil olahan',
  ADJUSTMENT: 'Penyesuaian',
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Berjalan',
  DONE: 'Selesai',
  CANCELLED: 'Batal',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  COMPLETED: 'Selesai',
  ACTIVE: 'Aktif',
  CLOSED: 'Ditutup',
  BSF: 'Maggot BSF',
  KOMPOS: 'Kompos',
  FEEDING: 'Pakan',
  OBSERVATION: 'Observasi',
  HARVEST: 'Panen larva',
  FRASS: 'Residu/frass',
}

/** Label Indonesia untuk nilai enum dari API. */
export const label = (value: string) => LABELS[value] ?? value

export const options = (...values: string[]) => values.map((value) => ({ value, label: label(value) }))

/** Dua huruf awal nama untuk avatar, mis. "Siti Aminah" menjadi "SA". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
