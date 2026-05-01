# Power Trends by 1GigLabs

> AI-powered power infrastructure intelligence for European and global energy markets

[![1GigLabs](https://img.shields.io/badge/1GigLabs-Powered%20by%20AI-blue)](https://1giglabs.com)
[![License](https://img.shields.io/badge/License-Proprietary-red)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org)

---

## Overview

**Power Trends** is an AI-powered platform by **1GigLabs** that generates comprehensive analyses of power infrastructure, electricity markets, and energy economics. It integrates real-time data from 50+ energy APIs (ENTSO-E, EIA, EPİAŞ, PSE, Energy-Charts, and more) with AI analysis to provide:

- **Grid Capacity & Stability** — Current/forecast transmission constraints, renewable integration challenges
- **Energy Mix & Sustainability** — Generation by fuel type, renewable percentage, decarbonization targets  
- **Electricity Pricing** — Day-ahead spot prices, historical trends, congestion patterns
- **Cross-Border Flows** — Physical power transfers between neighboring grids
- **Regulatory Environment** — Grid codes, connection procedures, compliance timelines
- **Investor Insights** — Cost analysis, market outlook, investment opportunities

### Use Cases

- **Data Centre Site Selection** — Find locations with affordable, reliable, green power
- **Energy Trading & Risk Management** — Monitor grid constraints and price signals
- **Corporate Sustainability** — Track renewable energy availability by region
- **Grid Planning** — Understand demand/supply dynamics across Europe

---

## About 1GigLabs

1GigLabs architect cloud-native data platforms, deploy production-grade AI, and automate complex workflows—transforming how enterprises operate at scale.

The power and data centre market is growing rapidly — driven by AI training workloads, cloud migration, and hyperscaler expansion — but the power infrastructure constraints that determine viable operations are complex, fragmented, and fast-changing. TSO grid APIs, national energy statistics, regulatory filings, and market research all speak different languages. **Power Trends unifies them.**

---

## System Architecture

Monorepo structure with React frontend, Express backend, and PostgreSQL database using Drizzle ORM.

```
React (Frontend) ──────────────→ Express Backend ────────────→ PostgreSQL (Database)
                                        ↓
                            Energy Data Integrations:
                    ENTSO-E, EIA, EPİAŞ, PSE, Energy-Charts,
                    Ember, RTE, Fingrid, NED, OpenRouteService
```

---

## Core Features

### 1. Power Trends Analysis

AI-generated comprehensive power infrastructure reports covering grid capacity, renewable integration, pricing, and regulatory environment. Supports 40+ European countries plus US and Turkey.

**Backend:** `server/routes.ts` — `/api/power-trends/generate`  
**Frontend:** `client/src/pages/PowerTrends.tsx`

### 2. Power Map — Interactive European Transmission Grid

Real-time visualization of:
- **Bidding Zone Prices** — Day-ahead electricity prices by market region (ENTSO-E + Elexon)
- **Cross-Border Flows** — Physical power transfers (MW) between countries (ENTSO-E A11)
- **Interconnector Capacity** — Maximum transfer capacity between regions

Features user-controllable flow visibility threshold slider (0–100 MW) to filter low-volume transfers.

**Backend:** `server/entsoe.ts` — `/api/entsoe/all-prices`, `/api/entsoe/cross-border-flows`  
**Frontend:** `client/src/components/ENTSOETransmissionMap.tsx`, `CrossBorderFlows.tsx`

### 3. Data Integrations

| Region | Primary Source | Fallback | Coverage |
|--------|---|---|---|
| **Europe (35 countries)** | ENTSO-E Transparency | PSE (Poland), Energy-Charts (Germany) | Day-ahead prices, generation mix, cross-border flows |
| **Turkey** | EPİAŞ / EXIST | — | Spot prices, real-time generation, demand |
| **USA** | EIA v2 API | — | Regional interchange flows, generation by fuel |
| **UK** | Elexon N2EX | — | 7-day rolling average prices |

### 4. Real-Time Collaboration

Team features on analyses:
- **Presence** — See who is viewing in real-time (SSE-based)
- **Comments** — Add discussion threads to reports
- **Assignments** — Delegate review tasks to colleagues

**Files:** `server/collaboration.ts`, `client/src/components/CollaborationPanel.tsx`

### 5. Audit Logging

Comprehensive logging of all user actions (login, report generation, deletion) for compliance and security.

**Table:** `audit_logs` — tracks userId, action, entityType, entityId, metadata, IP address, timestamp

---

## Authentication & Security

| Feature | Implementation |
|---------|---|
| **Auth Method** | Email/password with bcrypt (12 salt rounds) |
| **Sessions** | PostgreSQL-backed via `connect-pg-simple` |
| **Work Email Enforcement** | Personal domains (gmail, yahoo, hotmail, outlook) rejected; only work emails accepted |
| **Protected Routes** | All `/api/*` endpoints require `isAuthenticated` middleware |
| **Rate Limiting** | Exponential backoff for ENTSO-E 429 responses (8s, 16s, 24s) |

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|---|
| `POST` | `/api/auth/register` | Create account with work email + password |
| `POST` | `/api/auth/login` | Sign in with email + password |
| `POST` | `/api/auth/logout` | End session |
| `GET`  | `/api/auth/user` | Get current authenticated user |
| `POST` | `/api/auth/password-reset` | Initiate password reset (email link) |

---

## Frontend Architecture

| Category | Technology |
|----------|---|
| **Framework** | React with TypeScript (Vite) |
| **Routing** | Wouter (lightweight React router) |
| **State Management** | TanStack React Query |
| **UI Components** | shadcn/ui with Radix UI primitives |
| **Styling** | Tailwind CSS with CSS variables |
| **Animations** | Framer Motion |
| **Data Viz** | Recharts (line, bar, pie charts) |
| **Mapping** | Leaflet with custom polygon/arc rendering |
| **Export** | html2canvas + jsPDF (PDF), pptxgenjs (PowerPoint) |

### Pages

- `/` — Power Trends (main)
- `/power-trends` — Analysis generation
- `/power-map` — Interactive transmission grid visualization
- `/methodology` — Documentation of data sources and methods
- `/audit-logs` — Admin: user activity tracking

---

## Backend Architecture

| Category | Technology |
|----------|---|
| **Framework** | Express 5 on Node.js with TypeScript |
| **Build Tool** | esbuild (production), tsx (development) |
| **API Design** | RESTful with Zod validation |
| **Concurrency** | Inline `pLimit` function (avoids ESM-only dependencies) |
| **AI Integration** | OpenAI API (GPT-5.1) for report generation |

### Performance Optimizations

- **pLimit(3)** — 3 concurrent border pair fetches; each pair fetches 2 directions in parallel (~6 total requests)
- **Promise.allSettled()** — Graceful handling of partial failures (some borders return ENTSO-E error 999)
- **Exponential Backoff** — Automatic retry for rate-limited requests (429 responses)
- **24-Hour Cache** — Temporary file-based cache for prices; in-memory cache for API responses

---

## Database Layer

| Aspect | Details |
|--------|---|
| **ORM** | Drizzle ORM with PostgreSQL dialect |
| **Schema** | `shared/schema.ts` (main tables), `shared/models/auth.ts` (auth/users) |
| **Migrations** | Drizzle Kit with `npm run db:push` |
| **Connection** | `DATABASE_URL` environment variable |

### Core Tables

- `analyses` — Company/market analyses
- `power_trend_analyses` — AI-generated Power Trends reports
- `verified_executives` — Email verification data
- `users` — Registered user accounts
- `sessions` — Active login sessions
- `audit_logs` — User activity tracking

---

## Project Structure

```
.
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── assets/            # Brand logos, icons
│   │   ├── components/        # UI: Charts, Maps, Cards, Inputs, etc.
│   │   ├── pages/             # Route pages: PowerTrends, PowerMap, Methodology
│   │   ├── hooks/             # Custom hooks: useAuth, usePresence, useFetch
│   │   └── lib/               # Utilities: gridConstants, API helpers
│   └── index.html             # Vite entry point
│
├── server/                     # Express backend
│   ├── auth/                  # Session setup, password reset, user auth
│   ├── entsoe.ts              # ENTSO-E: prices, generation, cross-border flows
│   ├── eiaData.ts             # EIA: US regional interchange
│   ├── epiasData.ts           # EPİAŞ/EXIST: Turkey electricity market
│   ├── pseData.ts             # PSE: Polish RCE prices & generation
│   ├── energyChartsData.ts    # Energy-Charts: German prices & signal
│   ├── dcInsightsData.ts      # Data centre locations
│   ├── collaboration.ts       # Presence, comments, assignments
│   ├── entsoeHealth.ts        # API health monitoring
│   ├── storage.ts             # Database queries (Drizzle ORM)
│   ├── routes.ts              # Route registration
│   └── db.ts                  # Drizzle connection pool
│
├── shared/                     # Shared types and schemas
│   ├── schema.ts              # Drizzle table definitions
│   ├── routes.ts              # API path constants + Zod validators
│   └── models/                # Specific model schemas
│
├── migrations/                # Drizzle migrations
├── .env.example               # Environment template
├── docker-compose.yml         # Local PostgreSQL + Redis (optional)
└── package.json               # Dependencies, scripts

```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **PostgreSQL** 14+ ([postgresql.org](https://postgresql.org))
- **npm** 8+

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/DaftNinja/1GL.git
cd 1GL

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your API keys (see Environment Setup below)

# 4. Run database migrations
npm run db:push

# 5. Start development server
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:5000
```

---

## Environment Setup

### Required Variables

#### OpenAI API Key

```bash
# 1. Sign up at https://platform.openai.com/signup
# 2. Go to API Keys → Create new secret key
OPENAI_API_KEY=sk-proj-...
```

#### PostgreSQL Connection

```bash
# Local PostgreSQL (default)
DATABASE_URL=postgres://postgres:password@localhost:5432/1giglabs

# Or use Docker:
# docker run --name postgres -e POSTGRES_PASSWORD=password -d postgres:16
```

#### Session Secret (optional but recommended for production)

```bash
# Generate with: openssl rand -hex 32
SESSION_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Energy Data APIs (Optional — app degrades gracefully without them)

#### ENTSO-E — European Transmission System Operator (35 Countries)

Provides: Day-ahead prices, generation by fuel type, cross-border flows

```bash
# 1. Register at https://transparency.entsoe.eu
# 2. My Account Settings → Web API → Generate Token
ENTSOE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

#### EIA — US Energy Information Administration

Provides: US regional interchange flows, generation by fuel

```bash
# 1. Go to https://www.eia.gov/opendata/register.php
# 2. Email key is sent instantly (no account needed)
EIA_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### EPİAŞ — Turkey Electricity Market (Istanbul Energy Exchange)

Provides: Turkish day-ahead prices, real-time generation, demand

```bash
# 1. Register at https://kayit.epias.com.tr/epias-transparency-platform-registration-form
# 2. Confirm email (no separate API key)
EPIAS_USERNAME=your.email@example.com
EPIAS_PASSWORD=your_password
```

#### PSE — Polish Power System (Optional)

Provides: Polish RCE prices, generation, cross-border flows (alternative to ENTSO-E)

```bash
# Public API — no key required. Enable with:
PSE_ENABLED=true
```

#### Energy-Charts — German Energy Data (Optional)

Provides: German day-ahead prices, renewable percentage, grid signal (alternative to ENTSO-E)

```bash
# Public API — no key required. Enable with:
ENERGY_CHARTS_ENABLED=true
```

#### Optional Regional Grid Operators

| Variable | Service | Purpose |
|----------|---------|---------|
| `UKPN_API_KEY` | UK Power Networks | UK distribution network capacity |
| `SSEN_NERDA_API_KEY` | Scottish & Southern Electricity Networks | SSEN substation headroom |
| `NPG_API_KEY` | Northern Power Grid | NPG transformer utilisation |
| `ENW_API_KEY` | Electricity North West | ENW substation headroom |
| `RTE_API_KEY` | RTE France | French generation/grid data |
| `FINGRID_API_KEY` | Fingrid (Finland) | Finnish real-time grid data |
| `NED_API_KEY` | Nationaal Energie Dashboard (Netherlands) | Dutch electricity data |
| `EMBER_API_KEY` | Ember Climate | Global energy mix data |
| `HEIGIT_API_KEY` | HeiGIT OpenRouteService | Routing calculations |

### Deployment (Railway)

```bash
# 1. Create service at https://railway.app
# 2. Add variables in Railway dashboard → Variables tab
# 3. Railway auto-redeploys after variable changes
# 4. Verify with: npm run dev
```

> **Important:** Never commit `.env` to git. Only `.env.example` (with placeholder values) should be version-controlled.

---

## Testing

```bash
# Unit tests
npm run test

# Integration tests  
npm run test:integration

# Development with hot reload
npm run dev

# Production build & start
npm run build
npm run start
```

---

## API Documentation

### Power Trends

```
POST /api/power-trends/generate
{
  "country": "Norway"
}

Returns: { report: PowerTrendAnalysis, dataSources: [...] }
```

### Energy Data

```
GET /api/entsoe/all-prices?country=Germany
GET /api/entsoe/cross-border-flows?hourOffset=0
GET /api/eia/interchange?date=2024-01-15
GET /api/epias/prices?date=2024-01-15
```

### Collaboration

```
POST /api/analyses/:id/presence/heartbeat
GET /api/analyses/:id/presence/stream (SSE)
POST /api/analyses/:id/comments
GET /api/analyses/:id/assignments
```

---

## Known Limitations & Notes

### ENTSO-E

- **NordPool borders** (NO↔SE, NO↔FI, NO↔DK) may return error 999 (no TSO submission). These are internal NordPool flows; use [NordPool API](https://www.nordpoolgroup.com/) for real-time data.
- **Turkey pricing** returns null by design — use EPİAŞ instead.
- **Rate limiting:** Automatic exponential backoff implemented (8s, 16s, 24s).

### Cross-Border Flows

- Minimum flow threshold: 10 MW (user-adjustable via slider, 0–100 MW range)
- Low-volume transfers filtered to reduce visual clutter
- Negative prices indicate renewable energy excess — generators pay to avoid shutdown

---

## License

Proprietary — © 2025 1GigLabs. All rights reserved.

---

<p align="center">
  <em>Powered by 1GigLabs — Open. Local. Flexible.</em>
</p>
