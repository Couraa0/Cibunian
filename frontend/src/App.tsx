import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router'
import {
  Boxes,
  BrickWall,
  ChartColumn,
  Database,
  Ellipsis,
  House,
  PiggyBank,
  Scale,
  Sprout,
  Store,
  Truck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ReloadPrompt } from './ReloadPrompt'
import { StatusBadge } from './components/common/StatusBadge'
import { BrandMark } from './components/ui'
import { AccountPage } from './features/account/AccountPage'
import { LoginPage } from './features/auth/LoginPage'
import { CollectionPage } from './features/collection/CollectionPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { MarketplacePage } from './features/marketplace/MarketplacePage'
import { MasterPage } from './features/master/MasterPage'
import { OrganicPage } from './features/organic/OrganicPage'
import { PickupsPage } from './features/pickups/PickupsPage'
import { PlasticPage } from './features/plastic/PlasticPage'
import { SavingsPage } from './features/savings/SavingsPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { useQueue } from './hooks/useQueue'
import { LOGOUT_EVENT, session, syncQueue } from './services/api'
import { initials, label } from './utils/format'

interface NavItem {
  to: string
  label: string
  /** Label pendek untuk tab bawah di ponsel. */
  short?: string
  icon: LucideIcon
}

const STAFF_NAV: NavItem[] = [
  { to: '/', label: 'Beranda', icon: House },
  { to: '/pengumpulan', label: 'Pengumpulan', short: 'Catat', icon: Scale },
  { to: '/tabungan', label: 'Tabungan Nasabah', icon: PiggyBank },
  { to: '/stok', label: 'Stok Material', short: 'Stok', icon: Boxes },
  { to: '/pengangkutan', label: 'Pengangkutan', short: 'Angkut', icon: Truck },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
  { to: '/organik', label: 'Olah Organik', icon: Sprout },
  { to: '/plastik', label: 'Paving Block', icon: BrickWall },
  { to: '/laporan', label: 'Laporan', icon: ChartColumn },
  { to: '/data', label: 'Data Master', icon: Database },
]
const MITRA_NAV: NavItem[] = [{ to: '/marketplace', label: 'Marketplace', icon: Store }]

// Tab bawah di ponsel: empat tujuan tersering, dengan "Catat" di tengah. Sisanya di "Lainnya".
const STAFF_TABS = ['/', '/stok', '/pengumpulan', '/pengangkutan']
const PRIMARY_TAB = '/pengumpulan'

function App() {
  const [user, setUser] = useState(session.user)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { pathname } = useLocation()
  const isOnline = useNetworkStatus()
  const pending = useQueue()

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener(LOGOUT_EVENT, onLogout)
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout)
  }, [])

  // Kirim antrean offline saat aplikasi dibuka, koneksi kembali, atau tab aktif lagi.
  useEffect(() => {
    if (!user) return
    const sync = () => {
      if (document.visibilityState === 'visible') void syncQueue()
    }
    sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [user])

  if (!user) {
    return (
      <>
        <LoginPage onLogin={setUser} isOnline={isOnline} />
        <ReloadPrompt />
      </>
    )
  }

  const isMitra = user.role === 'MITRA'
  const nav = isMitra ? MITRA_NAV : STAFF_NAV
  const tabs = isMitra
    ? MITRA_NAV
    : STAFF_TABS.map((to) => STAFF_NAV.find((item) => item.to === to)!)
  const more = nav.filter((item) => !tabs.includes(item))

  // Posisi penanda halaman aktif (dipakai CSS lewat --aktif). Di tab bawah penanda pindah ke
  // "Lainnya" saat lembar menunya terbuka atau halaman yang dibuka ada di dalamnya.
  const here = pathname.replace(/\/+$/, '') || '/'
  const railIndex = nav.findIndex((item) => item.to === here) // -1 di halaman Akun
  const tabIndex = tabs.findIndex((item) => item.to === here)
  const activeTab = sheetOpen || tabIndex < 0 ? tabs.length : tabIndex
  const tabClass = (index: number, extra = '') => `${extra} ${index === activeTab ? 'aktif' : ''}`

  const badge = <StatusBadge isOnline={isOnline} pending={pending.length} />

  const logout = () => {
    // Antrean tetap di perangkat; akan terkirim atas nama akun yang login berikutnya.
    const ok =
      !pending.length ||
      confirm(`Masih ada ${pending.length} transaksi belum tersinkron. Tetap keluar?`)
    if (ok) session.clear()
  }
  const account = (buttonClass: string, status?: ReactNode) => (
    <div className="account">
      {status && <div className="mb-2">{status}</div>}
      <div className="account-id">
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <div>
          <div className="fw-bold">{user.name}</div>
          <div className="opacity-75">{label(user.role)}</div>
        </div>
      </div>
      <div className="d-flex flex-wrap gap-2">
        <Link to="/akun" className={`btn btn-sm ${buttonClass}`} onClick={() => setSheetOpen(false)}>
          Akun
        </Link>
        <button className={`btn btn-sm ${buttonClass}`} onClick={logout}>
          Keluar
        </button>
      </div>
    </div>
  )
  const link = (item: NavItem) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setSheetOpen(false)}>
      <item.icon size={20} aria-hidden />
      {item.label}
    </NavLink>
  )

  return (
    <div className="app">
      <nav className="rail" aria-label="Menu utama">
        <div className="brand">
          <BrandMark size={34} />
          <div>
            RUNA LOOP
            <small>Bank Sampah Desa Cibunian</small>
          </div>
        </div>
        <div
          className={railIndex < 0 ? 'rail-menu tanpa-aktif' : 'rail-menu'}
          style={{ '--aktif': Math.max(railIndex, 0) } as CSSProperties}
        >
          {nav.map(link)}
        </div>
        {account('btn-outline-light', badge)}
      </nav>

      <header className="mobile-top">
        <div className="brand">
          <BrandMark size={26} />
          RUNA LOOP
        </div>
        {badge}
      </header>

      <main className="content">
        <Routes>
          {isMitra ? (
            <Route path="/marketplace" element={<MarketplacePage user={user} />} />
          ) : (
            <>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/pengumpulan" element={<CollectionPage />} />
              <Route path="/tabungan" element={<SavingsPage user={user} />} />
              <Route path="/stok" element={<InventoryPage user={user} />} />
              <Route path="/pengangkutan" element={<PickupsPage user={user} />} />
              <Route path="/marketplace" element={<MarketplacePage user={user} />} />
              <Route path="/organik" element={<OrganicPage />} />
              <Route path="/plastik" element={<PlasticPage />} />
              <Route path="/laporan" element={<ReportsPage user={user} />} />
              <Route path="/data" element={<MasterPage user={user} />} />
            </>
          )}
          <Route path="/akun" element={<AccountPage user={user} />} />
          <Route path="*" element={<Navigate to={isMitra ? '/marketplace' : '/'} replace />} />
        </Routes>
      </main>

      {sheetOpen && (
        <>
          <div className="backdrop" onClick={() => setSheetOpen(false)} />
          <nav id="menu-lainnya" className="sheet" aria-label="Menu lainnya">
            {more.map(link)}
            {account('btn-outline-secondary')}
          </nav>
        </>
      )}

      <nav
        className="tabbar"
        aria-label="Menu cepat"
        style={{ '--aktif': activeTab, '--jumlah': tabs.length + 1 } as CSSProperties}
      >
        <i className="gelembung" aria-hidden />
        {tabs.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={tabClass(index, item.to === PRIMARY_TAB ? 'utama' : '')}
            onClick={() => setSheetOpen(false)}
          >
            <span>
              <item.icon size={22} aria-hidden />
            </span>
            {item.short ?? item.label}
          </NavLink>
        ))}
        <button
          className={tabClass(tabs.length)}
          aria-expanded={sheetOpen}
          aria-controls="menu-lainnya"
          onClick={() => setSheetOpen((open) => !open)}
        >
          <span>
            <Ellipsis size={22} aria-hidden />
          </span>
          Lainnya
        </button>
      </nav>

      <ReloadPrompt />
    </div>
  )
}

export default App
