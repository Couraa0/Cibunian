// Bentuk data dari API. Nilai Decimal (berat, harga) dikirim server sebagai string.
export type Num = string | number

export type Role = 'ADMIN' | 'PENGURUS' | 'PETUGAS' | 'MITRA'

export interface User {
  id: string
  name: string
  username: string
  role: Role
  buyerId: string | null
  active?: boolean
}

export interface Named {
  id: string
  name: string
  active?: boolean
}

export interface Household extends Named {
  address: string | null
  rt: string | null
  rw: string | null
  phone: string | null
  _count?: { collections: number }
}

export interface CollectionPoint extends Named {
  description: string | null
}

export interface Category extends Named {
  /** PRODUK = hasil olahan (maggot, kasgot): stoknya dari catatan panen, bukan pengumpulan. */
  group: 'ANORGANIK' | 'ORGANIK' | 'RESIDU' | 'PRODUK'
  listed: boolean
  /** Harga jual ke pembeli. */
  pricePerKg: Num | null
  /** Harga beli dari nasabah: setoran ber-KK menambah tabungan sebesar berat x harga ini. */
  householdPricePerKg?: Num | null
  stockKg?: Num
}

export interface Buyer extends Named {
  phone: string | null
  address: string | null
  notes: string | null
}

export interface Collection {
  id: string
  weightKg: Num
  collectionType: string
  recordedAt: string
  collectionPoint: { name: string }
  wasteCategory: { name: string }
  household: { name: string } | null
  recordedBy: { name: string }
  weighing: { deviceId: string } | null
}

export interface Weighing {
  id: string
  deviceId: string
  weightKg: Num
  measuredAt: string
}

export interface Movement {
  id: string
  type: string
  quantityKg: Num
  note: string | null
  createdAt: string
  wasteCategory: { name: string }
  recordedBy: { name: string }
}

export interface Pickup {
  id: string
  scheduledAt: string
  status: string
  movedWeightKg: Num | null
  handedOverTo: string | null
  notes: string | null
  collectionPoint: { name: string }
  assignedTo: { name: string } | null
}

export interface MarketRequest {
  id: string
  quantityKg: Num
  offeredPricePerKg: Num | null
  status: string
  note: string | null
  createdAt: string
  buyer: { name: string }
  wasteCategory: { name: string }
  sale: { id: string; weightKg: Num; totalAmount: Num } | null
}

export interface Sale {
  id: string
  weightKg: Num
  pricePerKg: Num
  totalAmount: Num
  soldAt: string
  buyer: { name: string }
  wasteCategory: { name: string }
}

export interface OrganicRecord {
  id: string
  type: 'FEEDING' | 'OBSERVATION' | 'HARVEST' | 'FRASS'
  weightKg: Num | null
  note: string | null
  recordedAt: string
  /** Kategori stok yang ikut berubah: pakan keluar dari sini, hasil panen masuk ke sini. */
  wasteCategory?: { name: string } | null
}

export interface OrganicBatch {
  id: string
  code: string
  /** BSF = larva maggot, KOMPOS = pengomposan. */
  method: 'BSF' | 'KOMPOS'
  startedAt: string
  status: 'ACTIVE' | 'CLOSED'
  notes: string | null
  records: OrganicRecord[]
}

export interface PlasticExperiment {
  id: string
  code: string
  plasticWeightKg: Num
  composition: string | null
  method: string | null
  partner: string | null
  prototypeCount: number
  testResult: string | null
  evaluation: string | null
  conductedAt: string
  wasteCategory: { name: string }
}

export interface Report {
  collected: {
    totalKg: Num
    count: number
    byCategory: { id: string; name: string; group?: string; weightKg: Num }[]
    byPoint: { id: string; name: string; weightKg: Num; count: number }[]
  }
  moved: { totalKg: Num; count: number }
  sold: { totalKg: Num; totalAmount: Num; count: number }
  /** feedingFromStockKg = pakan dari stok organik RUNA; selisihnya dari mitra (restoran, hotel). */
  organic: { feedingKg: Num; feedingFromStockKg?: Num; harvestKg: Num; frassKg: Num; compostKg?: Num }
  plastic: { processedKg: Num; experiments: number; prototypes: number }
  /** Partisipasi nasabah: KK aktif terdaftar, KK yang setor, dan rincian per KK. */
  participation?: {
    registered: number
    depositing: number
    byHousehold: {
      id: string
      name: string
      rt: string | null
      rw: string | null
      count: number
      weightKg: Num
      creditAmount: Num
    }[]
  }
  /** Total periode sebelumnya dengan panjang sama; null bila rentang tanggal tidak lengkap. */
  previous?: { collectedKg: Num; soldKg: Num; soldAmount: Num; depositingHouseholds?: number } | null
}

/** Saldo tabungan satu KK (GET /savings). */
export interface SavingsAccount {
  id: string
  name: string
  rt: string | null
  rw: string | null
  active: boolean
  creditedAmount: Num
  withdrawnAmount: Num
  balance: Num
  lastDepositAt: string | null
}

/** Riwayat tabungan satu KK (GET /savings/:householdId). */
export interface SavingsHistory {
  household: { id: string; name: string; rt: string | null; rw: string | null; active: boolean }
  balance: Num
  deposits: {
    id: string
    recordedAt: string
    weightKg: Num
    creditAmount: Num | null
    wasteCategory: { name: string; group: Category['group'] }
  }[]
  withdrawals: { id: string; amount: Num; note: string | null; createdAt: string; recordedBy: { name: string } }[]
}

/** Tren enam bulan terakhir; semua deret sejajar dengan `months` ('YYYY-MM', terlama dulu). */
export interface Analytics {
  months: string[]
  collectedKg: number[]
  byPoint: { id: string; name: string; monthlyKg: number[] }[]
  byCategory: { id: string; name: string; group: Category['group']; monthlyKg: number[] }[]
  sales: { weightKg: number; amount: number }[]
}

export interface Dashboard extends Report {
  /** Ke mana material terkumpul pergi, tanpa stok produk olahan. */
  flow?: { soldKg: Num; processedKg: Num; stockKg: Num }
  stock: Category[]
  upcomingPickups: Pickup[]
  pending: { weighings: number; requests: number }
  trend: { day: string; weightKg: number }[]
}
