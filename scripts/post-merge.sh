#!/bin/bash
set -e
npm install
node -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS baxtel_datacentres (
      id SERIAL PRIMARY KEY,
      baxtel_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      country TEXT,
      operator TEXT,
      capacity_mw DOUBLE PRECISION,
      tier TEXT,
      website_url TEXT,
      scraped_at TIMESTAMP DEFAULT NOW()
    )
  \`);
  console.log('baxtel_datacentres table ensured');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
"
