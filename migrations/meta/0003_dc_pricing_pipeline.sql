CREATE TABLE IF NOT EXISTS "dc_scraping_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "operator_name" varchar NOT NULL,
  "website" varchar NOT NULL,
  "scraping_url" varchar NOT NULL,
  "region" varchar,
  "country" varchar,
  "data_type" varchar NOT NULL,
  "extraction_hints" jsonb,
  "parser_type" varchar DEFAULT 'html',
  "frequency" varchar DEFAULT 'monthly',
  "is_active" boolean DEFAULT true,
  "last_scraped_at" timestamp,
  "next_scheduled_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_pricing_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_id" uuid REFERENCES "dc_scraping_targets"("id"),
  "operator_name" varchar NOT NULL,
  "region" varchar,
  "country" varchar,
  "price_per_kwh" numeric(6, 4),
  "price_per_rack_month" numeric(8, 2),
  "capacity_mw" numeric(8, 2),
  "occupancy_percent" numeric(5, 2),
  "pue_rating" numeric(4, 2),
  "raw_extracted_text" text,
  "data_source" varchar NOT NULL,
  "collection_method" varchar DEFAULT 'scrape',
  "confidence" varchar DEFAULT 'medium',
  "snapshot_date" timestamp DEFAULT now(),
  "notes" text,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_scraping_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_type" varchar DEFAULT 'monthly',
  "triggered_by" varchar DEFAULT 'scheduler',
  "started_at" timestamp DEFAULT now(),
  "completed_at" timestamp,
  "targets_total" integer DEFAULT 0,
  "targets_success" integer DEFAULT 0,
  "targets_failed" integer DEFAULT 0,
  "records_saved" integer DEFAULT 0,
  "status" varchar DEFAULT 'running',
  "error_summary" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_pricing_discrepancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "operator_name" varchar NOT NULL,
  "region" varchar,
  "country" varchar,
  "field" varchar NOT NULL,
  "source_a" jsonb NOT NULL,
  "source_b" jsonb NOT NULL,
  "spread_percent" numeric(6, 2),
  "status" varchar DEFAULT 'open',
  "resolved_by" varchar,
  "resolution_note" text,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
