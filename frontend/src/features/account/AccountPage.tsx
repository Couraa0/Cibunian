import { useState } from 'react'
import { KeyRound, UserRound } from 'lucide-react'
import { Card, Form } from '../../components/Resource'
import { PageHeader } from '../../components/ui'
import { api } from '../../services/api'
import type { User } from '../../types'
import { initials, label } from '../../utils/format'

export function AccountPage({ user }: { user: User }) {
  const [changed, setChanged] = useState(false)

  return (
    <>
      <PageHeader icon={UserRound} title="Akun" lead="Profil Anda dan penggantian password." />

      <Card title="Profil" icon={UserRound}>
        <div className="profil">
          <span className="avatar besar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <dl className="rincian-data">
            <dt>Nama</dt>
            <dd>{user.name}</dd>
            <dt>Username</dt>
            <dd>{user.username}</dd>
            <dt>Role</dt>
            <dd>{label(user.role)}</dd>
          </dl>
        </div>
      </Card>

      <Card title="Ganti password" icon={KeyRound}>
        <p className="text-secondary">
          Setelah diganti, perangkat lain yang masih masuk dengan akun ini akan diminta masuk lagi.
        </p>
        {changed && (
          <div className="alert alert-success py-2" role="status">
            Password sudah diganti.
          </div>
        )}
        <Form
          submitLabel="Ganti password"
          fields={[
            {
              name: 'currentPassword',
              label: 'Password saat ini',
              type: 'password',
              required: true,
              autoComplete: 'current-password',
            },
            { name: 'newPassword', label: 'Password baru', type: 'password', required: true, help: 'Minimal 8 karakter.' },
            { name: 'repeat', label: 'Ulangi password baru', type: 'password', required: true },
          ]}
          onSubmit={async ({ currentPassword, newPassword, repeat }) => {
            setChanged(false)
            if (String(newPassword).length < 8) throw new Error('Password baru minimal 8 karakter.')
            if (newPassword !== repeat) throw new Error('Password baru dan ulangannya tidak sama.')
            await api.changePassword(String(currentPassword), String(newPassword))
            setChanged(true)
          }}
        />
      </Card>
    </>
  )
}
