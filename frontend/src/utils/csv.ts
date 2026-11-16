// Ekspor CSV untuk dibuka di Excel / Google Sheets.
// ponytail: format Indonesia (pemisah titik koma, desimal koma, UTF-8 dengan BOM). Excel yang
// berformat Inggris membacanya sebagai satu kolom; ganti ke berkas .xlsx (butuh library) bila
// itu jadi masalah.
export type Cell = string | number | null | undefined

function cell(value: Cell): string {
  if (value == null) return ''
  if (typeof value === 'number') return String(value).replace('.', ',')
  // Teks isian pengguna yang diawali = + - @ akan dijalankan Excel sebagai rumus: netralkan.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return '﻿' + [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')
}

/** Unduh sebagai berkas lewat tautan sementara. */
export function downloadCsv(filename: string, headers: string[], rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
