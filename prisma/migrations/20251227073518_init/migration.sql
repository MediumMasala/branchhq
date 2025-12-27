-- CreateTable
CREATE TABLE "links" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "campaign_name" TEXT NOT NULL,
    "default_phone" TEXT NOT NULL,
    "default_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "og_title" TEXT,
    "og_description" TEXT,
    "og_image" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_stats" (
    "link_id" UUID NOT NULL,
    "total_clicks" BIGINT NOT NULL DEFAULT 0,
    "human_clicks" BIGINT NOT NULL DEFAULT 0,
    "ios_clicks" BIGINT NOT NULL DEFAULT 0,
    "android_clicks" BIGINT NOT NULL DEFAULT 0,
    "desktop_clicks" BIGINT NOT NULL DEFAULT 0,
    "last_click_at" TIMESTAMPTZ,

    CONSTRAINT "link_stats_pkey" PRIMARY KEY ("link_id")
);

-- CreateTable
CREATE TABLE "click_events" (
    "id" UUID NOT NULL,
    "link_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" TEXT,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "referer" TEXT,
    "hashed_ip" TEXT,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "links_slug_key" ON "links"("slug");

-- CreateIndex
CREATE INDEX "click_events_link_id_ts_idx" ON "click_events"("link_id", "ts");

-- AddForeignKey
ALTER TABLE "link_stats" ADD CONSTRAINT "link_stats_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
