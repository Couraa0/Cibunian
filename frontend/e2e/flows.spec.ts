import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { emptyAnalytics, emptyDashboard, emptyReport, login, mockApi, MITRA, PENGURUS, PETUGAS } from './helpers'

const plastik = { id: 'c-plastik', name: 'Plastik', group: 'ANORGANIK', listed: true, pricePerKg: '3000', stockKg: '20', active: true }
const organik = { id: 'c-organik', name: 'Organik', group: 'ORGANIK', listed: false, pricePerKg: null, active: true }
const maggot = { id: 'c-maggot', name: 'Maggot BSF', group: 'PRODUK', listed: true, pricePerKg: '8000', active: true }
const pembeli = { id: 'b1', name: 'Pengepul A', phone: null, address: null, notes: null, active: true }
const UUID = /^[0-9a-f-]{36}$/

test('pengurus mencatat penjualan langsung dan melihatnya di daftar', async ({ page }) => {
  const sales: object[] = []
  const api = await mockApi(page, PENGURUS, {
    'GET /marketplace/listings': [plastik],
    'GET /buyers': [pembeli],
    'GET /sales': () => sales,
    'POST /sales': ({ body }) => {
      const sale = { id: 's1', ...body, totalAmount: '15000', buyer: { name: pembeli.name }, wasteCategory: { name: plastik.name } }
      sales.push(sale)
      return sale
    },
  })
  await login(page, '/marketplace')

  await page.getByRole('button', { name: 'Catat penjualan langsung' }).click()
  await page.getByLabel('Pembeli').selectOption({ label: 'Pengepul A' })
  await page.getByLabel('Material').selectOption({ label: 'Plastik' })
  await page.getByLabel('Berat diserahkan (kg)').fill('5')
  await page.getByLabel('Harga per kg (Rp)').fill('3000')
  await page.getByRole('button', { name: 'Simpan' }).click()

  await expect(page.getByRole('cell', { name: /Rp\s15\.000/ })).toBeVisible()
  expect(api.sent('POST')).toHaveLength(1)
  expect(api.sent('POST')[0].body).toMatchObject({
    buyerId: 'b1',
    wasteCategoryId: 'c-plastik',
    weightKg: 5,
    pricePerKg: 3000,
  })
})

test('mitra hanya melihat Marketplace dan mengajukan permintaan atas nama pembelinya', async ({ page }) => {
  const requests: object[] = []
  const api = await mockApi(page, MITRA, {
    'GET /marketplace/listings': [plastik],
    'GET /marketplace/requests': () => requests,
    'POST /marketplace/requests': ({ body }) => {
      const request = {
        id: 'r1',
        ...body,
        offeredPricePerKg: null,
        status: 'PENDING',
        note: null,
        createdAt: new Date().toISOString(),
        buyer: { name: pembeli.name },
        wasteCategory: { name: plastik.name },
        sale: null,
      }
      requests.push(request)
      return request
    },
  })
  await login(page, '/stok') // halaman staf: mitra dialihkan ke Marketplace

  await expect(page).toHaveURL(/\/marketplace$/)
  await expect(page.locator('.rail-menu a')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Transaksi penjualan' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Buat permintaan' }).click()
  await expect(page.getByLabel('Pembeli')).toHaveCount(0) // pembeli mengikuti akun mitra
  await page.getByLabel('Material').selectOption({ label: 'Plastik' })
  await page.getByLabel('Jumlah (kg)').fill('4')
  await page.getByRole('button', { name: 'Simpan' }).click()

  await expect(page.getByRole('cell', { name: 'Menunggu' })).toBeVisible()
  expect(api.sent('POST')[0].body).toEqual({ wasteCategoryId: 'c-plastik', quantityKg: 4 })
})

test('status pengangkutan disimpan saat offline lalu tersinkron tepat satu kali', async ({ page }) => {
  const pickup = {
    id: 'p1',
    scheduledAt: '2026-11-18T01:00:00.000Z',
    status: 'SCHEDULED',
    movedWeightKg: null as string | null,
    handedOverTo: null,
    notes: null,
    collectionPoint: { name: 'Titik 1' },
    assignedTo: null,
  }
  const api = await mockApi(page, PETUGAS, {
    'GET /pickups': () => [pickup],
    'PATCH /pickups/p1': ({ body }) => Object.assign(pickup, body, { movedWeightKg: String(body?.movedWeightKg) }),
  })
  await login(page, '/pengangkutan')
  await expect(page.getByRole('cell', { name: 'Terjadwal' })).toBeVisible()

  api.net.offline = true
  await page.getByRole('button', { name: 'Ubah' }).click()
  await page.getByLabel('Status').selectOption('DONE')
  await page.getByRole('button', { name: 'Simpan perubahan' }).click()
  // Aturan "Selesai wajib ada berat" diperiksa di perangkat, karena server belum terjangkau.
  await expect(page.getByText('Isi berat yang dipindahkan untuk status Selesai.')).toBeVisible()

  await page.getByLabel('Berat dipindahkan (kg)').fill('12.5')
  await page.getByRole('button', { name: 'Simpan perubahan' }).click()
  const pending = page.getByRole('heading', { name: /Belum tersinkron/ })
  await expect(pending).toHaveText('Belum tersinkron (1)')
  await expect(page.getByRole('cell', { name: 'Selesai (belum tersinkron)' })).toBeVisible()
  expect(api.sent('PATCH')).toHaveLength(0)

  api.net.offline = false
  await page.getByRole('button', { name: 'Sinkronkan sekarang' }).click()
  await expect(pending).toHaveCount(0)
  await expect(page.getByRole('cell', { name: 'Selesai', exact: true })).toBeVisible()
  expect(api.sent('PATCH')).toHaveLength(1)
  expect(api.sent('PATCH')[0].key).toMatch(UUID)
  expect(api.sent('PATCH')[0].body).toEqual({ status: 'DONE', movedWeightKg: 12.5 })
})

test('panen BSF dicatat offline dan masuk ke stok produk saat tersinkron', async ({ page }) => {
  const api = await mockApi(page, PETUGAS, {
    'GET /organic/batches': [
      { id: 'bt1', code: 'BSF-001', startedAt: '2026-11-01T02:00:00.000Z', status: 'ACTIVE', notes: null, records: [] },
    ],
    'GET /categories': [organik, maggot, plastik],
    'POST /organic/batches/bt1/records': ({ body }) => ({ id: 'rec1', ...body }),
  })
  await login(page, '/organik')

  // Pilihan stok mengikuti jenis catatan: panen masuk stok produk, pakan keluar dari stok organik.
  await page.getByLabel('Jenis catatan').selectOption('HARVEST')
  await expect(page.getByLabel('Masukkan ke stok produk')).toBeVisible()
  await expect(page.getByLabel('Sumber pakan')).toHaveCount(0)
  await page.getByLabel('Masukkan ke stok produk').selectOption({ label: 'Maggot BSF' })

  await page.getByRole('button', { name: 'Tambah catatan' }).click()
  await expect(page.getByText('Isi berat untuk catatan pakan, panen, atau residu.')).toBeVisible()

  api.net.offline = true
  await page.getByLabel('Berat (kg)').fill('2.5')
  await page.getByRole('button', { name: 'Tambah catatan' }).click()
  await expect(page.getByRole('heading', { name: /Belum tersinkron/ })).toHaveText('Belum tersinkron (1)')
  await expect(page.getByRole('cell', { name: /Batch BSF-001: Panen larva 2,5 kg/ })).toBeVisible()
  expect(api.sent('POST')).toHaveLength(0)

  api.net.offline = false
  await page.getByRole('button', { name: 'Sinkronkan sekarang' }).click()
  await expect(page.getByRole('heading', { name: /Belum tersinkron/ })).toHaveCount(0)
  expect(api.sent('POST')).toHaveLength(1)
  expect(api.sent('POST')[0].key).toMatch(UUID)
  expect(api.sent('POST')[0].body).toMatchObject({ type: 'HARVEST', weightKg: 2.5, wasteCategoryId: 'c-maggot' })
})

test('tabungan: pengurus melihat saldo KK dan mencatat penarikan', async ({ page }) => {
  let balance = 5000
  const household = { id: 'h1', name: 'Bu Siti', rt: '01', rw: '03', active: true }
  const api = await mockApi(page, PENGURUS, {
    'GET /savings': () => [
      { ...household, creditedAmount: '5000', withdrawnAmount: String(5000 - balance), balance: String(balance), lastDepositAt: new Date().toISOString() },
    ],
    'GET /savings/h1': () => ({
      household,
      balance: String(balance),
      deposits: [
        { id: 'c1', recordedAt: new Date().toISOString(), weightKg: '2.5', creditAmount: '5000', wasteCategory: { name: 'Plastik', group: 'ANORGANIK' } },
      ],
      withdrawals: [],
    }),
    'POST /savings/h1/withdrawals': ({ body }) => {
      balance -= Number(body?.amount)
      return { id: 'w1', householdId: 'h1', amount: String(body?.amount) }
    },
  })
  await login(page, '/tabungan')

  await expect(page.getByRole('cell', { name: /Rp\s5\.000/ })).toBeVisible()
  await page.getByRole('button', { name: 'Rincian' }).click()
  await expect(page.getByRole('cell', { name: 'Setor Plastik 2,5 kg' })).toBeVisible()

  await page.getByLabel(/^Jumlah ditarik/).fill('3000')
  await page.getByRole('button', { name: 'Catat penarikan' }).click()
  await expect(page.getByRole('cell', { name: /Rp\s2\.000/ })).toBeVisible()
  expect(api.sent('POST')).toHaveLength(1)
  expect(api.sent('POST')[0].body).toMatchObject({ amount: 3000 })
})

test('ganti password: ulangan harus sama, lalu perangkat memakai token baru', async ({ page }) => {
  const api = await mockApi(page, PETUGAS, {
    'GET /dashboard': emptyDashboard,
    'POST /auth/password': { accessToken: 'token-baru' },
  })
  await login(page, '/akun')

  await page.getByLabel(/^Password saat ini/).fill('password-lama')
  await page.getByLabel(/^Password baru/).fill('password-baru-1')
  await page.getByLabel(/^Ulangi/).fill('password-baru-2')
  await page.getByRole('button', { name: 'Ganti password' }).click()
  await expect(page.getByText('Password baru dan ulangannya tidak sama.')).toBeVisible()
  expect(api.sent('POST')).toHaveLength(0)

  await page.getByLabel(/^Ulangi/).fill('password-baru-1')
  await page.getByRole('button', { name: 'Ganti password' }).click()
  await expect(page.getByText('Password sudah diganti.')).toBeVisible()
  expect(api.sent('POST')[0].body).toEqual({ currentPassword: 'password-lama', newPassword: 'password-baru-1' })
  expect(await page.evaluate(() => localStorage.getItem('runa.token'))).toBe('token-baru')
})

test('laporan: pembanding periode dan unduhan CSV berformat Indonesia', async ({ page }) => {
  const api = await mockApi(page, PENGURUS, {
    // Tanpa rentang tanggal tidak ada pembanding; dengan rentang, periode sebelumnya 10 kg.
    'GET /reports': ({ query }) =>
      query.has('from')
        ? {
            ...emptyReport,
            collected: { ...emptyReport.collected, totalKg: '15' },
            previous: { collectedKg: '10', soldKg: '0', soldAmount: '0' },
          }
        : emptyReport,
    'GET /reports/analytics': emptyAnalytics,
    'GET /collections': [
      {
        id: 'k1',
        weightKg: '3.500',
        collectionType: 'POINT_COLLECTION',
        recordedAt: '2026-11-10T02:15:00.000Z',
        collectionPoint: { name: 'Titik 1' },
        wasteCategory: { name: 'Plastik' },
        household: { name: '=SUM(A1:A9)' }, // isian pengguna yang berbentuk rumus
        recordedBy: { name: 'Petugas; Tes' },
        weighing: null,
      },
    ],
  })
  await login(page, '/laporan')

  await expect(page.getByText(/naik|turun/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Bulan ini' }).click()
  await expect(page.getByText('naik 50%')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Unduh pengumpulan (CSV)' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^runa-pengumpulan_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = readFileSync(await download.path(), 'utf8')
  const [header, row] = csv.split('\r\n')
  expect(header).toBe('﻿Waktu;Titik;Kategori;Berat (kg);Cara;Rumah tangga;Sumber berat;Petugas')
  // Desimal koma, rumus dinetralkan dengan tanda petik, dan teks berisi titik koma dikutip.
  expect(row).toContain(';Titik 1;Plastik;3,5;Di titik;\'=SUM(A1:A9);Manual;"Petugas; Tes"')
  await expect(page.getByText('Diunduh 1 baris pengumpulan.')).toBeVisible()
  expect(api.sent('GET').find((c) => c.path === '/collections')?.query.get('limit')).toBe('5000')
})

test.describe('ponsel', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('penanda tab bawah mengikuti menu yang dibuka, termasuk menu di "Lainnya"', async ({ page }) => {
    await mockApi(page, PENGURUS, {
      'GET /dashboard': emptyDashboard,
      'GET /reports': emptyReport,
      'GET /reports/analytics': emptyAnalytics,
    })
    await login(page)
    const tabbar = page.locator('.tabbar')
    await expect(tabbar).toHaveAttribute('style', /--aktif:\s*0/)

    await tabbar.getByRole('link', { name: 'Stok' }).click()
    await expect(page).toHaveURL(/\/stok$/)
    await expect(tabbar).toHaveAttribute('style', /--aktif:\s*1/)

    await tabbar.getByRole('button', { name: 'Lainnya' }).click()
    await expect(tabbar).toHaveAttribute('style', /--aktif:\s*4/)
    await page.getByRole('navigation', { name: 'Menu lainnya' }).getByRole('link', { name: 'Laporan' }).click()
    await expect(page).toHaveURL(/\/laporan$/)
    await expect(page.getByRole('heading', { name: 'Laporan & Dampak' })).toBeVisible()
    await expect(tabbar).toHaveAttribute('style', /--aktif:\s*4/)
  })
})
