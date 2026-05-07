import { pgTable, serial, varchar, timestamp, boolean, integer, uuid, numeric, date, text } from 'drizzle-orm/pg-core';

export const dcScrapingTargets = pgTable('dc_scraping_targets', {
  id: serial('id').primaryKey(),
  operatorName: varchar('operator_name').notNull(),
  website: varchar('website').notNull(),
  pricingUrl: varchar('pricing_url'),
  frequency: varchar('frequency').default('monthly'),
  parserType: varchar('parser_type').default('static'),
  lastScraped: timestamp('last_scraped'),
  nextScheduled: timestamp('next_scheduled'),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const dcPricingSnapshots = pgTable('dc_pricing_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  operatorName: varchar('operator_name').notNull(),
  targetId: integer('target_id').references(() => dcScrapingTargets.id, { onDelete: 'set null' }),
  facilityName: varchar('facility_name'),
  region: varchar('region'),
  country: varchar('country'),
  costPerKwh: numeric('cost_per_kwh', { precision: 6, scale: 4 }),
  costPerRack: integer('cost_per_rack'),
  mwDeployed: numeric('mw_deployed', { precision: 10, scale: 2 }),
  mwAvailable: numeric('mw_available', { precision: 10, scale: 2 }),
  occupancyRate: numeric('occupancy_rate', { precision: 5, scale: 2 }),
  dataSource: varchar('data_source'),
  confidence: varchar('confidence').default('medium'),
  snapshotDate: date('snapshot_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const dcScrapingLogs = pgTable('dc_scraping_logs', {
  id: serial('id').primaryKey(),
  targetId: integer('target_id').references(() => dcScrapingTargets.id, { onDelete: 'cascade' }),
  scrapeStartedAt: timestamp('scrape_started_at').defaultNow(),
  scrapeCompletedAt: timestamp('scrape_completed_at'),
  status: varchar('status').notNull(),
  recordsFound: integer('records_found').default(0),
  recordsInserted: integer('records_inserted').default(0),
  errorMessage: text('error_message'),
  httpStatus: integer('http_status'),
  responseTimeMs: integer('response_time_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});