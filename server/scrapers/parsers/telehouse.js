/**
 * Telehouse Parser
 * 
 * Two-stage parser for Telehouse data centres (KDDI subsidiary).
 * Stage 1: Extract city links from main page
 * Stage 2: Extract facility names from each city page
 * 
 * URL: https://www.telehouse.net/data-centres
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

async function fetchPage(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; 1GigLabs/1.0; +https://1giglabs.com)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 30000,
    maxRedirects: 5
  });
  return response.data;
}

export default async function parseTelehouse($, target) {
  const records = [];
  const cityLinks = [];

  console.log('[Telehouse Parser] Stage 1: Extracting city links...');

  // Stage 1: Extract city links from main page
  // City links follow pattern: "Go to [City] Data Centres"
  $('a[href*="/data-centre-services/"]').each((i, elem) => {
    const $link = $(elem);
    const text = $link.text().trim();
    const href = $link.attr('href');
    
    if (!href) return;
    
    // Match links like "Go to London Data Centres", "Go to Frankfurt Data Centres"
    const cityMatch = text.match(/Go to (.+?) Data Centres?/i);
    if (cityMatch) {
      const city = cityMatch[1].trim();
      const fullUrl = href.startsWith('http') 
        ? href 
        : `https://www.telehouse.net${href}`;
      
      cityLinks.push({ city, url: fullUrl });
    }
  });

  console.log(`[Telehouse Parser] Found ${cityLinks.length} city pages`);

  // Stage 2: Scrape each city page for facility names
  for (const { city, url } of cityLinks) {
    try {
      console.log(`[Telehouse Parser] Scraping ${city}...`);
      
      const html = await fetchPage(url);
      const $city = cheerio.load(html);
      
      // Extract facility names from h3 tags that contain "Telehouse"
      $city('h3').each((i, elem) => {
        const facilityName = $city(elem).text().trim();
        
        // Only include h3 tags that mention "Telehouse" (to filter out feature headers)
        if (facilityName.toLowerCase().includes('telehouse')) {
          // Determine country from city or URL
          let country = 'United Kingdom'; // Default
          
          if (url.includes('/uk/')) {
            country = 'United Kingdom';
          } else if (url.includes('/germany/') || url.includes('/frankfurt/')) {
            country = 'Germany';
          } else if (url.includes('/france/') || url.includes('/paris/') || url.includes('/marseille/')) {
            country = 'France';
          } else if (url.includes('/turkey/') || url.includes('/istanbul/')) {
            country = 'Turkey';
          } else if (url.includes('/china/') || city.match(/beijing|shanghai/i)) {
            country = 'China';
          } else if (url.includes('/hong-kong/') || city === 'Hong Kong') {
            country = 'Hong Kong';
          } else if (url.includes('/japan/') || city === 'Tokyo') {
            country = 'Japan';
          } else if (url.includes('/vietnam/') || city === 'Hanoi') {
            country = 'Vietnam';
          } else if (url.includes('/singapore/')) {
            country = 'Singapore';
          }
          
          // Determine region (continent)
          let region = 'Europe';
          if (['China', 'Hong Kong', 'Japan', 'Vietnam', 'Singapore'].includes(country)) {
            region = 'Asia';
          } else if (country === 'United Kingdom') {
            region = 'Europe';
          }
          
          records.push({
            facilityName: facilityName,
            region: city,
            country: country,
            mwDeployed: null,
            mwAvailable: null,
            costPerKwh: null,
            costPerRack: null,
            occupancyRate: null,
            confidence: 'medium' // We have name and location, no capacity
          });
        }
      });
      
      // Rate limiting: wait 1 second between city pages
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`[Telehouse Parser] Failed to scrape ${city}:`, error.message);
    }
  }

  console.log(`[Telehouse Parser] Found ${records.length} facilities across ${cityLinks.length} cities`);
  return records;
}
