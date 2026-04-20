/**
 * Research Agent — UK Data Centre Site Selection
 *
 * Multi-step agentic pipeline:
 *   Step 1  Screening    — AI identifies best-fit UK power regions
 *   Step 2  Live data    — ENTSO-E + World Bank fetch for United Kingdom
 *   Step 3  Site analysis — Parallel AI deep-dives per UK region (UK-only enforced)
 *   Step 4  Synthesis    — AI ranks UK candidates, writes executive summary
 *
 * Hard constraints enforced at every layer:
 *   - Only UK_REGIONS are passed to the AI
 *   - System prompts forbid non-UK suggestions explicitly
 *   - isUKSite() rejects any candidate mentioning non-UK places
 *   - country field is force-normalised to "United Kingdom" on every candidate
 */

import OpenAI from "openai";
import type { Response } from "express";
import {
  siteSelectionRequestSchema,
  siteSelectionContentSchema,
  type SiteSelectionRequest,
  type SiteSelectionContent,
  type SiteRecommendation,
} from "@shared/schema";
import { z } from "zod";

// ── UK power regions eligible for site selection ──────────────────────────────
// These map to real UK electricity network regions / DC cluster zones.
const UK_REGIONS = [
  "Scotland (North)",
  "Scotland (Central)",
  "North East England",
  "North West England",
  "Yorkshire",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London & Thames Valley",
  "South East England",
  "South West England",
  "Wales",
  "Northern Ireland",
] as const;

type UKRegion = (typeof UK_REGIONS)[number];

// ── Non-UK place tokens used in the hard filter ───────────────────────────────
// Any candidate whose location or region contains one of these strings is
// rejected regardless of what the AI returned.
const NON_UK_PLACE_TOKENS = [
  "ireland", "dublin", "cork", "limerick", "galway", "waterford",  // Republic of Ireland
  "france", "paris", "lyon", "marseille", "bordeaux", "strasbourg",
  "germany", "berlin", "frankfurt", "munich", "hamburg", "düsseldorf",
  "netherlands", "amsterdam", "rotterdam", "eindhoven",
  "belgium", "brussels", "antwerp",
  "denmark", "copenhagen",
  "norway", "oslo",
  "sweden", "stockholm",
  "spain", "madrid", "barcelona",
  "portugal", "lisbon",
  "italy", "milan", "rome",
  "poland", "warsaw",
  "switzerland", "zurich",
  "austria", "vienna",
];

/** Returns true only if the candidate is unambiguously within the UK. */
function isUKSite(candidate: { country: string; location: string; region: string }): boolean {
  const countryNorm = candidate.country.toLowerCase().trim();
  // Must claim United Kingdom (or UK / England / Scotland / Wales / N.Ireland)
  const countryOk =
    countryNorm === "united kingdom" ||
    countryNorm === "uk" ||
    countryNorm.includes("england") ||
    countryNorm.includes("scotland") ||
    countryNorm.includes("wales") ||
    countryNorm.includes("northern ireland");

  if (!countryOk) return false;

  // Reject if location or region mentions a known non-UK place
  const combined = `${candidate.location} ${candidate.region}`.toLowerCase();
  for (const token of NON_UK_PLACE_TOKENS) {
    if (combined.includes(token)) return false;
  }

  return true;
}

/** Normalise the country field to the canonical string "United Kingdom". */
function normaliseCountry(_country: string): string {
  return "United Kingdom";
}

// ── In-memory job store ───────────────────────────────────────────────────────
export interface AgentJob {
  status: "running" | "complete" | "error";
  events: string[];
  listeners: Set<Response>;
  reportId?: number;
  errorMessage?: string;
  createdAt: Date;
}

const jobs = new Map<string, AgentJob>();

// Prune jobs older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

export function createJob(jobId: string): AgentJob {
  const job: AgentJob = {
    status: "running",
    events: [],
    listeners: new Set(),
    createdAt: new Date(),
  };
  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): AgentJob | undefined {
  return jobs.get(jobId);
}

function emit(job: AgentJob, type: string, payload: Record<string, unknown>) {
  const data = JSON.stringify({ type, ...payload });
  job.events.push(data);
  for (const res of job.listeners) {
    res.write(`data: ${data}\n\n`);
  }
}

// ── Step helpers ──────────────────────────────────────────────────────────────
function stepStart(job: AgentJob, step: number, title: string, description: string) {
  emit(job, "step_start", { step, title, description });
}

function stepComplete(
  job: AgentJob,
  step: number,
  title: string,
  durationMs: number,
  outputSummary: string,
) {
  emit(job, "step_complete", { step, title, durationMs, outputSummary });
}

function stepError(job: AgentJob, step: number, message: string) {
  emit(job, "step_error", { step, message });
}

// ── Step 1: Screening ─────────────────────────────────────────────────────────
async function screenUKRegions(
  openai: OpenAI,
  request: SiteSelectionRequest,
): Promise<string[]> {
  const additionalHint = request.additionalRequirements
    ? ` Additional context: ${request.additionalRequirements}`
    : "";

  const prompt = `You are an expert UK data centre site selection consultant with deep knowledge of British power infrastructure.

SCOPE: United Kingdom ONLY. Do not suggest, mention, or reference any sites in Ireland, France, or any other country outside the United Kingdom. 'UK' means England, Scotland, Wales, and Northern Ireland — nothing else.

Identify the 5 best UK power regions for a new data centre deployment with these requirements:
- Power requirement: ${request.powerRequirementMW} MW
- Minimum renewable energy: ${request.sustainabilityTarget}%
- Grid connection timeline: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity} (Low = price matters most, High = willing to pay for premium locations)
${additionalHint}

Select from this list ONLY — all regions are within the United Kingdom:
${UK_REGIONS.join(", ")}

Consider:
- National Grid ESO transmission capacity and connection queue depth per region
- Scottish/Welsh renewable energy availability and PPA market maturity
- Industrial electricity tariffs and balancing costs by region
- Ofgem connection reform impact on timeline by region
- Natural cooling climate advantage (Scotland, North England vs South)
- Planning authority speed (permitted development rights, CNI designation impact)

Return JSON only: { "shortlistedRegions": ["Region1", "Region2", ...], "rationale": { "Region1": "brief reason", ... } }`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a UK-only data centre site selection specialist. ONLY research and return sites within the United Kingdom. Do not suggest or mention sites in Ireland, France, or any other country. 'UK' means England, Scotland, Wales, and Northern Ireland only.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const regions: string[] = (raw.shortlistedRegions ?? [])
    .filter((r: string) => (UK_REGIONS as readonly string[]).includes(r))
    .slice(0, 5);

  // If the AI hallucinated region names not in our list, fall back to top 5 UK_REGIONS
  if (regions.length < 2) {
    console.warn("Screening returned too few valid UK regions — using default top 5");
    return ["London & Thames Valley", "East of England", "North West England", "Scotland (Central)", "East Midlands"];
  }
  return regions;
}

// ── Step 2: Fetch live data per country ───────────────────────────────────────
interface LiveDataContext {
  entsoe: string;
  worldBank: string;
}

async function fetchLiveData(
  countries: string[],
): Promise<Record<string, LiveDataContext>> {
  const results: Record<string, LiveDataContext> = {};

  await Promise.allSettled(
    countries.map(async (country) => {
      let entsoe = "";
      let worldBank = "";

      await Promise.allSettled([
        (async () => {
          try {
            const { getCountryDayAheadPrices, getCountryGeneration, isEntsoeConfigured } =
              await import("./entsoe");
            if (!isEntsoeConfigured()) return;

            const [priceData, genData] = await Promise.allSettled([
              getCountryDayAheadPrices(country),
              getCountryGeneration(country),
            ]);

            const prices = priceData.status === "fulfilled" ? priceData.value : null;
            const gen = genData.status === "fulfilled" ? genData.value : null;

            if (prices?.monthly.length) {
              const recent = prices.monthly.slice(-3);
              const monthlyLines = recent
                .map(
                  (m) =>
                    `${m.year}-${String(m.month).padStart(2, "0")}: avg €${m.avgEurMwh.toFixed(2)}/MWh`,
                )
                .join(" | ");
              entsoe += `ENTSO-E prices (${country}): ${monthlyLines}. Latest: ${
                prices.latestDayAvg != null
                  ? `€${prices.latestDayAvg.toFixed(2)}/MWh (${prices.latestDayDate})`
                  : "N/A"
              }. `;
            }

            if (gen?.fuels.length) {
              const top = gen.fuels
                .slice(0, 5)
                .map((f) => `${f.fuelType} ${f.avgMw.toLocaleString()} MW`)
                .join(", ");
              entsoe += `Generation mix (last 30 days): ${top}. Renewable share: ${gen.renewableSharePct}%.`;
            }
          } catch {
            // live data unavailable — agent continues with embedded knowledge
          }
        })(),

        (async () => {
          try {
            const { getCountryIndicators, formatIndicatorsForPrompt } =
              await import("./worldBankData");
            const indicators = await getCountryIndicators(country);
            if (indicators) worldBank = formatIndicatorsForPrompt(indicators);
          } catch {
            // non-fatal
          }
        })(),
      ]);

      results[country] = { entsoe, worldBank };
    }),
  );

  return results;
}

// ── Step 3: Deep-dive per country ─────────────────────────────────────────────
const siteAnalysisOutputSchema = z.object({
  sites: z.array(
    z.object({
      location: z.string(),
      region: z.string(),
      gridCapacityMW: z.number(),
      renewableAccessPercent: z.number(),
      estimatedPriceMWh: z.number(),
      connectionTimelineMonths: z.number(),
      averagePUE: z.number(),
      coolingAdvantage: z.string(),
      scoreBreakdown: z.object({
        power: z.number(),
        renewable: z.number(),
        cost: z.number(),
        regulatory: z.number(),
        risk: z.number(),
      }),
      keyStrengths: z.array(z.string()),
      keyRisks: z.array(z.string()),
      recommendation: z.string(),
    }),
  ),
});

type SiteCandidate = z.infer<typeof siteAnalysisOutputSchema>["sites"][number] & {
  country: string;
  liveDataSnapshot?: SiteRecommendation["liveDataSnapshot"];
};

async function analyseUKRegion(
  openai: OpenAI,
  region: string,
  liveData: LiveDataContext,
  request: SiteSelectionRequest,
): Promise<SiteCandidate[]> {
  const liveSection =
    liveData.entsoe || liveData.worldBank
      ? `\nLIVE UK GRID DATA:\n${liveData.entsoe}\n${liveData.worldBank}`
      : "\nNo live grid data available — use embedded knowledge.";

  const prompt = `You are an expert on UK power infrastructure and data centre site selection in ${region}, United Kingdom.

SCOPE: United Kingdom ONLY. Do not suggest, mention, or reference any sites in the Republic of Ireland, France, or any other country. Every site you return must be physically located within the United Kingdom (England, Scotland, Wales, or Northern Ireland).

Identify the 2 best specific sites within the UK region of "${region}" for a data centre deployment:
- Power requirement: ${request.powerRequirementMW} MW
- Minimum renewable energy: ${request.sustainabilityTarget}%
- Connection timeline target: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}
${liveSection}

For each site, score ALL scoreBreakdown fields 0-100 where 100 = perfectly meets requirements:
- power: can the National Grid / DNO deliver the required MW capacity in this UK region?
- renewable: does renewable access (Scottish wind, offshore wind PPAs) meet or exceed the sustainability target?
- cost: how competitive are UK industrial electricity tariffs and BSUoS charges relative to the UK average?
- regulatory: how fast/predictable is UK planning permission and Ofgem grid connection in this region?
- risk: how low is the overall risk profile (grid stress, planning refusal history, flood zone, political)?

Return JSON only — the "location" and "region" fields MUST be within the United Kingdom:
{
  "sites": [
    {
      "location": "UK city or specific area (must be in United Kingdom)",
      "region": "UK sub-national region (must be in United Kingdom)",
      "gridCapacityMW": number,
      "renewableAccessPercent": number,
      "estimatedPriceMWh": number,
      "connectionTimelineMonths": number,
      "averagePUE": number (1.1-1.8),
      "coolingAdvantage": "Significant|Moderate|Limited",
      "scoreBreakdown": { "power": 0-100, "renewable": 0-100, "cost": 0-100, "regulatory": 0-100, "risk": 0-100 },
      "keyStrengths": ["string", ...],
      "keyRisks": ["string", ...],
      "recommendation": "2-3 sentence assessment"
    }
  ]
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a UK-only data centre site selection specialist. ONLY research and return sites within the United Kingdom. Do not suggest or mention sites in Ireland, France, or any other country. Every site in your response must be physically located in England, Scotland, Wales, or Northern Ireland.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const parsed = siteAnalysisOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  const snapshot: SiteRecommendation["liveDataSnapshot"] =
    liveData.entsoe
      ? { dataFetchedAt: new Date().toISOString() }
      : undefined;

  return parsed.data.sites.slice(0, 2).map((site) => ({
    ...site,
    // Hard-override: country is always United Kingdom regardless of what AI returned
    country: normaliseCountry(site.location),
    liveDataSnapshot: snapshot,
  }));
}

// ── Post-processing hard filter ───────────────────────────────────────────────
/**
 * Rejects any candidate that fails the isUKSite check.
 * Runs after all AI analysis steps as a final gate before synthesis.
 */
function filterNonUKSites(candidates: SiteCandidate[]): SiteCandidate[] {
  const passed: SiteCandidate[] = [];
  const rejected: string[] = [];

  for (const c of candidates) {
    if (isUKSite(c)) {
      passed.push(c);
    } else {
      rejected.push(`${c.location}, ${c.country}`);
    }
  }

  if (rejected.length > 0) {
    console.warn(
      `[ResearchAgent] Hard filter rejected ${rejected.length} non-UK site(s): ${rejected.join(" | ")}`,
    );
  }

  return passed;
}

// ── Step 4: Synthesis ─────────────────────────────────────────────────────────
const synthesisOutputSchema = z.object({
  rankedSites: z.array(
    z.object({
      rank: z.number(),
      location: z.string(),
      country: z.string(),
      overallScore: z.number(),
    }),
  ),
  executiveSummary: z.string(),
  methodology: z.string(),
});

async function synthesiseResults(
  openai: OpenAI,
  candidates: SiteCandidate[],
  request: SiteSelectionRequest,
): Promise<{ rankings: Array<{ location: string; country: string; rank: number; overallScore: number }>; executiveSummary: string; methodology: string }> {
  const candidateSummary = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.location}, ${c.country}: power=${c.scoreBreakdown.power}, renewable=${c.scoreBreakdown.renewable}, cost=${c.scoreBreakdown.cost}, regulatory=${c.scoreBreakdown.regulatory}, risk=${c.scoreBreakdown.risk}. Grid: ${c.gridCapacityMW} MW. Renewable: ${c.renewableAccessPercent}%. Price: €${c.estimatedPriceMWh}/MWh. Timeline: ${c.connectionTimelineMonths} months.`,
    )
    .join("\n");

  const prompt = `You are a senior UK data centre investment advisor synthesising a United Kingdom site selection analysis.

SCOPE: United Kingdom ONLY. All candidate sites are within England, Scotland, Wales, or Northern Ireland. Do not introduce or reference any sites outside the United Kingdom in your response.

Client requirements:
- Power: ${request.powerRequirementMW} MW
- Renewable target: ${request.sustainabilityTarget}%
- Timeline: ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}

UK candidate sites assessed:
${candidateSummary}

Tasks:
1. Rank all ${candidates.length} UK sites from best to worst fit for the requirements. Calculate a weighted overallScore (0-100) where:
   - power and renewable are weighted most heavily if sustainability is a high target
   - cost is weighted heavily if budget sensitivity is High
   - regulatory and risk are always material
2. Write a 3-4 sentence executive summary for the top recommendation, referencing specific UK grid and planning context.
3. Write a 2-sentence methodology note explaining the UK-specific scoring approach.

Return JSON only — all locations must be within the United Kingdom:
{
  "rankedSites": [
    { "rank": 1, "location": "...", "country": "United Kingdom", "overallScore": 0-100 },
    ...
  ],
  "executiveSummary": "...",
  "methodology": "..."
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a UK-only data centre site selection specialist. ONLY research and return sites within the United Kingdom. Do not suggest or mention sites in Ireland, France, or any other country.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const parsed = synthesisOutputSchema.safeParse(raw);
  if (!parsed.success) {
    // Fallback: rank by average score
    const fallback = candidates
      .map((c, i) => {
        const avg =
          (c.scoreBreakdown.power +
            c.scoreBreakdown.renewable +
            c.scoreBreakdown.cost +
            c.scoreBreakdown.regulatory +
            c.scoreBreakdown.risk) /
          5;
        return { rank: i + 1, location: c.location, country: c.country, overallScore: Math.round(avg) };
      })
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    return {
      rankings: fallback,
      executiveSummary: `Analysis identified ${candidates.length} UK candidate sites. Top recommendation is ${fallback[0]?.location}, United Kingdom, based on overall scoring against the stated requirements.`,
      methodology: "UK sites scored across five dimensions (power, renewable, cost, regulatory, risk) then ranked by weighted average.",
    };
  }

  return {
    rankings: parsed.data.rankedSites,
    executiveSummary: parsed.data.executiveSummary,
    methodology: parsed.data.methodology,
  };
}

// ── Main agent entry point ────────────────────────────────────────────────────
export async function runResearchAgent(
  openai: OpenAI,
  request: SiteSelectionRequest,
  job: AgentJob,
  persist: (content: SiteSelectionContent) => Promise<number>,
): Promise<void> {
  const completedSteps: SiteSelectionContent["agentSteps"] = [];

  try {
    // ── Step 1: Screening ──────────────────────────────────────────────────
    const s1Start = Date.now();
    stepStart(job, 1, "Screening UK power regions", "Identifying best-fit regions across England, Scotland, Wales & Northern Ireland");

    let shortlistedRegions: string[];
    try {
      shortlistedRegions = await screenUKRegions(openai, request);
    } catch (err: any) {
      stepError(job, 1, err.message ?? "Screening failed");
      throw err;
    }

    const s1Duration = Date.now() - s1Start;
    completedSteps.push({
      step: 1,
      title: "Screening UK power regions",
      description: "Identified best-fit UK regions for your requirements",
      durationMs: s1Duration,
      outputSummary: `Shortlisted ${shortlistedRegions.length} UK regions: ${shortlistedRegions.join(", ")}`,
    });
    stepComplete(job, 1, "Screening UK power regions", s1Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 2: Fetch live data ────────────────────────────────────────────
    const s2Start = Date.now();
    stepStart(job, 2, "Fetching live UK grid data", "Pulling ENTSO-E and World Bank data for United Kingdom");

    // All regions are UK — fetch live data keyed to "United Kingdom" then share across regions
    const liveData = await fetchLiveData(["United Kingdom"]);
    const ukLive = liveData["United Kingdom"] ?? { entsoe: "", worldBank: "" };
    // Expose under each region key so analyseUKRegion can look it up
    const regionLiveData: Record<string, LiveDataContext> = {};
    for (const region of shortlistedRegions) regionLiveData[region] = ukLive;

    const s2Duration = Date.now() - s2Start;
    completedSteps.push({
      step: 2,
      title: "Fetching live UK grid data",
      description: "Pulled real-time UK grid data from ENTSO-E and World Bank",
      durationMs: s2Duration,
      outputSummary: ukLive.entsoe
        ? "Live ENTSO-E and World Bank data retrieved for United Kingdom"
        : "Using embedded UK grid knowledge (live data unavailable)",
    });
    stepComplete(job, 2, "Fetching live UK grid data", s2Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 3: Parallel site analysis ────────────────────────────────────
    const s3Start = Date.now();
    stepStart(
      job,
      3,
      "Analysing UK candidate sites",
      `Running deep-dive site analysis across ${shortlistedRegions.length} UK regions`,
    );

    const analysisResults = await Promise.allSettled(
      shortlistedRegions.map((region) =>
        analyseUKRegion(openai, region, regionLiveData[region], request),
      ),
    );

    const rawCandidates: SiteCandidate[] = analysisResults
      .filter((r): r is PromiseFulfilledResult<SiteCandidate[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // ── Hard filter: reject any non-UK sites ──────────────────────────────
    const allCandidates = filterNonUKSites(rawCandidates);

    if (allCandidates.length === 0) throw new Error("No valid UK candidate sites found");

    const s3Duration = Date.now() - s3Start;
    completedSteps.push({
      step: 3,
      title: "Analysing UK candidate sites",
      description: "Deep-dive UK site analysis complete",
      durationMs: s3Duration,
      outputSummary: `Identified ${allCandidates.length} UK candidate sites across ${shortlistedRegions.length} regions`,
    });
    stepComplete(job, 3, "Analysing UK candidate sites", s3Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 4: Synthesis ─────────────────────────────────────────────────
    const s4Start = Date.now();
    stepStart(job, 4, "Ranking and synthesising", "Producing final ranked recommendations");

    const synthesis = await synthesiseResults(openai, allCandidates, request);

    // Build final ranked site list
    const rankedSites: SiteRecommendation[] = synthesis.rankings
      .map((ranking) => {
        const candidate = allCandidates.find(
          (c) => c.location === ranking.location && c.country === ranking.country,
        );
        if (!candidate) return null;

        return {
          rank: ranking.rank,
          country: "United Kingdom",   // hard-normalised — never trust AI-returned country
          location: candidate.location,
          region: candidate.region,
          overallScore: ranking.overallScore,
          scoreBreakdown: candidate.scoreBreakdown,
          gridCapacityMW: candidate.gridCapacityMW,
          renewableAccessPercent: candidate.renewableAccessPercent,
          estimatedPriceMWh: candidate.estimatedPriceMWh,
          connectionTimelineMonths: candidate.connectionTimelineMonths,
          averagePUE: candidate.averagePUE,
          coolingAdvantage: candidate.coolingAdvantage,
          keyStrengths: candidate.keyStrengths,
          keyRisks: candidate.keyRisks,
          recommendation: candidate.recommendation,
          liveDataSnapshot: candidate.liveDataSnapshot,
        } satisfies SiteRecommendation;
      })
      .filter((s): s is SiteRecommendation => s !== null);

    const s4Duration = Date.now() - s4Start;
    completedSteps.push({
      step: 4,
      title: "Ranking and synthesising",
      description: "Final UK recommendations produced",
      durationMs: s4Duration,
      outputSummary: `Ranked ${rankedSites.length} UK sites. Top pick: ${rankedSites[0]?.location} (score: ${rankedSites[0]?.overallScore})`,
    });
    stepComplete(job, 4, "Ranking and synthesising", s4Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Persist & complete ────────────────────────────────────────────────
    const content: SiteSelectionContent = {
      generatedAt: new Date().toISOString(),
      agentSteps: completedSteps,
      shortlistedCountries: shortlistedRegions,   // regions used as the country list
      rankedSites,
      executiveSummary: synthesis.executiveSummary,
      methodology: synthesis.methodology,
      dataSources: [
        { source: "ENTSO-E Transparency Platform", publisher: "ENTSO-E", year: 2025, description: "Day-ahead electricity prices and generation mix for European bidding zones" },
        { source: "World Bank Open Data", publisher: "World Bank Group", year: 2025, description: "Macroeconomic indicators including GDP, energy use, and electricity access" },
        { source: "IEA Data Centres and Data Transmission Networks", publisher: "International Energy Agency", year: 2025, description: "Global data centre energy consumption trends and projections to 2030" },
        { source: "DC Byte Global Data Centre Index 2025", publisher: "DC Byte", year: 2025, description: "7,500+ facility dataset tracking live supply, under construction, and committed pipelines globally" },
        { source: "S&P Global / 451 Research European DC Power Demand", publisher: "S&P Global Market Intelligence", year: 2025, description: "European DC load 18.7 GW end-2024, projected 36 GW by 2030" },
      ],
    };

    const validated = siteSelectionContentSchema.safeParse(content);
    if (!validated.success) {
      console.error("Site selection content validation failed:", validated.error.errors);
      throw new Error("Generated content failed schema validation");
    }

    const reportId = await persist(validated.data);

    job.status = "complete";
    job.reportId = reportId;
    emit(job, "complete", { reportId });

    // Close all SSE listeners
    for (const res of job.listeners) res.end();
    job.listeners.clear();
  } catch (err: any) {
    console.error("Research agent error:", err);
    job.status = "error";
    job.errorMessage = err.message ?? "Unknown error";
    emit(job, "error", { message: job.errorMessage });
    for (const res of job.listeners) res.end();
    job.listeners.clear();
  }
}
