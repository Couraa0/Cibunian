// Form, tabel, dan gabungan keduanya (Resource) yang dipakai hampir semua halaman modul.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { dateTime, toLocalInput } from '../utils/format'

export interface Field {
  name: string
  label: string
  type?: 'text' | 'number' | 'datetime-local' | 'select' | 'textarea' | 'checkbox' | 'password'
  options?: { value: string; label: string }[]
  /** Teks pilihan kosong pada select yang tidak wajib. Default "(tidak ada)". */
  emptyLabel?: string
  required?: boolean
  /** Tampil hanya bila fungsi ini benar untuk isian saat ini; kolom tersembunyi tidak dikirim. */
  visible?: (values: Values) => boolean
  /** Untuk type number. Default 0.001 (gram). */
  step?: string
  min?: string
  help?: string
  /** Nilai awal form baru. datetime-local tanpa default = waktu sekarang. */
  default?: string | boolean
  /** Petunjuk isi otomatis browser. Default: password = "new-password", lainnya "off". */
  autoComplete?: string
}

export type Values = Record<string, string | boolean>

function initialValues(fields: Field[], initial?: Record<string, unknown>): Values {
  const values: Values = {}
  for (const f of fields) {
    const raw = initial?.[f.name]
    if (f.type === 'checkbox') values[f.name] = Boolean(raw ?? f.default ?? false)
    else if (f.type === 'datetime-local')
      values[f.name] = toLocalInput(raw ? new Date(String(raw)) : new Date())
    else values[f.name] = raw == null ? String(f.default ?? '') : String(raw)
  }
  return values
}

function toPayload(fields: Field[], values: Values) {
  const payload: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.visible && !f.visible(values)) continue
    const value = values[f.name]
    if (f.type === 'checkbox') payload[f.name] = Boolean(value)
    else if (value === '') continue // kolom opsional yang kosong tidak dikirim
    else if (f.type === 'number') payload[f.name] = Number(value)
    else if (f.type === 'datetime-local') payload[f.name] = new Date(String(value)).toISOString()
    else payload[f.name] = value
  }
  return payload
}

interface FormProps {
  fields: Field[]
  initial?: Record<string, unknown>
  submitLabel?: string
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>
  onCancel?: () => void
}

export function Form({ fields, initial, submitLabel = 'Simpan', onSubmit, onCancel }: FormProps) {
  const formId = useId()
  const [values, setValues] = useState(() => initialValues(fields, initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(toPayload(fields, values))
      setValues(initialValues(fields, initial))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="row g-2 align-items-start" onSubmit={submit}>
      {fields.map((f) => {
        if (f.visible && !f.visible(values)) return null
        const id = `${formId}-${f.name}`
        const value = values[f.name]
        if (f.type === 'checkbox') {
          return (
            <div className="col-12 col-md-6 col-lg-4 form-cek" key={f.name}>
              <div className="form-check">
                <input
                  id={id}
                  type="checkbox"
                  className="form-check-input"
                  checked={Boolean(value)}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
                <label className="form-check-label" htmlFor={id}>
                  {f.label}
                </label>
              </div>
            </div>
          )
        }
        const common = {
          id,
          required: f.required,
          value: String(value),
          onChange: (e: { target: { value: string } }) => set(f.name, e.target.value),
        }
        return (
          <div className={f.type === 'textarea' ? 'col-12' : 'col-12 col-md-6 col-lg-4'} key={f.name}>
            <label className="form-label mb-1 small fw-semibold" htmlFor={id}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </label>
            {f.type === 'select' ? (
              <select className="form-select" {...common}>
                <option value="">{f.required ? 'Pilih…' : (f.emptyLabel ?? '(tidak ada)')}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="form-control" rows={2} {...common} />
            ) : (
              <input
                className="form-control"
                type={f.type ?? 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                step={f.type === 'number' ? (f.step ?? '0.001') : undefined}
                min={f.min}
                autoComplete={f.autoComplete ?? (f.type === 'password' ? 'new-password' : 'off')}
                {...common}
              />
            )}
            {f.help && <div className="form-text">{f.help}</div>}
          </div>
        )
      })}
      {error && (
        <div className="col-12">
          <div className="alert alert-danger py-2 mb-0" role="alert">
            {error}
          </div>
        </div>
      )}
      <div className="col-12 d-flex gap-2">
        <button className="btn btn-success" disabled={busy}>
          {busy ? 'Menyimpan…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Batal
          </button>
        )}
      </div>
    </form>
  )
}

export interface Column<T> {
  label: string
  render: (row: T) => ReactNode
  align?: 'end'
}

/** Baris yang langsung tampil; sisanya dibuka dengan satu ketukan agar halaman tidak memanjang. */
const PREVIEW_ROWS = 10

/**
 * Tabel yang tidak muat di wadahnya ditumpuk menjadi kartu "label: nilai" supaya tidak perlu
 * digeser ke samping. Ukurannya lebar WADAH, bukan layar: tabel delapan kolom di tablet rebah
 * (wadah menyempit karena rel samping) sama sesaknya dengan di ponsel.
 * Hasilnya ditulis ke atribut data-tumpuk yang dibaca CSS: "satu" kolom, atau "dua" kolom bila
 * wadah cukup lebar. Ditulis langsung ke elemen sebelum layar digambar, jadi tidak berkedip.
 */
function useStackWhenNarrow(columnCount: number) {
  // Callback ref: dipanggil saat wadah terpasang (sebelum layar digambar) dan dibersihkan saat dilepas.
  return useCallback(
    (wrapper: HTMLDivElement | null) => {
      if (!wrapper) return
      // Lebar rata-rata per kolom agar isi masih nyaman dibaca; tabel kecil berisi angka boleh lebih rapat.
      const needed = columnCount * (columnCount > 3 ? 105 : 88)
      const apply = () => {
        const width = wrapper.clientWidth
        if (width >= needed) wrapper.removeAttribute('data-tumpuk')
        else wrapper.setAttribute('data-tumpuk', width >= 520 ? 'dua' : 'satu')
      }
      apply()
      const observer = new ResizeObserver(apply)
      observer.observe(wrapper)
      return () => observer.disconnect()
    },
    [columnCount],
  )
}

export function Table<T extends { id: string }>({
  columns,
  rows,
  empty = 'Belum ada data.',
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  empty?: string
}) {
  const [showAll, setShowAll] = useState(false)
  const wrapperRef = useStackWhenNarrow(columns.length)
  if (!rows) return <p className="text-secondary mb-0">Memuat…</p>
  if (!rows.length) return <Empty text={empty} />
  const shown = showAll ? rows : rows.slice(0, PREVIEW_ROWS)
  return (
    <div className="table-responsive" ref={wrapperRef}>
      <table className="table align-middle mb-0">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} className={c.align === 'end' ? 'text-end' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => {
                const content = c.render(row)
                const blank = content == null || content === false || content === ''
                return (
                  // data-label dipakai CSS untuk menampilkan nama kolom saat baris ditumpuk.
                  // Isi dibungkus satu elemen supaya tetap utuh di sisi kanan label.
                  <td key={c.label} data-label={c.label} className={c.align === 'end' ? 'text-end' : undefined}>
                    {!blank && <span>{content}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <button className="btn btn-sm btn-outline-secondary w-100 mt-2 no-print" onClick={() => setShowAll(true)}>
          Tampilkan semua ({rows.length})
        </button>
      )}
    </div>
  )
}

/** Penanda bahwa data yang tampil adalah data offline, beserta waktu sinkron terakhir. */
export function StaleNote({ at, error }: { at?: number | null; error?: string }) {
  if (at) {
    return (
      <div className="alert alert-warning py-2" role="status">
        Offline — menampilkan data terakhir per {dateTime(at)}.
      </div>
    )
  }
  return error ? (
    <div className="alert alert-danger py-2" role="alert">
      {error}
    </div>
  ) : null
}

export function Card({
  title,
  icon: Icon,
  actions,
  children,
}: {
  title: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          {Icon && (
            <span className="panel-ikon" aria-hidden="true">
              <Icon size={17} />
            </span>
          )}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Keadaan kosong: satu kalimat yang mengarahkan ke langkah berikutnya. */
export function Empty({ text }: { text: ReactNode }) {
  return <p className="kosong">{text}</p>
}

interface ResourceProps<T> {
  title: string
  /** Endpoint daftar, mis. "/buyers". POST ke path yang sama, PATCH ke path/:id. */
  path: string
  columns: Column<T>[]
  /** Kolom form tambah. Kosong = hanya daftar. */
  fields?: Field[]
  /** Kolom form ubah (PATCH). Kosong = baris tidak bisa diubah. */
  editFields?: Field[]
  /** Path POST bila berbeda dari path daftar. */
  createPath?: string
  /** Pengganti PATCH langsung, mis. untuk menyimpan perubahan lewat antrean offline. */
  onEdit?: (row: T, payload: Record<string, unknown>) => Promise<unknown>
  addLabel?: string
  empty?: string
  /** Dipanggil setelah data berubah, untuk memuat ulang bagian lain halaman. */
  onChange?: () => void
  /** Ubah angka ini untuk memaksa daftar dimuat ulang dari luar. */
  refreshKey?: number
}

export function Resource<T extends { id: string }>({
  title,
  path,
  columns,
  fields,
  editFields,
  createPath = path,
  onEdit,
  addLabel = 'Tambah',
  empty,
  onChange,
  refreshKey = 0,
}: ResourceProps<T>) {
  const { data, error, cachedAt, reload } = useApi<T[]>(path, refreshKey)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)

  // Form muncul di atas daftar: di ponsel bisa berada di luar layar dari baris yang diketuk.
  const formRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!adding && !editing) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
  }, [adding, editing])

  const done = () => {
    setAdding(false)
    setEditing(null)
    reload()
    onChange?.()
  }

  const allColumns: Column<T>[] = editFields
    ? [
        ...columns,
        {
          label: '',
          align: 'end',
          render: (row) => (
            <button className="btn btn-sm btn-outline-success" onClick={() => setEditing(row)}>
              Ubah
            </button>
          ),
        },
      ]
    : columns

  return (
    <Card
      title={title}
      actions={
        fields &&
        !adding &&
        !editing && (
          <button className="btn btn-sm btn-success" onClick={() => setAdding(true)}>
            + {addLabel}
          </button>
        )
      }
    >
      <StaleNote at={cachedAt} error={error} />
      {adding && fields && (
        <div className="form-box" ref={editing ? undefined : formRef}>
          <Form
            fields={fields}
            onSubmit={(payload) => api.post(createPath, payload).then(done)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {editing && editFields && (
        <div className="form-box" ref={formRef}>
          <p className="small fw-semibold mb-2">
            Mengubah {columns[0].render(editing)}
            {columns[1] && <> ({columns[1].render(editing)})</>}
          </p>
          <Form
            key={editing.id}
            fields={editFields}
            initial={editing as Record<string, unknown>}
            submitLabel="Simpan perubahan"
            onSubmit={(payload) =>
              (onEdit ? onEdit(editing, payload) : api.patch(`${path}/${editing.id}`, payload)).then(done)
            }
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      <Table columns={allColumns} rows={data} empty={empty} />
    </Card>
  )
}
