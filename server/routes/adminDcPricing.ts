import { Router, Request, Response } from "express";
import { db } from "../db";
import { dcScrapingJobs, dcPricingSnapshots, dcPricingDiscrepancies, insertDcPricingSnapshotSchema, insertDcPricingDiscrepancySchema } from "../../shared/schema";
import { eq, and, desc, like } from "drizzle-orm";
import { triggerManualScrape } from "../dataCentreSites/scraping/scheduler";

const router = Router();

// Middleware to check if user is admin
function requireAdmin(req: Request, res: Response, next: () => void) {
  const userEmail = (req.session as any)?.userEmail;
  // Allow both personal and 1GL email addresses
  if (userEmail !== "andrew.mccreath@1giglabs.com" && userEmail !== "andrew.mccreath@gmail.com") {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/dc-pricing/status
router.get("/api/admin/dc-pricing/status", async (req: Request, res: Response) => {
  try {
    const jobs = await db.select().from(dcScrapingJobs).orderBy(desc(dcScrapingJobs.createdAt)).limit(10);

    const recentSnapshots = await db.select().from(dcPricingSnapshots).orderBy(desc(dcPricingSnapshots.createdAt)).limit(5);

    res.json({
      recentJobs: jobs,
      recentSnapshots,
      jobStatistics: {
        totalJobs: jobs.length,
        successCount: jobs.filter((j) => j.status === "success").length,
        partialCount: jobs.filter((j) => j.status === "partial").length,
        failedCount: jobs.filter((j) => j.status === "failed").length,
      },
    });
  } catch (err) {
    console.error("[Admin DC Pricing] Status error:", err);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// POST /api/admin/dc-pricing/run
router.post("/api/admin/dc-pricing/run", async (req: Request, res: Response) => {
  try {
    const jobId = await triggerManualScrape();
    res.json({ jobId, message: "Scraping job triggered" });
  } catch (err) {
    console.error("[Admin DC Pricing] Run error:", err);
    res.status(500).json({ error: "Failed to trigger scraping job" });
  }
});

// GET /api/admin/dc-pricing/snapshots
router.get("/api/admin/dc-pricing/snapshots", async (req: Request, res: Response) => {
  try {
    const { operator, country, confidence } = req.query;
    let query = db.select().from(dcPricingSnapshots);

    if (operator) {
      query = query.where(like(dcPricingSnapshots.operatorName, `%${operator}%`));
    }
    if (country) {
      query = query.where(eq(dcPricingSnapshots.country, String(country)));
    }
    if (confidence) {
      query = query.where(eq(dcPricingSnapshots.confidence, String(confidence)));
    }

    const snapshots = await query.orderBy(desc(dcPricingSnapshots.createdAt)).limit(50);
    res.json({ snapshots });
  } catch (err) {
    console.error("[Admin DC Pricing] Snapshots error:", err);
    res.status(500).json({ error: "Failed to fetch snapshots" });
  }
});

// POST /api/admin/dc-pricing/manual
router.post("/api/admin/dc-pricing/manual", async (req: Request, res: Response) => {
  try {
    const { operatorName, region, country, pricePerKwh, source, confidence, notes } = req.body;

    if (!operatorName || !country || typeof pricePerKwh !== "number") {
      return res.status(400).json({ error: "Missing or invalid required fields" });
    }

    const snapshot = {
      id: crypto.randomUUID?.() || undefined,
      operatorName,
      region,
      country,
      pricePerKwh: String(pricePerKwh),
      dataSource: source,
      collectionMethod: "manual" as const,
      confidence: confidence || "medium",
      notes,
    };

    await db.insert(dcPricingSnapshots).values(snapshot as any);
    res.json({ success: true, message: "Manual entry saved" });
  } catch (err) {
    console.error("[Admin DC Pricing] Manual entry error:", err);
    res.status(500).json({ error: "Failed to save manual entry" });
  }
});

// GET /api/admin/dc-pricing/queue
router.get("/api/admin/dc-pricing/queue", async (req: Request, res: Response) => {
  try {
    const discrepancies = await db
      .select()
      .from(dcPricingDiscrepancies)
      .where(eq(dcPricingDiscrepancies.status, "open"))
      .orderBy(desc(dcPricingDiscrepancies.createdAt));

    res.json({ discrepancies });
  } catch (err) {
    console.error("[Admin DC Pricing] Queue error:", err);
    res.status(500).json({ error: "Failed to fetch discrepancies" });
  }
});

// PATCH /api/admin/dc-pricing/queue/:id
router.patch("/api/admin/dc-pricing/queue/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolutionNote } = req.body;

    if (!["open", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updateData: any = {
      status,
      resolvedBy: (req.session as any)?.userEmail,
      resolvedAt: new Date(),
    };
    if (resolutionNote) {
      updateData.resolutionNote = resolutionNote;
    }

    await db
      .update(dcPricingDiscrepancies)
      .set(updateData)
      .where(eq(dcPricingDiscrepancies.id, id as any));

    res.json({ success: true, message: "Discrepancy resolved" });
  } catch (err) {
    console.error("[Admin DC Pricing] Update error:", err);
    res.status(500).json({ error: "Failed to update discrepancy" });
  }
});

export default router;
