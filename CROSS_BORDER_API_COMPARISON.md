# Cross-Border Flows API Comparison Debug

## Critical Question First

You mentioned seeing "Switzerland→Italy 2197 MW out" on the Price Map. Can you clarify:

1. **Where exactly** are you seeing this value?
   - In a tooltip when hovering over the interconnector line?
   - In a popup when clicking on something?
   - In the map legend or sidebar?
   - In the Network tab of DevTools (showing API response)?

2. **Which page/component** are you looking at?
   - European Transmission System — Price Map (ENTSOETransmissionMap.tsx)
   - Cross-border Physical Flows map (CrossBorderFlows.tsx)
   - Or a different component?

**Current Code Status:**
- **Price Map**: Displays only prices and interconnector CAPACITIES (NTC), NOT live flows
- **Cross-border Flows Map**: Displays actual live flows from `/api/entsoe/cross-border-flows`

## API Endpoints Comparison

### 1. Price Map Component
**Component**: `ENTSOETransmissionMap.tsx` (lines 258-266)
```typescript
fetch("/api/entsoe/all-prices", { credentials: "include" })
```

**Endpoint Handler**: `server/routes.ts` line 1032
```typescript
app.get("/api/entsoe/all-prices", async (req, res) => {
  const data = await getAllCountriesPriceSummary();
  // Returns: { _meta, data: CountrySummary[] }
  // data[i] has: { country, latestMonthAvg, latestMonthLabel, ... }
  // NO flow data
}
```

**Data returned**: Country price summaries, NOT flows
- Example: `{ country: "Switzerland", latestMonthAvg: 42.5, latestMonthLabel: "April 2026" }`

### 2. Cross-border Flows Map Component
**Component**: `CrossBorderFlows.tsx` (lines 413-420)
```typescript
fetch(`/api/entsoe/cross-border-flows?hourOffset=${hourOffset}`)
```

**Endpoint Handler**: `server/routes.ts` line 1102
```typescript
app.get("/api/entsoe/cross-border-flows", async (req, res) => {
  const data = await getCrossBorderFlows(hourOffset);
  // Returns: { _meta, data: CrossBorderFlow[] }
  // data[i] has: { from, to, netMw, inMw, outMw, updatedAt }
}
```

**Data returned**: Cross-border flows
- Example: `{ from: "Switzerland", to: "Italy", netMw: 2197, outMw: 2200, inMw: 3, updatedAt: "2026-05-01T12:00:00Z" }`

## API Response Schemas

### getAllCountriesPriceSummary()
**Source**: `server/entsoe.ts` (search for `getAllCountriesPriceSummary`)
**Returns**: 
```typescript
CountrySummary {
  country: string           // "Germany", "France", etc.
  code: string             // "DE", "FR"
  latestMonthAvg: number | null
  latestMonthLabel: string | null
  annualAvg: Record<string, number>
  eicCode: string
  estimated?: boolean
  estimatedNote?: string
}
```
**No flow data** — only prices

### getCrossBorderFlows()
**Source**: `server/entsoe.ts` (lines ~1200+)
**Returns**:
```typescript
CrossBorderFlow {
  from: string              // "Switzerland"
  to: string                // "Italy"
  netMw: number            // 2197 (positive = from exports to to)
  inMw: number             // MW flowing in
  outMw: number            // MW flowing out
  updatedAt: string        // ISO timestamp
}
```
**Has flow data** — this is what you're looking for

## The Real Question

**If the Price Map doesn't call the cross-border flows endpoint**, where are you seeing the flow values?

### Hypothesis 1: Different API Endpoint
Maybe one of the components is actually calling an endpoint that returns BOTH prices and flows?

**To check**:
1. Open browser DevTools → Network tab
2. Reload the page
3. Look at all API calls starting with `/api/entsoe/`
4. Screenshot/paste the URL and response schema for each

### Hypothesis 2: Different Time Windows
Maybe the Price Map is showing flows from a DIFFERENT hourOffset?

**To check**:
1. Console log both `updatedAt` timestamps
2. Are they the same hour? Different hours?
3. Check if filters are causing mismatches

### Hypothesis 3: Filtering/Rendering Logic
Maybe both components get the same data, but the Cross-border Flows map filters/hides certain pairs?

**To check**:
1. Look at the "⏬ FILTERED: netMw < 10" category in console
2. Check if "Switzerland→Italy 2197" is in FILTERED list (below visibility threshold)
3. Check the floor threshold in rendering logic

## Diagnostic Logging Enabled

I've added logging to both components:

### Price Map
**Console**: `📊 [Price Map] /api/entsoe/all-prices response`
Shows: Countries, prices, and timestamps

### Cross-border Flows
**Console**: `🔍 [EU arcs] DIAGNOSTIC AUDIT` (already enabled)
Shows: API data, coordinate matches, render status

## Next Steps

1. **Run the app** and open DevTools Console
2. **Look for**:
   - `📊 [Price Map] /api/entsoe/all-prices response` — see what API data it receives
   - `🔍 [EU arcs] DIAGNOSTIC AUDIT` — see what Cross-border Flows receives
3. **Compare timestamps**: Are they from the same hour?
4. **Check Network tab**: What endpoints are actually being called?
5. **Share the logs** — paste the console output so we can see the exact discrepancy

## Most Likely Root Cause

Based on the code review:
- **Price Map**: Doesn't call cross-border-flows endpoint at all
- **Cross-border Flows Map**: Calls cross-border-flows endpoint
- **Mismatch**: You might be looking at two different components or two different data sources

**If flows ARE showing on the Price Map somewhere:**
- That's a different code path we haven't found yet
- Share a screenshot showing where you see "Switzerland→Italy 2197 MW out"
- That will help us locate the actual data source

---

**Ready to debug once you clarify which page/component shows the flow values and share the console logs.**
