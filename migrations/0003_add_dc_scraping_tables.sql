-- DC Scraping Pipeline Tables

CREATE TABLE IF NOT EXISTS "dc_scraping_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "operator_name" varchar NOT NULL,
  "website" varchar NOT NULL,
  "pricing_url" varchar,
  "css_selectors" jsonb,
  "frequency" varchar DEFAULT 'monthly',
  "last_scraped" timestamp,
  "next_scheduled" timestamp,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_scraping_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" varchar UNIQUE NOT NULL,
  "started_at" timestamp DEFAULT now(),
  "ended_at" timestamp,
  "records_scraped" integer DEFAULT 0,
  "records_saved" integer DEFAULT 0,
  "records_failed" integer DEFAULT 0,
  "status" varchar DEFAULT 'running',
  "error_message" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_pricing_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "facility_id" uuid,
  "operator_name" varchar NOT NULL,
  "region" varchar,
  "cost_per_kwh" numeric(8, 4),
  "cost_per_rack" numeric(10, 2),
  "mw_deployed" numeric(8, 2),
  "mw_available" numeric(8, 2),
  "data_source" varchar NOT NULL,
  "confidence" varchar DEFAULT 'medium',
  "snapshot_date" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dc_pricing_discrepancies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" uuid,
  "operator" varchar NOT NULL,
  "facility" varchar,
  "conflicting_sources" jsonb,
  "discrepancy_type" varchar,
  "flagged_for_review" boolean DEFAULT true,
  "resolved" boolean DEFAULT false,
  "resolution_note" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "data_collection_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_type" varchar NOT NULL,
  "source_name" varchar NOT NULL,
  "scraping_method" varchar,
  "frequency" varchar,
  "last_collection" timestamp,
  "next_collection" timestamp,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_dc_scraping_targets_next_scheduled" ON "dc_scraping_targets"("next_scheduled");
CREATE INDEX IF NOT EXISTS "idx_dc_scraping_targets_operator_name" ON "dc_scraping_targets"("operator_name");
CREATE INDEX IF NOT EXISTS "idx_dc_pricing_snapshots_operator_name" ON "dc_pricing_snapshots"("operator_name");
CREATE INDEX IF NOT EXISTS "idx_dc_pricing_snapshots_snapshot_date" ON "dc_pricing_snapshots"("snapshot_date");
CREATE INDEX IF NOT EXISTS "idx_dc_pricing_discrepancies_operator" ON "dc_pricing_discrepancies"("operator");
CREATE INDEX IF NOT EXISTS "idx_dc_pricing_discrepancies_resolved" ON "dc_pricing_discrepancies"("resolved");
