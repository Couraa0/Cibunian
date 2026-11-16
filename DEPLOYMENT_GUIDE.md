# 🚀 Panduan Deploy Frontend & Backend ke Vercel Secara Terpisah

Dokumen ini memandu langkah demi langkah proses deploy proyek **RUNA Circular Integration** ke **Vercel** sebagai dua project terpisah: satu untuk **Backend (NestJS API)** dan satu untuk **Frontend (Vite React PWA)**.

---

## 📋 Ringkasan Perubahan & Kompatibilitas yang Telah Diperbaiki

1. **Pemisahan Dependensi Monorepo (`package.json`)**:
   - Menghapus referensi `"gen-aphyah": "file:.."` dari folder `frontend` dan `backend` sehingga masing-masing folder dapat di-deploy atau di-clone secara independen tanpa error modul hilang saat instalasi di Vercel.
2. **Kompilasi Prisma Otomatis (`backend/package.json`)**:
   - Menyesuaikan script build menjadi `"build": "prisma generate && nest build"` untuk memastikan Prisma Client selalu ter-generate sebelum kompilasi NestJS dimulai.
3. **CORS & Preflight Compatibility (`backend/src/main.ts`)**:
   - Mendukung method `OPTIONS` serta header kustom seperti `Authorization`, `Idempotency-Key`, dan `X-Device-Key` agar komunikasi lintas domain antara Frontend Vercel dan Backend Vercel tidak diblokir browser.
4. **Normalisasi Base URL API (`frontend/src/services/api.ts`)**:
   - Menangani format `VITE_API_URL` agar aman dari kesalahan input (seperti menambahkan garis miring di akhir atau akhiran `/api`).
5. **Konfigurasi Routing Vercel (`vercel.json`)**:
   - `backend/vercel.json`: Menggunakan `@vercel/node` untuk merutekan seluruh request serverless ke NestJS.
   - `frontend/vercel.json`: Mengatur rewrite SPA ke `/index.html` dan header no-cache untuk Service Worker PWA (`/sw.js`).

---

## 🛠️ Persiapan Database Terlebih Dahulu (Supabase / Neon / PostgreSQL)

Karena Vercel Serverless Function tidak menyimpan state dan bersifat dinamis, backend membutuhkan database PostgreSQL yang aktif di cloud (misalnya [Supabase](https://supabase.com) atau [Neon](https://neon.tech)).

1. Buat project baru di Supabase / Neon.
2. Di Supabase: Buka menu **Project Settings** > **Database** > bagian **Connection string**.
3. Ambil URL koneksi:
   - **Transaction Pooler (Port 6543)**: Digunakan untuk runtime backend di Vercel.
     ```text
     postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true
     ```
   - **Direct / Session Connection (Port 5432)**: Digunakan dari komputer lokal Anda untuk menjalankan migrasi skema tabel.
     ```text
     postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require
     ```
4. Jalankan migrasi dan seeding data awal dari komputer lokal:
   ```bash
   cd backend
   # Set sementara environment variabel DATABASE_URL ke URL database cloud Anda
   # Di Windows PowerShell:
   $env:DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require"
   $env:JWT_SECRET="kunci_rahasia_acak_minimal_32_karakter"
   $env:SEED_ADMIN_PASSWORD="AdminPassword123!"

   # Jalankan migrasi Prisma dan seed
   npx prisma migrate deploy
   npm run seed
   ```

---

## 1️⃣ Deploy Proyek Backend ke Vercel

### Langkah A: Import Proyek di Vercel Dashboard
1. Buka [Vercel Dashboard](https://vercel.com/dashboard) dan klik **Add New...** > **Project**.
2. Pilih repository Git Anda.
3. Pada halaman konfigurasi:
   - **Project Name**: Beri nama, misalnya `runa-backend`.
   - **Framework Preset**: Pilih **Other** (atau biarkan default, Vercel akan membaca `backend/vercel.json`).
   - **Root Directory**: Klik **Edit** dan pilih folder `backend` (atau `GEN_APHYAH/backend` jika repository adalah root Astra).

### Langkah B: Konfigurasi Environment Variables Backend
Di bagian **Environment Variables**, tambahkan variabel berikut:

| Key | Value Contoh | Keterangan |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Mode aplikasi produksi |
| `DATABASE_URL` | `postgresql://postgres....:6543/postgres?sslmode=require&uselibpqcompat=true` | Connection string pooler database |
| `JWT_SECRET` | `string_acak_panjang_yang_aman` | Kunci rahasia enkripsi token JWT |
| `IOT_DEVICE_KEY` | `string_kunci_iot_rahasia` | Kunci header `X-Device-Key` timbangan ESP32 |
| `CORS_ORIGIN` | `*` *(sementara)* | Ubah ke URL Frontend Vercel setelah frontend selesai dideploy |

### Langkah C: Deploy & Catat Domain Backend
1. Klik tombol **Deploy**.
2. Setelah deployment selesai, salin URL domain produksi Anda, misalnya:  
   👉 `https://runa-backend.vercel.app`
3. Cek endpoint status di browser: `https://runa-backend.vercel.app/api/status` atau dokumentasi Swagger di `https://runa-backend.vercel.app/docs`.

---

## 2️⃣ Deploy Proyek Frontend ke Vercel

### Langkah A: Import Proyek di Vercel Dashboard
1. Di [Vercel Dashboard](https://vercel.com/dashboard), klik **Add New...** > **Project** lagi (membuat project kedua dari repo yang sama).
2. Pilih repository Git yang sama.
3. Pada halaman konfigurasi:
   - **Project Name**: Beri nama, misalnya `runa-frontend`.
   - **Framework Preset**: Pilih **Vite**.
   - **Root Directory**: Klik **Edit** dan pilih folder `frontend` (atau `GEN_APHYAH/frontend`).
   - **Build Command**: Biarkan default `npm run build`.
   - **Output Directory**: Biarkan default `dist`.

### Langkah B: Konfigurasi Environment Variables Frontend
Di bagian **Environment Variables**, masukkan URL backend yang didapat dari langkah sebelumnya:

| Key | Value Contoh | Keterangan |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://runa-backend.vercel.app` | Alamat URL backend produksi Anda |

> ⚠️ **Penting**: Nilai `VITE_API_URL` dikompilasi ke dalam bundle JavaScript statis saat fase build.

### Langkah C: Deploy & Catat Domain Frontend
1. Klik tombol **Deploy**.
2. Setelah selesai, Anda akan mendapatkan URL frontend, misalnya:  
   👉 `https://runa-frontend.vercel.app`

---

## 3️⃣ Menghubungkan Backend & Frontend (Finalisasi CORS)

Agar browser mengizinkan pengiriman request dari frontend ke backend dengan aman:

1. Kembali ke project **Backend** di Vercel Dashboard (`runa-backend`).
2. Masuk ke **Settings** > **Environment Variables**.
3. Perbarui variabel `CORS_ORIGIN` menjadi URL frontend Anda:
   ```text
   CORS_ORIGIN = https://runa-frontend.vercel.app
   ```
   *(Jika Anda juga ingin mengaksesnya saat development lokal, pisahkan dengan koma: `https://runa-frontend.vercel.app,http://localhost:5173`)*
4. Masuk ke tab **Deployments** pada project backend, klik ikon titik tiga `...` pada deployment terbaru, lalu pilih **Redeploy**.

---

## ✅ Verifikasi Koneksi
1. Buka URL frontend Anda di browser: `https://runa-frontend.vercel.app`.
2. Buka DevTools (F12) > tab **Console** / **Network**.
3. Coba login dengan username `admin` dan password yang telah Anda seed.
4. Anda akan melihat request HTTP POST dikirim ke `https://runa-backend.vercel.app/api/auth/login` dan berhasil mengembalikan token JWT status `200 OK`.

