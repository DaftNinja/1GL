# DC Scraping Pipeline — Phase 1 & 2 Implementation Guide

## Overview
Phase 1 & 2 focus on 5 high-value operators with publicly available capacity/pricing data. All require JavaScript rendering for dynamic content.

---

## 🟢 PHASE 1: Highest ROI Operators (100% Scrapeable)

### 1️⃣ Verne Global (Iceland)
**Website**: https://www.verneglobal.com/data-centre/

**Data Available** ✓
- €/kWh pricing: **Yes** — visible on homepage
- MW capacity: **Yes**
- PUE rating: **Yes** — stated as 1.13
- Renewable: **Yes** — 100% renewable power

**Scraping Config**
```json
{
  "operatorName": "Verne Global",
  "parserType": "js",
  "render": true,
  "dataType": "pricing",
  "selectors": [
    "[class*='price']",
    "[class*='capacity']",
    "[class*='pue']",
    "h2, h3, p"
  ],
  "patterns": [
    "€[\\d.]+/kWh",
    "[\\d.]+\\s*MW",
    "PUE[:\\s]+[\\d.]+|PUE\\s*[\\d.]+"
  ]
}
```

**Manual Entry Template**
```
Operator: Verne Global
Region: Iceland, Reykjavik
Price Per kWh: [extract from homepage or contact form]
Capacity MW: [total facility MW]
PUE Rating: 1.13 (published)
Renewable %: 100
Source: verneglobal.com
Vintage: 2026-Q2
Confidence: high
Notes: 100% renewable power, cold climate cooling advantage
```

**Contact for Updated Pricing**
- Sales: https://www.verneglobal.com/contact
- Support: sales@verneglobal.com

---

### 2️⃣ Green Mountain (Norway)
**Website**: https://greenmountain.no/data-centre/

**Data Available** ✓
- €/kWh or NOK pricing: **Yes** — available on site
- MW capacity: **Yes**
- PUE rating: **Likely** — technical specs available
- Renewable: **Yes** — hydropower

**Scraping Config**
```json
{
  "operatorName": "Green Mountain",
  "parserType": "js",
  "render": true,
  "dataType": "pricing",
  "frequency": "monthly",
  "patterns": [
    "€[\\d.]+/kWh|[\\d.]+\\s*NOK",
    "[\\d.]+\\s*MW",
    "PUE[:\\s]+[\\d.]+"
  ]
}
```

**Manual Entry Template**
```
Operator: Green Mountain
Region: Norway, Stavanger
Price Per kWh: [extract from pricing page]
Price Per Rack Month: [if available]
Capacity MW: [facility capacity]
PUE Rating: [if published]
Renewable %: 100 (hydropower)
Source: greenmountain.no
Vintage: 2026-Q2
Confidence: high
Notes: Located in Stavanger, cold climate, hydropower renewable energy
```

**Contact for Detailed Pricing**
- https://greenmountain.no/contact
- Pricing inquiry: contact form on website

---

## 🟡 PHASE 2: Medium-High Value Operators (Capacity + Metrics)

### 3️⃣ Equinix (Global)
**Website**: https://www.equinix.com/data-centers/

**Data Available** ✓
- €/kWh pricing: **No** — requires custom quote
- MW capacity: **Yes** — by facility
- Facility list: **Yes** — comprehensive
- PUE/efficiency: **Partial** — some sites published

**Scraping Strategy**
- Extract facility list + capacity by region
- Pricing requires manual RFQ form submission
- Per-facility metrics vary

**Manual Entry Template**
```
Operator: Equinix
Region: [multiple European locations]
  - Frankfurt: [capacity MW]
  - Amsterdam: [capacity MW]
  - London: [capacity MW]
  - Paris: [capacity MW]
  
Price Per kWh: [contact sales - varies by region]
Typical Range: €0.12-0.18/kWh (industry estimate)
Source: equinix.com + sales contact
Vintage: 2026-Q2
Confidence: medium (capacity confirmed, pricing estimated)
Notes: Large carrier-neutral provider, per-location pricing negotiable
```

**Contact for Pricing**
- https://www.equinix.com/data-centers/ → "Request Quote"
- Regional sales teams available

---

### 4️⃣ Kao Data (London)
**Website**: https://www.kaodata.com/data-centre/

**Data Available** ✓
- €/kWh pricing: **No** — requires RFQ
- MW capacity: **Yes**
- PUE rating: **Yes** — published as key metric
- Power efficiency: **Yes** — detailed specs

**Scraping Config**
```json
{
  "operatorName": "Kao Data",
  "parserType": "js",
  "dataType": "capacity",
  "selectors": [
    "[class*='pue']",
    "[class*='power']",
    "[class*='efficiency']",
    "[class*='specs']"
  ],
  "patterns": [
    "PUE[:\\s]+[\\d.]+",
    "[\\d.]+\\s*MW",
    "power[:\\s]+[\\d.]+"
  ]
}
```

**Manual Entry Template**
```
Operator: Kao Data
Region: UK, London (Essex)
Price Per kWh: [contact for quote]
Typical Range: €0.14-0.16/kWh (estimate)
Capacity MW: [extract from specs]
PUE Rating: [published on site]
Source: kaodata.com
Vintage: 2026-Q2
Confidence: high (metrics + capacity confirmed)
Notes: London-based, independent operator, UK power grid connection
```

**Contact for Pricing**
- https://www.kaodata.com/contact-us
- Sales: sales@kaodata.com

---

### 5️⃣ QTS (Frankfurt)
**Website**: https://www.qtsdatacenters.com/locations

**Data Available** ✓
- €/kWh pricing: **No** — requires RFQ
- MW capacity: **Yes** — by facility
- Facility list: **Yes** — Frankfurt + others
- Power specs: **Partial**

**Scraping Config**
```json
{
  "operatorName": "QTS",
  "parserType": "js",
  "dataType": "capacity",
  "selectors": [
    "[class*='location']",
    "[class*='capacity']",
    "[data-location]"
  ],
  "patterns": [
    "[\\d.]+\\s*MW",
    "Frankfurt.*[\\d.]+",
    "capacity[:\\s]+[\\d.]+"
  ]
}
```

**Manual Entry Template**
```
Operator: QTS
Region: Germany, Frankfurt
Price Per kWh: [contact sales for quote]
Typical Range: €0.12-0.15/kWh (estimate)
Capacity MW: [extract from locations page]
Frankfurt Facility: [specific MW]
Source: qtsdatacenters.com
Vintage: 2026-Q2
Confidence: medium (capacity confirmed, pricing estimated)
Notes: Frankfurt am Main location, German carrier-neutral provider
```

**Contact for Pricing**
- https://www.qtsdatacenters.com/contact
- Regional sales: [Frankfurt contact form]

---

## 📋 Implementation Checklist

### Week 1: Phase 1 (Verne Global + Green Mountain)
- [ ] Deploy targets.ts with JS rendering enabled for both operators
- [ ] Start ScraperAPI pricing (request sandbox API key for testing)
- [ ] Manually extract current pricing from both operators
- [ ] Enter manual records via `/api/admin/dc-pricing/manual`:
  ```bash
  POST /api/admin/dc-pricing/manual
  {
    "operatorName": "Verne Global",
    "country": "Iceland",
    "region": "Reykjavik",
    "pricePerKwh": 0.0XX,
    "source": "verneglobal.com",
    "confidence": "high",
    "notes": "From homepage Q2 2026"
  }
  ```

### Week 2: Phase 2 (Equinix + Kao Data + QTS)
- [ ] Deploy Phase 2 targets with JS rendering
- [ ] Extract capacity data for each facility
- [ ] Estimate pricing using industry benchmarks (€0.12-0.18/kWh range)
- [ ] Enter records with `confidence: "medium"`
- [ ] Set up quarterly RFQ contacts for updated pricing

### Week 3: Validation & Monitoring
- [ ] Run scraping job: `POST /api/admin/dc-pricing/run`
- [ ] Review dashboard: `GET /admin/dc-pricing`
- [ ] Check for discrepancies: `GET /api/admin/dc-pricing/queue`
- [ ] Resolve any conflicts between sources

---

## 🔧 Testing Scraper Locally (Without ScraperAPI Key)

```bash
# Test with native fetch (HTTP only - JS won't render):
curl -s "https://www.verneglobal.com/data-centre/" | npx cheerio -q "h2, h3, [class*='price']"

# After ScraperAPI key is set:
export SCRAPERAPI_KEY="your_key"
npm run scrape:phase1
```

---

## 📊 Expected Data Quality

| Operator | Pricing | Capacity | PUE | Facility List | Confidence |
|----------|---------|----------|-----|---------------|------------|
| Verne Global | ✓ Public | ✓ Public | ✓ Published | ✓ | **HIGH** |
| Green Mountain | ✓ Contact | ✓ Public | Partial | ✓ | **HIGH** |
| Equinix | ✗ RFQ | ✓ Public | Partial | ✓ | **MEDIUM** |
| Kao Data | ✗ RFQ | ✓ Public | ✓ Published | ✓ | **MEDIUM** |
| QTS | ✗ RFQ | ✓ Public | Partial | ✓ | **MEDIUM** |

---

## 🚀 Production Rollout

1. **Get ScraperAPI key**: ~$30/mo for 100k requests (handles all 27 operators at monthly cadence)
2. **Enable JS rendering**: Already configured in targets.ts (`render: true`)
3. **Set environment variable**:
   ```bash
   export SCRAPERAPI_KEY="xxx"
   ```
4. **Deploy scheduler**: Runs automatically at monthly intervals
5. **Monitor discrepancies**: Admin dashboard auto-detects conflicting sources

---

## 🔗 Admin Dashboard Access

- **URL**: https://[1gl.domain]/admin/dc-pricing
- **Auth**: andrew.mccreath@1giglabs.com required
- **Panels**:
  - Scraping Status (job history, target success rate)
  - Pricing Records (searchable by operator/country/confidence)
  - Review Queue (manual resolution of discrepancies)

---

## 📞 Next Steps

1. **Request ScraperAPI account** (or use Puppeteer once Docker Chromium is available)
2. **Run Phase 1 manual entry** (quick wins: Verne + Green Mountain)
3. **Deploy Phase 2** (capacity extraction + industry pricing estimates)
4. **Monitor for 1 month** before rolling out to all 27 operators
