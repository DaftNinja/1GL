/**
 * Base Scraper Class
 * 
 * Abstract base class for all data centre pricing scrapers.
 * Handles logging, error tracking, and database operations.
 */

import { db } from '../db.js';
import { dcScrapingLogs, dcScrapingTargets, dcPricingSnapshots } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface ScrapingTarget {
  id: number;
  operatorName: string;
  website: string;
  pricingUrl: string | null;
  frequency: string | null;
  parserType: string | null;
  lastScraped: Date | null;
  nextScheduled: Date | null;
  isActive: boolean | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface PricingRecord {
  facilityName?: string | null;
  region?: string | null;
  country?: string | null;
  costPerKwh?: number | null;
  costPerRack?: number | null;
  mwDeployed?: number | null;
  mwAvailable?: number | null;
  occupancyRate?: number | null;
  confidence?: string;
}

export abstract class BaseScraper {
  protected target: ScrapingTarget;
  protected logId: number | null = null;
  protected startTime: number;
  protected recordsFound: number = 0;
  protected recordsInserted: number = 0;

  constructor(target: ScrapingTarget) {
    this.target = target;
    this.startTime = Date.now();
  }

  /**
   * Main execution method - must be implemented by subclasses
   */
  abstract scrape(): Promise<any>;

  /**
   * Parse scraped content - must be implemented by subclasses
   */
  abstract parse(content: any): Promise<PricingRecord[]>;

  /**
   * Execute the full scraping workflow with logging
   */
  async execute() {
    console.log(`[${this.target.operatorName}] Starting scrape...`);
    
    try {
      // Create log entry
      await this.logStart();

      // Run the scrape
      const content = await this.scrape();
      
      // Parse the content
      const records = await this.parse(content);
      this.recordsFound = records.length;

      // Insert records
      if (records.length > 0) {
        await this.insertRecords(records);
      }

      // Log success
      await this.logSuccess();
      
      // Update target last_scraped timestamp
      await this.updateTargetTimestamp();

      console.log(`[${this.target.operatorName}] ✓ Complete: ${this.recordsInserted}/${this.recordsFound} records inserted`);
      
      return {
        success: true,
        recordsFound: this.recordsFound,
        recordsInserted: this.recordsInserted
      };

    } catch (error: any) {
      console.error(`[${this.target.operatorName}] ✗ Failed:`, error.message);
      await this.logFailure(error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create initial log entry
   */
  protected async logStart() {
    const [log] = await db.insert(dcScrapingLogs)
      .values({
        targetId: this.target.id,
        scrapeStartedAt: new Date(),
        status: 'running'
      })
      .returning();
    
    this.logId = log.id;
  }

  /**
   * Update log on success
   */
  protected async logSuccess() {
    const responseTime = Date.now() - this.startTime;
    
    await db.update(dcScrapingLogs)
      .set({
        scrapeCompletedAt: new Date(),
        status: this.recordsInserted > 0 ? 'success' : 'partial',
        recordsFound: this.recordsFound,
        recordsInserted: this.recordsInserted,
        responseTimeMs: responseTime
      })
      .where(eq(dcScrapingLogs.id, this.logId!));
  }

  /**
   * Update log on failure
   */
  protected async logFailure(error: any) {
    const responseTime = Date.now() - this.startTime;
    
    await db.update(dcScrapingLogs)
      .set({
        scrapeCompletedAt: new Date(),
        status: 'failed',
        recordsFound: this.recordsFound,
        recordsInserted: this.recordsInserted,
        errorMessage: error.message,
        httpStatus: error.response?.status || null,
        responseTimeMs: responseTime
      })
      .where(eq(dcScrapingLogs.id, this.logId!));
  }

  /**
   * Insert parsed records into dc_pricing_snapshots
   */
  protected async insertRecords(records: PricingRecord[]) {
    const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    for (const record of records) {
      try {
        await db.insert(dcPricingSnapshots)
          .values({
            operatorName: this.target.operatorName,
            targetId: this.target.id,
            facilityName: record.facilityName || null,
            region: record.region || null,
            country: record.country || null,
            costPerKwh: record.costPerKwh?.toString() || null,
            costPerRack: record.costPerRack || null,
            mwDeployed: record.mwDeployed?.toString() || null,
            mwAvailable: record.mwAvailable?.toString() || null,
            occupancyRate: record.occupancyRate?.toString() || null,
            dataSource: this.target.pricingUrl || this.target.website,
            confidence: record.confidence || 'medium',
            snapshotDate: snapshotDate
          });
        
        this.recordsInserted++;
      } catch (error: any) {
        console.error(`[${this.target.operatorName}] Failed to insert record:`, error.message);
      }
    }
  }

  /**
   * Update target's last_scraped timestamp
   */
  protected async updateTargetTimestamp() {
    await db.update(dcScrapingTargets)
      .set({
        lastScraped: new Date(),
        updatedAt: new Date()
      })
      .where(eq(dcScrapingTargets.id, this.target.id));
  }

  /**
   * Utility: Clean and normalize text
   */
  protected cleanText(text: string | null | undefined): string | null {
    if (!text) return null;
    return text.trim().replace(/\s+/g, ' ').replace(/\n+/g, ' ');
  }

  /**
   * Utility: Extract numbers from text
   */
  protected extractNumber(text: string | null | undefined): number | null {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * Utility: Parse MW capacity from various formats
   */
  protected parseMW(text: string | null | undefined): number | null {
    if (!text) return null;
    
    // Handle "50 MW", "50MW", "50 megawatts"
    const cleaned = text.toLowerCase().replace(/,/g, '');
    const match = cleaned.match(/([\d.]+)\s*(mw|megawatt)/);
    
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Utility: Parse currency amounts
   */
  protected parseCurrency(text: string | null | undefined): number | null {
    if (!text) return null;
    
    // Handle "$1,234.56", "£1234.56", "€1.234,56"
    const cleaned = text.replace(/[$£€,]/g, '');
    return parseFloat(cleaned) || null;
  }
}
