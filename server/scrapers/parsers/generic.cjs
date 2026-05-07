/**
 * Generic Parser
 * 
 * Fallback parser that attempts to extract basic facility information
 * from any data centre operator website using common patterns.
 * 
 * Used when no operator-specific parser exists.
 */

async function parseGeneric($, target) {
  const records = [];

  // Common patterns for data centre names
  const facilitySelectors = [
    '.facility, .data-center, .datacenter, .location',
    '[class*="facility"], [class*="datacenter"], [class*="location"]',
    'h2, h3, h4',
    '.card-title, .site-name'
  ];

  // Try each selector pattern
  for (const selector of facilitySelectors) {
    $(selector).each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      
      // Skip if too short or looks like generic content
      if (text.length < 3) return;
      if (/^(home|about|contact|services)$/i.test(text)) return;
      
      // Look for MW capacity in surrounding context
      const context = $elem.parent().text() + ' ' + $elem.next().text();
      const mwMatch = context.match(/([\d.]+)\s*MW/i);
      
      // Look for location indicators
      const locationMatch = context.match(/(USA|UK|Europe|Asia|Australia|[A-Z]{2})/);
      
      records.push({
        facilityName: text,
        region: locationMatch ? locationMatch[1] : null,
        country: null,
        mwDeployed: mwMatch ? parseFloat(mwMatch[1]) : null,
        mwAvailable: null,
        costPerKwh: null,
        costPerRack: null,
        occupancyRate: null,
        confidence: 'low' // Generic parsing is inherently low confidence
      });
    });
    
    // If we found records, stop trying other selectors
    if (records.length > 0) break;
  }

  // Deduplicate by facility name
  const unique = records.reduce((acc, record) => {
    if (!acc.find(r => r.facilityName === record.facilityName)) {
      acc.push(record);
    }
    return acc;
  }, []);

  console.log(`[Generic Parser] Found ${unique.length} potential facilities for ${target.operator_name}`);
  
  return unique.slice(0, 50); // Cap at 50 to avoid noise
}

module.exports = parseGeneric;
