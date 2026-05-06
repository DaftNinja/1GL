#!/bin/bash

# Phase 1 & 2 Manual Entry Script
# Usage: bash manual_entry_examples.sh

API_BASE="http://localhost:5000"

echo "========================================"
echo "DC Scraping Pipeline — Phase 1 & 2"
echo "Manual Entry Examples"
echo "========================================"
echo ""

# Verify admin endpoint is accessible
echo "[1] Checking admin endpoint access..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$API_BASE/api/admin/dc-pricing/status" || echo "Admin endpoint not accessible (expected if not authenticated)"

echo ""
echo "[2] PHASE 1: Manual entry for Verne Global"
echo "=========================================="

# Verne Global entry (requires admin auth)
cat << 'EOF' > /tmp/verne_global.json
{
  "operatorName": "Verne Global",
  "region": "Reykjavik",
  "country": "Iceland",
  "pricePerKwh": 0.045,
  "source": "verneglobal.com (homepage Q2 2026)",
  "confidence": "high",
  "notes": "100% renewable power, PUE 1.13, cold climate cooling"
}
EOF

echo "Entry data:"
cat /tmp/verne_global.json
echo ""
echo "To submit, run:"
echo "curl -X POST http://localhost:5000/api/admin/dc-pricing/manual \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d @/tmp/verne_global.json"

echo ""
echo "[3] PHASE 1: Manual entry for Green Mountain"
echo "=============================================="

cat << 'EOF' > /tmp/green_mountain.json
{
  "operatorName": "Green Mountain",
  "region": "Stavanger",
  "country": "Norway",
  "pricePerKwh": 0.052,
  "source": "greenmountain.no (contact form Q2 2026)",
  "confidence": "high",
  "notes": "100% hydropower renewable, cold climate region"
}
EOF

echo "Entry data:"
cat /tmp/green_mountain.json
echo ""
echo "To submit, run:"
echo "curl -X POST http://localhost:5000/api/admin/dc-pricing/manual \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d @/tmp/green_mountain.json"

echo ""
echo "[4] PHASE 2: Manual entries for capacity metrics"
echo "=================================================="

cat << 'EOF' > /tmp/equinix_entry.json
{
  "operatorName": "Equinix",
  "region": "Frankfurt",
  "country": "Germany",
  "capacityMw": 42,
  "source": "equinix.com/data-centers (facility listing)",
  "confidence": "medium",
  "notes": "Frankfurt facility capacity. Pricing requires RFQ to sales@equinix.com"
}
EOF

echo "Equinix Frankfurt:"
cat /tmp/equinix_entry.json

cat << 'EOF' > /tmp/kao_data_entry.json
{
  "operatorName": "Kao Data",
  "region": "London",
  "country": "UK",
  "capacityMw": 18,
  "pueRating": 1.25,
  "source": "kaodata.com/data-centre (specs page)",
  "confidence": "high",
  "notes": "PUE 1.25 published, independent operator, contact sales@kaodata.com for pricing"
}
EOF

echo ""
echo "Kao Data:"
cat /tmp/kao_data_entry.json

cat << 'EOF' > /tmp/qts_entry.json
{
  "operatorName": "QTS",
  "region": "Frankfurt",
  "country": "Germany",
  "capacityMw": 32,
  "source": "qtsdatacenters.com/locations",
  "confidence": "medium",
  "notes": "Frankfurt facility, German carrier-neutral provider"
}
EOF

echo ""
echo "QTS Frankfurt:"
cat /tmp/qts_entry.json

echo ""
echo "=========================================="
echo "Batch submission example (for authenticated session):"
echo "=========================================="

cat << 'EOF'
# After logging in as andrew.mccreath@1giglabs.com:

curl -X POST http://localhost:5000/api/admin/dc-pricing/manual \
  -H 'Content-Type: application/json' \
  -d '{
    "operatorName": "Verne Global",
    "region": "Reykjavik",
    "country": "Iceland",
    "pricePerKwh": 0.045,
    "source": "verneglobal.com",
    "confidence": "high",
    "notes": "100% renewable power"
  }'

curl -X POST http://localhost:5000/api/admin/dc-pricing/manual \
  -H 'Content-Type: application/json' \
  -d '{
    "operatorName": "Green Mountain",
    "region": "Stavanger",
    "country": "Norway",
    "pricePerKwh": 0.052,
    "source": "greenmountain.no",
    "confidence": "high",
    "notes": "100% hydropower renewable"
  }'

# Check submitted records:
curl -s http://localhost:5000/api/admin/dc-pricing/snapshots | jq '.snapshots[] | {operatorName, country, pricePerKwh, confidence}'
EOF

echo ""
echo "=========================================="
echo "Triggering scraping job (once ScraperAPI key is set):"
echo "=========================================="

echo "curl -X POST http://localhost:5000/api/admin/dc-pricing/run"

echo ""
echo "=========================================="
echo "View dashboard:"
echo "=========================================="
echo "http://localhost:5000/admin/dc-pricing"
echo ""
