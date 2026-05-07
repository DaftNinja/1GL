/**
 * NEXTDC Parser
 * 
 * Parses data centre listings from NEXTDC's public website.
 * NEXTDC is Australia's largest data centre operator (ASX: NXT).
 * 
 * URL: https://www.nextdc.com/data-centres
 */

export default async function parseNEXTDC($, target) {
  const records = [];

  // NEXTDC lists facilities as a.leaf-link elements with format:
  // "S1 Macquarie Park", "M1 Port Melbourne", etc.
  $('a.leaf-link').each((i, elem) => {
    const $link = $(elem);
    const fullText = $link.text().trim();
    const href = $link.attr('href');
    
    if (!fullText || !href) return;
    
    // Parse format: "S1 Macquarie Park" or "S4 Horsley Park (In Planning)"
    const inPlanningMatch = fullText.match(/(.+?)\s*\(In [Pp]lanning\)/);
    const isPlanned = !!inPlanningMatch;
    const facilityText = inPlanningMatch ? inPlanningMatch[1].trim() : fullText;
    
    // Extract facility code (S1, M1, B1, etc.) and location
    const parts = facilityText.split(/\s+/);
    const facilityCode = parts[0]; // S1, M1, B1, etc.
    const location = parts.slice(1).join(' '); // Macquarie Park, Port Melbourne, etc.
    
    // FILTER: Only keep real facilities (format: Letter+Number like S1, M1, B1)
    if (!/^[A-Z][0-9]/.test(facilityCode)) {
      return; // Skip menu items and other junk
    }
    // Determine city and country from URL path
    // Format: /data-centres/sydney-data-centres/s1-sydney
    let city = 'Unknown';
    let country = 'Australia'; // Default
    
    if (href.includes('/sydney-')) {
      city = 'Sydney';
      country = 'Australia';
    } else if (href.includes('/melbourne-')) {
      city = 'Melbourne';
      country = 'Australia';
    } else if (href.includes('/brisbane-')) {
      city = 'Brisbane';
      country = 'Australia';
    } else if (href.includes('/perth-')) {
      city = 'Perth';
      country = 'Australia';
    } else if (href.includes('/adelaide-')) {
      city = 'Adelaide';
      country = 'Australia';
    } else if (href.includes('/canberra-')) {
      city = 'Canberra';
      country = 'Australia';
    } else if (href.includes('/darwin-')) {
      city = 'Darwin';
      country = 'Australia';
    } else if (href.includes('/port-hedland-')) {
      city = 'Port Hedland';
      country = 'Australia';
    } else if (href.includes('/sunshine-coast-')) {
      city = 'Sunshine Coast';
      country = 'Australia';
    } else if (href.includes('/newman-')) {
      city = 'Newman';
      country = 'Australia';
    } else if (href.includes('/japan-')) {
      city = facilityCode.startsWith('T') ? 'Tokyo' : 'Japan';
      country = 'Japan';
    } else if (href.includes('/malaysia-')) {
      city = facilityCode.startsWith('KL') ? 'Kuala Lumpur' : 'Malaysia';
      country = 'Malaysia';
    } else if (href.includes('/new-zealand-')) {
      city = facilityCode.startsWith('A') ? 'Auckland' : 'New Zealand';
      country = 'New Zealand';
    }
    
    // Build facility name
    const facilityName = location 
      ? `${facilityCode} ${location}` 
      : facilityCode;
    
    records.push({
      facilityName: facilityName + (isPlanned ? ' (Planned)' : ''),
      region: city,
      country: country,
      mwDeployed: null, // Not available on listing page
      mwAvailable: null,
      costPerKwh: null,
      costPerRack: null,
      occupancyRate: null,
      confidence: isPlanned ? 'low' : 'high', // High confidence for operational facilities
      notes: isPlanned ? 'In planning/construction phase' : null
    });
  });

  // Deduplicate (some facilities appear multiple times in nav)
  const unique = records.reduce((acc, record) => {
    if (!acc.find(r => r.facilityName === record.facilityName)) {
      acc.push(record);
    }
    return acc;
  }, []);

  console.log(`[NEXTDC Parser] Found ${unique.length} facilities`);
  return unique;
}
