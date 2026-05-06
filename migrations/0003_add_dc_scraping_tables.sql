-- DC Scraping Pipeline Tables
-- migrations/0003_add_dc_scraping_tables.sql

CREATE TABLE IF NOT EXISTS dc_scraping_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_name VARCHAR NOT NULL,
  website VARCHAR NOT NULL,
  pricing_url VARCHAR,
  css_selectors JSONB DEFAULT '{}',
  frequency VARCHAR DEFAULT 'monthly',
  parser_type VARCHAR DEFAULT 'static',
  last_scraped TIMESTAMP,
  next_scheduled TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dc_scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES dc_scraping_targets(id),
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  records_scraped INT DEFAULT 0,
  records_saved INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  status VARCHAR DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dc_pricing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_name VARCHAR NOT NULL,
  facility_name VARCHAR,
  region VARCHAR,
  country VARCHAR,
  cost_per_kwh DECIMAL(6,4),
  cost_per_rack INT,
  mw_deployed DECIMAL(10,2),
  mw_available DECIMAL(10,2),
  occupancy_rate DECIMAL(5,2),
  data_source VARCHAR,
  confidence VARCHAR DEFAULT 'medium',
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dc_pricing_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES dc_pricing_snapshots(id),
  operator_name VARCHAR,
  facility_name VARCHAR,
  conflicting_sources JSONB,
  discrepancy_type VARCHAR,
  flagged_for_review BOOLEAN DEFAULT true,
  resolved BOOLEAN DEFAULT false,
  resolution_note TEXT,
  resolved_by_user_id UUID,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_collection_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR,
  source_name VARCHAR NOT NULL,
  scraping_method VARCHAR,
  frequency VARCHAR,
  last_collection TIMESTAMP,
  next_collection TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dc_scraping_targets_operator ON dc_scraping_targets(operator_name);
CREATE INDEX idx_dc_pricing_snapshots_operator ON dc_pricing_snapshots(operator_name);
CREATE INDEX idx_dc_pricing_snapshots_date ON dc_pricing_snapshots(snapshot_date);
CREATE INDEX idx_dc_scraping_jobs_status ON dc_scraping_jobs(status);
