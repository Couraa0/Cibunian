-- Pembatas login dihitung per username + alamat IP (tabel login_attempts), menggantikan kunci
-- per akun di tabel users. passwordChangedAt: token yang lebih tua dari waktu ini ditolak.
-- Kolom lama users."failedLogins" dan "lockedUntil" sengaja TIDAK dihapus di sini: backend versi
-- sebelumnya masih membacanya, dan migrasi ini harus aman dijalankan sebelum versi baru di-deploy.
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_username_createdAt_idx" ON "login_attempts"("username", "createdAt");

-- Sama seperti tabel lain: tertutup untuk Data API Supabase.
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
