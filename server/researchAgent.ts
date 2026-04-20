/**
 * Research Agent — Data Centre Site Selection
 *
 * Multi-step agentic pipeline:
 *   Step 1  Screening    — AI identifies 5 best-fit European countries
 *   Step 2  Live data    — Parallel ENTSO-E + World Bank fetch per country
 *   Step 3  Site analysis — Parallel AI deep-dives (2 sites per country)
 *   Step 4  Synthesis    — AI ranks all candidates, writes executive summary
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

// ── European countries eligible for site selection ────────────────────────────
const EUROPEAN_COUNTRIES = [
  "United Kingdom", "Ireland", "Norway", "Sweden", "Finland", "Denmark",
  "Netherlands", "Belgium", "France", "Germany", "Austria", "Switzerland",
  "Spain", "Portugal", "Italy", "Poland", "Czechia", "Romania", "Hungary",
  "Bulgaria", "Slovakia", "Slovenia", "Croatia", "Greece", "Estonia",
  "Latvia", "Lithuania",
] as const;

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
async function screenCountries(
  openai: OpenAI,
  request: SiteSelectionRequest,
): Promise<string[]> {
  const regionHint = request.preferredRegions?.length
    ? ` Prefer countries in: ${request.preferredRegions.join(", ")}.`
    : "";

  const additionalHint = request.additionalRequirements
    ? ` Additional context: ${request.additionalRequirements}`
    : "";

  const prompt = `You are an expert data centre site selection consultant with deep knowledge of European power infrastructure.

Identify exactly 5 European countries best suited for a new data centre deployment with these requirements:
- Power requirement: ${request.powerRequirementMW} MW
- Minimum renewable energy: ${request.sustainabilityTarget}%
- Grid connection timeline: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity} (Low = price matters most, High = willing to pay for premium locations)
${regionHint}${additionalHint}

Select from this list only: ${EUROPEAN_COUNTRIES.join(", ")}

Consider:
- Grid capacity headroom and connection queue depth
- Renewable energy availability and PPA market maturity
- Power pricing (industrial tariffs and PPA rates)
- Planning and permitting speed
- Cooling climate advantage (reduces PUE and OpEx)
- Political stability and regulatory predictability

Return JSON only: { "shortlistedCountries": ["Country1", "Country2", ...], "rationale": { "Country1": "brief reason", ... } }`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const countries: string[] = (raw.shortlistedCountries ?? [])
    .filter((c: string) => (EUROPEAN_COUNTRIES as readonly string[]).includes(c))
    .slice(0, 5);

  if (countries.length < 2) throw new Error("Screening returned too few valid countries");
  return countries;
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

async function analyseCountry(
  openai: OpenAI,
  country: string,
  liveData: LiveDataContext,
  request: SiteSelectionRequest,
): Promise<SiteCandidate[]> {
  const liveSection =
    liveData.entsoe || liveData.worldBank
      ? `\nLIVE DATA:\n${liveData.entsoe}\n${liveData.worldBank}`
      : "\nNo live grid data available — use embedded knowledge.";

  const prompt = `You are an expert on power infrastructure and data centre site selection in ${country}.

Identify the 2 best specific sites within ${country} for a data centre deployment:
- Power requirement: ${request.powerRequirementMW} MW
- Minimum renewable energy: ${request.sustainabilityTarget}%
- Connection timeline target: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}
${liveSection}

For each site, score ALL scoreBreakdown fields 0-100 where 100 = perfectly meets requirements:
- power: can the grid deliver the required MW capacity?
- renewable: does renewable access meet or exceed the sustainability target?
- cost: how competitive are power prices relative to European average?
- regulatory: how fast/predictable is the permitting and grid connection process?
- risk: how low is the overall risk profile (grid stress, political, natural hazards)?

Return JSON only:
{
  "sites": [
    {
      "location": "city or specific area",
      "region": "sub-national region",
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
    messages: [{ role: "user", content: prompt }],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const parsed = siteAnalysisOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  // Extract live data snapshot for each site
  const snapshot: SiteRecommendation["liveDataSnapshot"] =
    liveData.entsoe
      ? {
          dataFetchedAt: new Date().toISOString(),
        }
      : undefined;

  return parsed.data.sites.slice(0, 2).map((site) => ({
    ...site,
    country,
    liveDataSnapshot: snapshot,
  }));
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

  const prompt = `You are a senior data centre investment advisor synthesising a multi-country site selection analysis.

Client requirements:
- Power: ${request.powerRequirementMW} MW
- Renewable target: ${request.sustainabilityTarget}%
- Timeline: ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}

Candidate sites assessed:
${candidateSummary}

Tasks:
1. Rank all ${candidates.length} sites from best to worst fit for the requirements. Calculate a weighted overallScore (0-100) where:
   - power and renewable are weighted most heavily if sustainability is a high target
   - cost is weighted heavily if budget sensitivity is High
   - regulatory and risk are always material
2. Write a 3-4 sentence executive summary for the top recommendation.
3. Write a 2-sentence methodology note explaining the scoring approach.

Return JSON only:
{
  "rankedSites": [
    { "rank": 1, "location": "...", "country": "...", "overallScore": 0-100 },
    ...
  ],
  "executiveSummary": "...",
  "methodology": "..."
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
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
      executiveSummary: `Analysis identified ${candidates.length} candidate sites across ${new Set(candidates.map((c) => c.country)).size} European countries. Top recommendation is ${fallback[0]?.location}, ${fallback[0]?.country} based on overall scoring against the stated requirements.`,
      methodology: "Sites scored across five dimensions (power, renewable, cost, regulatory, risk) then ranked by weighted average.",
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
    stepStart(job, 1, "Screening European markets", "Identifying best-fit countries for your requirements");

    let shortlistedCountries: string[];
    try {
      shortlistedCountries = await screenCountries(openai, request);
    } catch (err: any) {
      stepError(job, 1, err.message ?? "Screening failed");
      throw err;
    }

    const s1Duration = Date.now() - s1Start;
    completedSteps.push({
      step: 1,
      title: "Screening European markets",
      description: "Identified best-fit countries for your requirements",
      durationMs: s1Duration,
      outputSummary: `Shortlisted ${shortlistedCountries.length} countries: ${shortlistedCountries.join(", ")}`,
    });
    stepComplete(job, 1, "Screening European markets", s1Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 2: Fetch live data ────────────────────────────────────────────
    const s2Start = Date.now();
    stepStart(job, 2, "Fetching live grid data", `Pulling ENTSO-E and World Bank data for ${shortlistedCountries.join(", ")}`);

    const liveData = await fetchLiveData(shortlistedCountries);

    const s2Duration = Date.now() - s2Start;
    const liveCount = Object.values(liveData).filter((d) => d.entsoe || d.worldBank).length;
    completedSteps.push({
      step: 2,
      title: "Fetching live grid data",
      description: "Pulled real-time grid data from ENTSO-E and World Bank",
      durationMs: s2Duration,
      outputSummary: `Live data retrieved for ${liveCount}/${shortlistedCountries.length} countries`,
    });
    stepComplete(job, 2, "Fetching live grid data", s2Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 3: Parallel site analysis ────────────────────────────────────
    const s3Start = Date.now();
    stepStart(
      job,
      3,
      "Analysing candidate sites",
      `Running deep-dive site analysis across ${shortlistedCountries.length} countries`,
    );

    const analysisResults = await Promise.allSettled(
      shortlistedCountries.map((country) =>
        analyseCountry(openai, country, liveData[country] ?? { entsoe: "", worldBank: "" }, request),
      ),
    );

    const allCandidates: SiteCandidate[] = analysisResults
      .filter((r): r is PromiseFulfilledResult<SiteCandidate[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    if (allCandidates.length === 0) throw new Error("No candidate sites found");

    const s3Duration = Date.now() - s3Start;
    completedSteps.push({
      step: 3,
      title: "Analysing candidate sites",
      description: "Deep-dive site analysis complete",
      durationMs: s3Duration,
      outputSummary: `Identified ${allCandidates.length} candidate sites across ${shortlistedCountries.length} countries`,
    });
    stepComplete(job, 3, "Analysing candidate sites", s3Duration, completedSteps[completedSteps.length - 1].outputSummary);

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
          country: candidate.country,
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
      description: "Final recommendations produced",
      durationMs: s4Duration,
      outputSummary: `Ranked ${rankedSites.length} sites. Top pick: ${rankedSites[0]?.location}, ${rankedSites[0]?.country} (score: ${rankedSites[0]?.overallScore})`,
    });
    stepComplete(job, 4, "Ranking and synthesising", s4Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Persist & complete ────────────────────────────────────────────────
    const content: SiteSelectionContent = {
      generatedAt: new Date().toISOString(),
      agentSteps: completedSteps,
      shortlistedCountries,
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
