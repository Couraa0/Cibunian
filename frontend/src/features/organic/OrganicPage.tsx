import { useState } from 'react'
import { Bug, Eye, Leaf, Recycle, Sprout } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PendingCard } from '../../components/Pending'
import { Card, Empty, Form, StaleNote } from '../../components/Resource'
import { PageHeader, StatusPill } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { useOnSynced, useQueue } from '../../hooks/useQueue'
import { api, syncQueue } from '../../services/api'
import { queue } from '../../services/offline'
import type { Category, OrganicBatch, OrganicRecord } from '../../types'
import { dateTime, kg, label, options } from '../../utils/format'

const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 0 })

type Method = OrganicBatch['method']

const totalKg = (records: OrganicRecord[], type: string) =>
  records.filter((r) => r.type === type).reduce((total, r) => total + Number(r.weightKg ?? 0), 0)

/** Batch lama (sebelum ada metode) dan data cache lama dianggap BSF. */
const methodOf = (batch: OrganicBatch): Method => batch.method ?? 'BSF'

/** Nama jenis catatan mengikuti metodenya: di batch kompos, pakan = bahan dan panen = kompos. */
const KOMPOS_LABEL: Partial<Record<OrganicRecord['type'], string>> = {
  FEEDING: 'Bahan masuk',
  HARVEST: 'Panen kompos',
}
const recordLabel = (method: Method, type: OrganicRecord['type']) =>
  (method === 'KOMPOS' && KOMPOS_LABEL[type]) || label(type)

/** Hasil panen dibanding bahan yang masuk; tanda strip bila belum ada bahan. */
const harvestRatio = (records: OrganicRecord[]) => {
  const feed = totalKg(records, 'FEEDING')
  return feed ? percent.format(totalKg(records, 'HARVEST') / feed) : '–'
}

const RECORD_ICON: Record<OrganicRecord['type'], LucideIcon> = {
  FEEDING: Leaf,
  OBSERVATION: Eye,
  HARVEST: Bug,
  FRASS: Sprout,
}

/**
 * Arah stok sebuah catatan: pakan keluar dari stok organik RUNA atau datang dari mitra
 * (restoran, hotel) tanpa lewat stok; hasil panen masuk stok produk.
 */
function stockNote(r: OrganicRecord, method: Method) {
  if (r.wasteCategory) return `${r.type === 'FEEDING' ? 'Keluar dari' : 'Masuk ke'} stok ${r.wasteCategory.name}`
  return r.type === 'FEEDING' && method === 'BSF' ? 'Dari mitra, bukan stok RUNA' : null
}

/** Catatan batch sebagai linimasa: urutan kejadian pengolahan, terbaru di atas. */
function Timeline({ records, method }: { records: OrganicRecord[]; method: Method }) {
  if (!records.length) return <Empty text="Belum ada catatan untuk batch ini." />
  return (
    <ol className="linimasa">
      {records.map((r) => {
        const Icon = method === 'KOMPOS' && r.type === 'HARVEST' ? Recycle : RECORD_ICON[r.type]
        const note = [stockNote(r, method), r.note].filter(Boolean).join('. ')
        return (
          <li key={r.id}>
            <span className={`linimasa-ikon ${r.type}`} aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
              <div className="linimasa-kepala">
                <strong>{recordLabel(method, r.type)}</strong>
                {r.weightKg != null && <span className="linimasa-berat">{kg(r.weightKg)}</span>}
                <time dateTime={r.recordedAt}>{dateTime(r.recordedAt)}</time>
              </div>
              {note && <p>{note}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function OrganicPage() {
  const { data, error, cachedAt, reload } = useApi<OrganicBatch[]>('/organic/batches')
  const categories = (useApi<Category[]>('/categories').data ?? []).filter((c) => c.active !== false)
  const inGroup = (group: Category['group']) =>
    categories.filter((c) => c.group === group).map((c) => ({ value: c.id, label: c.name }))
  const queued = useQueue().filter((q) => q.path.startsWith('/organic/'))
  useOnSynced(queued.length, reload)
  const [adding, setAdding] = useState(false)

  const recordsOf = (method: Method) => (data ?? []).filter((b) => methodOf(b) === method).flatMap((b) => b.records)
  const allRecords = (data ?? []).flatMap((b) => b.records)

  async function close(batch: OrganicBatch) {
    if (!confirm(`Tutup batch ${batch.code}? Batch yang ditutup tidak bisa ditambah catatan.`)) return
    await api.patch(`/organic/batches/${batch.id}`, { status: 'CLOSED' }).catch((err: Error) => alert(err.message))
    reload()
  }

  return (
    <>
      <PageHeader
        icon={Sprout}
        title="Pengolahan Organik"
        lead="Catat batch kompos dan maggot BSF: bahan masuk, observasi, dan hasil panen. Bahan bisa dari stok organik RUNA; pakan BSF juga bisa dari mitra seperti restoran. Catatan bisa diisi tanpa sinyal."
        actions={
          !adding && (
            <button className="btn btn-success" onClick={() => setAdding(true)}>
              + Batch baru
            </button>
          )
        }
        stats={
          data && [
            { label: 'Batch aktif', value: data.filter((b) => b.status === 'ACTIVE').length },
            { label: 'Organik diolah', value: kg(totalKg(allRecords, 'FEEDING')) },
            { label: 'Kompos dihasilkan', value: kg(totalKg(recordsOf('KOMPOS'), 'HARVEST')) },
            { label: 'Panen larva', value: kg(totalKg(recordsOf('BSF'), 'HARVEST')) },
          ]
        }
      />
      <StaleNote at={cachedAt} error={error} />

      <PendingCard items={queued} />

      {adding && (
        <Card title="Batch baru">
          <Form
            fields={[
              {
                name: 'method',
                label: 'Metode',
                type: 'select',
                required: true,
                default: 'KOMPOS',
                options: options('KOMPOS', 'BSF'),
              },
              { name: 'code', label: 'Kode batch', required: true, help: 'Mis. KMP-001 atau BSF-001' },
              { name: 'startedAt', label: 'Mulai', type: 'datetime-local', required: true },
              { name: 'notes', label: 'Catatan', type: 'textarea' },
            ]}
            onCancel={() => setAdding(false)}
            onSubmit={async (payload) => {
              await api.post('/organic/batches', payload)
              setAdding(false)
              reload()
            }}
          />
        </Card>
      )}

      {data?.length === 0 && !adding && <Empty text="Belum ada batch. Mulai dengan tombol “Batch baru”." />}

      {data?.map((batch) => {
        const method = methodOf(batch)
        const isBsf = method === 'BSF'
        return (
        <Card
          key={batch.id}
          title={`Batch ${batch.code}`}
          icon={isBsf ? Bug : Recycle}
          actions={
            <span className="d-inline-flex align-items-center gap-2">
              <span className="small fw-semibold text-secondary">{label(method)}</span>
              <StatusPill status={batch.status} />
              {batch.status === 'ACTIVE' && (
                <button className="btn btn-sm btn-outline-secondary" onClick={() => void close(batch)}>
                  Tutup batch
                </button>
              )}
            </span>
          }
        >
          <p className="small text-secondary">
            Mulai {dateTime(batch.startedAt)}
            {batch.notes && `. ${batch.notes}`}
          </p>
          <dl className="ringkas-batch">
            <div>
              <dt>{isBsf ? 'Pakan' : 'Bahan masuk'}</dt>
              <dd>{kg(totalKg(batch.records, 'FEEDING'))}</dd>
            </div>
            <div>
              <dt>{isBsf ? 'Panen larva' : 'Kompos jadi'}</dt>
              <dd>{kg(totalKg(batch.records, 'HARVEST'))}</dd>
            </div>
            {isBsf && (
              <div>
                <dt>Residu / kasgot</dt>
                <dd>{kg(totalKg(batch.records, 'FRASS'))}</dd>
              </div>
            )}
            <div>
              <dt>Rasio panen</dt>
              <dd>{harvestRatio(batch.records)}</dd>
            </div>
          </dl>

          {batch.status === 'ACTIVE' && (
            <div className="form-box">
              <Form
                submitLabel="Tambah catatan"
                fields={[
                  {
                    name: 'type',
                    label: 'Jenis catatan',
                    type: 'select',
                    required: true,
                    options: (isBsf
                      ? (['FEEDING', 'OBSERVATION', 'HARVEST', 'FRASS'] as const)
                      : (['FEEDING', 'OBSERVATION', 'HARVEST'] as const)
                    ).map((type) => ({ value: type, label: recordLabel(method, type) })),
                  },
                  { name: 'weightKg', label: 'Berat (kg)', type: 'number', min: '0.001', help: 'Kosongkan untuk observasi.' },
                  {
                    name: 'feedCategoryId',
                    label: isBsf ? 'Sumber pakan' : 'Sumber bahan',
                    type: 'select',
                    options: inGroup('ORGANIK').map((o) => ({ ...o, label: `Stok RUNA: ${o.label}` })),
                    emptyLabel: isBsf ? 'Mitra (restoran, hotel, lainnya)' : 'Bukan dari stok RUNA',
                    visible: (v) => v.type === 'FEEDING',
                    help: isBsf
                      ? 'Dari stok RUNA: beratnya dikurangkan dari stok. Dari mitra: tulis nama mitranya di catatan.'
                      : 'Dari stok RUNA: beratnya dikurangkan dari stok organik.',
                  },
                  {
                    name: 'productCategoryId',
                    label: 'Masukkan ke stok produk',
                    type: 'select',
                    options: inGroup('PRODUK'),
                    emptyLabel: 'Hanya dicatat',
                    visible: (v) => v.type === 'HARVEST' || v.type === 'FRASS',
                    help: 'Stok produk bisa dijual lewat Marketplace.',
                  },
                  { name: 'recordedAt', label: 'Waktu', type: 'datetime-local', required: true },
                  { name: 'note', label: 'Catatan', type: 'textarea' },
                ]}
                onSubmit={async ({ feedCategoryId, productCategoryId, ...record }) => {
                  // Diperiksa di sini karena saat offline server belum bisa menolak.
                  if (record.type !== 'OBSERVATION' && record.weightKg == null) {
                    throw new Error(
                      isBsf ? 'Isi berat untuk catatan pakan, panen, atau residu.' : 'Isi berat untuk catatan bahan atau panen kompos.',
                    )
                  }
                  const wasteCategoryId = feedCategoryId ?? productCategoryId
                  const weight = record.weightKg == null ? '' : ` ${kg(record.weightKg as number)}`
                  // Simpan ke perangkat dulu, baru kirim: catatan aman walau sinyal hilang di kandang.
                  await queue.add(
                    `/organic/batches/${batch.id}/records`,
                    { ...record, ...(wasteCategoryId != null && { wasteCategoryId }) },
                    { label: `Batch ${batch.code}: ${recordLabel(method, record.type as OrganicRecord['type'])}${weight}` },
                  )
                  await syncQueue()
                  reload()
                }}
              />
            </div>
          )}

          <Timeline records={batch.records} method={method} />
        </Card>
        )
      })}
    </>
  )
}
