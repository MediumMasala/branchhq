-- AlterTable
ALTER TABLE "click_events" ADD COLUMN     "phone_id" UUID;

-- AlterTable
ALTER TABLE "link_stats" ADD COLUMN     "unique_humans_24h" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "links" ADD COLUMN     "rotation_mode" TEXT NOT NULL DEFAULT 'ROUND_ROBIN_SHUFFLED',
ADD COLUMN     "sticky_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sticky_ttl_hours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "link_phones" (
    "id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "total_clicks" BIGINT NOT NULL DEFAULT 0,
    "last_click_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "link_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_rotation" (
    "link_id" UUID NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "shuffle_seed" TEXT,
    "last_shuffled_at" TIMESTAMPTZ,

    CONSTRAINT "link_rotation_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "fingerprint_map" (
    "id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "fingerprint_hash" TEXT NOT NULL,
    "phone_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fingerprint_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "link_phones_link_id_status_idx" ON "link_phones"("link_id", "status");

-- CreateIndex
CREATE INDEX "fingerprint_map_expires_at_idx" ON "fingerprint_map"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fingerprint_map_link_id_fingerprint_hash_key" ON "fingerprint_map"("link_id", "fingerprint_hash");

-- AddForeignKey
ALTER TABLE "link_phones" ADD CONSTRAINT "link_phones_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_rotation" ADD CONSTRAINT "link_rotation_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fingerprint_map" ADD CONSTRAINT "fingerprint_map_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fingerprint_map" ADD CONSTRAINT "fingerprint_map_phone_id_fkey" FOREIGN KEY ("phone_id") REFERENCES "link_phones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
