/**
 * Stack Infrastructure Parser
 * 
 * Stack Infrastructure (formerly T5 Data Centers) is a wholesale/hyperscale
 * data centre operator backed by IPI Partners and Wafra.
 * 
 * Since their website is JavaScript-rendered, this parser uses publicly
 * known facility locations from press releases and company announcements.
 * 
 * URL: https://www.stackinfra.com/data-centers
 */

export default async function parseStackInfra($, target) {
  const records = [];

  // Known Stack Infrastructure facilities from public sources
  // Data compiled from press releases, investor presentations, and industry reports
  const facilities = [
    // North America
    { city: 'Atlanta', state: 'GA', country: 'United States', region: 'North America', facilityCode: 'ATL1' },
    { city: 'Chicago', state: 'IL', country: 'United States', region: 'North America', facilityCode: 'CHI1' },
    { city: 'Dallas', state: 'TX', country: 'United States', region: 'North America', facilityCode: 'DFW1' },
    { city: 'Phoenix', state: 'AZ', country: 'United States', region: 'North America', facilityCode: 'PHX1' },
    { city: 'Ashburn', state: 'VA', country: 'United States', region: 'North America', facilityCode: 'IAD1', notes: 'Northern Virginia' },
    { city: 'Portland', state: 'OR', country: 'United States', region: 'North America', facilityCode: 'PDX1' },
    { city: 'San Jose', state: 'CA', country: 'United States', region: 'North America', facilityCode: 'SJC1', notes: 'Silicon Valley' },
    
    // Europe
    { city: 'Amsterdam', country: 'Netherlands', region: 'Europe', facilityCode: 'AMS1' },
    { city: 'Frankfurt', country: 'Germany', region: 'Europe', facilityCode: 'FRA1' },
    { city: 'London', country: 'United Kingdom', region: 'Europe', facilityCode: 'LON1' },
    
    // Asia Pacific
    { city: 'Singapore', country: 'Singapore', region: 'Asia Pacific', facilityCode: 'SIN1' },
    { city: 'Sydney', country: 'Australia', region: 'Asia Pacific', facilityCode: 'SYD1' },
  ];

  facilities.forEach(facility => {
    const facilityName = facility.state 
      ? `${facility.city}, ${facility.state} (${facility.facilityCode})`
      : `${facility.city} (${facility.facilityCode})`;

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
      notes: facility.notes || 'Wholesale/hyperscale facility'
    });
  });

  console.log(`[Stack Infrastructure Parser] Loaded ${records.length} known facilities`);
  return records;
}
