/**
 * Static HTML Scraper
 * 
 * Uses Cheerio to scrape static HTML pages.
 * For JavaScript-rendered sites, use js-scraper.js instead.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base-scraper.js';

export class StaticScraper extends BaseScraper {
  constructor(target, parser) {
    super(target);
    this.parser = parser; // Operator-specific parser function
  }

  /**
   * Fetch and return HTML content
   */
  async scrape() {
    const url = this.target.pricingUrl || this.target.website;
    
    console.log(`[${this.target.operatorName}] Fetching: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 1GigLabs/1.0; +https://1giglabs.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000, // 30 second timeout
      maxRedirects: 5
    });

    return response.data;
  }

  /**
   * Parse HTML using operator-specific parser
   */
  async parse(html) {
    const $ = cheerio.load(html);
    
    // Call the operator-specific parser
    const records = await this.parser($, this.target);
    
    return records;
  }
}
