CREATE TABLE IF NOT EXISTS "site_selection_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text,
  "user_email" text,
  "request" jsonb NOT NULL,
  "content" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now()
);
