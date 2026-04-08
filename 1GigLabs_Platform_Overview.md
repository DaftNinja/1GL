# 1GigLabs — Platform Overview

## What We Set Out to Do

The goal was to build a professional-grade market intelligence and decision-support platform for **data center investors and operators** looking to deploy power-intensive infrastructure across Europe.

The core problem being solved: identifying *where* to build data centers is an increasingly complex exercise. Grid capacity, power pricing, renewable energy availability, regulatory environments, connection queues, and the existing competitive landscape all interact in ways that are difficult to assess manually. Investors and hyperscalers need a single platform that combines live grid data, geospatial analysis, and AI-generated insight to surface the best opportunities — and the hidden risks.

---

## What We Have Built

### 1. AI-Powered Country Reports (Power Trends)

The primary feature of the platform. A user selects a European country and the system generates a structured, multi-section market analysis report covering:

- **Grid capacity** — current headroom, planned upgrades, and regional constraints
- **Power pricing** — industrial tariffs, PPA availability, and price trajectory
- **Renewable energy mix** — solar, wind, nuclear, hydro shares and trends
- **Regulatory environment** — permitting timelines, government policy, incentives
- **Data center power demand** — existing supply and forward pipeline
- **Investor Insights** — an overall country rating, key opportunities, and specific risk flags

Reports are not static. They are enriched with **live data from the ENTSO-E API** (the authoritative European electricity transmission data source), meaning generation and pricing figures reflect current market conditions at the time of generation. The AI model synthesises this live data alongside deep research context embedded in the system to produce analysis that reads like a senior analyst's briefing note.

Reports support **collaboration**: team members can comment on specific sections, assign sections for review, and track activity across all reports in a project.

---

### 2. Interactive Power Infrastructure Map

A Leaflet-based geospatial analysis tool that layers multiple data sources onto a single map. Users can toggle:

- **Power plants** — filterable by fuel type (Solar, Wind, Nuclear, Gas, Hydro, Biomass, and more) and generation capacity
- **Grid infrastructure** — substations and distribution network data for major UK Distribution Network Operators (UK Power Networks, SSEN, National Grid Electricity Distribution, Northern Powergrid, Electricity North West)
- **Fiber networks** — metro fiber and long-haul backbone Points of Presence, currently covering euNetworks


Beyond simple data display, the map includes **analytical layers** derived from underlying data — for example, probability scoring for data center development suitability based on grid connection queues and substation headroom.

---

### 3. Real-Time Energy Monitoring

Live charts and dashboards showing:

- Electricity spot prices across European markets
- Generation mix by fuel type, updated in near real-time
- Renewable energy share trends
- Cross-border electricity flows and interconnector utilisation

Data is pulled directly from ENTSO-E and Elexon (for UK-specific BMRS data), ensuring the figures shown are current rather than static.

---

### 4. Strategic Case Studies

A library of structured analysis documents covering major global enterprises — examining their infrastructure ecosystem, financials, leadership, and regional footprint. These are designed to support conversations with potential anchor tenants or co-location customers by giving the sales and BD team rapid context on a target company's data infrastructure posture and strategic direction.

---

### 5. Audit Logs

A system-level view of all significant actions taken within the platform — report generation, data refreshes, and entity changes — supporting governance and accountability requirements for enterprise users.

---

## Platform Capabilities Summary

| Capability | Detail |
|---|---|
| Country coverage | All major European markets (UK, France, Germany, Netherlands, Sweden, Norway, Ireland, and more) |
| AI report generation | Structured multi-section briefings enriched with live grid data |
| Live power data | ENTSO-E API integration for prices, generation mix, and cross-border flows |
| UK-specific data | Elexon BMRS for UK electricity pricing; DNO open data for substation and connection queue detail |
| Geospatial analysis | Interactive map with power, fiber, and data center layers |
| Collaboration | Per-report commenting, section assignment, and activity tracking |
| Authentication | Secure user login with session management |
| Admin controls | Role-based access for admin-only actions (data refresh, audit access) |
| Data caching | File and in-memory caching to reduce external API load and improve response times |

---

## Architecture

- **Frontend**: React with TypeScript, Vite, TanStack Query, Wouter routing, Shadcn UI components
- **Backend**: Node.js with Express, Drizzle ORM, PostgreSQL
- **AI**: OpenAI API for report generation
- **Maps**: Leaflet with Mapbox tile layers and custom vector data
- **External Data**: ENTSO-E (European electricity), Elexon BMRS (UK electricity), DNO open datasets (UK grid detail)
- **Deployment**: Replit cloud hosting

---

*Document generated: March 2026*
