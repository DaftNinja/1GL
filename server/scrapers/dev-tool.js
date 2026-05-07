#!/usr/bin/env node
/**
 * Scraper Development Tool
 * 
 * Interactive tool for inspecting web pages and testing CSS selectors
 * to develop custom parsers for data centre operators.
 * 
 * Usage:
 *   npx tsx server/scrapers/dev-tool.js <url>
 *   npx tsx server/scrapers/dev-tool.js --target-id=1
 *   npx tsx server/scrapers/dev-tool.js --operator=Equinix
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../db.js';
import { dcScrapingTargets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import * as readline from 'readline';

class ScraperDevTool {
  constructor() {
    this.$ = null;
    this.html = null;
    this.url = null;
  }

  /**
   * Fetch and load a URL
   */
  async fetchUrl(url) {
    console.log(`\n📡 Fetching: ${url}\n`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; 1GigLabs/1.0; +https://1giglabs.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 30000,
        maxRedirects: 5
      });

      this.html = response.data;
      this.$ = cheerio.load(this.html);
      this.url = url;

      console.log(`✓ Fetched ${(this.html.length / 1024).toFixed(1)} KB`);
      console.log(`✓ Status: ${response.status}`);
      console.log(`✓ Content-Type: ${response.headers['content-type']}\n`);

      return true;
    } catch (error) {
      console.error(`✗ Failed to fetch: ${error.message}`);
      return false;
    }
  }

  /**
   * Show page statistics
   */
  showStats() {
    const $ = this.$;
    
    console.log('📊 Page Statistics:');
    console.log(`   Title: ${$('title').text().trim()}`);
    console.log(`   Links: ${$('a').length}`);
    console.log(`   Images: ${$('img').length}`);
    console.log(`   Tables: ${$('table').length}`);
    console.log(`   Divs: ${$('div').length}`);
    console.log(`   Headers (h1-h6): ${$('h1, h2, h3, h4, h5, h6').length}`);
    console.log(`   Forms: ${$('form').length}`);
    console.log('');
  }

  /**
   * Test a CSS selector
   */
  testSelector(selector) {
    const $ = this.$;
    
    try {
      const elements = $(selector);
      console.log(`\n🔍 Selector: ${selector}`);
      console.log(`   Found: ${elements.length} elements\n`);

      if (elements.length === 0) {
        console.log('   No matches found.\n');
        return;
      }

      // Show first 10 matches
      const limit = Math.min(elements.length, 10);
      elements.slice(0, limit).each((i, elem) => {
        const $elem = $(elem);
        const text = $elem.text().trim().substring(0, 100);
        const classes = $elem.attr('class') || '';
        const id = $elem.attr('id') || '';
        
        console.log(`   [${i}] ${elem.name}${id ? '#' + id : ''}${classes ? '.' + classes.split(' ').join('.') : ''}`);
        if (text) {
          console.log(`       Text: ${text}${text.length >= 100 ? '...' : ''}`);
        }
        
        // Show useful attributes
        const href = $elem.attr('href');
        const src = $elem.attr('src');
        if (href) console.log(`       href: ${href}`);
        if (src) console.log(`       src: ${src}`);
        
        console.log('');
      });

      if (elements.length > limit) {
        console.log(`   ... and ${elements.length - limit} more\n`);
      }
    } catch (error) {
      console.error(`   ✗ Invalid selector: ${error.message}\n`);
    }
  }

  /**
   * Extract common patterns
   */
  findCommonPatterns() {
    const $ = this.$;
    
    console.log('\n🔎 Common Patterns:\n');

    // Find facility/location cards
    const cardPatterns = [
      '.facility', '.data-center', '.datacenter', '.location', '.site',
      '[class*="facility"]', '[class*="datacenter"]', '[class*="location"]',
      '.card', '[class*="card"]'
    ];

    cardPatterns.forEach(pattern => {
      const count = $(pattern).length;
      if (count > 0 && count < 200) {
        console.log(`   ${pattern.padEnd(30)} → ${count} elements`);
      }
    });

    console.log('\n   Tables:');
    $('table').slice(0, 5).each((i, table) => {
      const rows = $(table).find('tr').length;
      const cols = $(table).find('tr').first().find('th, td').length;
      console.log(`   [${i}] ${rows} rows × ${cols} columns`);
    });

    console.log('\n   Headers with "data" or "facility":');
    $('h1, h2, h3, h4').each((i, elem) => {
      const text = $(elem).text().trim();
      if (/data|facility|center|location|site/i.test(text) && text.length < 100) {
        console.log(`   ${elem.name}: ${text}`);
      }
    });

    console.log('');
  }

  /**
   * Extract structured data (JSON-LD, meta tags)
   */
  findStructuredData() {
    const $ = this.$;
    
    console.log('\n📋 Structured Data:\n');

    // Look for JSON-LD
    $('script[type="application/ld+json"]').each((i, script) => {
      try {
        const data = JSON.parse($(script).html());
        console.log(`   JSON-LD [${i}]:`);
        console.log(`   Type: ${data['@type'] || 'unknown'}`);
        console.log(`   ${JSON.stringify(data, null, 2).split('\n').slice(0, 10).join('\n   ')}`);
        console.log('   ...\n');
      } catch (e) {
        // Invalid JSON
      }
    });

    // Look for data attributes
    const dataAttrs = new Set();
    $('[data-facility], [data-location], [data-capacity], [data-mw], [data-center]').each((i, elem) => {
      Object.keys(elem.attribs).forEach(attr => {
        if (attr.startsWith('data-')) {
          dataAttrs.add(attr);
        }
      });
    });

    if (dataAttrs.size > 0) {
      console.log('   Data attributes found:');
      Array.from(dataAttrs).forEach(attr => {
        const count = $(`[${attr}]`).length;
        console.log(`   ${attr.padEnd(30)} → ${count} elements`);
      });
      console.log('');
    }
  }

  /**
   * Save HTML to file for inspection
   */
  saveHtml(filename = 'scraper-debug.html') {
    const fs = require('fs');
    fs.writeFileSync(filename, this.html);
    console.log(`\n💾 Saved HTML to: ${filename}\n`);
  }

  /**
   * Interactive REPL
   */
  async startRepl() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'scraper> '
    });

    console.log('\n🔧 Interactive Mode');
    console.log('Commands:');
    console.log('  test <selector>   - Test a CSS selector');
    console.log('  stats             - Show page statistics');
    console.log('  patterns          - Find common patterns');
    console.log('  data              - Show structured data');
    console.log('  save [filename]   - Save HTML to file');
    console.log('  quit              - Exit\n');

    rl.prompt();

    rl.on('line', (line) => {
      const cmd = line.trim();

      if (cmd === 'quit' || cmd === 'exit') {
        rl.close();
        return;
      }

      if (cmd === 'stats') {
        this.showStats();
      } else if (cmd === 'patterns') {
        this.findCommonPatterns();
      } else if (cmd === 'data') {
        this.findStructuredData();
      } else if (cmd.startsWith('save')) {
        const filename = cmd.split(' ')[1] || 'scraper-debug.html';
        this.saveHtml(filename);
      } else if (cmd.startsWith('test ')) {
        const selector = cmd.substring(5).trim();
        this.testSelector(selector);
      } else if (cmd === '') {
        // Skip empty lines
      } else {
        console.log(`Unknown command: ${cmd}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log('\n👋 Goodbye!\n');
      process.exit(0);
    });
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const tool = new ScraperDevTool();

  let url = null;

  // Parse arguments
  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npx tsx server/scrapers/dev-tool.js <url>');
    console.error('  npx tsx server/scrapers/dev-tool.js --target-id=1');
    console.error('  npx tsx server/scrapers/dev-tool.js --operator=Equinix');
    process.exit(1);
  }

  if (args[0].startsWith('--target-id=')) {
    const targetId = parseInt(args[0].split('=')[1]);
    const [target] = await db.select()
      .from(dcScrapingTargets)
      .where(eq(dcScrapingTargets.id, targetId));
    
    if (!target) {
      console.error(`Target ID ${targetId} not found`);
      process.exit(1);
    }

    url = target.pricingUrl || target.website;
    console.log(`\n🎯 Target: ${target.operatorName}`);
  } else if (args[0].startsWith('--operator=')) {
    const operatorName = args[0].split('=')[1];
    const [target] = await db.select()
      .from(dcScrapingTargets)
      .where(eq(dcScrapingTargets.operatorName, operatorName));
    
    if (!target) {
      console.error(`Operator "${operatorName}" not found`);
      process.exit(1);
    }

    url = target.pricingUrl || target.website;
    console.log(`\n🎯 Target: ${target.operatorName}`);
  } else {
    url = args[0];
  }

  // Fetch the URL
  const success = await tool.fetchUrl(url);
  if (!success) {
    process.exit(1);
  }

  // Show initial analysis
  tool.showStats();
  tool.findCommonPatterns();
  tool.findStructuredData();

  // Start interactive mode
  await tool.startRepl();
}

main();
