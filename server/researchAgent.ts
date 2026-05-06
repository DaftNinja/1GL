/**
 * Research Agent — Dynamic Country Data Centre Site Selection
 *
 * Multi-step agentic pipeline:
 *   Step 1  Screening    — AI identifies best-fit regions within user-specified countries
 *   Step 2  Live data    — ENTSO-E + World Bank fetch for each target country
 *   Step 3  Site analysis — Parallel AI deep-dives per region (constrained to target countries)
 *   Step 4  Synthesis    — AI ranks candidates, writes executive summary
 *
 * Country constraint enforcement (four layers):
 *   1. Only user-specified countries are ever passed to the AI
 *   2. System messages explicitly name the target countries and forbid anything else
 *   3. isSiteInScope() hard-filters any candidate whose location/region contains
 *      known place-name tokens from non-target countries
 *   4. candidate.country is force-set to the canonical target country name
 *
 * The targetCountries list is threaded through every function — nothing defaults
 * to a hardcoded country. If the user specifies France, only France is researched.
 */

import OpenAI from "openai";
import type { Response } from "express";
import {
  siteSelectionContentSchema,
  type SiteSelectionRequest,
  type SiteSelectionContent,
  type SiteRecommendation,
} from "@shared/schema";
import { z } from "zod";

// ── Country place-name tokens ─────────────────────────────────────────────────
// Used to detect when the AI returns a site that belongs to a different country.
// Each key is a canonical country name; the array contains distinctive place tokens.
const COUNTRY_PLACE_TOKENS: Record<string, string[]> = {
  "United Kingdom": [
    "london", "manchester", "birmingham", "edinburgh", "glasgow", "cardiff",
    "belfast", "bristol", "leeds", "sheffield", "liverpool", "newcastle",
    "cambridge", "slough", "docklands", "swindon", "reading", "norwich",
  ],
  "Ireland": [
    "dublin", "cork", "galway", "limerick", "waterford", "bray",
    "drogheda", "dundalk", "kilkenny",
  ],
  "France": [
    "paris", "lyon", "marseille", "bordeaux", "strasbourg", "toulouse",
    "nantes", "lille", "montpellier", "rennes", "grenoble",
  ],
  "Germany": [
    "berlin", "frankfurt", "munich", "hamburg", "düsseldorf", "duesseldorf",
    "cologne", "köln", "koeln", "stuttgart", "hannover", "nuremberg",
  ],
  "Netherlands": [
    "amsterdam", "rotterdam", "eindhoven", "utrecht", "hague", "the hague",
    "den haag", "tilburg", "groningen",
  ],
  "Belgium": ["brussels", "antwerp", "ghent", "liège", "liege", "bruges", "leuven"],
  "Denmark": ["copenhagen", "aarhus", "odense", "aalborg"],
  "Sweden": ["stockholm", "gothenburg", "malmö", "malmoe", "göteborg"],
  "Norway": ["oslo", "bergen", "trondheim", "stavanger", "tromsø"],
  "Finland": ["helsinki", "espoo", "tampere", "oulu", "vantaa"],
  "Spain": [
    "madrid", "barcelona", "seville", "sevilla", "valencia", "bilbao",
    "zaragoza", "málaga", "malaga", "murcia",
  ],
  "Portugal": ["lisbon", "lisboa", "porto", "braga", "setúbal", "setubal"],
  "Italy": [
    "milan", "rome", "turin", "torino", "florence", "firenze", "naples",
    "napoli", "bologna", "genoa", "genova",
  ],
  "Poland": ["warsaw", "krakow", "gdansk", "wroclaw", "poznań", "poznan", "łódź"],
  "Czechia": ["prague", "brno", "ostrava", "plzeň", "plzen"],
  "Austria": ["vienna", "wien", "graz", "salzburg", "linz"],
  "Switzerland": ["zurich", "zürich", "geneva", "genève", "bern", "basel"],
  "Romania": ["bucharest", "cluj", "timisoara", "iași", "iasi"],
  "Hungary": ["budapest", "debrecen", "miskolc"],
  "Bulgaria": ["sofia", "plovdiv", "varna", "burgas"],
  "Greece": ["athens", "thessaloniki", "patras"],
  "United States": [
    "virginia", "ashburn", "dallas", "chicago", "atlanta", "new york",
    "seattle", "san jose", "phoenix", "las vegas", "denver",
  ],
  "Brazil": [
    "são paulo", "sao paulo", "rio de janeiro", "brasilia", "campinas",
  ],
};

// ── Country grid context ──────────────────────────────────────────────────────
// Brief grid context injected into prompts to ground the AI per-country.
const COUNTRY_GRID_CONTEXT: Record<string, string> = {
  "United Kingdom":
    "National Grid ESO operates the GB transmission system. Key metrics: ~700 GW connection queue, Ofgem connection reform active, CNI designation speeds planning in some cases. ENTSO-E bidding zone: GB.",
  "Ireland":
    "EirGrid operates the Irish transmission system. Dublin cluster has capacity constraints; Government moratorium on new large Dublin DCs. ENTSO-E bidding zone: IE.",
  "France":
    "RTE operates the French transmission system. Strong nuclear baseload (~70% of generation). Government AI investment plan €109bn (2025). ENTSO-E bidding zone: FR.",
  "Germany":
    "50Hertz, Amprion, TenneT DE, TransnetBW operate German TSOs. Energiewende driving renewable buildout. Frankfurt/Rhine-Main is primary DC hub. ENTSO-E bidding zones: DE-LU.",
  "Netherlands":
    "TenneT NL operates Dutch grid. Amsterdam (AMS-IX) is major internet exchange. Government scrutiny on DC power consumption. ENTSO-E bidding zone: NL.",
  "Belgium":
    "Elia operates the Belgian transmission system. Dense interconnection with France, Netherlands, Germany. ENTSO-E bidding zone: BE.",
  "Denmark":
    "Energinet operates Danish grid. ~80%+ renewable (wind). Copenhagen is primary DC hub. ENTSO-E bidding zones: DK1 (West), DK2 (East).",
  "Sweden":
    "Svenska kraftnät (SvK) operates Swedish grid. Large renewable surplus in north; Stockholm cluster in south. Brookfield €9.3bn, Microsoft €3.2bn committed. ENTSO-E bidding zones: SE1-SE4.",
  "Norway":
    "Statnett operates Norwegian grid. ~88% hydropower, cheap & clean. Price zones NO1-NO5. OpenAI €1bn committed. ENTSO-E bidding zones: NO1-NO5.",
  "Finland":
    "Fingrid operates Finnish grid. Strong hydro + nuclear + wind. Helsinki and Tampere are primary DC locations. ENTSO-E bidding zone: FI.",
  "Spain":
    "Red Eléctrica de España (REE/REE ESIOS) operates Spanish grid. 57% renewable (2023), targeting 81% by 2030. Madrid is primary DC hub. Cross-Pyrenees interconnection limited. ENTSO-E bidding zone: ES.",
  "Portugal":
    "REN operates Portuguese grid. High renewable share. Start Campus €8.5bn committed. Atlantic connectivity advantage. ENTSO-E bidding zone: PT.",
  "Italy":
    "Terna operates Italian grid. Milan (MXP) is primary DC hub. Average connection application 140 MW+ (hyperscale-class). ENTSO-E bidding zones: IT-North, IT-South, IT-CNOR, IT-CSUD, IT-Sardinia, IT-Sicily.",
  "Poland":
    "PSE operates Polish grid. Growing DC market; Warsaw is primary hub. High coal share but rapidly adding renewables. ENTSO-E bidding zone: PL.",
  "Switzerland":
    "Swissgrid operates Swiss grid. Hydro dominant, very clean grid. Strict data protection (FADP). ENTSO-E bidding zone: CH.",
  "Austria":
    "APG operates Austrian grid. High hydro share. Vienna is primary DC location. ENTSO-E bidding zone: AT.",
  "United States":
    "NERC oversees US grid reliability; regional ISOs include PJM, MISO, ERCOT, CAISO, NYISO. Northern Virginia (Ashburn) is world's largest DC market. Power constraints severe in some regions.",
  "Brazil":
    "ONS operates the National Interconnected System (SIN). São Paulo metro is primary DC cluster. High renewable share (hydro + wind + solar). ANEEL regulates electricity.",
};

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

// ── Scope validation ──────────────────────────────────────────────────────────

/**
 * Returns true if the candidate's location/region is consistent with one of
 * the target countries and does not contain tokens from a different country.
 */
function isSiteInScope(
  candidate: { country: string; location: string; region: string },
  targetCountries: string[],
): boolean {
  const countryNorm = candidate.country.toLowerCase().trim();
  const targetNorms = targetCountries.map((c) => c.toLowerCase().trim());

  // The country field must match one of the target countries
  const countryMatches = targetNorms.some(
    (tc) =>
      countryNorm === tc ||
      countryNorm.includes(tc) ||
      tc.includes(countryNorm),
  );
  if (!countryMatches) return false;

  // Build exclusion tokens from countries that are NOT in the target list
  const combined = `${candidate.location} ${candidate.region}`.toLowerCase();
  for (const [country, tokens] of Object.entries(COUNTRY_PLACE_TOKENS)) {
    const cNorm = country.toLowerCase();
    const isTarget = targetNorms.some((tc) => tc === cNorm || tc.includes(cNorm) || cNorm.includes(tc));
    if (isTarget) continue; // Don't exclude tokens from countries we're targeting

    for (const token of tokens) {
      if (combined.includes(token)) {
        return false; // Location mentions a place in a non-target country
      }
    }
  }

  return true;
}

/** Filters out any candidate not in scope; logs warnings for rejected sites. */
function filterToScope(candidates: SiteCandidate[], targetCountries: string[]): SiteCandidate[] {
  const passed: SiteCandidate[] = [];
  const rejected: string[] = [];

  for (const c of candidates) {
    if (isSiteInScope(c, targetCountries)) {
      passed.push(c);
    } else {
      rejected.push(`${c.location}, ${c.country}`);
    }
  }

  if (rejected.length > 0) {
    console.warn(
      `[ResearchAgent] Scope filter rejected ${rejected.length} out-of-scope site(s): ${rejected.join(" | ")}`,
    );
  }
  return passed;
}

/** Maps the AI-returned country string to the canonical name from targetCountries. */
function resolveCanonicalCountry(
  aiCountry: string,
  targetCountries: string[],
): string {
  const norm = aiCountry.toLowerCase().trim();
  const match = targetCountries.find((tc) => {
    const tcNorm = tc.toLowerCase().trim();
    return norm === tcNorm || norm.includes(tcNorm) || tcNorm.includes(norm);
  });
  return match ?? targetCountries[0]; // fall back to first target if unresolvable
}

// ── Region target ─────────────────────────────────────────────────────────────

interface RegionTarget {
  region: string;   // e.g. "London & Thames Valley", "Paris Region", "Rhine-Main"
  country: string;  // canonical country name from targetCountries
}

// ── Step 1: Screen regions within target countries ────────────────────────────
async function screenRegions(
  openai: OpenAI,
  request: SiteSelectionRequest,
): Promise<RegionTarget[]> {
  const { targetCountries } = request;
  const scopeLabel = targetCountries.join(", ");
  const gridContext = targetCountries
    .map((c) => COUNTRY_GRID_CONTEXT[c])
    .filter(Boolean)
    .join("\n");

  const additionalHint = request.additionalRequirements
    ? `\nAdditional requirements: ${request.additionalRequirements}`
    : "";

  // Ask for 2-3 regions per country, capped at 8 total
  const perCountryTarget = targetCountries.length === 1 ? 5 : 3;

  const prompt = `You are an expert data centre site selection consultant.

SCOPE CONSTRAINT: Research ONLY the following ${targetCountries.length > 1 ? "countries" : "country"}: ${scopeLabel}.
Do NOT suggest, mention, or return any sites outside these countries. If the user specified "UK", research only the United Kingdom, not Ireland or any other country. If the user specified "France", research only France. Respect the exact scope — do not expand it.

Grid context for the target ${targetCountries.length > 1 ? "countries" : "country"}:
${gridContext || "Use your embedded knowledge of the power infrastructure in these countries."}

Identify the best DC regions within ${scopeLabel} for a deployment with these requirements:
- Power: ${request.powerRequirementMW} MW
- Renewable target: ${request.sustainabilityTarget}%
- Grid connection timeline: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}
${additionalHint}

Return ${perCountryTarget} regions per country (maximum ${perCountryTarget * targetCountries.length} total).
Consider: grid capacity, connection queue depth, renewable access, power pricing, planning speed, cooling climate.

Return JSON only:
{
  "regions": [
    { "region": "name of DC cluster or power zone", "country": "exact country name from scope", "rationale": "brief reason" },
    ...
  ]
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a data centre site selection specialist. Your current research scope is STRICTLY LIMITED to: ${scopeLabel}. Do not suggest or return any sites outside these countries under any circumstances.`,
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const rawRegions: Array<{ region: string; country: string }> = raw.regions ?? [];

  // Hard filter: only keep regions whose country resolves to one of the targets
  const filtered: RegionTarget[] = rawRegions
    .filter((r) => {
      const cNorm = (r.country ?? "").toLowerCase().trim();
      return targetCountries.some((tc) => {
        const tcNorm = tc.toLowerCase().trim();
        return cNorm === tcNorm || cNorm.includes(tcNorm) || tcNorm.includes(cNorm);
      });
    })
    .map((r) => ({
      region: r.region,
      country: resolveCanonicalCountry(r.country, targetCountries),
    }))
    .slice(0, perCountryTarget * targetCountries.length);

  // Fallback: if AI returned nothing valid, create generic per-country entries
  if (filtered.length < targetCountries.length) {
    console.warn("[ResearchAgent] screenRegions returned insufficient results — using fallback regions");
    const fallback: RegionTarget[] = [];
    for (const country of targetCountries) {
      if (!filtered.some((r) => r.country === country)) {
        fallback.push({ region: `${country} primary DC cluster`, country });
      }
    }
    return [...filtered, ...fallback];
  }

  return filtered;
}

// ── Step 2: Fetch live data ───────────────────────────────────────────────────
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

// ── Step 3: Deep-dive per region ──────────────────────────────────────────────
const siteAnalysisOutputSchema = z.object({
  sites: z.array(
    z.object({
      location: z.string(),
      region: z.string(),
      lat: z.number().optional(),
      lng: z.number().optional(),
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

async function analyseRegion(
  openai: OpenAI,
  target: RegionTarget,
  liveData: LiveDataContext,
  request: SiteSelectionRequest,
): Promise<SiteCandidate[]> {
  const gridCtx = COUNTRY_GRID_CONTEXT[target.country] ?? "";
  const liveSection =
    liveData.entsoe || liveData.worldBank
      ? `\nLIVE GRID DATA FOR ${target.country.toUpperCase()}:\n${liveData.entsoe}\n${liveData.worldBank}`
      : `\nNo live grid data available — use embedded knowledge of ${target.country}.`;

  const prompt = `You are an expert on power infrastructure and data centre site selection in ${target.country}.

SCOPE CONSTRAINT: You must ONLY identify sites physically located within ${target.country}, specifically within the "${target.region}" area. Do not suggest sites in any other country.

Grid context: ${gridCtx}

Identify the 2 best specific sites within "${target.region}", ${target.country} for a data centre deployment:
- Power requirement: ${request.powerRequirementMW} MW
- Minimum renewable energy: ${request.sustainabilityTarget}%
- Connection timeline target: within ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}
${liveSection}

Score ALL scoreBreakdown fields 0-100 (100 = perfectly meets requirements):
- power: can the local grid deliver the required MW capacity?
- renewable: does renewable access meet or exceed the sustainability target?
- cost: how competitive are power prices vs the national average for ${target.country}?
- regulatory: how fast/predictable is the permitting and grid connection process here?
- risk: how low is the overall risk profile (grid stress, planning refusal history, hazards)?

Return JSON only — location and region MUST be within ${target.country}:
{
  "sites": [
    {
      "location": "specific city or area within ${target.country}",
      "region": "sub-national area within ${target.country}",
      "lat": WGS84 decimal latitude (e.g. 51.5074),
      "lng": WGS84 decimal longitude (e.g. -0.1278),
      "gridCapacityMW": number,
      "renewableAccessPercent": number,
      "estimatedPriceMWh": number,
      "connectionTimelineMonths": number,
      "averagePUE": number,
      "coolingAdvantage": "Significant|Moderate|Limited",
      "scoreBreakdown": { "power": 0-100, "renewable": 0-100, "cost": 0-100, "regulatory": 0-100, "risk": 0-100 },
      "keyStrengths": ["..."],
      "keyRisks": ["..."],
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
        content: `You are a data centre site selection specialist. Your scope is STRICTLY LIMITED to ${target.country}. Do not suggest or return any sites outside ${target.country} under any circumstances.`,
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const parsed = siteAnalysisOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  // Fetch live grid data to populate liveDataSnapshot with price trends
  let snapshot: SiteRecommendation["liveDataSnapshot"] = undefined;
  if (liveData.entsoe) {
    try {
      const { getGridAnalysis } = await import("./dataCentreSites/entsoeGrid");
      const gridData = await getGridAnalysis(target.country, target.region);
      snapshot = {
        currentPriceMWh: gridData.currentPriceMWh,
        priceTrendMonthly: gridData.priceTrendMonthly,
        priceCurrency: gridData.priceCurrency,
        renewableSharePercent: gridData.renewableSharePercent,
        dataFetchedAt: new Date().toISOString(),
      };
    } catch {
      snapshot = { dataFetchedAt: new Date().toISOString() };
    }
  }

  return parsed.data.sites.slice(0, 2).map((site) => ({
    ...site,
    // Force-set country to the canonical target country — never trust AI-returned country
    country: target.country,
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
): Promise<{
  rankings: Array<{ location: string; country: string; rank: number; overallScore: number }>;
  executiveSummary: string;
  methodology: string;
}> {
  const scopeLabel = request.targetCountries.join(" and ");

  const candidateSummary = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.location}, ${c.country}: power=${c.scoreBreakdown.power}, renewable=${c.scoreBreakdown.renewable}, cost=${c.scoreBreakdown.cost}, regulatory=${c.scoreBreakdown.regulatory}, risk=${c.scoreBreakdown.risk}. Grid: ${c.gridCapacityMW} MW. Renewable: ${c.renewableAccessPercent}%. Price: €${c.estimatedPriceMWh}/MWh. Timeline: ${c.connectionTimelineMonths}mo.`,
    )
    .join("\n");

  const prompt = `You are a senior data centre investment advisor synthesising a site selection analysis for: ${scopeLabel}.

SCOPE CONSTRAINT: All candidate sites are within ${scopeLabel}. Do not introduce or reference any sites outside this scope.

Client requirements:
- Power: ${request.powerRequirementMW} MW
- Renewable target: ${request.sustainabilityTarget}%
- Timeline: ${request.timelineMonths} months
- Budget sensitivity: ${request.budgetSensitivity}

Candidate sites assessed (all within ${scopeLabel}):
${candidateSummary}

Tasks:
1. Rank all ${candidates.length} sites from best to worst. Calculate a weighted overallScore (0-100):
   - power and renewable weighted most heavily if sustainability target is high
   - cost weighted heavily if budget sensitivity is High
   - regulatory and risk are always material
2. Write a 3-4 sentence executive summary for the top recommendation with country-specific grid context.
3. Write a 2-sentence methodology note.

Return JSON only:
{
  "rankedSites": [
    { "rank": 1, "location": "...", "country": "exact country from scope", "overallScore": 0-100 },
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
        content: `You are a data centre site selection specialist. Your research scope is STRICTLY LIMITED to: ${scopeLabel}. Do not suggest or mention sites outside this scope.`,
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = JSON.parse(resp.choices[0].message.content ?? "{}");
  const parsed = synthesisOutputSchema.safeParse(raw);

  if (!parsed.success) {
    // Fallback: rank by average score
    const fallback = candidates
      .map((c) => {
        const avg =
          (c.scoreBreakdown.power +
            c.scoreBreakdown.renewable +
            c.scoreBreakdown.cost +
            c.scoreBreakdown.regulatory +
            c.scoreBreakdown.risk) /
          5;
        return {
          rank: 0,
          location: c.location,
          country: c.country,
          overallScore: Math.round(avg),
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    return {
      rankings: fallback,
      executiveSummary: `Analysis identified ${candidates.length} candidate sites across ${scopeLabel}. Top recommendation is ${fallback[0]?.location}, ${fallback[0]?.country} based on overall scoring.`,
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
  const scopeLabel = request.targetCountries.join(", ");

  // Emit scope info so the client can display it immediately
  emit(job, "scope", { countries: request.targetCountries, scopeLabel });
  console.log(`[ResearchAgent] Active country constraint: ${scopeLabel}`);

  try {
    // ── Step 1: Screen regions ─────────────────────────────────────────────
    const s1Start = Date.now();
    stepStart(
      job,
      1,
      `Screening regions in ${scopeLabel}`,
      `Identifying best-fit power regions within ${scopeLabel}`,
    );

    let regionTargets: RegionTarget[];
    try {
      regionTargets = await screenRegions(openai, request);
    } catch (err: any) {
      stepError(job, 1, err.message ?? "Screening failed");
      throw err;
    }

    const s1Duration = Date.now() - s1Start;
    const regionSummary = regionTargets.map((r) => `${r.region} (${r.country})`).join(", ");
    completedSteps.push({
      step: 1,
      title: `Screening regions in ${scopeLabel}`,
      description: `Identified best-fit power regions within ${scopeLabel}`,
      durationMs: s1Duration,
      outputSummary: `Shortlisted ${regionTargets.length} regions: ${regionSummary}`,
    });
    stepComplete(job, 1, `Screening regions in ${scopeLabel}`, s1Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 2: Fetch live data ────────────────────────────────────────────
    const s2Start = Date.now();
    stepStart(
      job,
      2,
      "Fetching live grid data",
      `Pulling ENTSO-E and World Bank data for ${scopeLabel}`,
    );

    const liveData = await fetchLiveData(request.targetCountries);

    const s2Duration = Date.now() - s2Start;
    const liveCount = Object.values(liveData).filter((d) => d.entsoe || d.worldBank).length;
    completedSteps.push({
      step: 2,
      title: "Fetching live grid data",
      description: "Pulled real-time grid data",
      durationMs: s2Duration,
      outputSummary:
        liveCount > 0
          ? `Live data retrieved for ${liveCount}/${request.targetCountries.length} countries`
          : `Using embedded grid knowledge (live data unavailable for ${scopeLabel})`,
    });
    stepComplete(job, 2, "Fetching live grid data", s2Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 3: Parallel site analysis ────────────────────────────────────
    const s3Start = Date.now();
    stepStart(
      job,
      3,
      "Analysing candidate sites",
      `Running deep-dive analysis across ${regionTargets.length} regions in ${scopeLabel}`,
    );

    const analysisResults = await Promise.allSettled(
      regionTargets.map((target) =>
        analyseRegion(
          openai,
          target,
          liveData[target.country] ?? { entsoe: "", worldBank: "" },
          request,
        ),
      ),
    );

    const rawCandidates: SiteCandidate[] = analysisResults
      .filter((r): r is PromiseFulfilledResult<SiteCandidate[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // ── Hard scope filter ──────────────────────────────────────────────────
    const allCandidates = filterToScope(rawCandidates, request.targetCountries);

    if (allCandidates.length === 0) {
      throw new Error(`No valid candidate sites found within ${scopeLabel}`);
    }

    const s3Duration = Date.now() - s3Start;
    const countriesFound = [...new Set(allCandidates.map((c) => c.country))].join(", ");
    completedSteps.push({
      step: 3,
      title: "Analysing candidate sites",
      description: "Deep-dive site analysis complete",
      durationMs: s3Duration,
      outputSummary: `Identified ${allCandidates.length} candidate sites in ${countriesFound}`,
    });
    stepComplete(job, 3, "Analysing candidate sites", s3Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Step 4: Synthesis ─────────────────────────────────────────────────
    const s4Start = Date.now();
    stepStart(job, 4, "Ranking and synthesising", "Producing final ranked recommendations");

    const synthesis = await synthesiseResults(openai, allCandidates, request);

    // Merge rankings with candidate detail; force canonical country name
    const rankedSites: SiteRecommendation[] = synthesis.rankings
      .map((ranking) => {
        const candidate = allCandidates.find(
          (c) => c.location === ranking.location && c.country === ranking.country,
        );
        if (!candidate) return null;

        // Resolve canonical country from targetCountries
        const canonicalCountry = resolveCanonicalCountry(ranking.country, request.targetCountries);

        return {
          rank: ranking.rank,
          country: canonicalCountry,
          location: candidate.location,
          region: candidate.region,
          lat: candidate.lat,
          lng: candidate.lng,
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
      outputSummary: `Ranked ${rankedSites.length} sites across ${scopeLabel}. Top pick: ${rankedSites[0]?.location}, ${rankedSites[0]?.country} (score: ${rankedSites[0]?.overallScore})`,
    });
    stepComplete(job, 4, "Ranking and synthesising", s4Duration, completedSteps[completedSteps.length - 1].outputSummary);

    // ── Persist & complete ────────────────────────────────────────────────
    const content: SiteSelectionContent = {
      generatedAt: new Date().toISOString(),
      agentSteps: completedSteps,
      shortlistedCountries: request.targetCountries,
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
      console.error("Content validation failed:", validated.error.errors);
      throw new Error("Generated content failed schema validation");
    }

    const reportId = await persist(validated.data);

    job.status = "complete";
    job.reportId = reportId;
    emit(job, "complete", { reportId });

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
