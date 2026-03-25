-- sessions (connect-pg-simple session store)
CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");

-- users
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar UNIQUE NOT NULL,
	"password" text NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"role" varchar DEFAULT 'analyst',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- password reset tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar(64) UNIQUE NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- analyses
CREATE TABLE IF NOT EXISTS "analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- verified executives
CREATE TABLE IF NOT EXISTS "verified_executives" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"source_url" text,
	"verified_at" timestamp DEFAULT now()
);

-- TAM analyses
CREATE TABLE IF NOT EXISTS "tam_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text DEFAULT 'United Kingdom' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- power trend analyses
CREATE TABLE IF NOT EXISTS "power_trend_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text DEFAULT 'United Kingdom' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- report comments
CREATE TABLE IF NOT EXISTS "report_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"analysis_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"section" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

-- report assignments
CREATE TABLE IF NOT EXISTS "report_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"analysis_id" integer NOT NULL,
	"assigned_by_email" text NOT NULL,
	"assigned_to_email" text NOT NULL,
	"section" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- report activity
CREATE TABLE IF NOT EXISTS "report_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"analysis_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now()
);

-- audit logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);

-- Baxtel data centres
CREATE TABLE IF NOT EXISTS "baxtel_datacentres" (
	"id" serial PRIMARY KEY NOT NULL,
	"baxtel_id" text UNIQUE NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"country" text,
	"operator" text,
	"capacity_mw" double precision,
	"tier" text,
	"website_url" text,
	"scraped_at" timestamp DEFAULT now()
);

-- conversations
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- messages
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
