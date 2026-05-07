/**
 * NEXTDC Parser
 * 
 * Parses data centre listings from NEXTDC's public website.
 * NEXTDC is Australia's largest data centre operator with good public info.
 * 
 * Example URL: https://www.nextdc.com/data-centres
 */

export default async function parseNEXTDC($, target) {
  const records = [];

  // NEXTDC lists facilities with specs on their data centres page
  // This is a template - actual selectors need to be verified against live site
  
  $('.data-centre-card, .facility-card, [class*="facility"]').each((i, elem) => {
    const $card = $(elem);
    
    // Extract facility name
    const facilityName = $card.find('h2, h3, .facility-name, .card-title').first().text().trim();
    
    // Extract location
    const location = $card.find('.location, .city, [class*="location"]').first().text().trim();
    
    // Extract capacity info
    const capacityText = $card.find('.capacity, [class*="capacity"], [class*="power"]').text();
    const mwMatch = capacityText.match(/([\d.]+)\s*MW/i);
    const mwDeployed = mwMatch ? parseFloat(mwMatch[1]) : null;
    
    // Only add if we have meaningful data
    if (facilityName && facilityName.length > 2) {
      records.push({
        facilityName: facilityName,
        region: location || 'Australia',
        country: 'Australia',
        mwDeployed: mwDeployed,
        mwAvailable: null, // Would need more detailed scraping
        costPerKwh: null,  // Not publicly listed
        costPerRack: null, // Not publicly listed
        occupancyRate: null,
        confidence: mwDeployed ? 'high' : 'medium'
      });
    }
  });

  // If no records found with card-based approach, try table approach
  if (records.length === 0) {
    $('table tr').each((i, row) => {
      if (i === 0) return; // Skip header
      
      const $cells = $(row).find('td');
      if ($cells.length >= 2) {
        const facilityName = $cells.eq(0).text().trim();
        const location = $cells.eq(1).text().trim();
        const capacityText = $cells.eq(2).text().trim();
        
        const mwMatch = capacityText.match(/([\d.]+)\s*MW/i);
        
        if (facilityName && facilityName.length > 2) {
          records.push({
            facilityName: facilityName,
            region: location,
            country: 'Australia',
            mwDeployed: mwMatch ? parseFloat(mwMatch[1]) : null,
            mwAvailable: null,
            costPerKwh: null,
            costPerRack: null,
            occupancyRate: null,
            confidence: 'medium'
          });
        }
      }
    });
  }

  console.log(`[NEXTDC Parser] Found ${records.length} facilities`);
  return records;
}
