import { pgTable, text, serial, jsonb, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const verifiedExecutives = pgTable("verified_executives", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  sourceUrl: text("source_url"),
  verifiedAt: timestamp("verified_at").defaultNow(),
});

// === JSON CONTENT SCHEMA ===
export const analysisContentSchema = z.object({
  companyName: z.string(),
  website: z.string().optional(),
  colorScheme: z.object({
    primary: z.string(),
    secondary: z.string(),
  }).optional(),
  executiveSummary: z.string(),
  overview: z.object({
    description: z.string(),
    founded: z.string(),
    headquarters: z.string(),
    employees: z.string(),
    locations: z.array(z.string()),
    naics: z.string().optional(),
    sic: z.string().optional(),
    significantShareholders: z.array(z.object({
      name: z.string(),
      percentage: z.string(),
      type: z.string(),
    })).optional(),
  }),
  financials: z.object({
    revenue: z.string(),
    revenueGrowth: z.string(),
    netIncome: z.string(),
    stockSymbol: z.string().optional(),
    recentPerformance: z.string(),
    chartData: z.array(z.object({ year: z.string(), revenue: z.number(), netIncome: z.number() })).optional(),
  }),
  strategy: z.object({
    vision: z.string(),
    initiatives: z.array(z.object({ title: z.string(), description: z.string() })),
    leadership: z.array(z.object({
      name: z.string(),
      role: z.string(),
      bio: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
      sourceUrl: z.string().optional(),
    })).optional(),
    leadershipConfirmed: z.boolean().optional(),
  }),
  market: z.object({
    competitors: z.array(z.object({ name: z.string(), description: z.string() })),
    challenges: z.array(z.string()),
    marketShare: z.string().optional(),
  }),
  technicalSpend: z.object({
    totalEstimatedBudget: z.string(),
    breakdown: z.array(z.object({ category: z.string(), percentage: z.number(), estimatedAmount: z.string() })),
    categories: z.object({
      network: z.string(),
      hardware: z.string(),
      software: z.string(),
      cloud: z.string(),
      dataCenter: z.string(),
      aiAndAutomation: z.string(),
      outsourcedServices: z.string(),
    }),
  }),
  // New business insight sections
  esg: z.object({
    sustainabilityScore: z.string(),
    carbonFootprint: z.string(),
    renewableEnergy: z.string(),
    initiatives: z.array(z.object({ title: z.string(), description: z.string(), impact: z.string() })),
    certifications: z.array(z.string()),
    goals: z.array(z.object({ target: z.string(), timeline: z.string(), progress: z.string() })),
  }).optional(),
  swot: z.object({
    strengths: z.array(z.object({ point: z.string(), detail: z.string() })),
    weaknesses: z.array(z.object({ point: z.string(), detail: z.string() })),
    opportunities: z.array(z.object({ point: z.string(), detail: z.string() })),
    threats: z.array(z.object({ point: z.string(), detail: z.string() })),
  }).optional(),
  growthOpportunities: z.object({
    marketExpansion: z.array(z.object({ region: z.string(), potential: z.string(), rationale: z.string() })),
    productDevelopment: z.array(z.object({ area: z.string(), description: z.string(), timeline: z.string() })),
    partnerships: z.array(z.object({ type: z.string(), targets: z.string(), benefit: z.string() })),
    overallOutlook: z.string(),
  }).optional(),
  riskAssessment: z.object({
    operationalRisks: z.array(z.object({ risk: z.string(), likelihood: z.string(), impact: z.string(), mitigation: z.string() })),
    financialRisks: z.array(z.object({ risk: z.string(), likelihood: z.string(), impact: z.string(), mitigation: z.string() })),
    regulatoryRisks: z.array(z.object({ risk: z.string(), likelihood: z.string(), impact: z.string(), mitigation: z.string() })),
    overallRiskProfile: z.string(),
  }).optional(),
  digitalTransformation: z.object({
    maturityLevel: z.string(),
    currentInitiatives: z.array(z.object({ initiative: z.string(), status: z.string(), impact: z.string() })),
    technologyStack: z.array(z.string()),
    futureRoadmap: z.array(z.object({ phase: z.string(), focus: z.string(), timeline: z.string() })),
    readinessScore: z.string(),
  }).optional(),
  salesEnablement: z.object({
    executiveSummaryForSales: z.string(),
    conversationStarters: z.array(z.object({ topic: z.string(), question: z.string(), context: z.string() })),
    painPoints: z.array(z.object({ pain: z.string(), stellanorSolution: z.string(), talkingPoints: z.array(z.string()) })),
    useCases: z.array(z.object({ 
      scenario: z.string(), 
      stellanorService: z.string(), 
      benefits: z.array(z.string()),
      roiMetrics: z.string()
    })),
    tvoAnalysis: z.object({
      currentChallenges: z.array(z.string()),
      potentialSavings: z.array(z.object({ area: z.string(), estimatedSaving: z.string(), rationale: z.string() })),
      totalValueOpportunity: z.string(),
      paybackPeriod: z.string(),
    }),
    competitivePositioning: z.array(z.object({ 
      competitor: z.string(), 
      stellanorAdvantage: z.string(), 
      differentiator: z.string() 
    })),
    nextSteps: z.array(z.object({ action: z.string(), priority: z.string(), owner: z.string() })),
  }).optional(),
});

// === BASE SCHEMAS ===
export const insertAnalysisSchema = createInsertSchema(analyses).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type AnalysisContent = z.infer<typeof analysisContentSchema>;

export type CreateAnalysisRequest = { companyName: string };
export type AnalysisResponse = Analysis & { parsedContent: AnalysisContent };

// === TAM (Total Addressable Market) ===
export const tamAnalyses = pgTable("tam_analyses", {
  id: serial("id").primaryKey(),
  country: text("country").notNull().default("United Kingdom"),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const GIGLABS_COUNTRIES = [
  "United Kingdom",
  "United States",
  "France",
  "Netherlands",
  "Sweden",
] as const;

export const STELLANOR_COUNTRIES = GIGLABS_COUNTRIES;

export type GigLabsCountry = typeof GIGLABS_COUNTRIES[number];
export type StellanorCountry = GigLabsCountry;

export const tamLocationSchema = z.object({
  location: z.string(),
  region: z.string(),
  totalTAM: z.number(),
  services: z.array(z.object({
    service: z.string(),
    tam: z.number(),
    targetCustomers: z.number(),
    averageDealSize: z.number(),
    growthRate: z.string(),
    keyDrivers: z.array(z.string()),
  })),
  topIndustries: z.array(z.object({
    industry: z.string(),
    percentage: z.number(),
  })),
  competitiveIntensity: z.string(),
});

export const tamContentSchema = z.object({
  generatedAt: z.string(),
  totalTAM: z.number(),
  totalSAM: z.number(),
  totalSOM: z.number(),
  currency: z.string(),
  methodology: z.string(),
  stellanorServices: z.array(z.object({
    service: z.string(),
    description: z.string(),
    totalTAM: z.number(),
    growthRate: z.string(),
  })),
  locations: z.array(tamLocationSchema),
  marketTrends: z.array(z.object({
    trend: z.string(),
    impact: z.string(),
    relevance: z.string(),
  })),
  summary: z.string(),
  dataSources: z.array(z.object({
    source: z.string(),
    publisher: z.string(),
    year: z.number(),
    description: z.string(),
  })).optional(),
});

export const insertTamAnalysisSchema = createInsertSchema(tamAnalyses).omit({ id: true, createdAt: true });

export type TamAnalysis = typeof tamAnalyses.$inferSelect;
export type InsertTamAnalysis = z.infer<typeof insertTamAnalysisSchema>;
export type TamContent = z.infer<typeof tamContentSchema>;

// === POWER TRENDS ===
export const powerTrendAnalyses = pgTable("power_trend_analyses", {
  id: serial("id").primaryKey(),
  country: text("country").notNull().default("United Kingdom"),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const powerTrendContentSchema = z.object({
  generatedAt: z.string(),
  country: z.string(),
  gridCapacity: z.object({
    totalCapacityGW: z.number(),
    availableCapacityGW: z.number(),
    reservedForDataCentresGW: z.number(),
    projectedGrowth: z.array(z.object({
      year: z.number(),
      capacityGW: z.number(),
    })),
  }),
  powerPricing: z.object({
    averageIndustrialPriceMWh: z.number(),
    peakPriceMWh: z.number(),
    offPeakPriceMWh: z.number(),
    priceVolatilityIndex: z.string(),
    renewablePPAAvailability: z.string(),
    priceTrend: z.string(),
  }),
  renewableEnergy: z.object({
    renewableSharePercent: z.number(),
    solarCapacityGW: z.number(),
    windCapacityGW: z.number(),
    hydroCapacityGW: z.number(),
    nuclearCapacityGW: z.number(),
    projectedRenewableShare: z.array(z.object({
      year: z.number(),
      sharePercent: z.number(),
    })),
  }),
  gridConstraints: z.array(z.object({
    region: z.string(),
    constraintType: z.string(),
    severity: z.string(),
    description: z.string(),
    mitigationTimeline: z.string(),
  })),
  regulatoryEnvironment: z.object({
    planningFramework: z.string(),
    gridConnectionTimeline: z.string(),
    keyRegulations: z.array(z.object({
      regulation: z.string(),
      description: z.string(),
      impact: z.string(),
    })),
    incentives: z.array(z.object({
      incentive: z.string(),
      description: z.string(),
      value: z.string(),
    })),
    restrictions: z.array(z.object({
      restriction: z.string(),
      description: z.string(),
      severity: z.string(),
    })),
  }),
  dataCentrePowerDemand: z.object({
    currentDemandGW: z.number(),
    projectedDemand2030GW: z.number(),
    shareOfNationalDemandPercent: z.number(),
    annualGrowthRate: z.string(),
    keyDrivers: z.array(z.string()),
    workloadBreakdown: z.array(z.object({
      workload: z.string(),
      sharePercent: z.number(),
    })),
  }),
  locations: z.array(z.object({
    location: z.string(),
    region: z.string(),
    powerAvailabilityRating: z.string(),
    gridCapacityMW: z.number(),
    renewableAccessPercent: z.number(),
    averagePUE: z.number(),
    coolingAdvantage: z.string(),
    keyRisks: z.array(z.string()),
    suitabilityScore: z.number(),
    connectionTimelineMonths: z.number(),
  })),
  trends: z.array(z.object({
    trend: z.string(),
    impact: z.string(),
    timeframe: z.string(),
    relevance: z.string(),
  })),
  investorInsights: z.object({
    overallRating: z.string(),
    keyOpportunities: z.array(z.string()),
    keyRisks: z.array(z.string()),
    recommendedStrategy: z.string(),
    hyperscalerOutlook: z.string(),
  }),
  summary: z.string(),
  dataSources: z.array(z.object({
    source: z.string(),
    publisher: z.string(),
    year: z.number(),
    description: z.string(),
  })).optional(),
});

export const insertPowerTrendAnalysisSchema = createInsertSchema(powerTrendAnalyses).omit({ id: true, createdAt: true });

export type PowerTrendAnalysis = typeof powerTrendAnalyses.$inferSelect;
export type InsertPowerTrendAnalysis = z.infer<typeof insertPowerTrendAnalysisSchema>;
export type PowerTrendContent = z.infer<typeof powerTrendContentSchema>;

export const insertVerifiedExecutiveSchema = createInsertSchema(verifiedExecutives).omit({ id: true, verifiedAt: true });

export type VerifiedExecutive = typeof verifiedExecutives.$inferSelect;
export type InsertVerifiedExecutive = z.infer<typeof insertVerifiedExecutiveSchema>;

export const reportComments = pgTable("report_comments", {
  id: serial("id").primaryKey(),
  analysisId: serial("analysis_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  section: text("section").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportAssignments = pgTable("report_assignments", {
  id: serial("id").primaryKey(),
  analysisId: serial("analysis_id").notNull(),
  assignedByEmail: text("assigned_by_email").notNull(),
  assignedToEmail: text("assigned_to_email").notNull(),
  section: text("section").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reportActivity = pgTable("report_activity", {
  id: serial("id").primaryKey(),
  analysisId: serial("analysis_id").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReportCommentSchema = createInsertSchema(reportComments).omit({ id: true, createdAt: true });
export const insertReportAssignmentSchema = createInsertSchema(reportAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReportActivitySchema = createInsertSchema(reportActivity).omit({ id: true, createdAt: true });

export type ReportComment = typeof reportComments.$inferSelect;
export type InsertReportComment = z.infer<typeof insertReportCommentSchema>;
export type ReportAssignment = typeof reportAssignments.$inferSelect;
export type InsertReportAssignment = z.infer<typeof insertReportAssignmentSchema>;
export type ReportActivity = typeof reportActivity.$inferSelect;
export type InsertReportActivity = z.infer<typeof insertReportActivitySchema>;

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// === 1GL DATA CENTRES ===
export const oneGLDatacentres = pgTable("onegl_datacentres", {
  id: serial("id").primaryKey(),
  oneGLId: text("onegl_id").notNull().unique(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  country: text("country"),
  operator: text("operator"),
  capacityMW: doublePrecision("capacity_mw"),
  tier: text("tier"),
  websiteUrl: text("website_url"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

export const insertOneGLDatacentreSchema = createInsertSchema(oneGLDatacentres).omit({ id: true, scrapedAt: true });

export type OneGLDatacentre = typeof oneGLDatacentres.$inferSelect;
export type InsertOneGLDatacentre = z.infer<typeof insertOneGLDatacentreSchema>;

export * from "./models/chat";
