/**
 * CyrusOne Parser
 * 
 * Parses data centre listings from CyrusOne's public website.
 * Extracts facility names, locations, and facility codes (PHX1-PHX8, etc.)
 * 
 * URL: https://cyrusone.com/data-centers
 */

export default async function parseCyrusOne($, target) {
  const records = [];

  // CyrusOne lists facilities as a.city links with format: "City, State, CODE1-CODE2"
  $('a.city').each((i, elem) => {
    const $link = $(elem);
    const fullText = $link.text().trim();
    const href = $link.attr('href');
    
    // Parse format: "Chandler, AZ, PHX1-PHX8" or "Somerset, NJ, NYM1"
    const parts = fullText.split(',').map(p => p.trim());
    
    if (parts.length < 2) return; // Skip malformed entries
    
    const city = parts[0];
    const state = parts[1];
    const facilityCodes = parts[2] || '';
    
    // Determine region from URL path
    let region = 'Unknown';
    if (href) {
      if (href.includes('/north-america/')) region = 'North America';
      else if (href.includes('/emea/')) region = 'EMEA';
      else if (href.includes('/apac/')) region = 'APAC';
    }
    
    // Determine country from state/region and city
    let country = null;
    if (region === 'North America') {
      // US states
      if (['AZ', 'IL', 'IA', 'NJ', 'CT', 'NY', 'NC', 'OH', 'TX', 'VA', 'WA'].includes(state)) {
        country = 'United States';
      } else {
        country = 'Canada';
      }
    } else if (region === 'EMEA') {
      // Map EMEA cities to countries
      const cityToCountry = {
        'London': 'United Kingdom',
        'Frankfurt': 'Germany',
        'Amsterdam': 'Netherlands',
        'Paris': 'France',
        'Dublin': 'Ireland',
        'Madrid': 'Spain',
        'Istanbul': 'Turkey',
      };
      country = cityToCountry[city] || 'Unknown';
    } else if (region === 'APAC') {
      const cityToCountry = {
        'Singapore': 'Singapore',
        'Hong Kong': 'Hong Kong',
        'Tokyo': 'Japan',
        'Sydney': 'Australia',
      };
      country = cityToCountry[city] || 'Unknown';
    }
    
    // Parse facility codes to count individual facilities
    // "PHX1-PHX8" means 8 facilities, "NYM1" means 1 facility
    let facilityCount = 1;
    if (facilityCodes.includes('-')) {
      const codeMatch = facilityCodes.match(/([A-Z]+)(\d+)-([A-Z]+)?(\d+)/);
      if (codeMatch) {
        const startNum = parseInt(codeMatch[2]);
        const endNum = parseInt(codeMatch[4]);
        if (!isNaN(startNum) && !isNaN(endNum)) {
          facilityCount = endNum - startNum + 1;
        }
      }
    }
    
    // Create a record for the facility group
    // We can't split into individual facilities without visiting each detail page
    // So we record it as one entry with a note about multiple facilities
    const facilityName = facilityCodes 
      ? `${city}, ${state} (${facilityCodes})`
      : `${city}, ${state}`;
    
    records.push({
      facilityName: facilityName,
      region: city,
      country: country,
      mwDeployed: null, // Not available on listing page
      mwAvailable: null,
      costPerKwh: null,
      costPerRack: null,
      occupancyRate: null,
      confidence: 'medium', // We have accurate name/location, just not capacity
      notes: facilityCount > 1 ? `Campus with ${facilityCount} facilities` : null
    });
  });

  console.log(`[CyrusOne Parser] Found ${records.length} facility locations`);
  return records;
}
