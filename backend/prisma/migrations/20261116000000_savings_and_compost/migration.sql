-- Tabungan nasabah (insentif setoran per KK) dan pengolahan organik metode kompos.
-- Hanya menambah: data lama tetap berlaku, batch lama otomatis bermetode BSF.
CREATE TYPE "OrganicMethod" AS ENUM ('BSF', 'KOMPOS');

ALTER TABLE "organic_batches" ADD COLUMN "method" "OrganicMethod" NOT NULL DEFAULT 'BSF';

ALTER TABLE "waste_categories" ADD COLUMN "householdPricePerKg" DECIMAL(12,2);

ALTER TABLE "collection_transactions" ADD COLUMN "creditAmount" DECIMAL(14,2);

CREATE TABLE "savings_withdrawals" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "savings_withdrawals_householdId_idx" ON "savings_withdrawals"("householdId");

ALTER TABLE "savings_withdrawals" ADD CONSTRAINT "savings_withdrawals_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "savings_withdrawals" ADD CONSTRAINT "savings_withdrawals_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sama seperti tabel lain: tertutup dari Data API Supabase (lihat migrasi enable_rls).
ALTER TABLE "savings_withdrawals" ENABLE ROW LEVEL SECURITY;
