import { db } from "../../db";
import { dcScrapingTargets, dcScrapingJobs, dcPricingSnapshots } from "../../../shared/schema";
import { eq, and, lt } from "drizzle-orm";
import { fetchPage } from "./scraperService";
import { parseHtml } from "./parser";
import { SCRAPING_TARGETS } from "./targets";

interface JobContext {
  jobId: string;
  startedAt: Date;
  targetsTotal: number;
  targetsSuccess: number;
  targetsFailed: number;
  recordsSaved: number;
  errors: string[];
}

async function runScrapingJob(context: "scheduler" | "manual"): Promise<void> {
  const jobId = crypto.randomUUID?.() || Date.now().toString();
  const now = new Date();

  console.log(`[DC Scraping] Starting ${context} job ${jobId}`);

  const job: JobContext = {
    jobId,
    startedAt: now,
    targetsTotal: 0,
    targetsSuccess: 0,
    targetsFailed: 0,
    recordsSaved: 0,
    errors: [],
  };

  // Create job record
  try {
    await db.insert(dcScrapingJobs).values({
      id: jobId as any,
      jobType: context === "scheduler" ? "monthly" : "manual",
      triggeredBy: context,
      status: "running",
    });
  } catch (err) {
    console.error("[DC Scraping] Failed to create job record:", err);
    return;
  }

  // Get active targets
  const targets = await db.select().from(dcScrapingTargets).where(eq(dcScrapingTargets.isActive, true));
  job.targetsTotal = targets.length;

  // Scrape each target
  for (const target of targets) {
    try {
      const html = await fetchPage(target.scrapingUrl, {
        render: target.parserType === "js",
        country: target.country,
      });

      const hints = target.extractionHints as { keywords?: string[]; selectors?: string[] } | undefined;
      const parsed = await parseHtml(html, {
        keywords: hints?.keywords,
        selectors: hints?.selectors,
      });

      // Save snapshot
      const snapshot = {
        id: crypto.randomUUID?.() || Date.now().toString(),
        targetId: target.id,
        operatorName: target.operatorName,
        region: target.region,
        country: target.country,
        capacityMw: parsed.capacityMw ? parseFloat(parsed.capacityMw.toString()) : undefined,
        occupancyPercent: parsed.occupancyPercent ? parseFloat(parsed.occupancyPercent.toString()) : undefined,
        pueRating: parsed.pueRating ? parseFloat(parsed.pueRating.toString()) : undefined,
        pricePerKwh: parsed.pricePerKwh ? parseFloat(parsed.pricePerKwh.toString()) : undefined,
        pricePerRackMonth: parsed.pricePerRackMonth ? parseFloat(parsed.pricePerRackMonth.toString()) : undefined,
        rawExtractedText: parsed.rawText,
        dataSource: target.website,
        collectionMethod: "scrape" as const,
        confidence: "medium" as const,
      };

      await db.insert(dcPricingSnapshots).values(snapshot as any);
      job.recordsSaved++;
      job.targetsSuccess++;

      // Update next scheduled time
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await db.update(dcScrapingTargets).set({ lastScrapedAt: now, nextScheduledAt: nextMonth }).where(eq(dcScrapingTargets.id, target.id));

      console.log(`[DC Scraping] ${target.operatorName}: OK`);
    } catch (err) {
      job.targetsFailed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      job.errors.push(`${target.operatorName}: ${errMsg}`);
      console.error(`[DC Scraping] ${target.operatorName} failed:`, err);
    }
  }

  // Update job record with final status
  const jobStatus = job.targetsFailed === 0 ? "success" : job.targetsSuccess > 0 ? "partial" : "failed";
  try {
    await db
      .update(dcScrapingJobs)
      .set({
        status: jobStatus,
        completedAt: new Date(),
        targetsTotal: job.targetsTotal,
        targetsSuccess: job.targetsSuccess,
        targetsFailed: job.targetsFailed,
        recordsSaved: job.recordsSaved,
        errorSummary: job.errors.length > 0 ? job.errors.join("; ") : undefined,
      })
      .where(eq(dcScrapingJobs.id, jobId as any));
  } catch (err) {
    console.error("[DC Scraping] Failed to update job record:", err);
  }

  console.log(
    `[DC Scraping] Job ${jobId} completed: ${job.targetsSuccess}/${job.targetsTotal} success, ${job.recordsSaved} records saved`
  );
}

export function startScrapingScheduler(): void {
  console.log("[DC Scraping] Scheduler starting...");

  // Initialize targets first
  initializeTargets()
    .then(() => console.log("[DC Scraping] Scheduler initialization complete, ready for scraping"))
    .catch((err) => console.error("[DC Scraping] Failed to initialize targets:", err));

  // Check every hour if any targets are due
  setInterval(async () => {
    try {
      const now = new Date();
      const dueSoon = new Date(now.getTime() + 5 * 60 * 1000); // 5 min window

      const dueTargets = await db
        .select()
        .from(dcScrapingTargets)
        .where(and(eq(dcScrapingTargets.isActive, true), lt(dcScrapingTargets.nextScheduledAt, dueSoon)));

      if (dueTargets.length > 0) {
        console.log(`[DC Scraping] ${dueTargets.length} targets due, starting job`);
        await runScrapingJob("scheduler");
      }
    } catch (err) {
      console.error("[DC Scraping] Scheduler check failed:", err);
    }
  }, 60 * 60 * 1000); // Every hour

  console.log("[DC Scraping] ✓ Scheduler started (hourly checks enabled)");
}

async function initializeTargets(): Promise<void> {
  const existing = await db.select().from(dcScrapingTargets);
  if (existing.length > 0) return; // Already initialized

  console.log("[DC Scraping] Initializing 20 scraping targets");

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  for (const target of SCRAPING_TARGETS) {
    try {
      await db.insert(dcScrapingTargets).values({
        id: crypto.randomUUID?.() || undefined,
        operatorName: target.operatorName,
        website: target.website,
        scrapingUrl: target.scrapingUrl,
        region: target.region,
        country: target.country,
        dataType: target.dataType,
        extractionHints: target.extractionHints,
        parserType: target.parserType,
        frequency: target.frequency,
        isActive: true,
        nextScheduledAt: nextMonth,
      });
    } catch (err) {
      console.warn(`[DC Scraping] Failed to insert target ${target.operatorName}:`, err);
    }
  }

  console.log("[DC Scraping] Targets initialized");
}

export async function triggerManualScrape(): Promise<string> {
  await runScrapingJob("manual");
  const jobs = await db.select().from(dcScrapingJobs).orderBy((t) => t.startedAt);
  return jobs[jobs.length - 1]?.id || "unknown";
}
