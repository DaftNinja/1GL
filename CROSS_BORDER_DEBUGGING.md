# Cross-Border Flows Debugging Guide

## Current State
- **80+ transmission border pairs** defined in INTERCONNECTORS
- **All 35 European countries** have coordinate entries (capitals or centroids)
- **Diagnostic logging enabled** in both frontend and backend

## How to Debug

### Step 1: Check Frontend Console Logs
1. Open the Cross-border Physical Flows map in your browser
2. Press `F12` to open DevTools → Console tab
3. Look for the **🔍 [EU arcs] DIAGNOSTIC AUDIT** section (grouped output)
4. You'll see:
   ```
   📍 Coordinate map: 35 entries: [Albania, Austria, Belgium, ...]
   📦 API response: 74 pairs
   📋 Sample API pairs (first 5): [Norway→Sweden, Norway→Finland, Norway→Denmark, ...]
   📊 ENTSO-E pair format check: {
     firstPair: "Norway (type: string)",
     exampleFormat: "Norway→Sweden"
   }
   ✅ RENDERED (N): [list of pairs that appear on map]
   ⛔ MISSING FLOW DATA (M): [pairs in INTERCONNECTORS but not in API response]
   🚫 MISSING COORDINATES (M): [pairs where country not in coord map]
   ⏬ FILTERED: netMw < 10 (M): [pairs with |netMw| < 10 MW]
   📈 Full audit matrix (missing pairs details):
     Norway→Sweden: [reason]
     ...
   ```

### Step 2: Check Server Logs (Railway/Docker)
Look for `[ENTSOE A11]` messages:
```
[ENTSOE A11] Fetching 77 borders (3 skipped) with concurrency=3 | hourOffset: 0 | window: ...
[ENTSOE A11] fetch complete in Xms
[ENTSOE A11] 50/77 borders have data | latest data point: ...
[ENTSOE A11] borders WITH data: DE→NL(1234out/567in), FR→DE(890out/123in), ...
[ENTSOE A11] borders NO data (error 999 or no TSO submission): NO→SE, NO→FI, ...
[ENTSOE A11] Sending to client: 74 pairs total
[ENTSOE A11] Response format check: first pair = Norway→Sweden (netMw=-456)
[ENTSOE A11] Non-zero flows (|netMw| >= 10): 52 / 74
[ENTSOE A11] Sample non-zero: Norway→Sweden:-456MW, Germany→France:1234MW, ...
```

## What Each Category Means

### ✅ RENDERED (pairs that appear on map)
- **Count**: Should be visible on the map
- **Why**: Has API data + non-zero flow (|netMw| ≥ 10) + coordinates found
- **Example**: `Germany→Netherlands(5432MW)`

### ⛔ MISSING FLOW DATA (in INTERCONNECTORS, missing from API)
- **Likely causes**:
  - Border doesn't submit to ENTSO-E
  - Border gets error 999 (NordPool internal: NO↔SE, NO↔FI, NO↔DK)
  - API error during fetch
  - Border explicitly skipped (KNOWN_EMPTY_BORDERS)
- **Example**: `Turkey→Bulgaria` (if Turkey doesn't submit regularly)

### 🚫 MISSING COORDINATES (country not in coordinate map)
- **Impossible in current setup** (all 35 countries verified to have coordinates)
- **Would indicate**: Bug in coordinate map or country name mismatch

### ⏬ FILTERED: netMw < 10 (low flow, not visible at default zoom)
- **Reason**: Rendering filtered to avoid cluttering map with tiny flows
- **Example**: `Albania→Greece (2MW)`
- **Note**: These are NOT missing data; the data exists but is below visibility threshold

## Known Issues by Category

### Nordic Borders (NordPool, return error 999)
These publish via nordpoolgroup.com API, NOT ENTSO-E:
- `Norway→Sweden` — NordPool Link 1, Link 2
- `Norway→Finland` — NordPool
- `Norway→Denmark` — NordPool (DC)

**Action needed**: Use NordPool API fallback OR accept that they won't show from ENTSO-E

### Balkan/Eastern Borders (low submission rates)
Might have low/zero data:
- Turkish borders (`Turkey→Greece`, `Turkey→Bulgaria`)
- Some Albanian borders (`Albania→Montenegro`, `Albania→Greece`)
- Some Serbian/Bosnia borders (inconsistent ENTSO-E submission)

### Iberian (typically low flow)
- `Spain→Portugal` — Often < 10 MW, filtered out

## Debugging Checklist

- [ ] **API response format**: Do countries use full names (Norway, Germany) or codes (NO, DE)?
  - Check: "ENTSO-E pair format check" in console → should show `Norway→Sweden`
  - If codes shown: Update backend INTERCONNECTOR_PAIRS to use codes
  
- [ ] **Coordinate mismatch**: Do country names in API match country names in coordinate map?
  - Check: All 35 countries in "Coordinate map" match all countries in INTERCONNECTORS
  - Currently: **100% match verified** ✅

- [ ] **Low flow filtering**: Are many pairs filtered due to |netMw| < 10?
  - Check: Count in "⏬ FILTERED" category
  - If high: Increase filter threshold OR log in "FILTERED" to understand patterns

- [ ] **Error 999 vs missing**: Which borders return error 999 vs no data?
  - Check server logs: `borders NO data (error 999 or no TSO submission)`
  - Typically: Nordic borders (NO↔SE, NO↔FI, NO↔DK) + some Balkans

- [ ] **API data arrival**: Are flows actually in the API response?
  - Check: "Non-zero flows (|netMw| >= 10): X / Y"
  - If Y = 77 but X = 10: Most borders have zero/near-zero flow
  - If Y < 77: Some borders missing from API entirely

## Sample Output Interpretation

If console shows:
```
✅ RENDERED (45): [list of 45 pairs]
⛔ MISSING FLOW DATA (28): [list of 28 pairs]
🚫 MISSING COORDINATES (0): none
⏬ FILTERED: netMw < 10 (2): [list of 2 pairs]
```

**Analysis**: 
- 45 borders visible on map (good!)
- 28 borders have no API data (expected for Nordic/Balkans)
- 0 coordinate issues (expected, all countries covered)
- 2 borders have data but < 10 MW (borderline visibility)

**Total**: 45 + 28 + 0 + 2 = 75 borders accounted for out of 80

## Next Steps

Once you run the debugger and share the console output, we can:

1. **Identify the exact missing pairs** with reasons
2. **Group them by pattern**:
   - NordPool borders (need alternative API)
   - Balkan borders (inconsistent ENTSO-E submission)
   - Low-flow pairs (increase filter threshold?)
   - API format issues (rename if needed)
3. **Fix in one go**: Update coordinate map OR INTERCONNECTORS OR filtering logic

## Commands to Check

### Frontend: Run diagnostic in console
```javascript
// Copy-paste into DevTools console to re-run audit
document.location.reload();
// Then check console for 🔍 [EU arcs] DIAGNOSTIC AUDIT group
```

### Backend: Check cross-border flow fetch
```bash
# Watch server logs (Railway dashboard or local dev)
npm run dev  # If developing locally
# Look for: [ENTSOE A11] messages in console
```

### Backend: Manually fetch API to see raw response
```bash
curl "http://localhost:5000/api/entsoe/cross-border-flows?hourOffset=0" \
  -H "Cookie: [session cookie]" | jq '.data | map(.from + "→" + .to)'
```

## Expected Output Format

### Frontend Coordinate Map
- All 35 countries with `[latitude, longitude]`
- Keys: full country names ("Norway", "Germany", "Turkey")

### Backend API Response
- Array of `{ from, to, netMw, inMw, outMw, updatedAt }`
- `from` and `to` use **full country names** (matches INTERCONNECTORS)
- Should have 50-80 pairs depending on what ENTSO-E has data for

### Format Mismatch Examples
❌ **Wrong** (code vs name):
```javascript
// Frontend INTERCONNECTORS
{ from: "Norway", to: "Sweden" }

// Backend API response
{ from: "NO", to: "SE" }
```

✅ **Correct** (both using names):
```javascript
// Frontend INTERCONNECTORS
{ from: "Norway", to: "Sweden" }

// Backend API response
{ from: "Norway", to: "Sweden" }
```

---

**Status**: Diagnostic logging committed and pushed to dev. Ready for you to run and analyze. Share the console output and server logs, and we'll identify the exact missing pairs and fix them in one targeted update.
