# 1GigLabs Platform — Full Technical & Data Documentation

**Version:** March 2026  
**Purpose:** Auditability, onboarding, and growth planning  
**Audience:** Technical team, analysts, new contributors, and commercial partners

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Technology Stack](#2-technology-stack)
3. [Authentication & Access Control](#3-authentication--access-control)
4. [Application Structure (Pages & Routes)](#4-application-structure-pages--routes)
5. [Data Sources — Complete Inventory](#5-data-sources--complete-inventory)
6. [API Endpoints — Full Reference](#6-api-endpoints--full-reference)
7. [Components & Charts — Data Lineage](#7-components--charts--data-lineage)
8. [Environment Variables & Secrets](#8-environment-variables--secrets)
9. [Database](#9-database)
10. [Caching Strategy](#10-caching-strategy)
11. [AI Report Generation](#11-ai-report-generation)
12. [Setting Up the Platform from Scratch](#12-setting-up-the-platform-from-scratch)
13. [Adding a New Country](#13-adding-a-new-country)
14. [Adding a New Data Source](#14-adding-a-new-data-source)
15. [Growth Opportunities](#15-growth-opportunities)

---

## 1. Platform Overview

1GigLabs is a market intelligence and decision-support platform built for data centre investors and operators. It focuses specifically on **European power grid analysis**, providing:

- AI-generated country-level power trend reports with grid, pricing, and regulatory analysis
- An interactive power infrastructure map showing data centres, wind farms, submarine cables, and real network data
- Real-time and forecast energy monitoring from national grid operators
- UK-specific grid intelligence layers from five UK distribution network operators
- A methodology page documenting all data sources and analytical approaches

The platform is targeted at two audiences:
- **Investors** evaluating data centre market opportunities and risks across Europe
- **Data centre providers** (including hyperscalers) assessing locations for HPC, cloud, and AI deployments

---

## 2. Technology Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 (Vite) |
| Routing | Wouter |
| Data fetching | TanStack Query v5 |
| UI components | shadcn/ui (Radix UI primitives) |
| Mapping | Leaflet + React-Leaflet |
| Charting | Recharts |
| Styling | Tailwind CSS |
| Icons | Lucide React, React Icons |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js (Express) |
| Language | TypeScript |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Neon serverless) |
| Schema validation | Zod + drizzle-zod |
| AI | OpenAI GPT (via Replit AI Integration) |
| Authentication | Replit Auth (OAuth + session) |

### Infrastructure
| Layer | Detail |
|---|---|
| Hosting | Replit Deployments |
| Port | 5000 (single port for both frontend and backend) |
| Build | Vite (frontend) + esbuild (backend) |
| Static files | `public/` served by Express before Vite middleware |
| Dev server | Vite HMR proxied through Express |

---

## 3. Authentication & Access Control

### How Authentication Works

The platform uses **Replit Auth**, which provides OAuth-based login without managing passwords.

**Step-by-step login flow:**
1. Unauthenticated users see the login page (`/auth/login`)
2. Users click "Sign in with Replit" and are redirected to Replit's OAuth flow
3. On success, Replit redirects back with an auth code
4. The server stores a session (`req.session.userId`) using `express-session`
5. All subsequent API requests read from the session to verify identity

### Session-level Protection

Every API route (except public auth routes) is wrapped with the `isAuthenticated` middleware:

```
GET /api/anything → isAuthenticated → handler
```

This means **all data, all charts, and all maps require a logged-in session**.

### Public Paths (no auth required)
- `/auth/login`
- `/auth/register`
- `/auth/logout`
- `/auth/user`
- `/auth/forgot-password`
- `/auth/reset-password`

### Admin Access

A small number of admin-only actions (e.g. refreshing the data centre dataset) require the user's email to be listed in the `ADMIN_EMAILS` environment variable (comma-separated list).

---

## 4. Application Structure (Pages & Routes)

| URL Path | Page Component | Description |
|---|---|---|
| `/` or `/power-trends` | `PowerTrends.tsx` | Main landing page — country selector, AI report, grid charts, UK-specific intelligence |
| `/power-map` | `PowerInfrastructure.tsx` | Interactive infrastructure map — data centres, wind farms, cables, grid data |
| `/methodology` | `Methodology.tsx` | Data sources, AI methodology, and analytical framework documentation |
| `/audit-logs` | `AuditLogs.tsx` | Activity log for authenticated users |
| `/reset-password` | `AuthPage.tsx` (reset mode) | Password reset flow |

### Country Dropdown

The Power Trends page supports **four countries** (defined in `shared/schema.ts` as `GIGLABS_COUNTRIES`):
- United Kingdom (pre-selected by default)
- France
- Netherlands
- Sweden

When a country is selected, the AI report query fires automatically (`TanStack Query`, enabled when `selectedCountry` is truthy). If a report exists in the database from within the past month, it is returned from cache. If not, the user clicks "Generate Analysis" to create a new one.

---

## 5. Data Sources — Complete Inventory

This section lists every external data source the platform connects to, what it provides, and whether it requires credentials.

### 5.1 AI-Powered Report Content

| Item | Detail |
|---|---|
| Provider | OpenAI (GPT-5.1) via Replit AI Integration |
| What it generates | Country power trend reports: grid capacity, pricing, renewables, constraints, regulations, location suitability, investor insights |
| Credential | `AI_INTEGRATIONS_OPENAI_API_KEY` (auto-managed by Replit) |
| Caching | Reports stored in PostgreSQL; regenerated after 1 month or on user request |
| Data grounding | The AI prompt includes: hard-coded research intelligence from 40+ published sources, and live ENTSO-E price/generation data fetched at the moment of generation |

### 5.2 ENTSO-E Transparency Platform

| Item | Detail |
|---|---|
| Provider | European Network of Transmission System Operators for Electricity |
| URL | `https://web-api.tp.entsoe.eu/api` |
| Credential | `ENTSOE_API_KEY` — register free at transparency.entsoe.eu |
| Data | Day-ahead electricity prices, actual generation by fuel type, cross-border physical flows |
| Countries covered | All European bidding zones (GB, IE, IT, DE-LU, DK, SE, NO, FR, BE, NL, etc.) |
| Cache TTL | 1 hour (in-memory) |
| Fallback | UK prices also fetched from Elexon BMRS API (no key required) at `data.elexon.co.uk/bmrs/api/v1/datasets/MID` |

### 5.3 NESO (National Energy System Operator) — UK

| Item | Detail |
|---|---|
| Provider | NESO (formerly National Grid ESO), UK |
| URL | `https://api.neso.energy` |
| Credential | None (open API) |
| Data | SSEP strategic planning zones, 14-day generation forecast, 52-week seasonal forecast, demand forecast (cardinal points), transmission losses, TRESP regions, TEC connection register |
| Cache TTL | Varies: 1h for forecasts, 24h for registers |

### 5.4 Energy Charts (Fraunhofer ISE)

| Item | Detail |
|---|---|
| Provider | Fraunhofer Institute for Solar Energy Systems, Germany |
| URL | `https://api.energy-charts.info` |
| Credential | None (open API) |
| Data | Actual generation mix by fuel type, installed power capacity by technology, renewable energy share (daily average), grid signal (green/amber/red for renewable-rich periods) |
| Countries covered | Germany and most EU countries |
| Cache TTL | 15 minutes to 1 hour depending on endpoint |

### 5.5 Ember Climate

| Item | Detail |
|---|---|
| Provider | Ember (UK energy think tank) |
| URL | `https://api.ember-climate.org/v1` |
| Credential | `EMBER_API_KEY` — register at ember-climate.org |
| Data | Country-level annual and monthly electricity generation data, renewable share trends, power sector emissions |
| Cache TTL | 24 hours |

### 5.6 NED (Netherlands National Energy Dashboard)

| Item | Detail |
|---|---|
| Provider | Netherlands Enterprise Agency (RVO) |
| URL | `https://ned.nl/api` |
| Credential | `NED_API_KEY` — register at ned.nl |
| Data | Netherlands real-time and forecast electricity generation by source |
| Cache TTL | 30 minutes |

### 5.7 PSE SA (Poland TSO)

| Item | Detail |
|---|---|
| Provider | Polskie Sieci Elektroenergetyczne (PSE) |
| URL | `https://www.pse.pl` (publicly available data) |
| Credential | None |
| Data | Poland grid generation mix, load data |

### 5.8 Terna (Italy TSO)

| Item | Detail |
|---|---|
| Provider | Terna SpA, Italy |
| Data | Italy grid intelligence — curated static dataset enriched with Terna published data |
| Credential | None (static enrichment) |

### 5.9 Fingrid (Finland TSO)

| Item | Detail |
|---|---|
| Provider | Fingrid, Finland |
| URL | `https://data.fingrid.fi/api` |
| Credential | `FINGRID_API_KEY` — register free at data.fingrid.fi |
| Data | Finland generation, load, grid balancing data |

### 5.10 REE (Spain TSO — Red Eléctrica de España)

| Item | Detail |
|---|---|
| Provider | Red Eléctrica de España |
| URL | `https://apidatos.ree.es` |
| Credential | None (open API) |
| Data | Spain generation mix (wind, solar PV, solar CSP, hydro, nuclear, gas), demand, interconnection flows |

### 5.11 Statnett (Norway TSO)

| Item | Detail |
|---|---|
| Provider | Statnett SF, Norway |
| Data | Norway grid intelligence — price zones, hydro capacity, wind generation, interconnector data |
| Credential | None (open data) |

### 5.12 Elia (Belgium TSO)

| Item | Detail |
|---|---|
| Provider | Elia Group, Belgium |
| URL | `https://opendata.elia.be` |
| Credential | None (open API) |
| Data | Belgium generation mix, nuclear capacity status, offshore wind data |

### 5.13 RTE (France TSO)

| Item | Detail |
|---|---|
| Provider | Réseau de Transport d'Électricité, France |
| URL | `https://opendata.rte-france.com` |
| Credential | None (open API) |
| Data | France generation mix, nuclear output, cross-border flows |

### 5.14 Open Energy Platform (OEP) — MODEX Benchmarks

| Item | Detail |
|---|---|
| Provider | Open Energy Platform (German research consortium) |
| URL | `https://openenergy-platform.org` |
| Credential | `OEP_API_KEY` — register at openenergy-platform.org |
| Data | DEA 2020 renewable technology cost benchmarks (CAPEX, OPEX, lifetime) for onshore/offshore wind and solar; Siala 2020 Germany offshore expansion potential |
| Used in | OEP Benchmark Chart on the Power Trends page |

### 5.15 ADMIE (Greece TSO)

| Item | Detail |
|---|---|
| Provider | ADMIE (Independent Power Transmission Operator), Greece |
| URL | `https://www.admie.gr/getOperationMarketFile` |
| Credential | None (open API with XLS file downloads) |
| Data | Real-time SCADA system load, renewable generation, import/export flows by border |
| Cache TTL | 1 hour |

### 5.16 EMODnet Human Activities

| Item | Detail |
|---|---|
| Provider | European Marine Observation and Data Network (EU) |
| URL | `https://ows.emodnet-humanactivities.eu/wfs` |
| Credential | None (open OGC WFS service) |
| Data | Offshore wind farm locations, capacities, status (operational/planned/under construction); submarine power cable routes from four source layers (Germany/Baltic, France SHOM, Netherlands Rijkswaterstaat, Norway NVE) |
| Cache TTL | 24 hours |

### 5.17 Submarine Cable Map

| Item | Detail |
|---|---|
| Provider | TeleGeography (submarinecablemap.com) |
| URL | `https://www.submarinecablemap.com/api/v3` |
| Credential | None (public API) |
| Data | Global submarine telecoms cable routes and landing point locations |
| Cache TTL | 24 hours |

### 5.18 Data Centre Dataset (1GigLabs Primary + Baxtel Fallback)

| Item | Detail |
|---|---|
| Primary source | 1GigLabs internal dataset (`server/dcInsightsData.ts`) |
| Fallback source | Baxtel (via Mapbox vector tiles) |
| Mapbox credential | `BAXTEL_MAPBOX_TOKEN` (for fallback tile scraping) |
| Data | Data centre name, location (lat/lng), country, operator, capacity (MW where available) |
| Startup | On first launch, if the database is empty, Baxtel data is automatically scraped and loaded |
| Admin refresh | `POST /api/baxtel/refresh` (admin email required) |

### 5.19 UK Power Networks (UKPN)

| Item | Detail |
|---|---|
| Provider | UK Power Networks (DNO for London, SE & East England) |
| URL | UKPN Open Data Portal |
| Credential | `UKPN_API_KEY` — register at ukpowernetworks.opendatasoft.com |
| Data | Data centre connection register, grid substations, grid & primary sites, DFES network headroom, fault level data, connection queue |

### 5.20 National Grid Electricity Distribution (NGED)

| Item | Detail |
|---|---|
| Provider | National Grid (DNO for Midlands, SW & South Wales) |
| URL | Connected Data Platform |
| Credential | `NGED_API_KEY` — register at connecteddata.nationalgrid.co.uk |
| Data | Network capacity map, opportunity map, generation connection register, GCR summary by technology, embedded capacity register |

### 5.21 Northern Power Grid (NPG)

| Item | Detail |
|---|---|
| Provider | Northern Powergrid (DNO for NE England & Yorkshire) |
| URL | `https://northernpowergrid.opendatasoft.com` |
| Credential | `NPG_API_KEY` — register at northernpowergrid.opendatasoft.com |
| Data | Substation utilisation, connection queue, NDP network headroom |

### 5.22 SSEN (Scottish & Southern Electricity Networks)

| Item | Detail |
|---|---|
| Provider | SSEN (DNO for South England & Scotland) |
| URL | Open data portal |
| Credential | None (open data) |
| Data | Network headroom data, data centre probability scoring |

### 5.23 Electricity North West (ENW)

| Item | Detail |
|---|---|
| Provider | Electricity North West (DNO for North West England) |
| URL | `https://electricitynorthwest.opendatasoft.com` |
| Credential | `ENW_API_KEY` — register at electricitynorthwest.opendatasoft.com |
| Data | Network headroom by primary substation |

### 5.24 Ireland Planning Applications

| Item | Detail |
|---|---|
| Provider | Irish Planning Authorities via ArcGIS FeatureServer |
| URL | `https://services.arcgis.com/NzlPQPKn5QF9v2US/arcgis/rest/services/IrishPlanningApplications` |
| Credential | None (public ArcGIS service) |
| Data | Planning application locations and status in Ireland (used in power map) |

### 5.25 OpenRouteService (HEIGit) — Isochrones

| Item | Detail |
|---|---|
| Provider | HEIGit / OpenRouteService |
| URL | `https://api.openrouteservice.org/v2/isochrones` |
| Credential | `HEIGIT_API_KEY` — register at openrouteservice.org |
| Data | Drive-time accessibility zones from any point on the map (used for DC site selection analysis) |

### 5.26 European GeoJSON Boundaries

| Item | Detail |
|---|---|
| Provider | GISCO (Eurostat geographic data) |
| URL | `https://gisco-services.ec.europa.eu` |
| Credential | None |
| Data | Country polygon boundaries for European countries (used in map country selection overlay) |
| Cache TTL | 24 hours |

### 5.27 UK Heat Network Zones (SSEP)

| Item | Detail |
|---|---|
| Source | Static GeoJSON file bundled with the application |
| File path | `public/uk-heat-network-zones.geojson` |
| Served at | `/uk-heat-network-zones.geojson` (Express static middleware) |
| Data | 131 features (83 valid polygons, 25 valid points; 23 with null geometry are automatically skipped) covering UK heat network zones from the SSEP strategic spatial planning exercise |

---

## 6. API Endpoints — Full Reference

All endpoints (except auth routes) require a valid session. Responses are JSON unless noted.

### Power Trends
| Method | Path | Description |
|---|---|---|
| POST | `/api/power-trends/generate` | Generate AI report for a country (cached 1 month) |
| GET | `/api/power-trends/latest?country=X` | Retrieve most recent report from database |

### NESO (UK Grid Operator)
| Method | Path | Description |
|---|---|---|
| GET | `/api/neso/demand-forecast` | UK demand forecast (cardinal points) |
| GET | `/api/neso/ssep-zones` | SSEP strategic planning zones |
| GET | `/api/neso/forecast-14day` | 14-day generation forecast |
| GET | `/api/neso/forecast-52week` | 52-week seasonal outlook |
| GET | `/api/neso/transmission-losses` | Transmission loss data |
| GET | `/api/neso/tresp-regions` | TRESP regional energy plan data |
| GET | `/api/neso/tec-register` | Transmission Entry Capacity register |

### ENTSO-E (European Electricity Prices & Generation)
| Method | Path | Description |
|---|---|---|
| GET | `/api/entsoe/status` | Check if ENTSO-E API is configured |
| GET | `/api/entsoe/prices?country=X` | Day-ahead price data for a country |
| GET | `/api/entsoe/cross-border-flows?country=X` | Cross-border physical flows |

### Energy Charts (Fraunhofer ISE)
| Method | Path | Description |
|---|---|---|
| GET | `/api/energy-charts/de` | Germany actual generation mix |
| GET | `/api/energy-charts/installed-power?country=X` | Installed capacity by technology |
| GET | `/api/energy-charts/signal?country=X` | Grid signal (renewable intensity) |
| GET | `/api/energy-charts/ren-share?country=X` | Renewable share daily average |

### Country Grid Intelligence
| Method | Path | Description |
|---|---|---|
| GET | `/api/ned/nl` | Netherlands grid data (NED) |
| GET | `/api/pse/pl` | Poland grid data (PSE SA) |
| GET | `/api/terna/it` | Italy grid data (Terna) |
| GET | `/api/fingrid/fi` | Finland grid data (Fingrid) |
| GET | `/api/ree/es` | Spain grid data (REE) |
| GET | `/api/statnett/no` | Norway grid data (Statnett) |
| GET | `/api/elia/be` | Belgium grid data (Elia) |
| GET | `/api/rte/fr` | France grid data (RTE) |
| GET | `/api/admie/grid` | Greece grid data (ADMIE, SCADA) |
| GET | `/api/ember/country-energy?country=X` | Ember annual generation data |

### UK Distribution Networks
| Method | Path | Description |
|---|---|---|
| GET | `/api/ukpn/datacentres` | UKPN data centre connection register |
| GET | `/api/ukpn/grid-substations` | UKPN grid substations |
| GET | `/api/ukpn/connection-queue` | UKPN connection queue |
| GET | `/api/ukpn/fault-levels` | UKPN fault level measurements |
| GET | `/api/ukpn/grid-primary-sites` | UKPN grid & primary sites |
| GET | `/api/ukpn/dfes-headroom` | UKPN DFES network headroom |
| GET | `/api/nged/network-capacity` | NGED network capacity map |
| GET | `/api/nged/opportunity-map` | NGED opportunity map |
| GET | `/api/nged/generation-register` | NGED generation connection register |
| GET | `/api/nged/gcr-summary-by-technology` | NGED GCR technology summary |
| GET | `/api/nged/embedded-capacity-register` | NGED embedded capacity register |
| GET | `/api/npg/utilisation` | NPG substation utilisation |
| GET | `/api/npg/connection-queue` | NPG connection queue |
| GET | `/api/npg/ndp-headroom` | NPG NDP network headroom |
| GET | `/api/ssen/headroom` | SSEN network headroom |
| GET | `/api/ssen/dc-probability` | SSEN data centre probability scoring |
| GET | `/api/enw/headroom` | ENW network headroom |

### Infrastructure Map Data
| Method | Path | Description |
|---|---|---|
| GET | `/api/baxtel/datacentres` | Data centre locations (primary + fallback) |
| POST | `/api/baxtel/refresh` | Admin: refresh data centre database |
| GET | `/api/emodnet/windfarms` | Offshore wind farms (EMODnet WFS) |
| GET | `/api/emodnet/powercables` | Submarine power cables (EMODnet WFS) |
| GET | `/api/submarine-cables/cables` | Telecoms submarine cables |
| GET | `/api/submarine-cables/landing-points` | Cable landing points |
| GET | `/api/submarine-cables/cable/:id` | Individual cable detail |
| GET | `/api/powerplants` | European power plant locations |
| GET | `/api/europe/geojson` | European country boundary polygons |
| GET | `/api/ireland/planning-applications` | Ireland planning applications |
| GET | `/api/ireland/traffic-sensors` | Ireland traffic sensor data |
| GET | `/api/oep/benchmarks` | OEP MODEX technology benchmarks |
| POST | `/api/ors/isochrones` | Drive-time isochrone zones |

---

## 7. Components & Charts — Data Lineage

### Power Trends Page

| Component | API Endpoint(s) | What it Shows |
|---|---|---|
| **Country dropdown + AI Report** | `POST /api/power-trends/generate`, `GET /api/power-trends/latest` | Full AI-generated report: summary, grid capacity, pricing, renewables, constraints, regulations, locations, trends, investor insights |
| **Grid Signal Widget** | `GET /api/energy-charts/signal` | Real-time renewable intensity signal (green/amber/red) and 30-minute timeseries |
| **Electricity Prices Chart** | `GET /api/entsoe/prices` | Monthly day-ahead electricity prices (EUR/MWh) with annual averages |
| **Renewable Share Chart** | `GET /api/energy-charts/ren-share` | Daily renewable energy share percentage over recent weeks |
| **Installed Power Chart** | `GET /api/energy-charts/installed-power` | Installed generation capacity by technology type (GW) |
| **Ember Energy Chart** | `GET /api/ember/country-energy` | Multi-year annual electricity generation by source |
| **OEP Benchmark Chart** | `GET /api/oep/benchmarks` | Renewable technology cost benchmarks (CAPEX/OPEX) by year |
| **Grid Losses** | `GET /api/neso/transmission-losses` | UK transmission loss data over time |
| **14-Day Forecast** | `GET /api/neso/forecast-14day` | 14-day peak/min/average generation forecast |
| **Seasonal Forecast** | `GET /api/neso/forecast-52week` | 52-week seasonal outlook |
| **Demand Forecast** | `GET /api/neso/demand-forecast` | UK demand forecast curve (cardinal points) |
| **Regional Demand** | `GET /api/neso/tresp-regions` | TRESP regional energy planning data |
| **Cross-Border Flows** | `GET /api/entsoe/cross-border-flows` | Animated arc map showing MW flows between countries |

#### Country-Specific Sections (shown only when that country is selected)

| Country | Component | API |
|---|---|---|
| United Kingdom | **SSEP Map** | `/uk-heat-network-zones.geojson` (static file), `/api/neso/ssep-zones` |
| United Kingdom | **TEC Register** | `GET /api/neso/tec-register` |
| United Kingdom | **NGED Generation Register** | `GET /api/nged/generation-register` |
| United Kingdom | **NGED Network Layer** | `GET /api/nged/network-capacity`, `/api/nged/opportunity-map` |
| United Kingdom | **UKPN Distribution Layer** | `GET /api/ukpn/datacentres`, `/api/ukpn/grid-substations`, `/api/ukpn/dfes-headroom` |
| Ireland | **Ireland DC Consumption** | Ember/CSO data (static enrichment) |
| Germany | **Germany Grid Chart** | `GET /api/energy-charts/de` |
| Netherlands | **Netherlands Grid Chart** | `GET /api/ned/nl` |
| France | **France Grid Chart** | `GET /api/rte/fr` |
| Norway | **Norway Grid Chart** | `GET /api/statnett/no` |
| Belgium | **Belgium Grid Chart** | `GET /api/elia/be` |
| Poland | **Poland Grid Chart** | `GET /api/pse/pl` |
| Italy | **Italy Grid Chart** | `GET /api/terna/it` |
| Finland | **Finland Grid Chart** | `GET /api/fingrid/fi` |
| Spain | **Spain Grid Chart** | `GET /api/ree/es` |
| Greece | **Greece Grid Chart** | `GET /api/admie/grid` |

### Power Infrastructure Map Page (`/power-map`)

| Layer | Toggle Name | API Endpoint | Data |
|---|---|---|---|
| Data Centres | "Data Centres" | `/api/baxtel/datacentres` | Markers: name, location, operator, capacity |
| Offshore Wind Farms | "Offshore Wind" | `/api/emodnet/windfarms` | Polygon/point markers: name, MW, turbine count, status, year |
| Submarine Power Cables | "Power Cables" | `/api/emodnet/powercables` | Polylines from 4 EMODnet source layers |
| Telecoms Submarine Cables | "Submarine Cables" | `/api/submarine-cables/cables` + `/landing-points` | Cable routes with click-to-detail |
| European Country Boundaries | (base layer) | `/api/europe/geojson` | Choropleth selectable country polygons |
| Cross-Border Electricity Flows | "Cross-Border Flows" | `/api/entsoe/cross-border-flows` | Animated Bezier arc polylines, colour-coded by direction & MW |
| SSEP Heat Network Zones (UK) | "Heat Networks" | `/uk-heat-network-zones.geojson` | UK strategic heat network zone polygons |
| UKPN Distribution Network | "UKPN Network" | `/api/ukpn/grid-substations`, `/api/ukpn/dfes-headroom` | SE England & East substation locations with headroom data |
| NGED Network | "NGED Network" | `/api/nged/network-capacity` | Midlands, SW, South Wales capacity map |

---

## 8. Environment Variables & Secrets

All secrets are stored as Replit Secrets (never committed to code).

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | **Required** | PostgreSQL connection string | Auto-provisioned by Replit Neon integration |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | **Required** | OpenAI API key | Auto-managed by Replit AI Integration |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | **Required** | OpenAI base URL | Auto-managed by Replit AI Integration |
| `ENTSOE_API_KEY` | Strongly recommended | ENTSO-E Transparency Platform | transparency.entsoe.eu (free registration) |
| `EMBER_API_KEY` | Recommended | Ember Climate API | ember-climate.org (free registration) |
| `NED_API_KEY` | Recommended | Netherlands Energy Dashboard | ned.nl (free registration) |
| `FINGRID_API_KEY` | Recommended | Fingrid (Finland) | data.fingrid.fi (free registration) |
| `OEP_API_KEY` | Recommended | Open Energy Platform | openenergy-platform.org (free registration) |
| `NGED_API_KEY` | UK-specific | National Grid ED open data | connecteddata.nationalgrid.co.uk |
| `UKPN_API_KEY` | UK-specific | UK Power Networks open data | ukpowernetworks.opendatasoft.com |
| `NPG_API_KEY` | UK-specific | Northern Power Grid open data | northernpowergrid.opendatasoft.com |
| `ENW_API_KEY` | UK-specific | Electricity North West open data | electricitynorthwest.opendatasoft.com |
| `HEIGIT_API_KEY` | Optional | OpenRouteService (isochrones) | openrouteservice.org (free tier available) |
| `BAXTEL_MAPBOX_TOKEN` | Fallback only | Mapbox token for Baxtel tile scraping | mapbox.com (if primary DC dataset is unavailable) |
| `ADMIN_EMAILS` | Optional | Comma-separated admin email list | Set manually to restrict admin routes |
| `SMTP_HOST` | Optional | Email server hostname | Your SMTP provider |
| `SMTP_PORT` | Optional | Email server port (default 587) | Your SMTP provider |
| `SMTP_USER` | Optional | SMTP username/email | Your SMTP provider |
| `SMTP_PASS` | Optional | SMTP password | Your SMTP provider |
| `SMTP_FROM` | Optional | From address for emails | Set manually |

> **Note:** Variables prefixed with `AI_INTEGRATIONS_` are managed automatically when the Replit AI Integration is enabled. Do not set these manually.

---

## 9. Database

### Technology
PostgreSQL via Neon (serverless), accessed through Drizzle ORM.

### Key Tables

| Table | Purpose |
|---|---|
| `users` | Registered user accounts (email, hashed password, session tokens) |
| `power_trend_analyses` | Cached AI-generated country reports (country, JSON content, created timestamp) |
| `baxtel_datacentres` | Fallback data centre records (name, lat, lng, country, operator) |
| `audit_logs` | User action audit trail |

### Schema Location
All table definitions and Zod schemas live in `shared/schema.ts`, which is imported by both the frontend and backend to ensure type consistency.

### Running Migrations
```bash
npm run db:push
```
This uses Drizzle Kit to push schema changes to the database. Run this after any changes to `shared/schema.ts`.

---

## 10. Caching Strategy

The platform uses a multi-layer caching approach to stay within API rate limits and deliver fast responses.

| Layer | Where | TTL | What is cached |
|---|---|---|---|
| AI reports | PostgreSQL database | 1 month | Full country power trend analysis JSON |
| ENTSO-E prices/flows | Server in-memory Map | 1 hour | Day-ahead prices, generation mix, cross-border flows |
| NESO forecasts | Server in-memory | 1 hour | 14-day forecast, 52-week forecast, demand forecast |
| Energy Charts | Server in-memory | 15–60 min | Generation data, grid signal, renewable share |
| EMODnet data | Server in-memory | 24 hours | Offshore wind farms, submarine power cables |
| Submarine Cable Map | Server in-memory | 24 hours | Cable routes and landing points |
| Europe GeoJSON | Server in-memory | 24 hours | Country boundary polygons |
| ADMIE grid data | Server in-memory Map | 1 hour | Greece SCADA load/generation/flows |
| Browser | HTTP `Cache-Control` headers | Varies | Static files and API responses |

---

## 11. AI Report Generation

### How a Report is Generated

**Step 1 — Check the database cache**
When a user selects a country and the page loads, TanStack Query calls `GET /api/power-trends/latest?country=X`. If a report exists in the database that is less than one month old and the user has not requested a force-refresh, it is returned immediately.

**Step 2 — Fetch live ENTSO-E data (if configured)**
If a new report is needed, the server first calls ENTSO-E to fetch the most recent day-ahead prices and generation mix for that country. This data is injected directly into the AI prompt as a "live data update" block, grounding the analysis in current market conditions.

**Step 3 — Build the AI prompt**
The system prompt for GPT contains:
- The analyst role instruction
- ~400 lines of hard-coded research intelligence from 40+ published reports (Goldman Sachs, IEA, Ember, BP Energy Outlook, DC Byte, KPMG, DCA, Oxford Economics, and others)
- Country-specific data sections (UK, Norway, Sweden, Denmark, Spain, Germany, Belgium, Ireland)
- OEP technology cost benchmarks (CAPEX/OPEX/lifetime for onshore wind, offshore wind, solar)
- Historical ENTSO-E price data by country
- The live ENTSO-E context from Step 2
- The required JSON output schema

**Step 4 — Call GPT and parse the response**
The model is called with `response_format: { type: "json_object" }` to ensure valid JSON output. The response is parsed and the `dataSources` array (40+ research citations) is injected server-side.

**Step 5 — Save to database**
The completed report is saved to the `power_trend_analyses` table and returned to the client.

### Output Structure
The AI report JSON contains the following top-level fields:
- `generatedAt`, `country`, `summary`
- `gridCapacity` — total/available/reserved capacity GW + projections
- `powerPricing` — average/peak/off-peak prices, volatility, PPA availability, trend
- `renewableEnergy` — share %, technology capacities, projections
- `gridConstraints` — array of regional constraints with severity and mitigation timelines
- `regulatoryEnvironment` — planning framework, connection timeline, key regulations, incentives, restrictions
- `dataCentrePowerDemand` — current/forecast demand, growth rate, workload breakdown
- `locations` — 5–8 location suitability assessments with scores
- `trends` — 5–8 market trends with impact and timeframe
- `investorInsights` — rating, opportunities, risks, recommended strategy
- `dataSources` — 40+ research citations (injected server-side, not generated by AI)

---

## 12. Setting Up the Platform from Scratch

Follow these steps to set up the platform in a new environment.

### Step 1 — Clone and install dependencies

```bash
npm install
```

### Step 2 — Provision the database

In Replit, the database is automatically provisioned when you use the Neon PostgreSQL integration. The `DATABASE_URL` secret is set automatically.

To push the schema to the database:
```bash
npm run db:push
```

### Step 3 — Enable the Replit AI Integration

In the Replit sidebar, go to **Integrations** and enable **OpenAI**. This automatically sets `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.

### Step 4 — Set required API keys

In Replit Secrets, add the following (minimum for full functionality):

```
ENTSOE_API_KEY=<your key from transparency.entsoe.eu>
EMBER_API_KEY=<your key from ember-climate.org>
```

For UK grid intelligence layers, also add:
```
NGED_API_KEY=<from connecteddata.nationalgrid.co.uk>
UKPN_API_KEY=<from ukpowernetworks.opendatasoft.com>
NPG_API_KEY=<from northernpowergrid.opendatasoft.com>
ENW_API_KEY=<from electricitynorthwest.opendatasoft.com>
```

### Step 5 — Start the application

```bash
npm run dev
```

This starts both the Express backend and the Vite frontend dev server on port 5000.

### Step 6 — Register and log in

Navigate to the app URL. Register an account. On first login, you will be routed to the Power Trends page with United Kingdom pre-selected.

### Step 7 — Generate your first report

Click the **"Generate Analysis"** button. The server will fetch live ENTSO-E data, call GPT, and store the report. Subsequent page loads will serve it instantly from the database.

---

## 13. Adding a New Country

To add a new country (e.g. Germany) to the AI report dropdown:

### Step 1 — Add to the country list
In `shared/schema.ts`, add the country name to `GIGLABS_COUNTRIES`:
```typescript
export const GIGLABS_COUNTRIES = [
  "United Kingdom",
  "France",
  "Netherlands",
  "Sweden",
  "Germany",  // ← new
] as const;
```

### Step 2 — Add country-specific research to the AI prompt
In `server/routes.ts`, within the system prompt string, add a country-specific data section (following the existing pattern for Norway, Sweden, etc.). Include grid capacity, TSO name, price zones, regulatory framework, and DC market specifics.

### Step 3 — Create a grid chart component (optional but recommended)
Create `client/src/components/GermanyGridChart.tsx` that calls `GET /api/energy-charts/de` (already exists for Germany) or the relevant TSO API. Follow the pattern of existing country chart components.

### Step 4 — Add a server-side data module (if the TSO is new)
Create `server/[tso].ts` with a `get[Country]Data()` function and a corresponding route in `server/routes.ts` under `/api/[tso]/[country-code]`.

### Step 5 — Wire up the chart on the Power Trends page
In `client/src/pages/PowerTrends.tsx`, find the section with country-specific conditionals (around the UK/Ireland/Germany section) and add:
```tsx
{selectedCountry.toLowerCase().includes("germany") && (
  <GermanyGridChart />
)}
```

### Step 6 — Deploy and regenerate reports
Push the changes and click "Generate Analysis" for the new country.

---

## 14. Adding a New Data Source

### Step 1 — Create a server module
Create `server/[sourceName].ts`. The module should:
- Export a main `get[Source]Data()` async function
- Include in-memory caching with a TTL
- Handle API errors gracefully
- Return a typed object

Example structure:
```typescript
let cache: { data: MyDataType; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getMySourceData(): Promise<MyDataType> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data;
  const resp = await fetch("https://api.example.com/data");
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  const data = await resp.json() as MyDataType;
  cache = { data, fetchedAt: Date.now() };
  return data;
}
```

### Step 2 — Register an API route
In `server/routes.ts`, add a route:
```typescript
app.get("/api/mysource/data", isAuthenticated, async (req, res) => {
  try {
    const { getMySourceData } = await import("./mySource");
    const data = await getMySourceData();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch data", error: err.message });
  }
});
```

### Step 3 — Create a frontend component
In `client/src/components/MySourceChart.tsx`, use TanStack Query:
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['/api/mysource/data'],
});
```

### Step 4 — Add to the relevant page
Import and render the component in `PowerTrends.tsx` or `PowerInfrastructure.tsx`.

### Step 5 — Document the source
Add the data source to the Methodology page (`client/src/pages/Methodology.tsx`) so users can see where the data comes from.

---

## 15. Growth Opportunities

The following are identified opportunities to add value to the platform based on current architecture and data connections.

### Immediate (Existing API Connections Available)

| Opportunity | What to Build | API Already Connected |
|---|---|---|
| **Germany full country report** | Add Germany to `GIGLABS_COUNTRIES`, German-specific AI prompt data, and a dedicated grid intelligence section using Energy Charts | Yes — `/api/energy-charts/de` |
| **Greece country section** | Show ADMIE SCADA data (load, RES, cross-border flows) in a Greece-specific chart | Yes — `/api/admie/grid` |
| **Norway price zone map** | Interactive Norway map showing NO1–NO5 price zones with current prices from Statnett | Yes — `/api/statnett/no` |
| **OEP benchmarks chart enhancement** | Add offshore wind expansion potential chart from Siala 2020 model data already in OEP benchmarks | Yes — `/api/oep/benchmarks` |
| **Drive-time isochrone tool** | "Accessibility analysis" tool on the map — click any data centre, generate drive-time zones | Yes — `/api/ors/isochrones` |
| **Ireland planning tracker** | List and map live planning applications for large energy users | Yes — `/api/ireland/planning-applications` |

### Near-Term (Small New Integrations)

| Opportunity | What to Build | Integration Needed |
|---|---|---|
| **NordPool price dashboard** | Real-time pan-Nordic spot prices by bidding zone | NordPool API (free registration) |
| **REE Spain generation dashboard** | Real-time Spain generation mix with solar and wind breakdown | None (REE API already connected) |
| **Belgium nuclear status widget** | Live nuclear plant availability (Elia OpenData) | None (Elia already connected) |
| **ENTSO-E generation forecasts** | Day-ahead and week-ahead generation forecasts for any country | None (ENTSOE_API_KEY already in use) |
| **French network capacity map** | RTE's capacity map for large consumer connections | None (RTE already connected) |
| **Carbon intensity dashboard** | Real-time gCO₂/kWh by country for DC procurement decisions | Carbon Intensity API (UK: free) |
| **Water stress overlay** | Map layer showing water stress risk by region (critical for cooling decisions) | Aqueduct Water Risk API (free) |

### Longer-Term (Strategic Features)

| Opportunity | Description |
|---|---|
| **Multi-country comparison report** | Side-by-side comparison of two or more countries on key investor metrics |
| **PPA pricing tool** | Structured renewable PPA price calculator using OEP benchmark costs and live market data |
| **Connection queue tracker** | Aggregate UK DNO connection queues (UKPN, NGED, NPG, SSEN, ENW) into a single waiting-time dashboard |
| **Portfolio site scoring** | Allow users to enter candidate data centre sites and receive an automated power-readiness score |
| **Regulatory change alerts** | Email/webhook notifications when monitored regulation feeds change (DCA horizon scan) |
| **Historical price archive** | Store ENTSO-E price data daily to build multi-year trend charts beyond the Transparency Platform's API window |
| **User-defined country reports** | Allow authenticated users to generate reports for any ENTSO-E country, not just the four in `GIGLABS_COUNTRIES` |
| **PDF export** | One-click PDF export of a country report for client-ready presentation |
| **Embeddable widgets** | Shareable iframe widgets for individual charts (already iframe-embeddable from dcauk.org via CSP header) |

---

*Document generated March 2026. Maintained by the 1GigLabs technical team.*
