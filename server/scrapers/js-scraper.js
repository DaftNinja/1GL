/**
 * JavaScript Scraper (Puppeteer)
 * 
 * Uses Puppeteer (headless Chrome) to scrape JavaScript-rendered pages
 * and bypass basic bot detection.
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base-scraper.js';

export class JavaScriptScraper extends BaseScraper {
  constructor(target, parser) {
    super(target);
    this.parser = parser;
    this.browser = null;
  }

  /**
   * Fetch and return rendered HTML content using Puppeteer
   */
  async scrape() {
    const url = this.target.pricingUrl || this.target.website;
    
    console.log(`[${this.target.operatorName}] Launching browser...`);
    
    // Launch browser with stealth settings
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });

    try {
      const page = await this.browser.newPage();
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });

      console.log(`[${this.target.operatorName}] Navigating to: ${url}`);
      
      // Navigate with timeout
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for content to load (adjust selector based on site)
      try {
        await page.waitForSelector('body', { timeout: 10000 });
      } catch (e) {
        console.log(`[${this.target.operatorName}] Warning: body selector timeout (page may still have loaded)`);
      }

      // Optional: Wait additional time for JavaScript to execute
      await page.waitForTimeout(2000);

      // Get the rendered HTML
      const html = await page.content();
      
      console.log(`[${this.target.operatorName}] ✓ Rendered ${(html.length / 1024).toFixed(1)} KB`);

      await this.browser.close();
      this.browser = null;

      return html;

    } catch (error) {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      throw error;
    }
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

  /**
   * Clean up browser on error
   */
  async logFailure(error) {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    await super.logFailure(error);
  }
}
