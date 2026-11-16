// Daftar transaksi yang masih di perangkat (antrean offline), dipakai halaman yang bisa mencatat tanpa sinyal.
import { syncQueue } from '../services/api'
import { queue } from '../services/offline'
import type { QueueItem } from '../services/offline'
import { dateTime } from '../utils/format'
import { Card, Table } from './Resource'
import type { Column } from './Resource'

const statusColumns: Column<QueueItem>[] = [
  {
    label: 'Status',
    render: (q) =>
      q.error ? (
        <span className="text-danger">Ditolak: {q.error}</span>
      ) : (
        <span className="text-secondary">Menunggu koneksi</span>
      ),
  },
  {
    label: '',
    align: 'end',
    render: (q) =>
      q.error && (
        <span className="d-inline-flex gap-1">
          <button
            className="btn btn-sm btn-outline-success"
            onClick={() => void queue.put({ ...q, error: undefined }).then(syncQueue)}
          >
            Coba lagi
          </button>
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => confirm('Hapus catatan ini dari perangkat?') && void queue.remove(q.id)}
          >
            Hapus
          </button>
        </span>
      ),
  },
]

/**
 * Kartu "Belum tersinkron". Tidak tampil bila antrean kosong. `columns` merinci isi item;
 * tanpa itu yang tampil adalah ringkasan (`label`) yang disimpan saat item dibuat.
 */
export function PendingCard({ items, columns }: { items: QueueItem[]; columns?: Column<QueueItem>[] }) {
  if (!items.length) return null
  return (
    <Card
      title={`Belum tersinkron (${items.length})`}
      actions={
        <button className="btn btn-sm btn-outline-success" onClick={() => void syncQueue()}>
          Sinkronkan sekarang
        </button>
      }
    >
      <Table
        rows={items}
        columns={[
          { label: 'Dicatat', render: (q) => dateTime(q.createdAt) },
          ...(columns ?? [{ label: 'Perubahan', render: (q: QueueItem) => q.label ?? q.path }]),
          ...statusColumns,
        ]}
      />
    </Card>
  )
}
