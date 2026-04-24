import { analyses, tamAnalyses, powerTrendAnalyses, verifiedExecutives, auditLogs, reportComments, reportAssignments, reportActivity, oneGLDatacentres, siteSelectionReports, type Analysis, type InsertAnalysis, type TamAnalysis, type InsertTamAnalysis, type PowerTrendAnalysis, type InsertPowerTrendAnalysis, type VerifiedExecutive, type InsertVerifiedExecutive, type AuditLog, type InsertAuditLog, type ReportComment, type InsertReportComment, type ReportAssignment, type InsertReportAssignment, type ReportActivity, type InsertReportActivity, type OneGLDatacentre, type InsertOneGLDatacentre, type SiteSelectionReport, type InsertSiteSelectionReport } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  createAnalysis(analysis: InsertAnalysis): Promise<Analysis>;
  getAnalysis(id: number): Promise<Analysis | undefined>;
  getAnalysisByCompanyName(companyName: string): Promise<Analysis | undefined>;
  listAnalyses(): Promise<Analysis[]>;
  updateAnalysis(id: number, analysis: InsertAnalysis): Promise<Analysis>;
  deleteAnalysis(id: number): Promise<boolean>;
  createTamAnalysis(tam: InsertTamAnalysis): Promise<TamAnalysis>;
  getLatestTamAnalysis(): Promise<TamAnalysis | undefined>;
  getLatestTamAnalysisByCountry(country: string): Promise<TamAnalysis | undefined>;
  getTamAnalysis(id: number): Promise<TamAnalysis | undefined>;
  createPowerTrendAnalysis(analysis: InsertPowerTrendAnalysis): Promise<PowerTrendAnalysis>;
  getLatestPowerTrendAnalysis(): Promise<PowerTrendAnalysis | undefined>;
  getLatestPowerTrendAnalysisByCountry(country: string): Promise<PowerTrendAnalysis | undefined>;
  getPowerTrendAnalysis(id: number): Promise<PowerTrendAnalysis | undefined>;
  listVerifiedExecutives(): Promise<VerifiedExecutive[]>;
  getVerifiedExecutivesByCompany(companyName: string): Promise<VerifiedExecutive[]>;
  createVerifiedExecutive(exec: InsertVerifiedExecutive): Promise<VerifiedExecutive>;
  deleteVerifiedExecutive(id: number): Promise<boolean>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  listAuditLogs(limit?: number): Promise<AuditLog[]>;
  createReportComment(comment: InsertReportComment): Promise<ReportComment>;
  getReportComments(analysisId: number): Promise<ReportComment[]>;
  getReportCommentById(id: number): Promise<ReportComment | undefined>;
  deleteReportComment(id: number): Promise<boolean>;
  createReportAssignment(assignment: InsertReportAssignment): Promise<ReportAssignment>;
  getReportAssignments(analysisId: number): Promise<ReportAssignment[]>;
  getReportAssignmentById(id: number): Promise<ReportAssignment | undefined>;
  updateReportAssignment(id: number, status: string): Promise<ReportAssignment | undefined>;
  createReportActivity(activity: InsertReportActivity): Promise<ReportActivity>;
  getReportActivity(analysisId: number, limit?: number): Promise<ReportActivity[]>;
  listOneGLDatacentres(): Promise<OneGLDatacentre[]>;
  upsertOneGLDatacentres(records: InsertOneGLDatacentre[]): Promise<{ inserted: number; updated: number }>;
  createSiteSelectionReport(report: InsertSiteSelectionReport): Promise<SiteSelectionReport>;
  getSiteSelectionReport(id: number): Promise<SiteSelectionReport | undefined>;
  listSiteSelectionReports(userId?: string | null): Promise<SiteSelectionReport[]>;
}

export class DatabaseStorage implements IStorage {
  async createAnalysis(analysis: InsertAnalysis): Promise<Analysis> {
    const [created] = await db.insert(analyses).values(analysis).returning();
    return created;
  }

  async getAnalysis(id: number): Promise<Analysis | undefined> {
    const [analysis] = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, id));
    return analysis;
  }

  async getAnalysisByCompanyName(companyName: string): Promise<Analysis | undefined> {
    const normalizedName = companyName.trim().toLowerCase();
    const [analysis] = await db
      .select()
      .from(analyses)
      .where(sql`lower(trim(${analyses.companyName})) = ${normalizedName}`)
      .orderBy(desc(analyses.createdAt))
      .limit(1);
    return analysis;
  }

  async listAnalyses(): Promise<Analysis[]> {
    return db.select().from(analyses).orderBy(desc(analyses.createdAt));
  }

  async updateAnalysis(id: number, analysis: InsertAnalysis): Promise<Analysis> {
    const [updated] = await db
      .update(analyses)
      .set({ ...analysis, createdAt: new Date() })
      .where(eq(analyses.id, id))
      .returning();
    return updated;
  }

  async deleteAnalysis(id: number): Promise<boolean> {
    const result = await db.delete(analyses).where(eq(analyses.id, id)).returning();
    return result.length > 0;
  }

  async createTamAnalysis(tam: InsertTamAnalysis): Promise<TamAnalysis> {
    const [created] = await db.insert(tamAnalyses).values(tam).returning();
    return created;
  }

  async getLatestTamAnalysis(): Promise<TamAnalysis | undefined> {
    const [latest] = await db.select().from(tamAnalyses).orderBy(desc(tamAnalyses.createdAt)).limit(1);
    return latest;
  }

  async getLatestTamAnalysisByCountry(country: string): Promise<TamAnalysis | undefined> {
    const normalizedCountry = country.trim().toLowerCase();
    const [latest] = await db
      .select()
      .from(tamAnalyses)
      .where(sql`lower(trim(${tamAnalyses.country})) = ${normalizedCountry}`)
      .orderBy(desc(tamAnalyses.createdAt))
      .limit(1);
    return latest;
  }

  async getTamAnalysis(id: number): Promise<TamAnalysis | undefined> {
    const [tam] = await db.select().from(tamAnalyses).where(eq(tamAnalyses.id, id));
    return tam;
  }

  async createPowerTrendAnalysis(analysis: InsertPowerTrendAnalysis): Promise<PowerTrendAnalysis> {
    const [created] = await db.insert(powerTrendAnalyses).values(analysis).returning();
    return created;
  }

  async getLatestPowerTrendAnalysis(): Promise<PowerTrendAnalysis | undefined> {
    const [latest] = await db.select().from(powerTrendAnalyses).orderBy(desc(powerTrendAnalyses.createdAt)).limit(1);
    return latest;
  }

  async getLatestPowerTrendAnalysisByCountry(country: string): Promise<PowerTrendAnalysis | undefined> {
    const normalizedCountry = country.trim().toLowerCase();
    const [latest] = await db
      .select()
      .from(powerTrendAnalyses)
      .where(sql`lower(trim(${powerTrendAnalyses.country})) = ${normalizedCountry}`)
      .orderBy(desc(powerTrendAnalyses.createdAt))
      .limit(1);
    return latest;
  }

  async getPowerTrendAnalysis(id: number): Promise<PowerTrendAnalysis | undefined> {
    const [analysis] = await db.select().from(powerTrendAnalyses).where(eq(powerTrendAnalyses.id, id));
    return analysis;
  }

  async listVerifiedExecutives(): Promise<VerifiedExecutive[]> {
    return db.select().from(verifiedExecutives).orderBy(verifiedExecutives.companyName, verifiedExecutives.name);
  }

  async getVerifiedExecutivesByCompany(companyName: string): Promise<VerifiedExecutive[]> {
    const normalized = companyName.trim().toLowerCase();
    return db.select().from(verifiedExecutives)
      .where(sql`lower(trim(${verifiedExecutives.companyName})) = ${normalized}`)
      .orderBy(verifiedExecutives.name);
  }

  async createVerifiedExecutive(exec: InsertVerifiedExecutive): Promise<VerifiedExecutive> {
    const [created] = await db.insert(verifiedExecutives).values(exec).returning();
    return created;
  }

  async deleteVerifiedExecutive(id: number): Promise<boolean> {
    const result = await db.delete(verifiedExecutives).where(eq(verifiedExecutives.id, id)).returning();
    return result.length > 0;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async listAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async createReportComment(comment: InsertReportComment): Promise<ReportComment> {
    const [created] = await db.insert(reportComments).values(comment).returning();
    return created;
  }

  async getReportComments(analysisId: number): Promise<ReportComment[]> {
    return db.select().from(reportComments)
      .where(eq(reportComments.analysisId, analysisId))
      .orderBy(desc(reportComments.createdAt));
  }

  async getReportCommentById(id: number): Promise<ReportComment | undefined> {
    const [comment] = await db.select().from(reportComments).where(eq(reportComments.id, id));
    return comment;
  }

  async deleteReportComment(id: number): Promise<boolean> {
    const result = await db.delete(reportComments).where(eq(reportComments.id, id)).returning();
    return result.length > 0;
  }

  async createReportAssignment(assignment: InsertReportAssignment): Promise<ReportAssignment> {
    const [created] = await db.insert(reportAssignments).values(assignment).returning();
    return created;
  }

  async getReportAssignments(analysisId: number): Promise<ReportAssignment[]> {
    return db.select().from(reportAssignments)
      .where(eq(reportAssignments.analysisId, analysisId))
      .orderBy(desc(reportAssignments.createdAt));
  }

  async getReportAssignmentById(id: number): Promise<ReportAssignment | undefined> {
    const [assignment] = await db.select().from(reportAssignments).where(eq(reportAssignments.id, id));
    return assignment;
  }

  async updateReportAssignment(id: number, status: string): Promise<ReportAssignment | undefined> {
    const [updated] = await db.update(reportAssignments)
      .set({ status, updatedAt: new Date() })
      .where(eq(reportAssignments.id, id))
      .returning();
    return updated;
  }

  async createReportActivity(activity: InsertReportActivity): Promise<ReportActivity> {
    const [created] = await db.insert(reportActivity).values(activity).returning();
    return created;
  }

  async getReportActivity(analysisId: number, limit: number = 50): Promise<ReportActivity[]> {
    return db.select().from(reportActivity)
      .where(eq(reportActivity.analysisId, analysisId))
      .orderBy(desc(reportActivity.createdAt))
      .limit(limit);
  }

  async listOneGLDatacentres(): Promise<OneGLDatacentre[]> {
    return db.select().from(oneGLDatacentres).orderBy(oneGLDatacentres.name);
  }

  async upsertOneGLDatacentres(records: InsertOneGLDatacentre[]): Promise<{ inserted: number; updated: number }> {
    const dedupMap = new Map<string, InsertOneGLDatacentre>();
    for (const r of records) {
      dedupMap.set(r.oneGLId, r);
    }
    const uniqueRecords = Array.from(dedupMap.values());

    const existingBefore = await db.select({ oneGLId: oneGLDatacentres.oneGLId }).from(oneGLDatacentres);
    const existingIds = new Set(existingBefore.map(r => r.oneGLId));

    const now = new Date();
    const BATCH_SIZE = 50;
    for (let i = 0; i < uniqueRecords.length; i += BATCH_SIZE) {
      const batch = uniqueRecords.slice(i, i + BATCH_SIZE);
      await db.insert(oneGLDatacentres)
        .values(batch.map(r => ({ ...r, scrapedAt: now })))
        .onConflictDoUpdate({
          target: oneGLDatacentres.oneGLId,
          set: {
            name: sql`excluded.name`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            country: sql`excluded.country`,
            operator: sql`excluded.operator`,
            capacityMW: sql`excluded.capacity_mw`,
            tier: sql`excluded.tier`,
            websiteUrl: sql`excluded.website_url`,
            scrapedAt: sql`excluded.scraped_at`,
          },
        });
    }

    let inserted = 0;
    let updated = 0;
    for (const r of uniqueRecords) {
      if (existingIds.has(r.oneGLId)) {
        updated++;
      } else {
        inserted++;
      }
    }
    return { inserted, updated };
  }

  async createSiteSelectionReport(report: InsertSiteSelectionReport): Promise<SiteSelectionReport> {
    const [created] = await db.insert(siteSelectionReports).values(report).returning();
    return created;
  }

  async getSiteSelectionReport(id: number): Promise<SiteSelectionReport | undefined> {
    const [report] = await db.select().from(siteSelectionReports).where(eq(siteSelectionReports.id, id));
    return report;
  }

  async listSiteSelectionReports(userId?: string | null): Promise<SiteSelectionReport[]> {
    if (userId) {
      return db.select().from(siteSelectionReports)
        .where(eq(siteSelectionReports.userId, userId))
        .orderBy(desc(siteSelectionReports.createdAt));
    }
    return db.select().from(siteSelectionReports).orderBy(desc(siteSelectionReports.createdAt));
  }
}

export const storage = new DatabaseStorage();
