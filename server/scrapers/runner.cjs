require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});
/**
 * Scraper Runner
 * 
 * Orchestrates the execution of all active scraping targets.
 * Can be run manually, via cron, or triggered via API.
 * 
 * Usage:
 *   node server/scrapers/runner.js                    # Run all active targets
 *   node server/scrapers/runner.js --target-id=5      # Run specific target
 *   node server/scrapers/runner.js --operator=NEXTDC  # Run specific operator
 */

const { db } = require('../db');
const { dcScrapingTargets } = require('../db/schema');
const { eq, and } = require('drizzle-orm');
require('ts-node/register');
const StaticScraper = require('./static-scraper');

// Import parsers
const parseNEXTDC = require('./parsers/nextdc');
const parseGeneric = require('./parsers/generic');

// Parser registry - maps operator names to parser functions
const PARSERS = {
  'NEXTDC': parseNEXTDC,
  // Add more as we build them:
  // 'Equinix': parseEquinix,
  // 'Digital Realty': parseDigitalRealty,
};

class ScraperRunner {
  constructor() {
    this.results = [];
  }

  /**
   * Get parser for a target (falls back to generic)
   */
  getParser(target) {
    return PARSERS[target.operator_name] || parseGeneric;
  }

  /**
   * Run a single scraping target
   */
  async runTarget(target) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Target: ${target.operator_name} (ID: ${target.id})`);
    console.log(`URL: ${target.pricing_url || target.website}`);
    console.log(`${'='.repeat(60)}`);

    const parser = this.getParser(target);
    const scraper = new StaticScraper(target, parser);
    
    const result = await scraper.execute();
    this.results.push({
      targetId: target.id,
      operatorName: target.operator_name,
      ...result
    });

    return result;
  }

  /**
   * Run all active targets
   */
  async runAll() {
    console.log('🚀 Starting scraper run...\n');
    
    const targets = await db.select()
      .from(dcScrapingTargets)
      .where(eq(dcScrapingTargets.isActive, true));

    console.log(`Found ${targets.length} active targets\n`);

    for (const target of targets) {
      try {
        await this.runTarget(target);
        
        // Rate limiting: wait 2 seconds between targets to be polite
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to run target ${target.operator_name}:`, error);
      }
    }

    this.printSummary();
  }

  /**
   * Run a specific target by ID
   */
  async runById(targetId) {
    const [target] = await db.select()
      .from(dcScrapingTargets)
      .where(eq(dcScrapingTargets.id, targetId));

    if (!target) {
      throw new Error(`Target ID ${targetId} not found`);
    }

    return await this.runTarget(target);
  }

  /**
   * Run a specific target by operator name
   */
  async runByOperator(operatorName) {
    const [target] = await db.select()
      .from(dcScrapingTargets)
      .where(eq(dcScrapingTargets.operatorName, operatorName));

    if (!target) {
      throw new Error(`Operator "${operatorName}" not found`);
    }

    return await this.runTarget(target);
  }

  /**
   * Print summary of scraping run
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING RUN SUMMARY');
    console.log('='.repeat(60));
    
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const totalRecords = this.results.reduce((sum, r) => sum + (r.recordsInserted || 0), 0);

    console.log(`Total targets: ${this.results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Total records inserted: ${totalRecords}`);
    
    if (failed.length > 0) {
      console.log('\nFailed targets:');
      failed.forEach(r => {
        console.log(`  - ${r.operatorName}: ${r.error}`);
      });
    }

    console.log('\nSuccessful targets:');
    successful.forEach(r => {
      console.log(`  ✓ ${r.operatorName}: ${r.recordsInserted} records`);
    });

    console.log('\n' + '='.repeat(60));
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const runner = new ScraperRunner();

  try {
    if (args.length === 0) {
      // No args: run all active targets
      await runner.runAll();
    } else if (args[0].startsWith('--target-id=')) {
      // Run specific target by ID
      const targetId = parseInt(args[0].split('=')[1]);
      await runner.runById(targetId);
    } else if (args[0].startsWith('--operator=')) {
      // Run specific operator by name
      const operatorName = args[0].split('=')[1];
      await runner.runByOperator(operatorName);
    } else {
      console.error('Invalid arguments');
      console.log('Usage:');
      console.log('  node server/scrapers/runner.js');
      console.log('  node server/scrapers/runner.js --target-id=5');
      console.log('  node server/scrapers/runner.js --operator=NEXTDC');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for programmatic use
module.exports = { ScraperRunner };
