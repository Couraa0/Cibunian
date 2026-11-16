import { useCallback, useState } from 'react'
import { Truck } from 'lucide-react'
import { PendingCard } from '../../components/Pending'
import { Resource } from '../../components/Resource'
import { useOptions } from '../../hooks/useApi'
import { useOnSynced, useQueue } from '../../hooks/useQueue'
import { syncQueue } from '../../services/api'
import { queue } from '../../services/offline'
import type { Pickup, User } from '../../types'
import { dateTime, kg, label, options } from '../../utils/format'
import { PageHeader } from '../../components/ui'

export function PickupsPage({ user }: { user: User }) {
  const canManage = user.role !== 'PETUGAS'
  const points = useOptions('/collection-points')
  const users = useOptions(canManage ? '/users' : null)
  const queued = useQueue().filter((q) => q.path.startsWith('/pickups/'))
  const [refresh, setRefresh] = useState(0)
  useOnSynced(
    queued.length,
    useCallback(() => setRefresh((n) => n + 1), []),
  )
  // Perubahan terakhir yang masih di perangkat untuk satu jadwal.
  const pendingFor = (id: string) => queued.filter((q) => q.path === `/pickups/${id}`).at(-1)

  return (
    <>
      <PageHeader
        icon={Truck}
        title="Pengangkutan"
        lead="Memindahkan material dari titik ke RUNA atau pengepul. Berat yang dipindahkan tidak dihitung sebagai pengumpulan baru. Status bisa diperbarui tanpa sinyal."
      />

      <PendingCard items={queued} />

      <Resource<Pickup>
        title="Jadwal pengangkutan"
        path="/pickups"
        addLabel="Buat jadwal"
        refreshKey={refresh}
        fields={
          canManage
            ? [
                { name: 'collectionPointId', label: 'Titik', type: 'select', options: points, required: true },
                { name: 'scheduledAt', label: 'Jadwal', type: 'datetime-local', required: true },
                { name: 'assignedToId', label: 'Petugas', type: 'select', options: users },
                { name: 'notes', label: 'Catatan', type: 'textarea' },
              ]
            : undefined
        }
        editFields={[
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            required: true,
            options: options('SCHEDULED', 'IN_PROGRESS', 'DONE', 'CANCELLED'),
          },
          {
            name: 'movedWeightKg',
            label: 'Berat dipindahkan (kg)',
            type: 'number',
            min: '0',
            help: 'Wajib diisi saat status Selesai.',
          },
          { name: 'handedOverTo', label: 'Diserahkan kepada', help: 'Pengepul atau mitra penerima.' },
          { name: 'notes', label: 'Catatan', type: 'textarea' },
        ]}
        onEdit={async (pickup, payload) => {
          // Diperiksa di sini karena saat offline server belum bisa menolak.
          if (payload.status === 'DONE' && payload.movedWeightKg == null) {
            throw new Error('Isi berat yang dipindahkan untuk status Selesai.')
          }
          const weight = payload.movedWeightKg == null ? '' : `, ${kg(payload.movedWeightKg as number)}`
          // Simpan ke perangkat dulu, baru kirim: status tetap tercatat walau sinyal hilang.
          await queue.add(`/pickups/${pickup.id}`, payload, {
            method: 'PATCH',
            label: `${pickup.collectionPoint.name}: ${label(String(payload.status))}${weight}`,
          })
          await syncQueue()
        }}
        columns={[
          { label: 'Jadwal', render: (p) => dateTime(p.scheduledAt) },
          { label: 'Titik', render: (p) => p.collectionPoint.name },
          { label: 'Petugas', render: (p) => p.assignedTo?.name ?? '-' },
          {
            label: 'Status',
            render: (p) => {
              const pending = pendingFor(p.id)
              return pending ? (
                <>
                  {label(String(pending.body.status))} <small className="text-secondary">(belum tersinkron)</small>
                </>
              ) : (
                label(p.status)
              )
            },
          },
          { label: 'Dipindahkan', align: 'end', render: (p) => kg(p.movedWeightKg) },
          { label: 'Diserahkan kepada', render: (p) => p.handedOverTo ?? '-' },
        ]}
      />
    </>
  )
}
