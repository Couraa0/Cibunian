import { useEffect, useRef, useState } from 'react'
import { queue, QUEUE_EVENT } from '../services/offline'
import type { QueueItem } from '../services/offline'

/** Isi antrean transaksi offline di perangkat ini; ikut berubah saat antrean berubah. */
export function useQueue(): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>([])

  useEffect(() => {
    const load = () => void queue.all().then(setItems)
    load()
    window.addEventListener(QUEUE_EVENT, load)
    return () => window.removeEventListener(QUEUE_EVENT, load)
  }, [])

  return items
}

/**
 * Panggil `callback` setiap kali jumlah antrean berkurang, yaitu saat ada yang baru tersinkron:
 * waktunya memuat ulang data dari server. `callback` harus stabil (mis. `reload` dari useApi).
 */
export function useOnSynced(pending: number, callback: () => void) {
  const previous = useRef(pending)
  useEffect(() => {
    if (pending < previous.current) callback()
    previous.current = pending
  }, [pending, callback])
}
