import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChartColumn, Download, Minus, Printer } from 'lucide-react'
import { Card, StaleNote, Table } from '../../components/Resource'
import type { Column } from '../../components/Resource'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'
import type { Analytics, Collection, Report, Sale, User } from '../../types'
import { downloadCsv } from '../../utils/csv'
import { kg, label, monthLabel, num, rupiah, toLocalInput } from '../../utils/format'
import { PageHeader } from '../../components/ui'

const EXPORT_LIMIT = 5000
const DAY = 86_400_000
const dayFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' })
const percentFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
/** Tanggal lokal 'YYYY-MM-DD', bentuk yang dipakai <input type="date">. */
const ymd = (date: Date) => toLocalInput(date).slice(0, 10)
/** Waktu lokal 'YYYY-MM-DD HH:mm' untuk sel CSV. */
const csvTime = (iso: string) => toLocalInput(new Date(iso)).replace('T', ' ')

/** Partisipasi nasabah dalam periode: berapa KK yang setor dan apa yang mereka bawa. */
function Participation({ data, previous }: { data: NonNullable<Report['participation']>; previous?: number }) {
  const share = data.registered ? Math.round((data.depositing / data.registered) * 100) : 0
  const credited = data.byHousehold.reduce((sum, h) => sum + Number(h.creditAmount), 0)
  return (
    <Card title="Partisipasi nasabah">
      <table className="table table-sm mb-3">
        <tbody>
          <Row name="KK terdaftar (aktif)" value={data.registered} />
          <Row
            name="KK yang setor"
            value={`${data.depositing} KK (${share}%)`}
            delta={previous != null && <Delta now={data.depositing} before={previous} />}
          />
          <Row name="Tabungan masuk ke nasabah" value={rupiah(credited)} />
        </tbody>
      </table>
      <Table
        rows={data.byHousehold}
        empty="Belum ada setoran atas nama KK pada periode ini."
        columns={[
          { label: 'Nasabah', render: (h) => h.name },
          { label: 'RT/RW', render: (h) => `${h.rt ?? '-'}/${h.rw ?? '-'}` },
          { label: 'Setoran', align: 'end', render: (h) => h.count },
          { label: 'Berat', align: 'end', render: (h) => kg(h.weightKg) },
          { label: 'Tabungan masuk', align: 'end', render: (h) => rupiah(h.creditAmount) },
        ]}
      />
    </Card>
  )
}

/** Naik/turun dibanding periode sebelumnya. Ikon dan kata membawa arahnya, bukan warna saja. */
function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return now ? <small className="delta">periode sebelumnya 0</small> : null
  const change = ((now - before) / before) * 100
  const Icon = change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus
  const word = change > 0 ? 'naik' : change < 0 ? 'turun' : 'tetap'
  return (
    <small className={`delta ${word}`}>
      <Icon size={14} aria-hidden />
      {word} {percentFormat.format(Math.abs(change))}%
    </small>
  )
}

function Row({
  name,
  value,
  delta,
  sub,
}: {
  name: string
  value: string | number
  delta?: ReactNode
  /** Rincian dari baris di atasnya: menjorok dan lebih redup. */
  sub?: boolean
}) {
  return (
    <tr className={sub ? 'rincian-baris' : undefined}>
      <td>{name}</td>
      <td className="text-end fw-semibold">
        {value}
        {delta}
      </td>
    </tr>
  )
}

/** Kolom per bulan: batang tipis berpangkal rata; bulan berjalan ditonjolkan. */
function MonthlyColumns({ months, values }: { months: string[]; values: number[] }) {
  const max = Math.max(...values, 1)
  const peak = values.indexOf(Math.max(...values))
  return (
    <div className="kolom" role="list" aria-label="Berat pengumpulan per bulan, enam bulan terakhir">
      {months.map((month, i) => (
        // Bisa difokus dengan keyboard agar nilainya terbaca tanpa mouse.
        <div key={month} role="listitem" tabIndex={0} aria-label={`${monthLabel(month)}: ${kg(values[i])}`}>
          <div className="kolom-area">
            {/* Nilai ditulis langsung hanya pada bulan berjalan dan puncak; sisanya lewat sorot/fokus. */}
            <span className={i === months.length - 1 || i === peak ? 'nilai' : 'nilai tip'}>{kg(values[i])}</span>
            <div className="batang" style={{ height: `${(values[i] / max) * 100}%` }} />
          </div>
          <span className="bulan">{monthLabel(month)}</span>
        </div>
      ))}
    </div>
  )
}

interface Series {
  id: string
  name: ReactNode
  values: number[]
}

function MonthlyTable({ months, rows, first }: { months: string[]; rows: Series[]; first: string }) {
  const columns: Column<Series>[] = [
    { label: first, render: (row) => row.name },
    ...months.map(
      (month, i): Column<Series> => ({
        label: monthLabel(month),
        align: 'end',
        render: (row) => (row.values[i] ? num(row.values[i]) : '–'),
      }),
    ),
  ]
  return <Table rows={rows} columns={columns} />
}

function Trend() {
  const { data, error, cachedAt } = useApi<Analytics>('/reports/analytics')
  if (!data) return error ? <StaleNote error={error} /> : null
  const { months } = data

  return (
    <>
      <h2 className="judul-bagian">Tren enam bulan terakhir</h2>
      <p className="text-secondary">Selalu enam bulan terakhir, tidak mengikuti periode di atas.</p>
      <StaleNote at={cachedAt} />
      <div className="row g-3">
        <div className="col-12 col-xl-5">
          <Card title="Sampah terkumpul per bulan">
            <MonthlyColumns months={months} values={data.collectedKg} />
          </Card>
        </div>
        <div className="col-12 col-xl-7">
          <Card title="Penjualan per bulan">
            <Table
              rows={months.map((month, i) => ({ id: month, ...data.sales[i] }))}
              columns={[
                { label: 'Bulan', render: (row) => monthLabel(row.id) },
                { label: 'Berat terjual', align: 'end', render: (row) => (row.weightKg ? kg(row.weightKg) : '–') },
                { label: 'Nilai transaksi', align: 'end', render: (row) => (row.amount ? rupiah(row.amount) : '–') },
              ]}
            />
          </Card>
        </div>
        <div className="col-12">
          <Card title="Terkumpul per titik (kg)">
            <MonthlyTable
              months={months}
              first="Titik"
              rows={[
                ...data.byPoint.map((p) => ({ id: p.id, name: p.name, values: p.monthlyKg })),
                { id: 'total', name: <strong>Semua titik</strong>, values: data.collectedKg },
              ]}
            />
          </Card>
        </div>
        <div className="col-12">
          <Card title="Terkumpul per kategori (kg)">
            {data.byCategory.length ? (
              <MonthlyTable
                months={months}
                first="Kategori"
                rows={data.byCategory.map((c) => ({
                  id: c.id,
                  name: (
                    <>
                      <i className={`dot ${c.group}`} />
                      {c.name}
                    </>
                  ),
                  values: c.monthlyKg,
                }))}
              />
            ) : (
              <p className="text-secondary mb-0">Belum ada pengumpulan dalam enam bulan terakhir.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

export function ReportsPage({ user }: { user: User }) {
  const canSeeSales = user.role === 'ADMIN' || user.role === 'PENGURUS'
  const [today] = useState(() => new Date())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportNote, setExportNote] = useState<{ error: boolean; text: string } | null>(null)

  const presets = [
    { name: 'Semua', from: '', to: '' },
    { name: 'Bulan ini', from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) },
    {
      name: 'Bulan lalu',
      from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    { name: '30 hari terakhir', from: ymd(new Date(today.getTime() - 29 * DAY)), to: ymd(today) },
  ]

  // Tanggal dipilih dalam waktu perangkat; dikirim sebagai awal & akhir hari dalam UTC.
  const query = new URLSearchParams()
  if (from) query.set('from', new Date(`${from}T00:00:00`).toISOString())
  if (to) query.set('to', new Date(`${to}T23:59:59.999`).toISOString())
  const { data, error, cachedAt } = useApi<Report>(`/reports?${query}`)

  // Pembanding = rentang tepat sebelum periode ini, dengan jumlah hari yang sama.
  const previous = data?.previous
  let previousRange = ''
  if (previous && from && to) {
    const start = new Date(`${from}T00:00:00`).getTime()
    const days = Math.round((new Date(`${to}T00:00:00`).getTime() - start) / DAY) + 1
    previousRange = `${dayFormat.format(start - days * DAY)} s.d. ${dayFormat.format(start - DAY)}`
  }

  async function exportCsv(kind: 'pengumpulan' | 'penjualan') {
    setExporting(kind)
    setExportNote(null)
    try {
      const params = new URLSearchParams(query)
      params.set('limit', String(EXPORT_LIMIT))
      const name = `runa-${kind}_${from || 'awal'}_${to || ymd(today)}.csv`
      let count: number
      if (kind === 'pengumpulan') {
        const rows = await api.fresh<Collection[]>(`/collections?${params}`)
        count = rows.length
        downloadCsv(
          name,
          ['Waktu', 'Titik', 'Kategori', 'Berat (kg)', 'Cara', 'Rumah tangga', 'Sumber berat', 'Petugas'],
          rows.map((c) => [
            csvTime(c.recordedAt),
            c.collectionPoint.name,
            c.wasteCategory.name,
            Number(c.weightKg),
            label(c.collectionType),
            c.household?.name,
            c.weighing ? `Timbangan ${c.weighing.deviceId}` : 'Manual',
            c.recordedBy.name,
          ]),
        )
      } else {
        const rows = await api.fresh<Sale[]>(`/sales?${params}`)
        count = rows.length
        downloadCsv(
          name,
          ['Waktu', 'Pembeli', 'Material', 'Berat (kg)', 'Harga per kg (Rp)', 'Total (Rp)'],
          rows.map((s) => [
            csvTime(s.soldAt),
            s.buyer.name,
            s.wasteCategory.name,
            Number(s.weightKg),
            Number(s.pricePerKg),
            Number(s.totalAmount),
          ]),
        )
      }
      setExportNote({
        error: false,
        text:
          count === EXPORT_LIMIT
            ? `Diunduh ${num(count)} baris terbaru (batas sekali unduh). Persempit periode untuk mengambil sisanya.`
            : `Diunduh ${num(count)} baris ${kind}.`,
      })
    } catch (err) {
      setExportNote({
        error: true,
        text: err instanceof TypeError ? 'Unduh data butuh koneksi internet.' : (err as Error).message,
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Laporan & Dampak"
        lead="Ringkasan per periode dengan pembanding periode sebelumnya, tren enam bulan, dan unduhan data."
        actions={
        <>
          <button
            className="btn btn-sm btn-outline-success"
            disabled={exporting !== null}
            onClick={() => void exportCsv('pengumpulan')}
          >
            <Download size={16} aria-hidden /> Unduh pengumpulan (CSV)
          </button>
          {canSeeSales && (
            <button
              className="btn btn-sm btn-outline-success"
              disabled={exporting !== null}
              onClick={() => void exportCsv('penjualan')}
            >
              <Download size={16} aria-hidden /> Unduh penjualan (CSV)
            </button>
          )}
          <button className="btn btn-sm btn-outline-success" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Cetak / simpan PDF
          </button>
        </>
        }
      />
      {exportNote && (
        <div className={`alert py-2 no-print ${exportNote.error ? 'alert-danger' : 'alert-success'}`} role="status">
          {exportNote.text}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-2 no-print" role="group" aria-label="Pilihan periode cepat">
        {presets.map((p) => (
          <button
            key={p.name}
            className={`btn btn-sm ${p.from === from && p.to === to ? 'btn-success' : 'btn-outline-success'}`}
            aria-pressed={p.from === from && p.to === to}
            onClick={() => {
              setFrom(p.from)
              setTo(p.to)
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="row g-2 mb-3 no-print">
        <div className="col-6 col-md-3">
          <label className="form-label mb-1 small fw-semibold" htmlFor="from">
            Dari tanggal
          </label>
          <input id="from" type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label mb-1 small fw-semibold" htmlFor="to">
            Sampai tanggal
          </label>
          <input id="to" type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <p className="text-secondary">
        Periode: {from || 'awal'} s.d. {to || 'sekarang'}
        {previousRange && `. Naik/turun dibanding ${previousRange}.`}
      </p>
      <StaleNote at={cachedAt} error={error} />

      {data && (
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <Card title="Ringkasan">
              <table className="table table-sm mb-0">
                <tbody>
                  <Row
                    name="Sampah terkumpul"
                    value={kg(data.collected.totalKg)}
                    delta={previous && <Delta now={Number(data.collected.totalKg)} before={Number(previous.collectedKg)} />}
                  />
                  <Row name="Jumlah transaksi pengumpulan" value={data.collected.count} />
                  <Row name="Material dipindahkan (pengangkutan selesai)" value={kg(data.moved.totalKg)} />
                  <Row
                    name="Material dan produk terjual / tersalurkan"
                    value={kg(data.sold.totalKg)}
                    delta={previous && <Delta now={Number(data.sold.totalKg)} before={Number(previous.soldKg)} />}
                  />
                  <Row name="Jumlah transaksi penjualan" value={data.sold.count} />
                  <Row
                    name="Nilai transaksi (pendapatan RUNA)"
                    value={rupiah(data.sold.totalAmount)}
                    delta={previous && <Delta now={Number(data.sold.totalAmount)} before={Number(previous.soldAmount)} />}
                  />
                </tbody>
              </table>
            </Card>
          </div>
          <div className="col-12 col-lg-6">
            <Card title="Pengolahan">
              <table className="table table-sm mb-0">
                <tbody>
                  <Row name="Bahan organik diolah (kompos dan BSF)" value={kg(data.organic.feedingKg)} />
                  {data.organic.feedingFromStockKg != null && (
                    <>
                      <Row sub name="dari stok organik RUNA" value={kg(data.organic.feedingFromStockKg)} />
                      <Row
                        sub
                        name="dari luar stok (mitra, lainnya)"
                        value={kg(Number(data.organic.feedingKg) - Number(data.organic.feedingFromStockKg))}
                      />
                    </>
                  )}
                  {data.organic.compostKg != null && <Row name="Kompos dihasilkan" value={kg(data.organic.compostKg)} />}
                  <Row name="Hasil panen larva" value={kg(data.organic.harvestKg)} />
                  <Row name="Residu / frass" value={kg(data.organic.frassKg)} />
                  <Row name="Plastik diolah" value={kg(data.plastic.processedKg)} />
                  <Row name="Eksperimen paving block" value={data.plastic.experiments} />
                  <Row name="Prototipe dihasilkan" value={data.plastic.prototypes} />
                </tbody>
              </table>
            </Card>
          </div>
          <div className="col-12 col-lg-6">
            <Card title="Terkumpul per kategori">
              <Table
                rows={data.collected.byCategory}
                empty="Tidak ada pengumpulan pada periode ini."
                columns={[
                  { label: 'Kategori', render: (c) => c.name },
                  { label: 'Kelompok', render: (c) => (c.group ? label(c.group) : '-') },
                  { label: 'Berat', align: 'end', render: (c) => kg(c.weightKg) },
                ]}
              />
            </Card>
          </div>
          <div className="col-12 col-lg-6">
            <Card title="Terkumpul per titik">
              <Table
                rows={data.collected.byPoint}
                columns={[
                  { label: 'Titik', render: (p) => p.name },
                  { label: 'Transaksi', align: 'end', render: (p) => p.count },
                  { label: 'Berat', align: 'end', render: (p) => kg(p.weightKg) },
                ]}
              />
            </Card>
          </div>
          {data.participation && (
            <div className="col-12">
              <Participation data={data.participation} previous={previous?.depositingHouseholds} />
            </div>
          )}
        </div>
      )}

      <Trend />
    </>
  )
}
