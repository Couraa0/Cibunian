import type { Page } from '@playwright/test'

export interface Call {
  method: string
  path: string
  query: URLSearchParams
  body: Record<string, unknown> | null
  /** Header Idempotency-Key, bila dikirim (antrean offline). */
  key: string | undefined
}

/** Jawaban tetap (objek/array), atau fungsi yang menyusun jawaban dari panggilannya. */
type Handler = object | ((call: Call) => unknown)

/**
 * Backend palsu di level jaringan, jadi tes hanya butuh dev server frontend.
 * `handlers` dikunci "METHOD /path" (tanpa /api dan tanpa query). Yang tidak terdaftar dijawab [].
 * Set `net.offline = true` untuk memutus koneksi ke API.
 */
export async function mockApi(page: Page, user: object, handlers: Record<string, Handler> = {}) {
  const calls: Call[] = []
  const net = { offline: false }

  await page.route('**/api/**', async (route) => {
    if (net.offline) return route.abort('internetdisconnected')
    const request = route.request()
    const url = new URL(request.url())
    const call: Call = {
      method: request.method(),
      path: url.pathname.replace(/^\/api/, ''),
      query: url.searchParams,
      body: request.postData() ? (request.postDataJSON() as Record<string, unknown>) : null,
      key: request.headers()['idempotency-key'],
    }
    if (call.path === '/auth/login') return route.fulfill({ json: { accessToken: 'token-tes', user } })

    calls.push(call)
    const handler = handlers[`${call.method} ${call.path}`]
    const json = typeof handler === 'function' ? (handler as (call: Call) => unknown)(call) : (handler ?? [])
    return route.fulfill({ status: call.method === 'POST' ? 201 : 200, json })
  })

  return {
    net,
    /** Panggilan ke API (selain login) dengan method tertentu. */
    sent: (method: string) => calls.filter((c) => c.method === method),
  }
}

export async function login(page: Page, path = '/') {
  await page.goto(path)
  await page.getByLabel('Username').fill('akun-tes')
  await page.getByLabel('Password').fill('password-tes')
  await page.getByRole('button', { name: 'Masuk' }).click()
}

const user = (role: string, extra: object = {}) => ({
  id: `u-${role}`,
  name: `Tes ${role}`,
  username: role.toLowerCase(),
  role,
  buyerId: null,
  ...extra,
})

export const PENGURUS = user('PENGURUS')
export const PETUGAS = user('PETUGAS')
export const MITRA = user('MITRA', { buyerId: 'b1' })

export const emptyReport = {
  collected: { totalKg: '0', count: 0, byCategory: [], byPoint: [] },
  moved: { totalKg: '0', count: 0 },
  sold: { totalKg: '0', totalAmount: '0', count: 0 },
  organic: { feedingKg: '0', harvestKg: '0', frassKg: '0' },
  plastic: { processedKg: '0', experiments: 0, prototypes: 0 },
  previous: null,
}

export const emptyDashboard = {
  ...emptyReport,
  flow: { soldKg: '0', processedKg: '0', stockKg: '0' },
  stock: [],
  upcomingPickups: [],
  pending: { weighings: 0, requests: 0 },
  trend: [],
}

export const emptyAnalytics = {
  months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
  collectedKg: [0, 0, 0, 0, 0, 0],
  byPoint: [],
  byCategory: [],
  sales: Array.from({ length: 6 }, () => ({ weightKg: 0, amount: 0 })),
}
