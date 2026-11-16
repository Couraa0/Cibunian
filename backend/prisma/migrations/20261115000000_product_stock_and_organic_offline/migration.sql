-- Produk hasil olahan sebagai stok. Catatan BSF bisa terhubung ke stok (pakan keluar dari stok
-- organik; panen dan kasgot masuk ke stok produk) dan aman dikirim ulang dari antrean offline.
ALTER TYPE "MovementType" ADD VALUE 'PRODUCTION';
ALTER TYPE "WasteGroup" ADD VALUE 'PRODUK';

ALTER TABLE "inventory_movements" ADD COLUMN     "organicRecordId" UUID;

ALTER TABLE "organic_records" ADD COLUMN     "clientMutationId" TEXT,
ADD COLUMN     "wasteCategoryId" UUID;

CREATE UNIQUE INDEX "inventory_movements_organicRecordId_key" ON "inventory_movements"("organicRecordId");

CREATE UNIQUE INDEX "organic_records_clientMutationId_key" ON "organic_records"("clientMutationId");

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organicRecordId_fkey" FOREIGN KEY ("organicRecordId") REFERENCES "organic_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organic_records" ADD CONSTRAINT "organic_records_wasteCategoryId_fkey" FOREIGN KEY ("wasteCategoryId") REFERENCES "waste_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
