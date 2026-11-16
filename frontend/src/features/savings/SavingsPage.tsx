// Tabungan nasabah: insentif setoran per KK (bagian Sasa, DSA Cibunian).
import { useEffect, useRef, useState } from 'react'
import { PiggyBank, ReceiptText, Wallet } from 'lucide-react'
import { Card, Form, StaleNote, Table } from '../../components/Resource'
import { PageHeader } from '../../components/ui'
import { useApi } from '../../hooks/useApi'
import { api } from '../../services/api'
import type { SavingsAccount, SavingsHistory, User } from '../../types'
import { dateTime, kg, rupiah } from '../../utils/format'

const total = (rows: SavingsAccount[], key: 'balance' | 'withdrawnAmount') =>
  rows.reduce((sum, r) => sum + Number(r[key]), 0)

/** Riwayat satu KK: setoran (masuk) dan penarikan (keluar), terbaru di atas. */
function AccountDetail({
  householdId,
  canWithdraw,
  onClose,
  onChange,
}: {
  householdId: string
  canWithdraw: boolean
  onClose: () => void
  onChange: () => void
}) {
  const { data, error, reload } = useApi<SavingsHistory>(`/savings/${householdId}`)
  const ref = useRef<HTMLDivElement>(null)

  // Di ponsel rincian bisa berada di luar layar dari baris yang diketuk.
  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
  }, [householdId])

  const entries = data
    ? [
        ...data.deposits.map((d) => ({
          id: `d-${d.id}`,
          at: d.recordedAt,
          text: `Setor ${d.wasteCategory.name} ${kg(d.weightKg)}`,
          amount: d.creditAmount == null ? null : Number(d.creditAmount),
        })),
        ...data.withdrawals.map((w) => ({
          id: `w-${w.id}`,
          at: w.createdAt,
          text: `Penarikan${w.note ? `: ${w.note}` : ''} (dicatat ${w.recordedBy.name})`,
          amount: -Number(w.amount),
        })),
      ].sort((a, b) => b.at.localeCompare(a.at))
    : undefined

  return (
    <div ref={ref} className="scroll-target">
      <Card
        title={data ? `Tabungan ${data.household.name}` : 'Tabungan'}
        icon={ReceiptText}
        actions={
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Tutup
          </button>
        }
      >
        <StaleNote error={error} />
        {data && (
          <>
            <div className="saldo">
              <span>Saldo saat ini</span>
              <strong>{rupiah(data.balance)}</strong>
            </div>
            {canWithdraw && Number(data.balance) > 0 && (
              <div className="form-box">
                <Form
                  submitLabel="Catat penarikan"
                  fields={[
                    {
                      name: 'amount',
                      label: 'Jumlah ditarik (Rp)',
                      type: 'number',
                      step: '1',
                      min: '1',
                      required: true,
                      help: `Paling banyak ${rupiah(data.balance)}.`,
                    },
                    { name: 'note', label: 'Catatan', help: 'Mis. diambil tunai, ditukar sembako.' },
                  ]}
                  onSubmit={async (payload) => {
                    await api.post(`/savings/${householdId}/withdrawals`, payload)
                    reload()
                    onChange()
                  }}
                />
              </div>
            )}
          </>
        )}
        <Table
          rows={entries}
          empty="Belum ada setoran atas nama KK ini."
          columns={[
            { label: 'Waktu', render: (e) => dateTime(e.at) },
            { label: 'Keterangan', render: (e) => e.text },
            {
              label: 'Jumlah',
              align: 'end',
              render: (e) =>
                e.amount == null ? (
                  <span className="text-secondary">Tanpa harga beli</span>
                ) : (
                  <span className={e.amount < 0 ? 'text-danger' : undefined}>
                    {e.amount < 0 ? `− ${rupiah(-e.amount)}` : `+ ${rupiah(e.amount)}`}
                  </span>
                ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

export function SavingsPage({ user }: { user: User }) {
  const canWithdraw = user.role === 'ADMIN' || user.role === 'PENGURUS'
  const [refresh, setRefresh] = useState(0)
  const { data, error, cachedAt } = useApi<SavingsAccount[]>('/savings', refresh)
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <PageHeader
        icon={PiggyBank}
        title="Tabungan Nasabah"
        lead="Setoran atas nama KK menambah tabungannya sebesar berat dikali harga beli kategori. Harga beli diatur di Data Master; penarikan dicatat pengurus."
        stats={
          data && [
            { label: 'Total saldo nasabah', value: rupiah(total(data, 'balance')), tone: 'uang' },
            { label: 'KK bersaldo', value: data.filter((r) => Number(r.balance) > 0).length },
            { label: 'Sudah dibayarkan', value: rupiah(total(data, 'withdrawnAmount')), tone: 'uang' },
          ]
        }
      />
      <StaleNote at={cachedAt} error={error} />

      {selected && (
        <AccountDetail
          key={selected}
          householdId={selected}
          canWithdraw={canWithdraw}
          onClose={() => setSelected(null)}
          onChange={() => setRefresh((n) => n + 1)}
        />
      )}

      <Card title="Saldo per KK" icon={Wallet}>
        <Table
          rows={data}
          empty="Belum ada nasabah. Tambahkan rumah tangga di Data Master."
          columns={[
            { label: 'Nama', render: (r) => (r.active ? r.name : `${r.name} (nonaktif)`) },
            { label: 'RT/RW', render: (r) => `${r.rt ?? '-'}/${r.rw ?? '-'}` },
            { label: 'Saldo', align: 'end', render: (r) => <strong>{rupiah(r.balance)}</strong> },
            { label: 'Setoran terakhir', render: (r) => (r.lastDepositAt ? dateTime(r.lastDepositAt) : 'Belum pernah') },
            {
              label: '',
              align: 'end',
              render: (r) => (
                <button className="btn btn-sm btn-outline-success" onClick={() => setSelected(r.id)}>
                  Rincian
                </button>
              ),
            },
          ]}
        />
      </Card>
    </>
  )
}
