// Unsur tampilan bersama: logo, kepala halaman, angka kunci, dan penanda status.
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { label } from '../utils/format'

/**
 * Logo RUNA: tiga busur yang bersambung menjadi lingkaran (ekonomi sirkular), berwarna seperti
 * tempat sampah terpilah: hijau organik, biru anorganik, kuning hasil olahan bernilai jual.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  // Keliling lingkaran r=11 adalah 69,12; tiap busur 17 dengan celah 6,04 (ujung bulat menutup sebagian).
  const arc = (color: string, offset: number) => (
    <circle
      cx="16"
      cy="16"
      r="11"
      fill="none"
      stroke={color}
      strokeWidth="4.5"
      strokeLinecap="round"
      strokeDasharray="17 52.12"
      strokeDashoffset={offset}
      transform="rotate(-80 16 16)"
    />
  )
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {arc('#3fa34d', 0)}
      {arc('#4fb0d3', -23.04)}
      {arc('#f2b705', -46.08)}
    </svg>
  )
}

export interface Stat {
  label: string
  value: ReactNode
  /** Keterangan kecil di bawah angka, mis. naik/turun dibanding periode lalu. */
  note?: ReactNode
  /** "uang" = nilai rupiah, ditandai garis kunyit. */
  tone?: 'uang'
}

/** Deretan angka kunci: label kecil di atas, angka besar di bawah. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="angka-kunci">
      {stats.map((s) => (
        <div key={s.label} className={s.tone}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
          {s.note && <div className="angka-catatan">{s.note}</div>}
        </div>
      ))}
    </dl>
  )
}

/**
 * Kepala halaman modul: ikon, judul, penjelasan singkat, tombol aksi, dan angka kunci.
 * Garis kontur di latarnya mengambil bentuk perbukitan Cibunian.
 */
export function PageHeader({
  icon: Icon,
  title,
  lead,
  actions,
  stats,
  children,
}: {
  icon: LucideIcon
  title: string
  lead?: ReactNode
  actions?: ReactNode
  stats?: Stat[] | false
  /** Isi tambahan di dalam kepala, mis. perjalanan material di Beranda. */
  children?: ReactNode
}) {
  return (
    <header className="kepala">
      <div className="kepala-baris">
        <span className="kepala-ikon" aria-hidden="true">
          <Icon size={24} strokeWidth={2.1} />
        </span>
        <div className="kepala-teks">
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
        {actions && <div className="kepala-aksi no-print">{actions}</div>}
      </div>
      {stats && stats.length > 0 && <StatStrip stats={stats} />}
      {children}
    </header>
  )
}

/** Status sebagai label berwarna. Warnanya hanya pembantu: teksnya selalu tertulis. */
export function StatusPill({ status }: { status: string }) {
  return <span className={`pil ${status}`}>{label(status)}</span>
}
