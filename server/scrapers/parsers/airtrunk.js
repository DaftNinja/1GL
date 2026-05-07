/**
 * AirTrunk Parser
 * 
 * AirTrunk is Asia-Pacific's leading hyperscale data centre operator,
 * backed by Macquarie Infrastructure and Real Assets.
 * 
 * Since their website is JavaScript-rendered, this parser uses publicly
 * known facility locations from press releases and company announcements.
 * 
 * URL: https://www.airtrunk.com/data-centres
 */

export default async function parseAirTrunk($, target) {
  const records = [];

  // Known AirTrunk facilities from public sources
  // Data compiled from press releases, investor presentations, and industry reports
  const facilities = [
    // Australia
    { city: 'Sydney', state: 'NSW', country: 'Australia', region: 'Asia Pacific', facilityCode: 'SYD1', status: 'operational' },
    { city: 'Sydney', state: 'NSW', country: 'Australia', region: 'Asia Pacific', facilityCode: 'SYD2', status: 'operational' },
    { city: 'Sydney', state: 'NSW', country: 'Australia', region: 'Asia Pacific', facilityCode: 'SYD3', status: 'operational' },
    { city: 'Melbourne', state: 'VIC', country: 'Australia', region: 'Asia Pacific', facilityCode: 'MEL1', status: 'operational' },
    { city: 'Melbourne', state: 'VIC', country: 'Australia', region: 'Asia Pacific', facilityCode: 'MEL2', status: 'operational' },
    { city: 'Perth', state: 'WA', country: 'Australia', region: 'Asia Pacific', facilityCode: 'PER1', status: 'operational' },
    
    // Asia
    { city: 'Singapore', country: 'Singapore', region: 'Asia Pacific', facilityCode: 'SGP1', status: 'operational' },
    { city: 'Tokyo', country: 'Japan', region: 'Asia Pacific', facilityCode: 'TOK1', status: 'operational' },
    { city: 'Tokyo', country: 'Japan', region: 'Asia Pacific', facilityCode: 'TOK2', status: 'operational' },
    { city: 'Hong Kong', country: 'Hong Kong', region: 'Asia Pacific', facilityCode: 'HKG1', status: 'operational' },
    { city: 'Johor', country: 'Malaysia', region: 'Asia Pacific', facilityCode: 'JHR1', status: 'operational', notes: 'Johor, Malaysia campus' },
  ];

  facilities.forEach(facility => {
    const facilityName = facility.state
      ? `${facility.facilityCode} ${facility.city}`
      : `${facility.facilityCode} ${facility.city}`;

    records.push({
      facilityName: facilityName,
      region: facility.city,
      country: facility.country,
      mwDeployed: null,
      mwAvailable: null,
      costPerKwh: null,
      costPerRack: null,
      occupancyRate: null,
      confidence: 'medium', // Based on public sources, not scraped from website
      notes: facility.notes || 'Hyperscale facility'
    });
  });

  console.log(`[AirTrunk Parser] Loaded ${records.length} known facilities`);
  return records;
}
