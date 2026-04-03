import type { Express } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { powerTrendContentSchema, GIGLABS_COUNTRIES } from "@shared/schema";
import OpenAI from "openai";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { registerImageRoutes } from "./replit_integrations/image/routes";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import { isAuthenticated } from "./auth/setup";

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerAudioRoutes(app);

  // Power Trends API
  app.post(api.powerTrends.generate.path, isAuthenticated, async (req, res) => {
    try {
      const { country } = z.object({ country: z.string() }).parse(req.body);
      const forceRefresh = req.query.forceRefresh === 'true';

      if (!GIGLABS_COUNTRIES.includes(country as any)) {
        return res.status(400).json({ message: "Invalid country selection" });
      }

      if (!forceRefresh) {
        const existing = await storage.getLatestPowerTrendAnalysisByCountry(country);
        if (existing && existing.createdAt) {
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          if (new Date(existing.createdAt) > oneMonthAgo) {
            return res.status(200).json(existing);
          }
        }
      }

      // Fetch World Bank macro indicators and live ENTSO-E data in parallel
      let worldBankContext = "";
      let liveEntsoeContext = "";

      await Promise.allSettled([
        // World Bank indicators
        (async () => {
          try {
            const { getCountryIndicators, formatIndicatorsForPrompt } = await import("./worldBankData");
            const wbResult = await getCountryIndicators(country);
            if (wbResult) worldBankContext = formatIndicatorsForPrompt(wbResult);
          } catch (e: any) {
            console.warn("Could not fetch World Bank indicators for prompt:", e.message);
          }
        })(),

        // ENTSO-E prices & generation
        (async () => {
          try {
        const { getCountryDayAheadPrices, getCountryGeneration, isEntsoeConfigured } = await import("./entsoe");
        if (isEntsoeConfigured()) {
          const [priceData, genData] = await Promise.allSettled([
            getCountryDayAheadPrices(country),
            getCountryGeneration(country),
          ]);

          const prices = priceData.status === "fulfilled" ? priceData.value : null;
          const gen = genData.status === "fulfilled" ? genData.value : null;

          if (prices && prices.monthly.length > 0) {
            const recent = prices.monthly.slice(-6);
            const annualLines = Object.entries(prices.annualAvg)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([yr, avg]) => `${yr}: €${avg.toFixed(2)}/MWh`)
              .join(" | ");
            const monthlyLines = recent
              .map(m => `${m.year}-${String(m.month).padStart(2,"0")}: avg €${m.avgEurMwh.toFixed(2)} (min €${m.minEurMwh.toFixed(2)}, max €${m.maxEurMwh.toFixed(2)})`)
              .join("\n");
            liveEntsoeContext += `\nLIVE ENTSO-E DAY-AHEAD PRICES — ${country} (fetched ${new Date().toISOString().slice(0,10)}, ${prices.currency}/MWh):\nAnnual averages: ${annualLines}\nRecent 6 months:\n${monthlyLines}\nLatest day avg: ${prices.latestDayAvg != null ? `€${prices.latestDayAvg.toFixed(2)}/MWh (${prices.latestDayDate})` : "N/A"}\n`;
          }

          if (gen && gen.fuels.length > 0) {
            const topFuels = gen.fuels.slice(0, 8)
              .map(f => `${f.fuelType}: ${f.avgMw.toLocaleString()} MW avg`)
              .join(", ");
            liveEntsoeContext += `LIVE ENTSO-E GENERATION MIX — ${country} (last 30 days, ${gen.period}):\n${topFuels}\nRenewable share: ${gen.renewableSharePct}%\n`;
          }
        }
          } catch (e: any) {
            console.warn("Could not fetch live ENTSO-E data for prompt:", e.message);
          }
        })(),
      ]);

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-5.1",
        messages: [
          {
            role: "system",
            content: `You are an energy market analyst specialising in power infrastructure for data centre deployments in ${country}. Generate a comprehensive Power Trends analysis for ${country} covering power distribution, availability, capacity, grid constraints, and regulatory trends relevant to data centre site selection.

CONTEXT - This analysis serves two audiences:
1. INVESTORS evaluating data centre market opportunities and risks
2. DATA CENTRE PROVIDERS (including hyperscalers) assessing locations for HPC, cloud, and AI deployments

KEY RESEARCH INSIGHTS TO INCORPORATE:

GLOBAL DATA CENTRE ENERGY DEMAND:
- Goldman Sachs forecasts global data centre power demand to increase 50% by 2027 and 165% by 2030 vs 2023
- Current global data centre market power is approximately 55 GW (cloud 54%, traditional 32%, AI 14%)
- By 2027, AI is projected to grow to 27% of overall data centre power market
- Data centre occupancy rates projected to peak above 95% in late 2026
- IEA reports data centres consumed ~415 TWh globally in 2024 (~1.5% of world electricity), projected to reach ~945 TWh by 2030
- IEA estimates around 20% of planned data centre projects could face delays due to grid constraints unless addressed
- Global data centre electricity consumption has grown ~12% per year since 2017 (4x faster than total electricity consumption)
- US accounts for 45% of global DC electricity consumption, China 25%, Europe 15% (IEA 2025)
- EDNA/IEA 4E Total Energy Model 4.0 projects global DC energy consumption reaching 650-1,050 TWh by 2030 depending on AI growth assumptions
- Average global PUE has stagnated around 1.55-1.6 since 2013 despite earlier improvements from 2.5 in 2007 (Uptime Institute/CSA Catapult)

BP ENERGY OUTLOOK 2025 (scenario modelling across ~400,000 data observations):
- AI and data centres are now one of the largest upside uncertainties in BP's global energy model — included as a key driver in both the Current Trajectory and Below 2°C scenarios
- Energy efficiency gains in data centres remain "lacklustre" overall: despite PUE improvements in premium facilities, growth in AI-driven energy consumption outpaces efficiency gains across the installed base
- Emergence of 'Electrostates': countries that reduce fossil fuel import dependency by accelerating domestic renewable electrification — Norway, Sweden, Iceland are archetypes; this trend increases the relative attractiveness of renewables-rich DC markets for ESG-driven operators
- Geopolitical tensions are refocusing energy security priorities: increasing tariffs, sanctions, and supply chain fragmentation affecting energy costs and supply reliability for DC operators — sovereignty risk is elevated
- CO₂ budget warning: if global emissions remain at current trajectory for the next 10 years, the 2°C target becomes "increasingly challenging and costly" — driving regulatory urgency around DC carbon reporting and efficiency mandates
- In BP's scenarios, power sector electricity demand growth from AI data centres is the single fastest-growing category in developed economies through 2030; DC power demand competes directly with residential electrification and industrial decarbonisation for grid capacity

IEA 4E TCP CRITICAL REVIEW — METHODOLOGY GUIDANCE (March 2025, most rigorous published evaluation of DC energy estimates):
- Wide-ranging estimates create confusion for investors: 2030 DC energy projections in published literature range from just over 200 TWh to nearly 8,000 TWh — a factor of 40× spread
- High-quality studies (22 publications reviewed) show a narrower 2023 range: 210–440 TWh actual consumption; low-quality temporal extrapolation studies produce the widest and most misleading estimates
- Key finding for analysts: modelling methodology is the strongest predictor of estimate reliability — temporal extrapolation is least reliable; aggregated-totals (top-down) and validated bottom-up models are most reliable
- Author affiliation (industry vs. government vs. academia) is NOT a reliable predictor of estimate quality; methodology disclosure matters more than who funded the study
- AI energy projections are particularly uncertain: hardware efficiency improvements (e.g. NVIDIA H100→H200→B200 transition) are compressing energy-per-inference but compute volumes are growing faster — net effect debated
- Historical lesson: early-2000s PC boom predictions overestimated DC energy growth; 2019 "tsunami of data" predictions also proved too high — but the current AI compute surge involves fundamentally different hardware density and is widely considered structurally different

DC BYTE GLOBAL DATA CENTRE INDEX 2025 (proprietary dataset, 7,500+ facilities tracked):
- Global live supply grew 26 GW from 2019 to 2024 — a 30% faster rate of growth than the 2018–2023 period; new capacity delivered each year has increased 2.2x since 2019
- Rate of new schemes commencing construction grew 4x from 2019–2024, but growth of the Under Construction pipeline has slowed in the past 18 months — a clear bottleneck
- New committed schemes in 2024 increased 3.7x since 2019, far outpacing growth in Live and Under Construction capacity — demonstrating demand running ahead of deliverable supply
- Global take-up reached 12,975 MW in 2024 (+29.8% vs 2023), an unbroken chain of year-on-year increases since 2015; public cloud = 52% of take-up, AI = 11% (roughly doubling annually since 2022)
- Space sold before construction commenced increased 33x since 2019; space sold under construction increased 2.8x — hyperscalers locking in capacity years in advance
- US accounted for 62% of new live supply in 2024 (up from 50% in 2023); Americas = 87% of total DC Byte tracked capacity is in the United States
- Vacancy rates in some mature hubs fallen below 1%; hyperscalers securing power and land 24–36 months before delivery in constrained regions
- Emerging growth corridors: US Southeast (Georgia, North Carolina, Alabama), Southern Europe, South and Southeast Asia — driven by available power, lower land costs, pro-investment policy
- Northern Virginia alone is the world's largest hyperscale data centre market; Dominion Energy projects connecting projects >100 MW could take up to 7 years

HYPERSCALE LEASING & BUILD TRENDS (DC Byte Hyperscale Build Race, 2025):
- Entire campuses are now pre-leased before construction begins; partnerships between operators, utilities and suppliers are becoming standard
- Self-builds dominate in power-rich regions (Nordics, US Southeast); build-to-suit and modular design enable faster deployment in constrained markets
- EMEA: pre-leasing dominance and increasing shift toward partnership models as FLAP-D constraints intensify
- Americas: power constraints driving early leasing with larger individual commitments per deal (>100 MW blocks now common)
- Power access has become the single greatest determinant of delivery speed globally

EUROPEAN MARKET:
- European electricity markets seeing increasing negative prices from renewable buildout
- Electricity demand from data centres in Europe projected to grow from 96 TWh (2024) to 168 TWh by 2030 and 236 TWh by 2035 — nearly +150% (Ember)
- In legacy FLAP-D hubs (Frankfurt, London, Amsterdam, Paris, Dublin), data centres consumed 33-42% of local electricity in 2023; Dublin nearly 80% (Ember)
- Nordic and Southern European countries with uncongested grids expected to see data centre demand grow +110%, nearly double the rate of FLAP-D hubs (+55%) by 2030
- By 2035, half of Europe's data centre capacity will be located outside traditional hubs as developers shift to new markets
- EMEA operational data centre capacity totals 11.4 GW, with 2.7 GW under construction and 12.1 GW planned (26.2 GW combined) (Cushman & Wakefield H2 2025)
- Nordic countries account for 2.0 GW operational capacity (+43% YoY), with 513 MW under construction and 1.44 GW planned
- Grid connection for data centres takes an average of 7-10 years in legacy hubs; smarter connection agreements could reduce this to 1 year (Ember)
- Europe currently has only ~25 W installed per capita vs ~140 W per capita in the US — a 5.6× gap; to reach US levels in 10 years Europe would need 19% annual growth, even assuming no US expansion (KPMG 2026)
- European supply chain growth for DC infrastructure: +9% (9M 2024 vs 9M 2025) vs Americas +16% — even European-headquartered companies seeing fastest growth in the US
- Selected major hyperscale capital commitments in Europe (not exhaustive, KPMG 2026): UK (Microsoft, AWS, Google, Blackstone each ~€30bn 2024–2025); Germany (AWS €17bn, Google €5.5bn, Microsoft €3.2bn); France (UAE+ €40bn, Brookfield €20bn); Spain/Portugal (AWS €15.7bn, Start Campus €8.5bn, Microsoft €2.1bn); Italy (Microsoft €4.3bn, Apto €3.4bn); Sweden (Brookfield €9.3bn, Microsoft €3.2bn); Norway (OpenAI €1bn)
- Industry frustration mounting over gap between announcements and actual delivery — construction and engineering executives consistently highlight this execution gap
- France national AI investment plan: €109 billion committed (2025), among the largest per-country AI investment packages globally; CMA Regulators index France as one of the fastest-improving DC regulatory environments in Europe
- Netherlands DC and cloud industry accounts for 20% of all FDI in the Netherlands — the single largest sector for inbound foreign direct investment, highlighting the economic centrality of digital infrastructure (Ember, 2025)
- Italy: Italian TSO Terna reports average data centre grid connection applications of 140 MW+ — far exceeding European average application sizes, confirming Italy is attracting hyperscale-class demand, not merely retail colocation; Milan (MXP) is the primary hub
- Norway: data centres added €240 million to the Norwegian economy in 2023 — high economic value per unit of consumption; exceeds that of traditional power-intensive industries (chemicals/aluminium) on a per-TWh basis (Ember, 2025)
- Sweden and Denmark: DC electricity demand expected to triple by 2030 (Ember, 2025), driven by hyperscale investment and Nordic renewable cost advantage; tripling rate compares to +55% for FLAP-D hubs and +110% for broader Nordic/Southern Europe (Ember)

NORWAY-SPECIFIC DATA (use when country is Norway):
- Norway generates ~88% of electricity from hydropower, ~13% from wind (2024, NVE); among the cheapest and cleanest grids in Europe
- NVE installed capacity: Hydro 31.5 GW, Wind onshore 6.2 GW, Thermal 0.6 GW — total ~38.3 GW for a population of 5.5 million; enormous per-capita surplus
- Annual generation trend: 2021 peak 171 TWh (hydro surplus), 2023 drought low 149 TWh (hydro 128.7 TWh + wind 18.8 TWh) — DC operators must plan for ±15% year-on-year hydro variability
- Wind growing rapidly: 5.5 TWh (2019) → 20.5 TWh (2024), providing important seasonal complement to winter hydro drawdown
- DC demand tripling by 2030; key markets: Oslo/Lysaker (NO1), Bergen (NO5), Trondheim (NO3), repurposed aluminium smelting sites (Hydro/Norsk Hydro legacy infrastructure)
- OpenAI committed €1 billion; Bulk Infrastructure, Green Mountain active; Google long-established (NoreGeo/IEEE 2026 geographic dataset documents full grid topology by municipality)
- NordLink (Norway–Germany, 1.4 GW) and NSL (Norway–UK, 1.4 GW) interconnectors create European price linkage — Norwegian prices rose post-2021 due to export to Europe during energy crisis
- Cool climate enables free air cooling almost year-round, reducing PUE to near 1.1 for well-designed facilities; water stress near-zero (unlike SE England or Mediterranean sites)
- No significant moratorium risk; Norwegian government actively courting sustainable DC investment; grid connection timelines typically 2-4 years for large loads
NORWAY ELECTRICITY PRICE ZONES (NO1–NO5) — CRITICAL FOR DC SITE SELECTION:
- NO1 (Southeast/Oslo): Largest demand zone; most interconnected to SE and DK; ~€52/MWh avg 2024; best for low-latency applications and hyperscale connectivity; Lysaker/Fornebu DC cluster
- NO2 (Southwest/Kristiansand): NordLink to Germany and NSL to UK land here; often more price-volatile due to export flows; ~€48/MWh avg 2024; good for renewable PPA backed by export-linked hydro
- NO3 (Central/Trondheim): Growing onshore wind capacity; mid-range prices ~€43/MWh avg 2024; Trondheim emerging as secondary DC location for HPC; good PPA prospects
- NO4 (North/Tromsø): Historically cheapest zone (~€26/MWh avg 2024); large hydro + wind surplus vs. low local demand; KEY RISK: north–south transmission bottleneck (limited capacity to export south) means NO4 prices decouple from European market and can spike in export periods; best for cold-storage, HPC AI training with flexible scheduling
- NO5 (West/Bergen): Significant hydro; fjord geography limits large campus development; ~€46/MWh avg 2024; ferry cable routes to NO2/NO1

SWEDEN-SPECIFIC DATA (use when country is Sweden):
- Nordic electricity market (NordPool); Swedish DC demand tripling by 2030 (Ember); Stockholm and surrounding Kista tech corridor is primary DC cluster
- Brookfield committed €9.3 billion; Microsoft €3.2 billion in Swedish DC investments (KPMG 2026); Meta, Google, Amazon well-established
- 2023 Data Centre Strategy: streamlined planning permission for DC projects; district heating integration mandated for waste heat recovery in urban areas — heat reuse regulations among Europe's most progressive
- Green certificate (elcertifikat) system provides cost-effective renewable procurement for large consumers; wind power dramatically expanding in northern Sweden
- Free cooling advantage: sub-zero winters reduce cooling energy needs; PUEs of 1.1-1.2 routinely achieved
- Vattenfall grid subsidiary: progressive on large new loads; transmission from northern wind surplus to Stockholm requires grid reinforcement (SydVästlänken upgrade)

DENMARK-SPECIFIC DATA (use when country is Denmark):
- DC demand tripling by 2030 (Ember); Copenhagen metro is the primary DC hub and Nordic gateway for pan-European latency-sensitive workloads
- Meta's Odense hyperscale campus is one of Europe's largest single-site hyperscale facilities; Iron Mountain, Green Mountain established in market
- Denmark targeting 100% renewable electricity by 2030; already at ~80%+ from wind; Energinet's ancillary services markets well-developed — DCs with flexible loads can earn balancing revenues
- Offshore wind expansion in the North Sea making Denmark one of Europe's most renewable-intensive power systems
- Free cooling advantage similar to Sweden; district heating integration regulatory incentive applies; waste heat from DCs feeds Copenhagen district heating network
- Connection timelines: 2-4 years for large loads; grid more congested around Copenhagen than rural Jutland/Funen sites

SPAIN-SPECIFIC DATA (use when country is Spain):
- Spain's PNIEC (Plan Nacional Integrado de Energía y Clima) 2024 final version projects national electricity demand of 344 TWh by 2030, up from ~235 TWh in 2022 — a ~46% increase driven by electrification and green hydrogen electrolysers (11.98 GW ELYs) (PNIEC 2024 / PyPSA-Spain model)
- REE (Red Eléctrica de España) manages Spain's electricity system; real-time generation data via apidatos.ree.es API; breakdown: Wind, Solar PV, Solar CSP (Concentrated Solar Power), Hydro, Nuclear, CCGT Gas, Cogeneration, Coal
- Installed capacity (REE 2024): Wind ~30 GW, Solar PV ~28 GW, Solar CSP ~2.3 GW, Nuclear ~7.1 GW, Hydro ~17 GW — total ~125 GW installed, one of Europe's largest renewable capacity bases
- Renewable share: Spain reached 57% renewable generation in 2023, targeting 81% by 2030 under PNIEC; solar penetration is highest in Europe, driving negative/near-zero prices during summer midday periods
- ISA (Índice de Sostenibilidad Ambiental): Spain uses a 0–4 environmental sensitivity classification for wind and solar land eligibility — grid code 4 (lowest sensitivity, highest DC PPA development suitability), code 0 (highest environmental protection); DC operators evaluating long-term PPAs must assess ISA classification of prospective renewable sites (PyPSA-Spain model)
- Cross-Pyrenees interconnection constraint: France–Spain interconnection capacity is severely limited (~2.8 GW vs European target of 10% of installed capacity); this is a structural weakness for Spain's integration into European markets and can cause isolated price spikes during wind/solar lulls
- AWS €15.7 billion, Start Campus €8.5 billion, Microsoft €2.1 billion committed to Spain/Portugal (KPMG 2026); Madrid (MAD) is the primary DC hub with significant pipeline growth
- Madrid cluster: growing alternative to FLAP-D; lower land costs than Western European hubs; warm climate requires more active cooling (higher PUE than Nordic alternatives, typically 1.4–1.6); water stress risk in central Spain — closed-loop cooling essential
- Renewable PPA market maturity: excellent; Spain has Europe's most developed corporate PPA market for wind and solar; long-term PPAs at €35–55/MWh achievable for large DC operators
- Key regulatory advantage: Spain has no equivalent of Ireland's DC moratorium or Germany's pro-rata grid allocation — connections proceeding more openly, though medium-voltage grid reinforcement is often required outside Madrid
- ESIOS (Sistema de Información del Operador del Sistema): real-time and historical electricity data portal for Spain at esios.ree.es

UK-SPECIFIC DATA:
- Over 500 data centres in the UK, third highest globally (CSA Catapult, techUK)
- UK commercial data centre sector consumes 2.89 TWh/year (~0.8% of UK electricity supply); doubles when including enterprise DCs (techUK)
- UK data centres consumed 5.0 TWh in 2023 (~2% of UK demand), forecast to reach 26.2 TWh by 2030 (Oxford Economics)
- UK has approximately 2.9 GW of IT power capacity, with 6.2 GW additional planned by 2030
- Total UK DC investment since current government took office has surpassed £25 billion (CSA Catapult)
- UK-US tech partnership includes £31 billion for data centre capacity expansion
- UK data centre growth CAGR of ~3% (2017-2024), with realistic forecast reaching 600+ DCs by 2031 (CSA Catapult)
- Each new UK data centre contributes between £397M and £436M GVA per year (techUK)
- 70% of UK commercial data centre market is clustered in and around the M25; Manchester is the secondary cluster (techUK)
- National Grid NGED licence areas seeing significant new DC connection applications, with AI data centres requiring up to 500 MW+ per site
- AI data centres have more variable load profiles compared to conventional cloud/storage DCs which have relatively stable loads (National Grid/Regen)
- Secretary of State has overruled local rejections of 90 MW and 96 MW data centre developments (Buckinghamshire and Hertfordshire, 2025)
- UK grid connection queue has swelled beyond 700 GW, prompting milestone-based reforms to prioritise viable projects (KPMG 2026)

UK LONDON MARKET (DC Byte London 2024):
- Slough & West London: largest UK market with >1.4 GW total IT capacity; live capacity 2× larger than Docklands (277 MW total)
- Iver-B substation upgrade repeatedly delayed — power availability now not expected until 2030–2033; much of this capacity already pre-allocated
- Green Belt planning refusals continue (Greystoke Abbots Langley, West London Technology Park both refused, though now under review post-CNI status)
- East London emerging: Google (Broxbourne — 22 MW UC, 66 MW committed), Reef Group (The Foundry Havering — 600 MW early stage), NTT (London 1 — 32 MW live), Ada Infrastructure (Docklands — 210 MW committed)
- Operators moving to substations further afield despite higher infrastructure costs — some willing to fund their own grid connections
- Hyperscalers expanding beyond traditional AZs: Microsoft acquired Newport (Wales, near Vantage CWL-1 campus) and Skelton Grange/Eggborough (Yorkshire); Google acquired Thurrock and North Weald Airfield in East London
- Cardiff and Manchester/North also seeing pipeline activity; QTS/Blackstone active in Cambois (Northeast England)

UK CONNECTION PRODUCTS (UK Power Networks — covers London, SE & East England):
- Non-curtailable connection: full firm capacity 24/7, default product, appropriate for most DC use cases
- Ramped connection: initial lower capacity with contractual commitment to increase on agreed schedule; reduces charges in early years; may enable faster initial connection
- Flexible connection: non-firm capacity, curtailable via automated DERMS software when network congested; enables connection ahead of reinforcement; curtailment assessment reports provided at offer stage; Connections Lab tool available
- Profiled connection: suited to loads not requiring 24/7 full capacity (e.g. AI training workloads schedulable to off-peak); potentially faster and cheaper in high-utilisation network areas
- UK Power Networks receives >70,000 connection enquiries/year; offers "Ask the Expert" surgery for complex large DC connections

UK REGULATORY HORIZON (DCA Legislation Horizon Scan 2025–2027):
- Energy Act 2023: strengthens Ofgem powers, enables demand-side response, energy storage, and grid flexibility participation
- ESOS (Energy Savings Opportunity Scheme): mandatory for large organisations (250+ employees or >£44M turnover); requires energy audits
- SECR (Streamlined Energy and Carbon Reporting): large data centres must report energy use and emissions, driving scrutiny of PUE performance
- UK ETS: data centres with combustion systems >20 MW used regularly (not just emergency) are included; industry lobbying for exemption reform via techUK
- F-Gas regulations: UK has own devolved system, targeting 79% HFC phase-down by 2030 (same schedule as EU)
- Emerging: Net Zero Strategy targets electricity decarbonisation by 2035; Green Heat Network Fund incentivises heat recovery from DCs
- EU regulations with UK impact: GDPR/UK GDPR, NIS2 (UK clients), CBAM (carbon import taxes affecting DC construction embodied emissions), DORA (financial sector DCs)
- Watchlist: carbon pricing extension to electricity use; mandatory efficiency ratings (as in Singapore/EU); AI Regulation Bill (UK/EU divergence risk)
- GC2 delivery model emerging in UK/Ireland hyperscale projects: civil GC handles shell; M&E contractor (GC2) takes over for fitout, power infrastructure, and commissioning — gating item is HV grid energisation

SUBNATIONAL GB ELECTRICITY CONSUMPTION (DESNZ 2024):
- Total GB electricity consumption decreased in 97% of local authorities between 2015-2024
- Over two-thirds of local authorities experienced electricity consumption reductions greater than 10%
- Between 2022 and 2024, mean domestic electricity consumption rebounded 2.6% after record 8.9% fall in 2021-2022
- Regional variation in domestic electricity use: North East 15% below GB average, South West lowest gas use (12% below average)
- Non-domestic electricity consumption trends vary significantly by local authority, important for site selection analysis

REGULATORY & INFRASTRUCTURE:
- Ofgem ED3 framework (2028-2033) enabling proactive distribution network investment
- AI Growth Zones launched June 2025, offering streamlined planning and access to significant power connections (500 MW+)
- Data centres reclassified as Nationally Significant Infrastructure Projects (NSIP) in September 2024
- NESO transitional Regional Energy Strategic Plans (tRESP) providing consistent planning assumptions
- National Planning Policy Framework (Dec 2024) now includes direct references to data centre development
- Grid connection timelines and queue reforms significantly impacting data centre deployment speed
- Critical national infrastructure designation for data centres (UK, September 2024)
- EU has launched InvestAI to mobilise €200 billion for AI investments and set target to triple DC capacity in 5-7 years
- Ofcom reports full-fibre broadband now available to 69% of UK households; gigabit-capable coverage at 83% (Connected Nations 2024)
- 5G coverage expanding to 61-79% outside premises; 5G standalone sites increased to ~3,300

GERMANY-SPECIFIC DATA (use when country is Germany):
- Germany is home to DE-CIX, the world's largest internet exchange — recorded 34 exabytes of annual traffic in 2022 with nearly 1,100 connected networks
- Total supply across six German DC markets reached 3.5 GW as of Q4 2023 (DC Byte)
- Frankfurt dominates with ~74.7% of Germany's total IT capacity — a key European financial hub (ECB, Deutsche Bundesbank headquartered there)
- Frankfurt faces land and power constraints; 2022 master plan introduced 7 designated development areas, pushing operators further out of the city
- Berlin secondary market growing rapidly: 40% CAGR 2020–2023, driven by wholesale colocation (NTT, Vantage, VIRTUS, Prea); >90% of Berlin's new supply is wholesale colo
- Berlin advantages: cheaper land than Munich/Frankfurt, startup capital of Germany, positioned to serve Central and Eastern European demand
- Munich: smaller market (~5.2% of national capacity), 5% CAGR 2020–2023, dominated by retail colocation (Noris Network, Equinix, NTT)
- Dusseldorf: ~1.7% of national capacity, 88% retail colo/build-to-suit; Microsoft announced investment in North Rhine-Westphalia (2024) — will shift market toward self-build public cloud
- Hamburg and Stuttgart: very early stage, collectively <2% of national capacity
- Key investment commitments: AWS €17bn (2025), Google €5.5bn (2024), Microsoft €3.2bn (2024)
- Belgium case study relevant: Google entered in 2010, now fuels >60% of Belgian total IT capacity — illustrating how hyperscale self-build transforms smaller markets

GERMANY GRID INFRASTRUCTURE — MaStR LIVE DATA (Marktstammdatenregister, 2026-03-12):
[WIND CAPACITY BY STATE — 31,986 operational turbines, 88.83 GW total]
- Niedersachsen: 14.44 GW wind (5,821 turbines) — Germany's #1 wind state; Hannover and Bremerhaven corridors
- Schleswig-Holstein: 9.70 GW onshore + 9.55 GW AWZ offshore = 19.25 GW combined — onshore grid heavily loaded; HVDC export south underway
- Brandenburg: 9.56 GW wind (4,102 turbines) — strong PPA fundamentals; 43 large power consumers registered; key DC sites: Fürstenwalde, Neuruppin, Cottbus
- Nordrhein-Westfalen: 9.30 GW wind + 24.85 GW thermal = 34.15 GW combined; 187 of Germany's 554 registered large power consumers are in NRW (highest concentration)
- Sachsen-Anhalt: 5.75 GW wind; renewable surplus region; grid capacity relatively available; lower land costs
- Rheinland-Pfalz: 4.33 GW wind; Mannheim-Ludwigshafen industrial corridor; Amprion TSO
- Mecklenburg-Vorpommern: 4.27 GW wind; sparsely populated, significant renewable surplus; 50Hertz TSO zone
[SOLAR CAPACITY BY STATE — 93.5 GW total, Bundesnetzagentur Q4-2024]
- Bayern: 24.5 GW solar (~26% of national total); Bayernwerk grid operator; Munich metropolitan hub; longest connection lead times (18-36 months for >10 MW)
- Baden-Württemberg: 12.6 GW solar; Stuttgart, Karlsruhe; TransnetBW TSO; well-balanced grid
- Nordrhein-Westfalen: 11.0 GW solar + 9.3 GW wind + 24.85 GW thermal = Germany's most diversified power state; Amprion TSO
- Niedersachsen: 10.4 GW solar + 14.44 GW wind = 24.84 GW renewables; leading DC PPA opportunity region
- Brandenburg: 7.5 GW solar + 9.56 GW wind = 17.06 GW renewables; 43 large consumers vs high renewable generation = compelling DC siting case
[LARGE ELECTRICITY CONSUMERS — 554 registered (high-voltage connection) across Germany, MaStR 2026]
- Nordrhein-Westfalen: 187 (34% national total) — established heavy industrial and tech clusters; grid tightest but most connections available
- Niedersachsen: 64 | Bayern: 59 | Baden-Württemberg: 53 | Brandenburg: 43 | Hessen: 34 | Rheinland-Pfalz: 25
- Brandenburg 43 registered large consumers vs 17.06 GW renewables = best power-to-load ratio for new DC entrants in Germany
- Berlin: 13 registered (likely undercount — most DC operators in Berlin connect via distribution network, not high-voltage)
[GRID OPERATOR / TSO CONTEXT]
- Amprion (NRW, Rheinland-Pfalz, Bayern south): most constrained corridors; serving highest industrial load density in Germany
- TenneT (Niedersachsen, Schleswig-Holstein, Bayern north, AWZ offshore): key wind export corridor; AC/DC reinforcements underway; SuedLink HVDC scheduled 2028
- TransnetBW (Baden-Württemberg): compact, highly interconnected; strong renewable access; progressive on large new loads
- 50Hertz (Brandenburg, Berlin, Sachsen, Sachsen-Anhalt, MV, Thüringen): highest renewable penetration ratio in Germany; actively seeking anchor loads to balance surplus
[DC SITE SELECTION — POWER PERSPECTIVE, MaStR-INFORMED]
- Frankfurt/NRW corridor: best for connectivity (DE-CIX); tightest grid headroom; highest existing load; connection timelines 24-48 months for >50 MW
- Brandenburg/Berlin (50Hertz): best power-to-load ratio; 50Hertz actively seeking new anchor loads to absorb wind surplus; PPA prices ~€45-60/MWh; fastest connections
- Sachsen-Anhalt/Niedersachsen: renewable surplus, available grid capacity, emerging DC market; lower land costs than Frankfurt or Munich
- Bayern (Munich): highest solar fundamentals; longest connection lead times (18-36 months); highest construction/land costs in Germany
- Schleswig-Holstein: abundant wind but transmission south severely constrained; NOT recommended for very large new loads until SuedLink completes (2029, now postponed from 2028)

GERMANY DATA CENTRE MARKET — DEEP INTELLIGENCE (AlgorithmWatch, Addleshaws, S&P Global, ICIS, Reuters 2025-2026):
[MARKET SIZE & CONSUMPTION]
- Germany is Europe's largest DC market: ~490 data centres on DataCenterMap; >126 in Frankfurt alone; another 12 approved but not yet built (Frankfurt city government, 2025)
- Germany's total DC IT load: 4.26 GW in 2025 (S&P Global/451 Research — highest in Europe); UK next at 3.69 GW; France 3rd at 1.72 GW
- German DC electricity consumption: ~21 TWh in 2024 — largest in Europe; DCs account for ~4% of Germany's gross power consumption in 2024 (Borderstep Institute)
- Federal Network Agency forecasts DCs could rise to 10% of German power consumption by 2037
- DC/IT capacity has more than doubled since 2010; Bitkom/GDA predict further doubling of IT capacity by 2030
- Hyperscale trend: facilities >100 MW increasingly common; NTT Nierstein project (announced July 2025): 480 MW campus, construction from 2026
- E.ON committed to connecting 6 GW of DC capacity in Germany by 2030; most sites in the Frankfurt area
- Polarise (German start-up): 30 MW AI DC in Amberg, Bavaria — online mid-2027, scalable to 120 MW; sovereign/domestic compute focus; 12 MW Munich facility opened Q2 2026 estimated at €1bn (Deutsche Telekom)

[FRANKFURT — GRID AT CAPACITY, MARKET SATURATION]
- Frankfurt DCs now account for up to 40% of the city's total power demand — #1 sectoral consumer (AlgorithmWatch, 2025)
- Grid connections fully allocated in Frankfurt for the coming years; NRM (Mainova subsidiary) receives 5-10 DC connection requests per year for large grid capacities — ALL currently oversubscribed
- Pro-rata allocation for connections >3.5 MW in effect since 2020; operators must register expected peak consumption annually; capacity awarded proportionally at year-end
- "In general, the situation is under strain" — Mainova spokesperson; further capacity only possible with many years' advance notice
- CyrusOne FRA7 case: campus expanding 84→126 MW but grid power insufficient — E.ON partnership announced to supply additional capacity via gas generators on-site; experts say this is "not an isolated case" in Frankfurt (Federal Environment Agency)
- Frankfurt 2022 data centre strategy: restricted new DC development to 7 designated zones; sites outside these zones face zoning refusal
- Frankfurt municipalities spilling out: Hanau, Hattersheim, Offenbach, Schwalbach increasingly sought-after for proximity to DE-CIX
- Berlin adopted similar pro-rata grid allocation procedure in 2024 (replacing first-come-first-served)
- NRM/Mainova investing to double Frankfurt grid coupling capacity by the 2030s, but timelines are long (currently halfway through first tranche)

[SECONDARY MARKETS — RAPID EMERGENCE]
- Saxony, Saxony-Anhalt, Brandenburg, Mecklenburg-Vorpommern: each receiving 100-200 DC operator enquiries per month (Max Schulze, SDI Alliance think tank)
- NRW Rhineland (Aachen-Bonn-Cologne-Düsseldorf): Erik Schöddert (RWE) calls it "most exciting region in Germany"; former coal country repurposing for AI/DC clusters; Microsoft planning 3rd hyperscaler in Elsdorf; Kramer & Crew 15 MW facility in Bedburg
- Berlin/Brandenburg: now Germany's second largest DC cluster; 50Hertz grid has capacity headroom; land cheaper than Frankfurt; wholesale DCs dominate (NTT, Vantage, VIRTUS, Prea)
- Grid growth is shifting to where power is available: states with renewable surplus (Brandenburg, Sachsen-Anhalt, Niedersachsen, MV) are the beneficiaries

[REGULATORY FRAMEWORK — GERMANY ENERGY EFFICIENCY ACT (EnEfG)]
- Facilities >300 kWp: must source 50% renewable electricity from 2024; rising to 100% by 2027 (EnWG obligation)
- PUE mandates: new DCs from 2026 must achieve PUE ≤ 1.2; existing DCs must reach PUE ≤ 1.5 by July 2027 and PUE ≤ 1.3 by 2030
- Waste heat reuse: large DCs must reuse unavoidable waste heat; Heat Planning Act encourages integration into district heating; national heat atlas proposed but not yet implemented
- Permitting: facilities with backup generators >20 MW require immission permits; >50 MW require full public consultation — adds complexity and time
- Sec. 35 BauGB: proposed reform to classify DCs as "privileged" outside urban areas has NOT been enacted yet
- Data Centre Register: since 2023 all DCs must submit energy consumption data; 73% compliance but gaps remain, especially for larger DCs
- Grid access: no streamlined or prioritised access for DCs under the Energy Industry Act (EnWG) — compete on equal terms with factories, electrolysers, and BESS projects

[PERMITTING & GRID CONNECTION CHALLENGES]
- No dedicated digitalised grid connection process; no binding capacity reservations — exposure to "ghost projects" occupying capacity
- TSOs legally required to publish indicative grid capacity maps by region (2025); shows availability to 2030 by area
- Connection lead times: 24-48+ months for large loads (>50 MW) in constrained areas; faster (6-18 months) in 50Hertz zone for well-sited projects
- Flexible grid connection contracts (from EU Electricity Market Directive): allow limited "Überbauung" (over-building) to reduce delays; increasingly used by DC operators
- SuedLink HVDC (TenneT): now postponed to 2029 (was 2028); delays north-south congestion relief

[EUROPEAN CONTEXT FOR GERMANY]
- European DC capacity: 9.2 GW at end-2024; forecast 17.5 GW by 2030, 26.6 GW by 2035 (ICIS)
- European DC power demand: 96 TWh in 2024; forecast 168 TWh by 2030, 236 TWh by 2035 — DCs = 5.7% of European demand by 2035 (ICIS)
- FLAP-D (Frankfurt, London, Amsterdam, Paris, Dublin): >20% of European DCs by number; hosting the largest facilities by MW
- Germany forecast to have far highest renewable PPA availability in Europe over next decade (ICIS) — key competitive advantage for ESG-driven operators
- Average European DC PUE: 1.6 in 2023; new facilities consistently achieve 1.3; Google global average 1.09
- Hyperscale share: doubled to ~40% of European market between 2017-2023; expected to reach ~60% by 2030 — driving further PUE gains and scale

[KEY RISKS FOR DC DEVELOPERS IN GERMANY]
- Frankfurt: grid fully allocated; land premium; DCs outbid all other sectors; zoning restricted to 7 zones; gas generation emerging as workaround (regulatory/reputational risk)
- AI bubble risk: speculation-driven overbuilding; not all land is actually leased; some estimates suggest current capacity pipeline exceeds near-term demand
- Grid stranded assets: if DC pipeline slows, TSOs and municipalities may hold expensive unused grid infrastructure
- Section 19 EnNEV reduced network charges for DCs may be challenged; industry push for full energy tax exemption would shift costs to other consumers

SOUTHEAST EUROPE DATA (use when country is Greece, Romania, Bulgaria, or Croatia):
- Southeast Europe is emerging as a strategic alternative as FLAP-D markets face constraints (DC Byte SE Europe Market Spotlight)
- Athens is the standout hub: 101 MW total IT capacity (highest in SE Europe), with significant pipeline driven by Microsoft (3 sites + campus plans)
- Athens growth: Digital Realty developing 5th facility on Athens campus; Microsoft purchasing + constructing multiple sites in Greece
- Connectivity advantage: Greece (particularly Crete) hosts multiple subsea cable landing stations; positioned as alternative to Marseille for MENA connectivity
- Trans Adriatic Express: low-latency route Turkey–France routing through Athens and Chania (Crete), then Sofia, Bucharest, Zagreb — competitive with Western European hubs
- Bucharest: operational stability and moderate growth; Digital Realty and Microsoft have acquisition activities in Romania
- Zagreb: Digital Realty (via Interxion) entered by acquiring ALTUS IT in 2020, now a wholesale colo focused market; capacity surged in 2023
- Sofia: measured growth strategy, balancing live and under-construction; more domestic operator focus than Athens
- Turkey comparison: 106 MW live capacity, 90 MW committed — slightly ahead of SE Europe in live terms but SE Europe has more active Under Construction and Early Stage pipeline
- Key drivers: tax incentives, land availability, lower costs, digital transformation post-pandemic, and proximity to growing MENA/Eastern European demand
- Risks: less mature grid infrastructure, higher regulatory complexity, smaller local talent pools than Western Europe

ENERGY EFFICIENCY & TECHNOLOGY:
- Wide bandgap (WBG) semiconductors (SiC, GaN) can reduce data centre electricity use by up to 10%, saving $1.9 billion annually and 15 TWh globally (Navitas/CSA Catapult)
- PSU market in US, China, UK, Germany has potential to exceed $7.5 billion over next 7 years; UPS market forecast >$4.2 billion by 2030
- Average enterprise DC consumes ~3 MW; average hyperscale DC requires 20-50 MW (CSA Catapult)
- Cooling systems account for up to 40% of DC energy demands; most efficient use 24%, least efficient 61%
- UK Data Centre Energy Routemap identifies 10 priority areas including security of supply, renewables adoption, heat reuse, and becoming a prosumer
- Over 75% of energy used by UK commercial data centre sector is certified 100% renewable (techUK)
- Liquid cooling and immersion cooling technologies increasingly adopted for AI GPU clusters

WATER USAGE & COOLING (DCA Water Usage Guide 2025):
- AI workloads dramatically increase water consumption: a single Google search requires ~0.5ml of water in energy terms, while ChatGPT uses ~500ml per 5–50 prompts — approximately a 1,000× increase
- Digital services consume significant water both on-site (cooling) and through the water footprint of energy consumed; AI accelerates both
- High-density AI GPU racks require more intensive cooling and thus have a proportionally higher water footprint than traditional cloud/storage workloads
- Cooling technology water impact: air cooling (minimal/no water), dry coolers (no water), direct-to-chip liquid cooling (minimal, closed loop), rear door heat exchangers (closed loop, 30–50 kW/rack), cooling towers (open evaporation — water loss, rarely used in UK due to Legionnaires risk), adiabatic/evaporative coolers (uses water inlet to humidify — suited to dry environments)
- SE England faces high current and future water stress risk (World Resources Institute Aqueduct analysis, March 2025)
- Anglian Water (covering the "Silicon Fenn" Cambridge AI corridor) is proposing to screen requests for facilities requiring >20 m³/day of water — creating a new planning constraint for data centres in East England
- Water Resources East analysis: 5bn litre/day deficit in supply vs demand in Eastern England; additional 2bn litre/day future deficit anticipated
- Operators should evaluate sites for water stress risk, especially if using evaporative/adiabatic cooling; closed-loop liquid cooling and dry cooling preferred in water-stressed regions
- GWh/heat reuse opportunities: Green Heat Network Fund (UK) incentivises heat recovery from data centres into local district heating networks

GLOBAL SOUTH & WIDER CONTEXT (ORF 2025):
- Global South (excluding China) has 50% of world's internet users but less than 10% of global DC capacity
- US accounts for over 50% of global DCs by number and power consumption
- Fossil fuels accounted for about 56% of electricity consumed by DCs globally in 2023
- DC GHG emissions below 1.5% of total energy sector emissions in 2023 but among fastest growing sources

IRELAND-SPECIFIC DATA (use when country is Ireland):

ELECTRICITY CONSUMPTION — CSO MEC02 (quarterly metered data):
- Data centres consumed 21.8% (6,969 GWh) of Ireland's total metered electricity (31,903 GWh) in 2024
- DC annual totals by year: 2015=1,238 GWh (5.0%), 2016=1,480 GWh (5.8%), 2017=1,760 GWh (6.8%), 2018=2,180 GWh (8.2%), 2019=2,488 GWh (9.4%), 2020=3,027 GWh (11.2%), 2021=4,010 GWh (14.1%), 2022=5,271 GWh (17.7%), 2023=6,336 GWh (20.7%), 2024=6,969 GWh (21.8%)
- Growth: 5.6x increase over 9 years, 21.2% CAGR 2015–2024; accelerating despite moratorium
- EirGrid projects data centre share could reach 30% of Ireland's total electricity by 2032 (Generation Capacity Statement)
- DC growth has been driven almost entirely by Dublin hyperscale expansion (AWS, Microsoft, Google, Meta)

DUBLIN MARKET — DC-BYTE & KPMG:
- Dublin is Europe's second largest DC cluster with 1,150 MW in operation (H1 2025), fractionally behind London (1,189 MW), ahead of Amsterdam, Frankfurt, Paris
- Known as a "critical mass" hub for hyperscalers due to favourable corporate tax (12.5%), English language, EU data residency, skilled workforce
- Three established campus clusters: Grange Castle (Clondalkin), Ballycoolen (Blanchardstown), Clonshaugh (North Dublin/Airport corridor)
- Significant pipeline remains: construction, committed, and early-stage projects exceed ~2,000 MW in greater Dublin area
- CRU moratorium (2021) and policy uncertainty caused temporary pause; new LEU policy (Dec 2025) has re-opened the connection queue

GRID & POLICY — CRU LEU Decision (CRU/2025/236, December 2025):
- This is the landmark decision re-opening grid connections after the effective 2021 Dublin moratorium
- New connections for Large Energy Users (>10 MVA) must provide matched dispatchable on-site generation or storage capacity as a condition of connection
- A 6-year glide path applies: new connectors must source an increasing % of electricity from renewable PPAs (target: 80% renewable by 2030 in line with Climate Action Plan)
- Policy requires phased approach: connections approved in tranches based on grid upgrade timelines, with EirGrid/ESBN setting capacity envelopes
- Flexibility obligations: DCs must demonstrate demand response capability and participate in grid ancillary services
- ESB Networks (ESBN) highlighted distribution network constraints in Dublin suburban areas requiring significant reinforcement before new connections
- Equinix stressed importance of predictable timelines; AmCham flagged FDI competitiveness risk if connection delays persist

GRID PERFORMANCE — EirGrid Irish Grid 2025 Year in Review:
- Renewable electricity share reached 38.4% in 2025 (wind dominant), below the 2030 target of 80%
- Wind curtailment (dispatch-down) rate reached 11.3% in 2025 — a key grid management challenge as wind penetration increases
- Greenlink interconnector (Ireland–Wales, 500 MW) came online in 2025, Ireland's third interconnector alongside Moyle (500 MW, NI) and East-West (500 MW)
- Celtic Interconnector (France–Ireland, 700 MW) expected online by 2027 — will substantially improve system adequacy and market integration
- Ireland remains an island grid with limited synchronous inertia, making frequency management increasingly challenging at high renewable penetration
- Gas-fired CCGT stations remain essential for system security and are unlikely to be decommissioned before 2030

BROADER MARKET CONTEXT:
- Ireland's electricity system operates within the all-island Single Electricity Market (SEM) with Northern Ireland
- Ireland targeting 80% renewable electricity by 2030; offshore wind pipeline targeting 5 GW (ambitious given consenting delays)
- Industrial electricity prices among highest in EU (Eurostat); partly driven by network charges and capacity payments
- 12.5% corporate tax rate remains a critical FDI attractor for US tech companies placing DC infrastructure in Ireland
- Post-GDPR and EU AI Act, Ireland (as EU jurisdiction) provides data sovereignty advantages for US hyperscalers serving European customers
- EirGrid Generation Capacity Statement 2023–2032 flags adequacy concerns from 2025 if DC demand continues on current trajectory without grid reinforcement
- KPMG Ireland (2026) notes Ireland is in a "policy reset" phase — moratorium ended, new LEU framework provides clearer pathway, but timeline uncertainty remains a risk
- Potential for co-located renewable generation with DC campuses is actively discussed; Wind Energy Ireland advocates for bundled PPAs tied to connection applications

ADDITIONAL AREAS TO CONSIDER:
- Behind-the-meter generation opportunities (on-site solar, gas turbines, fuel cells)
- Battery energy storage system (BESS) co-location benefits
- Power Purchase Agreement (PPA) market maturity
- Carbon intensity of grid electricity and net zero alignment
- Interconnector capacity and cross-border power flows
- Demand-side flexibility and smart grid participation opportunities — AI training workloads offer flexibility potential
- Cooling climate advantages (ambient temperature, water availability)

BELGIUM-SPECIFIC DATA (use when country is Belgium):

GRID STRUCTURE & NUCLEAR BASELOAD — Elia Annual Report 2024 / CREG:
- Belgium's grid operator is Elia, managing 12,500 km of high-voltage network; interconnectors to France (3,000 MW), Netherlands (2,400 MW), Luxembourg, and UK via Nemo Link (1,000 MW HVDC)
- Nuclear provides ~50% of Belgian generation in normal conditions — Doel 4 and Tihange 3 are life-extended to 2055 under the Engie–Belgian government agreement (December 2022), providing 3.9 GW of stable low-carbon baseload
- Doel 1, 2 and Tihange 1 were shut down 2022–2023; net installed nuclear capacity fell from 5.9 GW to 3.9 GW — grid stress was managed via increased gas generation and imports
- Natural gas CCGT capacity: 5.7 GW — primarily flexible mid-merit and peaking plants; Belgium imports gas via the Zeebrugge LNG terminal and Interconnector UK–Belgium pipeline
- Wind offshore: 2.3 GW installed (Alpha, Beta, Gamma, Norther, Rentel, Seastar, Mermaid, Northwester2 wind farms in the Belgian North Sea Zone); Prinses Elisabethzone (PEZ) will add 3.5 GW by 2030, tripling offshore capacity
- Wind onshore: 3.6 GW — Flanders (1.3 GW) and Wallonia (2.3 GW) regions; heavily constrained by planning (wind turbine spacing rules, noise limits, nature zones)
- Solar PV: 8.2 GW — Belgium has among the world's highest solar penetration per km² (30,500 km² country); midday curtailment risk is growing without dedicated storage
- Pumped hydro: Coo-Trois-Ponts (1,164 MW gross, 900 MW net — largest pumped storage in Western Europe), plus small run-of-river totalling ~140 MW net

DATA CENTRE MARKET — JLL, CBRE, Uptime Institute 2025:
- Brussels metropolitan area is Belgium's primary DC cluster; key campus locations: Brussels National (Zaventem), Gosselies (Charleroi area near Brussels-South Airport), Antwerp port zone
- Google entered Belgium in 2010 (Saint-Ghislain data centre, sourced from the disused paper mill industrial zone); now powers >60% of Belgian total IT capacity — a case study in how a single hyperscale tenant transforms a mid-size market
- Major operators: Google (Saint-Ghislain hyperscale campus, 250 MW+), Microsoft (Brussels campus), Equinix (BX1, BX2 in Brussels), Interxion (ditto), Iron Mountain, Proximus Telindus
- Belgium's data centre market is smaller than FLAP-D but plays a critical Benelux hub role — seamless physical and fibre interconnection to Amsterdam (AMS-IX) and Frankfurt (DECIX) via subsea and terrestrial routes
- Corporate tax rate 25% (standard); Innovation Income Deduction (IID) at 85% can effectively reduce IP-related taxable income — relevant for hyperscale operators with regional IP holding structures

ELECTRICITY PRICING & PPA MARKET:
- Belgium's industrial electricity prices have historically been above EU average; 2022 crisis drove Belgian large-user prices to €244.53/MWh (vs. EU28 avg ~€180/MWh); 2024 prices normalised to ~€75–90/MWh for large consumers
- CREG (Commission de Régulation de l'Électricité et du Gaz) regulates markets; capacity remuneration mechanism (CRM) auctions provide capacity payments to both conventional and renewable-backed dispatchable plants
- PPA market active: Google, Microsoft and key data centre operators have executed multi-year PPAs with Belgian offshore wind projects (including Rentel and Mermaid); typical tenors 10–15 years at €45–65/MWh
- Elia's balancing mechanism and the interconnected CWE (Central Western Europe) price zone means Belgian DC operators benefit from liquid day-ahead and intraday markets

REGULATORY & PLANNING FRAMEWORK:
- Three-region structure (Flanders, Wallonia, Brussels Capital) creates planning complexity — DCs straddling regional boundaries face dual permitting
- Environmental Impact Assessment (EIA) required for DCs >5 MW; permitting timelines typically 18–30 months in Brussels, faster in Wallonia (12–18 months) due to active industrial land policy
- EU Corporate Sustainability Reporting Directive (CSRD) effective 2024 for large companies — Belgian DCs must disclose energy consumption, water usage (WUE), and Scope 2/3 emissions with third-party assurance
- Belgium signed COP28 Global Cooling Pledge; BREEAM and ISO 50001 increasingly required for government/EU-funded DC procurement
- Waste heat recovery: Brussels Environmental Permit guidelines encourage but do not mandate waste heat reuse; Bruxelles Environnement (IBGE) has piloted DC waste-heat-to-district-heating feasibility studies (Saint-Josse pilot)

GRID CONNECTION PROCESS — Elia 2024/2025:
- Connection queue: Elia manages grid connection requests via a Feasibility Study → Technical Study → Connection Agreement pathway; HV connections (>30 MW) typically take 3–7 years from application to energisation
- N-S congestion: Structural congestion exists between the Flanders generation zone (offshore wind surplus, solar) and the Wallonia/Brussels load zone — DC operators in Flanders may face curtailment risk; Wallonia/Brussels positions benefit from more balanced local supply
- Elia grid investments: €6 billion investment plan 2024–2028 — major HV ring reinforcements (Horta-Ventilus offshore wind grid, Borealis project) will resolve Flanders offshore bottleneck by 2030
- Nemo Link (IFA2 Belgium–UK HVDC) interconnector allows Belgium to import UK surplus renewables during high wind periods — bidirectional benefit

NETHERLANDS-SPECIFIC DATA (use when country is Netherlands):
- Grid operator: TenneT (HV transmission, 23,000 km network); Liander, Stedin, Enexis (regional distribution)
- Amsterdam (AMS-IX) is Europe's largest internet exchange — latency imperative makes AMS a tier-1 DC hub; FLAP-D member alongside Frankfurt, London, Paris, Dublin
- Total installed capacity ~35 GW; major interconnectors to Belgium (2,400 MW), Germany (4,000 MW), Norway (NorNed 700 MW HVDC), UK (BritNed 1,000 MW HVDC)
- DC electricity demand is the single largest inbound FDI sector — 20% of all Netherlands FDI (Ember 2025); hyperscale campuses: Google Middenmeer (Groningen, 1 GW+ long-term), Microsoft Wieringermeer, Meta Zeewolde
- Primary DC clusters: Amsterdam metro (Equinix AMS1-AMS9, Digital Realty AMSDC campus, Iron Mountain), Eemshaven port zone (Google, RWE green power), Middenmeer/Wieringerwerf (greenfield hyperscale)
- TenneT grid connection backlog: 3–7 years for HV connections >20 MW in the Randstad (Amsterdam/Rotterdam/The Hague); TenneT has declared parts of the western Netherlands transmission grid "vol" (full) — no new large connections without offsetting load reductions
- Renewable share ~45% (2024): offshore wind dominant; 3.6 GW offshore installed — Hollandse Kust Noord/Zuid/West Alpha/Beta; 21 GW in offshore pipeline to 2030 under national offshore wind programme
- Planning restrictions: several provincial councils (Noord-Holland, Flevoland) have applied DC zoning freezes or moratoriums in certain areas citing grid congestion and land-use concerns; national DC policy framework under development (2025)
- SDE++ subsidy scheme supports renewable generation procurement; reduced Energiebelasting (energy tax) rate for large consumers >10 GWh/yr; CO₂ pricing via EU ETS
- District heating: Amsterdam (WarmtelinQ successor), Rotterdam (Warmtebedrijf) heat networks — DC operators face increasing municipal pressure to supply waste heat; AEB Amsterdam (waste-to-energy) adjacent to major DC campuses
- NED (Netherlands Energy Dashboard): live grid data available via ned.nl API; TenneT open data platform provides 15-min generation and price data

- Water stress risk: assess site-level water availability, especially for regions using evaporative/adiabatic cooling; SE England and many Mediterranean areas face escalating water scarcity constraints
- Supply chain constraints for transformers, switchgear, and HV cables — lead times for turbine deliveries now several years
- Workforce availability for electrical engineering and construction — major constraint identified by Soben/Accenture
- Data sovereignty considerations driving domestic DC investment post-Brexit
- Private wire network solutions and their regulatory treatment
- Mandatory carbon reporting requirements for data centres (SECR in UK, CSRD in EU)
- Strategic spatial energy planning for optimal DC siting
- Gas-fired generation returning as supplementary power for constrained grids (Soben Data Centre Trends 2026)
- Edge data centres growing with 5G deployment, requiring distributed power solutions
- Quantum computing readiness as emerging consideration for next-generation facilities
- GC2 contracting model: hyperscale projects increasingly splitting civil (GC1) from M&E/power fitout (GC2), making specialist M&E contractors a critical path item

Return a valid JSON object matching this structure EXACTLY:
{
  "generatedAt": string (ISO date),
  "country": "${country}",
  "gridCapacity": {
    "totalCapacityGW": number,
    "availableCapacityGW": number,
    "reservedForDataCentresGW": number,
    "projectedGrowth": [{ "year": number, "capacityGW": number }] (3-5 future years)
  },
  "powerPricing": {
    "averageIndustrialPriceMWh": number (in local currency equivalent to GBP),
    "peakPriceMWh": number,
    "offPeakPriceMWh": number,
    "priceVolatilityIndex": string (one of: "Low", "Medium", "High", "Very High"),
    "renewablePPAAvailability": string (one of: "Excellent", "Good", "Moderate", "Limited"),
    "priceTrend": string (2-3 sentence outlook)
  },
  "renewableEnergy": {
    "renewableSharePercent": number,
    "solarCapacityGW": number,
    "windCapacityGW": number,
    "hydroCapacityGW": number,
    "nuclearCapacityGW": number,
    "projectedRenewableShare": [{ "year": number, "sharePercent": number }] (3-5 future years)
  },
  "gridConstraints": [
    {
      "region": string,
      "constraintType": string (e.g. "Transmission Capacity", "Distribution Capacity", "Transformer Shortage", "Connection Queue Backlog"),
      "severity": string (one of: "Critical", "High", "Medium", "Low"),
      "description": string,
      "mitigationTimeline": string
    }
  ] (4-8 constraints),
  "regulatoryEnvironment": {
    "planningFramework": string (2-3 sentences on planning policy for data centres),
    "gridConnectionTimeline": string (typical timeline in months/years),
    "keyRegulations": [
      { "regulation": string, "description": string, "impact": string (one of: "Positive", "Neutral", "Negative") }
    ] (3-5 regulations),
    "incentives": [
      { "incentive": string, "description": string, "value": string }
    ] (2-4 incentives),
    "restrictions": [
      { "restriction": string, "description": string, "severity": string (one of: "High", "Medium", "Low") }
    ] (2-4 restrictions)
  },
  "dataCentrePowerDemand": {
    "currentDemandGW": number,
    "projectedDemand2030GW": number,
    "shareOfNationalDemandPercent": number,
    "annualGrowthRate": string (e.g. "15-20% CAGR"),
    "keyDrivers": string[] (4-6 drivers like "AI training workloads", "Cloud migration", "Edge computing", etc.),
    "workloadBreakdown": [
      { "workload": string, "sharePercent": number }
    ] (4-5 workload types)
  },
  "locations": [
    {
      "location": string (city/region name),
      "region": string,
      "powerAvailabilityRating": string (one of: "Excellent", "Good", "Moderate", "Constrained"),
      "gridCapacityMW": number,
      "renewableAccessPercent": number,
      "averagePUE": number (1.1-1.8 range),
      "coolingAdvantage": string (one of: "Significant", "Moderate", "Limited"),
      "keyRisks": string[] (2-3 risks),
      "suitabilityScore": number (1-100),
      "connectionTimelineMonths": number
    }
  ] (5-8 locations),
  "trends": [
    {
      "trend": string,
      "impact": string (one of: "High", "Medium", "Low"),
      "timeframe": string (e.g. "2025-2027", "2028-2030"),
      "relevance": string (how this trend affects data centre power decisions)
    }
  ] (5-8 trends),
  "investorInsights": {
    "overallRating": string (one of: "Very Attractive", "Attractive", "Moderate", "Challenging"),
    "keyOpportunities": string[] (3-5 opportunities),
    "keyRisks": string[] (3-5 risks),
    "recommendedStrategy": string (3-4 sentences),
    "hyperscalerOutlook": string (2-3 sentences on hyperscaler activity and prospects)
  },
  "summary": string (4-5 sentences summarising the power landscape for data centre investment)
}

RENEWABLE TECHNOLOGY COST BENCHMARKS — OEP MODEX Benchmark, DEA 2020 (Open Energy Platform):
These are calibrated technology parameters used across multiple peer-reviewed European energy system models. Unit: EUR per MW of installed capacity.
Onshore Wind:
  2016: CAPEX €1,288k/MW | Fixed OPEX €23,280/MW/yr | Lifetime 25.4 years
  2030: CAPEX €1,040k/MW | Fixed OPEX €12,600/MW/yr | Lifetime 30 years (−19% CAPEX from 2016)
  2050: CAPEX €960k/MW  | Fixed OPEX €11,340/MW/yr | Lifetime 30 years (−25% CAPEX from 2016)
Offshore Wind:
  2016: CAPEX €2,714k/MW | Fixed OPEX €53,852/MW/yr | Lifetime 25.4 years
  2030: CAPEX €1,930k/MW | Fixed OPEX €36,053/MW/yr | Lifetime 30 years (−29% CAPEX from 2016)
  2050: CAPEX €1,780k/MW | Fixed OPEX €32,448/MW/yr | Lifetime 30 years (−34% CAPEX from 2016)
Key implications for DC investors:
- Offshore CAPEX declining at 1.7×/yr faster rate than onshore — makes North Sea / Baltic PPAs increasingly competitive vs spot markets in 2030-2040
- Onshore OPEX/MW halved from 2016→2050 — improving PPA long-term economics for landlocked markets (Germany BB/ST/MV, Poland, Spain Aragon)
- Typical levelised cost of energy (LCOE) for onshore wind in Central Europe in 2030 scenario: ~€40-50/MWh; offshore: ~€55-75/MWh (includes grid connection)
- DC operators with 10-20 year PPA horizons can lock in near-2030 CAPEX-derived prices, well below current spot market peaks (DE avg €89/MWh in 2025)
GERMANY OFFSHORE WIND EXPANSION POTENTIAL (Siala 2020 model via OEP MODEX v12):
  North Sea zone: 86.95 GW expansion limit (2050 model) vs 2.96 GW installed today (MaStR)
  Baltic Sea zone: 10.00 GW expansion limit vs 0.34 GW installed today (MaStR)
  Total Germany offshore potential: 96.95 GW vs 3.30 GW current = 29× expansion headroom
  Context: Germany 2030 offshore target = 30 GW; 2050 target = 70 GW — still well within model limits

ELECTRICITY PRICE INTELLIGENCE — ENTSO-E Day-Ahead Market Data (EUR/MWh, annual average):
Germany (DE-LU zone): 2019: €37.67 | 2020: €30.47 | 2021: €96.86 | 2022: €235.44 | 2023: €95.24 | 2024: €78.51 | 2025: €89.33
United Kingdom (GB_GBN zone): 2015: €40.24 | 2017: €45.32 | 2018: €57.44 | 2019: €42.88 | 2020: €31.16 | 2022: €223.21
Ireland (IE_SEM zone): 2018: €72.23 | 2019: €50.18 | 2020: €33.15
Italy (IT_NORD zone): 2015: €52.76 | 2017: €54.41 | 2018: €60.72 | 2019: €51.25 | 2020: €34.48 | 2022: €307.58
Denmark (DK_1): 2015: €22.90 | 2018: €44.05 | 2019: €38.50 | 2020: €23.96
Sweden (SE_3): 2015: €22.00 | 2018: €44.54 | 2019: €38.36 | 2020: €19.71
Norway (NO_1 Oslo area): 2015: €19.85 | 2018: €43.66 | 2019: €39.29 | 2020: €8.12
France: 2022: €275.88 (crisis year, pre-crisis avg 2015-2020 est. €40-55)
Belgium: 2022: €244.53
Spain: 2022: €167.52 (below EU average — high solar penetration moderating crisis impact)
Germany August 2022 monthly avg: €465.51/MWh (peak crisis month)
Germany generation mix (hourly avg MW): 2022: wind onshore 11,564 / offshore 2,825 / solar 6,391 / nuclear 3,747 / lignite 11,818 / gas 5,241; 2024: wind onshore 12,868 / offshore 2,922 / solar 7,223 / nuclear 0 (exit April 2023) / lignite 8,081 / gas 6,487; 2025: wind onshore 12,241 / offshore 2,990 / solar 8,472 / nuclear 0 / lignite 7,668 / gas 6,919
DC power opex context: At PUE 1.4 and 1 MW IT load, cost per year: DE 2025 ≈ €1.1M; UK 2022 ≈ €2.7M; IE 2020 ≈ €0.4M; IT 2022 ≈ €3.8M; SE 2020 ≈ €0.24M; NO 2020 ≈ €0.1M; ES 2022 ≈ €2.1M
Key insight: Nordic hydro-dominated markets (NO, SE) historically had Europe's cheapest power pre-2021; Germany's nuclear exit (April 2023) increased reliance on gas, contributing to higher 2025 prices vs. 2023; most large DC operators hedge via multi-year PPAs, typically at 30-40% discount to spot market; Spain's high solar penetration moderated 2022 crisis vs. gas-dependent markets.
Sources: ENTSO-E Transparency Platform via Open Power System Data; DE-LU Electricity Market 2019-2025 dataset (Kaggle, updated 2026-03-11).

NOTE: dataSources will be injected server-side — do NOT include it in the JSON output.
${worldBankContext ? `\n${worldBankContext}\n` : ""}${liveEntsoeContext ? `\nLIVE DATA UPDATE (fetched in real-time from ENTSO-E Transparency Platform — use this to ground powerPricing figures):\n${liveEntsoeContext}` : ""}
CRITICAL: Ground your analysis in real market data and cite specific sources. All monetary values in EUR (or GBP for UK). The analysis must be actionable for both investors and data centre operators.`
          },
          {
            role: "user",
            content: `Generate a comprehensive Power Trends analysis for ${country}, covering grid capacity, power pricing, renewable energy mix, grid constraints, regulatory environment, data centre power demand forecasts, location suitability, and investor insights. This analysis will be used by data centre providers and investors for site selection and market assessment.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const contentStr = completion.choices[0].message.content;
      if (!contentStr) {
        throw new Error("Failed to generate Power Trends content");
      }

      const rawContent = JSON.parse(contentStr);

      rawContent.dataSources = [
        { source: "AI to drive 165% increase in data center power demand by 2030", publisher: "Goldman Sachs Research", year: 2025, description: "Global data centre power demand forecasts and supply-demand dynamics" },
        { source: "BP Energy Outlook 2025", publisher: "BP", year: 2025, description: "Global energy scenario modelling (Current Trajectory and Below 2°C); AI data centres identified as the single fastest-growing electricity demand category; 'Electrostates' concept; geopolitical energy security risks; lacklustre efficiency gains offsetting renewable growth" },
        { source: "Energy and AI", publisher: "International Energy Agency (IEA)", year: 2025, description: "Comprehensive analysis of data centre electricity demand, AI energy impacts, and grid integration challenges globally" },
        { source: "Grids for data centres: ambitious grid planning can win Europe's AI race", publisher: "Ember", year: 2025, description: "European DC demand: 96 TWh (2024) → 168 TWh (2030) → 236 TWh (2035); FLAP-D hubs +55% vs Nordic/Southern Europe +110% by 2030; Netherlands 20% of FDI; Norway DCs €240M economic contribution; Italy Terna avg 140 MW+ DC applications; DC grid connection 7-10 years legacy hubs vs 1 year with smarter agreements; Sweden and Denmark DC demand tripling by 2030" },
        { source: "Data Centre Impact Study", publisher: "National Grid Electricity Distribution / Regen", year: 2025, description: "Analysis of data centre growth, load profiles, and network impact in NGED licence areas including AI Growth Zones" },
        { source: "Advancing Data Centres: Key Trends and the Rise of Wide Bandgap Solutions", publisher: "CSA Catapult", year: 2025, description: "Data centre energy efficiency, WBG semiconductor opportunities, UK market position with 500+ DCs" },
        { source: "Impact of Growth of Data Centres on Energy Consumption", publisher: "Europe Economics / DESNZ", year: 2025, description: "Methodology for estimating digital vs physical energy consumption, PUE analysis, and policy implications" },
        { source: "Powering the Cloud: How data centres can deliver sustainable growth", publisher: "Energy UK", year: 2025, description: "UK data centre challenges, grid connection, power pricing, AI Growth Zones, and energy policy recommendations" },
        { source: "EMEA Data Centre MarketBeat H2 2025", publisher: "Cushman & Wakefield", year: 2025, description: "EMEA data centre market overview: 11.4 GW operational, 2.7 GW under construction, 12.1 GW planned across 33 markets" },
        { source: "Data Centre Trends Report 2026: Shifting up a gear", publisher: "Soben / Accenture", year: 2026, description: "Ten key trends including gas power resurgence, workforce constraints, edge DC growth, and cooling innovations" },
        { source: "The UK's data centre boom: growth trends, drivers, and the rising power challenge", publisher: "Oxford Economics", year: 2025, description: "UK data centre growth analysis: 5.0 TWh consumption in 2023 forecast to 26.2 TWh by 2030" },
        { source: "UK Data Centres Sector: UK Leadership in Digital Infrastructure", publisher: "Imperial College London", year: 2025, description: "Strategic analysis of UK DC landscape, policy gaps, circular economy potential, and innovation opportunities" },
        { source: "The UK Data Centre Sector: The most important industry you've never heard of", publisher: "techUK", year: 2020, description: "UK DC market overview: 2.89 TWh commercial consumption, £397-436M GVA per new facility, 70% M25 cluster" },
        { source: "Subnational electricity and gas consumption summary report 2024", publisher: "DESNZ", year: 2025, description: "GB subnational electricity consumption data showing 97% of local authorities with declining consumption 2015-2024" },
        { source: "Data Centre Energy Use: Critical Review of Models and Results", publisher: "EDNA / IEA 4E TCP", year: 2025, description: "Critical review of 50+ DC energy models, global estimates of 415 TWh (2024), regional breakdowns and AI projections" },
        { source: "Total Energy Model 4.0 - Data Centres", publisher: "EDNA / IEA 4E TCP", year: 2025, description: "Bottom-up energy model projecting 650-1,050 TWh global DC consumption by 2030 with policy modelling capabilities" },
        { source: "The Consumption of Energy by Data Centres: Implications for the Global South", publisher: "Observer Research Foundation", year: 2025, description: "Global DC energy distribution, fossil fuel share (56% in 2023), and implications for equitable energy access" },
        { source: "Connected Nations UK Report 2024", publisher: "Ofcom", year: 2024, description: "UK broadband and mobile connectivity: 69% full-fibre, 83% gigabit-capable, 5G expanding to 61-79% coverage" },
        { source: "UK Data Centre Sector Energy Routemap", publisher: "techUK", year: 2019, description: "Sector energy strategy covering security of supply, renewables adoption, heat reuse, and prosumer opportunities" },
        { source: "ED3 Framework Decision", publisher: "Ofgem", year: 2025, description: "Regulatory framework for electricity distribution networks 2028-2033 enabling proactive investment" },
        { source: "transitional Regional Energy Strategic Plan (tRESP)", publisher: "NESO", year: 2026, description: "Regional energy planning assumptions for electricity distribution networks" },
        { source: "Trends in Data Centre Energy Consumption under the European Code of Conduct", publisher: "European Commission JRC", year: 2017, description: "EU voluntary energy efficiency programme showing declining average PUE in participating facilities" },
        { source: "Metered Electricity Consumption (MEC02) - Data Centres", publisher: "Central Statistics Office (CSO) Ireland", year: 2025, description: "Quarterly metered electricity consumption data showing DC share grew from 5% (2015) to 22% (2024) of Ireland's total electricity" },
        { source: "Ireland's data centre policy reset - Europe's digital infrastructure", publisher: "KPMG Ireland", year: 2026, description: "Analysis of Dublin as Europe's second largest DC cluster (1,150 MW), CRU moratorium impact, and policy developments enabling growth" },
        { source: "Large Energy User Connection Policy Decision Paper (CRU/2025/236)", publisher: "Commission for Regulation of Utilities (CRU)", year: 2025, description: "Policy framework for large energy user grid connections including dispatchability and flexibility requirements for data centres" },
        { source: "Generation Capacity Statement 2023-2032", publisher: "EirGrid / SONI", year: 2023, description: "All-island generation capacity adequacy assessment projecting system challenges from growing data centre and electrification demand" },
        { source: "A Year in Review: The Irish Grid in 2025", publisher: "EirGrid", year: 2025, description: "Annual review of Irish electricity system performance, renewable integration levels, and grid management challenges" },
        { source: "CRU LEU Consultation Response", publisher: "Equinix Ireland", year: 2025, description: "Industry perspective on DC connection policy, load flexibility potential, and need for predictable connection timelines" },
        { source: "CRU LEU Consultation Response", publisher: "ESB Networks (ESBN)", year: 2025, description: "Distribution network operator perspective on infrastructure constraints and required upgrades for DC connections" },
        { source: "CRU LEU Consultation Response", publisher: "Wind Energy Ireland (WEI)", year: 2025, description: "Renewable energy industry perspective on co-location of wind generation with DC loads and PPA frameworks" },
        { source: "CRU LEU Consultation Response", publisher: "American Chamber of Commerce Ireland (AmCham)", year: 2025, description: "FDI perspective on data centre policy, balanced energy approach, and Ireland's competitiveness for US tech investment" },
        { source: "CRU LEU Consultation Response", publisher: "Energy Storage Ireland (ESI)", year: 2025, description: "Energy storage industry perspective on co-location of BESS with data centres and grid flexibility services" },
        { source: "CRU LEU Consultation Response", publisher: "Fingleton White", year: 2025, description: "Engineering and construction perspective on DC infrastructure delivery, grid connection processes, and project timelines" },
        { source: "CRU LEU Consultation Response", publisher: "Found Digital", year: 2025, description: "Digital infrastructure operator perspective on DC connection policy and market development in Ireland" },
        { source: "IE Electricity Statistics", publisher: "Eurostat", year: 2025, description: "Comparative European electricity consumption and pricing data for Ireland" },
        { source: "Data centres consumed 22% of Ireland's electricity in 2024", publisher: "Irish media / CSO data analysis", year: 2025, description: "Analysis of CSO MEC02 data confirming data centres consumed 6,969 GWh (22%) of Ireland's 31,903 GWh total metered electricity in 2024" },
        { source: "Global Data Centre Index 2025", publisher: "DC Byte", year: 2025, description: "Proprietary tracking of 7,500+ facilities globally: 12,975 MW take-up in 2024, supply bottleneck analysis, US 62% of new live supply, space pre-sold before construction up 33×" },
        { source: "The Hyperscale Build Race: Power, Policy and Speed in the Next Digital Frontier", publisher: "DC Byte", year: 2025, description: "Analysis of hyperscale build and leasing strategies across Americas, APAC and EMEA; power access as key competitive differentiator; emerging US Southeast and Southern Europe corridors" },
        { source: "Market Spotlight: Emerging Horizons — Dynamic Data Centre Activity in Southeast Europe", publisher: "DC Byte", year: 2024, description: "Athens (101 MW, highest in SE Europe), Bucharest, Sofia, Zagreb market analysis; Microsoft and Digital Realty driving growth; Crete subsea cable advantage for MENA connectivity" },
        { source: "Market Spotlight: Germany's Data Centre Markets — The Rise of the Secondary Markets", publisher: "DC Byte", year: 2024, description: "Frankfurt 74.7% of Germany's 3.5 GW total capacity; Berlin 40% CAGR 2020-2023 (wholesale colo); DE-CIX 34 exabytes/year; Munich, Dusseldorf emerging" },
        { source: "Market Spotlight: The London Data Centre Market", publisher: "DC Byte", year: 2024, description: "Slough & West London >1.4 GW; Iver-B substation delays 2030-2033; East London emerging (Google Broxbourne, Reef Group 600 MW Havering); Microsoft and Google expanding to Wales and Yorkshire" },
        { source: "Data Centre Delivery: Beyond the Announcements", publisher: "KPMG Ireland", year: 2026, description: "Europe 25W vs US 140W per capita; EU supply chain growing 9% vs Americas 16%; major European capital commitments by country; GC2 contracting model for mission-critical delivery" },
        { source: "Built Environment: The GC2 Shift", publisher: "KPMG Ireland", year: 2026, description: "Critical path management in data centre delivery; GC2 model (GC1 for civil, GC2 M&E for fitout/power); HV grid connection as gating commissioning item; M&E contractors (Kirby, Suir, Mercury, H&MV)" },
        { source: "UK Data Centre Legislation Horizon Scan Report 2025–2027", publisher: "Data Centre Alliance (DCA)", year: 2025, description: "Six legislative domains: energy/sustainability (Energy Act, ESOS, SECR, UK ETS), planning (NPPF, CNI), digital security, power resilience, circular economy; EU and US regulations with UK impact" },
        { source: "Connecting Data Centres: An Introduction to Connecting Demand Projects", publisher: "UK Power Networks", year: 2024, description: "Connection products for data centres in London, SE and East England: Non-curtailable, Ramped, Flexible (DERMS), and Profiled connections; Connections Lab tool for curtailment estimation" },
        { source: "DCA Data Centre Water Usage Guide 2025", publisher: "Data Centre Alliance (DCA)", year: 2025, description: "AI increases water footprint 1,000× vs traditional search; SE England water stress risk; Anglian Water 20m³/day screening; cooling technology water impacts; adiabatic vs closed-loop trade-offs" },
        { source: "Germany's Data Center Boom is Pushing the Power Grid to its Limits", publisher: "AlgorithmWatch", year: 2025, description: "Frankfurt DCs = 40% city power demand; NRM grid fully allocated; pro-rata allocation >3.5 MW since 2020; CyrusOne FRA7 84→126 MW with gas generators; Berlin adopted pro-rata 2024; secondary markets (BB, ST, MV, SN) each receiving 100-200 DC enquiries/month" },
        { source: "Future Data Centres in Germany: Challenges and Opportunities", publisher: "Addleshaws Goddard", year: 2025, description: "EnEfG PUE mandates (≤1.2 new from 2026, ≤1.5 existing by 2027, ≤1.3 by 2030); 100% renewable by 2027; permitting thresholds (>20 MW immission, >50 MW public consultation); SuedLink postponed to 2029; BauGB privileged classification proposed but not enacted; grid access fragmented under EnWG" },
        { source: "European Data Center Power Demand to Double by 2030, Straining Grids", publisher: "S&P Global Market Intelligence / 451 Research", year: 2025, description: "European DC load 18.7 GW end-2024; 21.3 GW by end-2025; 36 GW by 2030. Germany #1 at 4.26 GW (2025); UK 3.69 GW; France 1.72 GW. E.ON targeting 6 GW Germany connections by 2030. Frankfurt already congested." },
        { source: "Data Centres: Hungry for Power — Forecasting European Power Demand to 2035", publisher: "ICIS", year: 2025, description: "Germany ~21 TWh DC consumption 2024 (largest in Europe, 4% national total). European: 96 TWh 2024 → 168 TWh 2030 → 236 TWh 2035. FLAP-D >20% of European DCs. Germany highest renewable PPA availability. Average EU PUE 1.6 (2023); hyperscale share 40% → 60% by 2030. Average PUE forecast 1.35 by 2035." },
        { source: "German start-up plans 30-megawatt AI data centre in boost to sovereign control", publisher: "Reuters", year: 2026, description: "Polarise: 30 MW AI DC in Amberg, Bavaria, online mid-2027, scalable to 120 MW; 12 MW Munich facility (opened Q2 2026) estimated at €1bn by Deutsche Telekom; sovereign/domestic AI compute focus; partner WV Energie supplying wind, solar, battery storage" },
        { source: "Marktstammdatenregister (MaStR) Gesamtdatenexport", publisher: "Bundesnetzagentur", year: 2026, description: "Live bulk export (12-Mar-2026, 2.87 GB): 31,986 operational wind turbines (88.83 GW); 81,415 combustion plants (83.4 GW); 554 registered large electricity consumers — all by Bundesland. Streamed via byte-range HTTP without full download." },
        { source: "Open Power System Data — Time Series (60-min resolution)", publisher: "Open Power System Data / ENTSO-E", year: 2020, description: "Hourly electricity load, solar, wind generation and day-ahead prices for 30+ European countries, 2015-2020. Coverage: day-ahead prices for UK (GB_GBN), Ireland (IE_SEM), Italy (IT_NORD), Denmark (DK_1), Sweden (SE_3), Norway (NO_1). Load data for all EU member states. Via Kaggle: eugeniyosetrov." },
        { source: "DE-LU Electricity Market 2019-2025", publisher: "Open Power System Data / ENTSO-E via Kaggle (williamdennis)", year: 2026, description: "Hourly day-ahead prices and generation mix (wind onshore/offshore, solar, nuclear, lignite, hard coal, gas) for German-Luxembourg bidding zone, January 2019 – December 2025. Updated 11 March 2026. 61,369 hourly rows. Includes nuclear phase-out (April 2023) and full energy crisis trajectory: 2021 €96.86/MWh → 2022 €235.44 (Aug peak €465.51) → 2024 €78.51 → 2025 €89.33." },
        { source: "NoreGeo: Norwegian Electricity in Geographic Dataset", publisher: "IEEE Data Descriptions (Zhang, Maharjan, Strunz, Bryne)", year: 2026, description: "Peer-reviewed geographic dataset covering all 356 Norwegian municipalities (2024): electricity infrastructure, hydro/wind/solar production, main power grid topology (overhead + sea cables), transformer locations, daily electricity price by zone, population. doi:10.1109/IEEEDATA.2026.3658039" },
        { source: "Electricity Statistics 2024 — Annual Report on Power Supply", publisher: "NVE (Norwegian Water Resources and Energy Directorate)", year: 2024, description: "Norwegian generation 2019–2024: Hydro 128.7 TWh (2023 drought year) to 156.2 TWh (2021 wet year); Wind 5.5 TWh (2019) → 20.5 TWh (2024); Installed: Hydro 31.5 GW, Wind 6.2 GW, Thermal 0.6 GW; consumption ~127 TWh" },
        { source: "Nordic Power System Overview — driftsdata.statnett.no", publisher: "Statnett SF (Norway TSO)", year: 2026, description: "Live public API (no auth): real-time Nordic generation and consumption for NO, SE, DK, FI, EE, LT, LV. Norway breakdown: Hydro, Wind, Thermal, Nuclear (none), total production, consumption, net exchange. Accessed March 2026." },
        { source: "PyPSA-Spain: an extension of PyPSA-Eur to model the Spanish energy system", publisher: "Cristobal Gallego-Castillo (open source)", year: 2024, description: "Open-source national energy model of Spain. Key data: PNIEC 2024 demand target 344 TWh by 2030 (up from 235 TWh in 2022); ISA environmental sensitivity index (0–4) for wind/solar siting; Spain–France interconnection constraints; regional network topology and renewable capacity allocation" },
        { source: "Plan Nacional Integrado de Energía y Clima (PNIEC) 2024", publisher: "Ministerio para la Transición Ecológica y el Reto Demográfico (MITERD)", year: 2024, description: "Spain's national energy and climate plan: 344 TWh electricity demand by 2030, 81% renewable generation target, 11.98 GW electrolysers for green hydrogen, offshore wind targets, grid investment requirements" },
        { source: "Elia Open Data Platform — opendata.elia.be", publisher: "Elia Transmission Belgium NV", year: 2026, description: "104 public datasets, 15-minute resolution, 2019–present. Key datasets: ods177 (generation by fuel type: Nuclear, Gas, Wind Offshore, Wind Onshore, Solar, Biofuels, Hydro, Storage), ods003 (real-time grid load), ods086/087 (wind/solar NRT with regional monitored capacity by Flanders/Wallonia/Brussels). No authentication required. Accessed March 2026." },
        { source: "Elia Annual Report 2024 — Power System Overview", publisher: "Elia Transmission Belgium NV", year: 2024, description: "Installed capacity: Nuclear 3.9 GW (Doel 4+Tihange 3 life-extended to 2055), Gas 5.7 GW CCGT, Wind Offshore 2.3 GW, Wind Onshore 3.6 GW, Solar 8.2 GW, Pumped Hydro (Coo-Trois-Ponts) 900 MW net. N-S internal congestion between Flanders (generation) and Wallonia/Brussels (load). €6B grid investment plan 2024-2028 including Ventilus and Borealis offshore grid." },
        { source: "MODEX Technology Benchmark — Wind Turbine CAPEX/OPEX (v12/v13)", publisher: "Open Energy Platform (OEP) / Danish Energy Agency (DEA) 2020", year: 2024, description: "Peer-reviewed technology cost parameters for European energy system models. Onshore Wind: CAPEX €1,288k/MW (2016) → €1,040k/MW (2030) → €960k/MW (2050); Fixed OPEX €23,280→€12,600→€11,340/MW/yr; Lifetime 25→30 years. Offshore Wind: CAPEX €2,714k/MW (2016) → €1,930k/MW (2030) → €1,780k/MW (2050); Fixed OPEX €53,852→€36,053→€32,448/MW/yr. Germany offshore 2050 expansion potential: North Sea 86.95 GW, Baltic 10 GW (Siala 2020 model). API: openenergyplatform.org/api/v0/schema/model_draft/tables/modex_tech_wind_turbine_onshore/rows" },
      ];

      const parsed = powerTrendContentSchema.safeParse(rawContent);
      if (!parsed.success) {
        console.error("Power Trends content validation failed:", parsed.error.errors);
        return res.status(500).json({ message: "Generated Power Trends data did not match expected format. Please try again." });
      }

      const analysis = await storage.createPowerTrendAnalysis({ content: parsed.data, country });

      storage.createAuditLog({
        userId: req.session.userId, userEmail: req.session.userEmail,
        action: "GENERATE_POWER_TRENDS", entityType: "power_trend", entityId: String(analysis.id),
        metadata: { country }, ipAddress: req.ip || req.socket.remoteAddress || null,
      }).catch(() => {});

      res.status(201).json(analysis);
    } catch (err) {
      console.error("Power Trends generation error:", err);
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Please select a country" });
      } else {
        res.status(500).json({ message: "Failed to generate Power Trends analysis" });
      }
    }
  });

  app.get(api.powerTrends.latest.path, isAuthenticated, async (req, res) => {
    const country = (req.query.country as string) || '';
    if (country) {
      const analysis = await storage.getLatestPowerTrendAnalysisByCountry(country);
      if (!analysis) {
        return res.status(404).json({ message: "No Power Trends analysis found for this country" });
      }
      return res.json(analysis);
    }
    const analysis = await storage.getLatestPowerTrendAnalysis();
    if (!analysis) {
      return res.status(404).json({ message: "No Power Trends analysis found" });
    }
    res.json(analysis);
  });

  app.get(api.powerTrends.get.path, isAuthenticated, async (req, res) => {
    const analysis = await storage.getPowerTrendAnalysis(Number(req.params.id));
    if (!analysis) {
      return res.status(404).json({ message: "Power Trends analysis not found" });
    }
    res.json(analysis);
  });

  app.get("/api/neso/demand-forecast", isAuthenticated, async (req, res) => {
    try {
      const { getDemandForecastData } = await import("./nesoDemand");
      const data = await getDemandForecastData();
      res.json(data);
    } catch (err: any) {
      console.error("[NESO] demand forecast error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to fetch demand forecast data" });
    }
  });

  app.get("/api/neso/ssep-zones", isAuthenticated, async (req, res) => {
    try {
      const { getSSEPData } = await import("./nesoData");
      const data = await getSSEPData();
      res.json(data);
    } catch (err: any) {
      console.error("NESO data fetch error:", err);
      res.status(500).json({ message: "Failed to fetch SSEP zone data" });
    }
  });

  app.get("/api/neso/forecast-14day", isAuthenticated, async (req, res) => {
    try {
      const { get14DayForecast } = await import("./nesoExtended");
      const data = await get14DayForecast();
      res.json(data);
    } catch (err: any) {
      console.error("NESO 14-day forecast error:", err);
      res.status(500).json({ message: "Failed to fetch 14-day forecast" });
    }
  });

  app.get("/api/neso/forecast-52week", isAuthenticated, async (req, res) => {
    try {
      const { get52WeekForecast } = await import("./nesoExtended");
      const data = await get52WeekForecast();
      res.json(data);
    } catch (err: any) {
      console.error("NESO 52-week forecast error:", err);
      res.status(500).json({ message: "Failed to fetch 52-week forecast" });
    }
  });

  app.get("/api/neso/transmission-losses", isAuthenticated, async (req, res) => {
    try {
      const { getTransmissionLosses } = await import("./nesoExtended");
      const data = await getTransmissionLosses();
      res.json(data);
    } catch (err: any) {
      console.error("NESO transmission losses error:", err);
      res.status(500).json({ message: "Failed to fetch transmission losses" });
    }
  });

  app.get("/api/neso/tresp-regions", isAuthenticated, async (req, res) => {
    try {
      const { getTRESPRegions } = await import("./nesoExtended");
      const data = await getTRESPRegions();
      res.json(data);
    } catch (err: any) {
      console.error("NESO TRESP regions error:", err);
      res.status(500).json({ message: "Failed to fetch TRESP regional demand" });
    }
  });

  app.get("/api/neso/tec-register", isAuthenticated, async (req, res) => {
    try {
      const { getTECRegister } = await import("./nesoExtended");
      const data = await getTECRegister();
      res.json(data);
    } catch (err: any) {
      console.error("NESO TEC register error:", err);
      res.status(500).json({ message: "Failed to fetch TEC register data" });
    }
  });

  app.get("/api/electricity-prices", isAuthenticated, async (req, res) => {
    try {
      const dataPath = path.join(process.cwd(), "server/data/electricity_prices.json");
      const raw = fs.readFileSync(dataPath, "utf-8");
      const data = JSON.parse(raw);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    } catch (err: any) {
      console.error("Electricity prices route error:", err);
      res.status(500).json({ message: "Failed to load electricity price data" });
    }
  });

  // ─── ENTSO-E Transparency Platform — Live Electricity Prices ──────────────
  app.get("/api/entsoe/status", isAuthenticated, async (req, res) => {
    const { isEntsoeConfigured } = await import("./entsoe");
    res.json({ configured: isEntsoeConfigured() });
  });

  app.get("/api/entsoe/prices", isAuthenticated, async (req, res) => {
    try {
      const country = req.query.country as string;
      if (!country) return res.status(400).json({ message: "country parameter required" });
      const { getCountryDayAheadPrices, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured", configured: false });
      }
      const data = await getCountryDayAheadPrices(country);
      if (!data) return res.status(404).json({ message: `No ENTSO-E data available for: ${country}` });
      res.json(data);
    } catch (err: any) {
      console.error("ENTSO-E prices route error:", err);
      res.status(500).json({ message: "Failed to fetch ENTSO-E price data", error: err.message });
    }
  });

  app.get("/api/entsoe/generation", isAuthenticated, async (req, res) => {
    try {
      const country = req.query.country as string;
      if (!country) return res.status(400).json({ message: "country parameter required" });
      const { getCountryGeneration, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured", configured: false });
      }
      const data = await getCountryGeneration(country);
      if (!data) return res.status(404).json({ message: `No ENTSO-E generation data for: ${country}` });
      res.json(data);
    } catch (err: any) {
      console.error("ENTSO-E generation route error:", err);
      res.status(500).json({ message: "Failed to fetch ENTSO-E generation data", error: err.message });
    }
  });

  app.get("/api/entsoe/generation-timeseries", isAuthenticated, async (req, res) => {
    try {
      const country = req.query.country as string;
      if (!country) return res.status(400).json({ message: "country parameter required" });

      // UK is not on ENTSO-E post-Brexit — use NESO Historic Generation Mix instead
      if (country === "United Kingdom") {
        const { getUKGenerationTimeSeries } = await import("./ukgen");
        const ukData = await getUKGenerationTimeSeries();
        if (!ukData) return res.status(404).json({ message: "No UK generation data available" });
        // UKGenerationResult already matches the ENTSO-E shape (MW values, same field names)
        return res.json(ukData);
      }

      const { getCountryGenerationTimeSeries, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured", configured: false });
      }
      const data = await getCountryGenerationTimeSeries(country);
      if (!data) return res.status(404).json({ message: `No ENTSO-E generation time-series data for: ${country}` });
      res.json({ ...data, dataUnit: "MW", source: "ENTSO-E Transparency Platform" });
    } catch (err: any) {
      console.error("ENTSO-E generation-timeseries route error:", err);
      res.status(500).json({ message: "Failed to fetch generation time series", error: err.message });
    }
  });

  // ── ENTSO-E live connectivity test — hit from browser while logged in ───────
  // Returns raw HTTP status + first 500 chars of ENTSO-E response.
  // Use to diagnose API key / auth issues without needing Railway log access.
  app.get("/api/entsoe/test", isAuthenticated, async (req, res) => {
    const token = process.env.ENTSOE_API_KEY;
    if (!token) return res.json({ ok: false, error: "ENTSOE_API_KEY not set" });
    try {
      const now = new Date();
      now.setUTCHours(22, 0, 0, 0);
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      yesterday.setUTCHours(0, 0, 0, 0);
      const fmt = (d: Date) => d.toISOString().replace(/[-T:]/g, "").slice(0, 12);
      const url = `https://external-api.tp.entsoe.eu/api?securityToken=${token}&documentType=A44&in_Domain=10Y1001A1001A82H&out_Domain=10Y1001A1001A82H&periodStart=${fmt(yesterday)}&periodEnd=${fmt(now)}`;
      const t0 = Date.now();
      const resp = await fetch(url, {
        headers: { Accept: "application/xml" },
        signal: AbortSignal.timeout(15000),
      });
      const body = await resp.text();
      const elapsed = Date.now() - t0;
      const snippet = body.replace(/\s+/g, " ").slice(0, 500);
      const hasData = body.includes("TimeSeries");
      const hasError = body.includes("Acknowledgement_MarketDocument");
      const errorCode = hasError ? (body.match(/<code>(\d+)<\/code>/)?.[1] ?? "?") : null;
      const errorMsg  = hasError ? (body.match(/<text>([^<]+)<\/text>/)?.[1] ?? "?") : null;
      console.log(`[entsoe-test] HTTP ${resp.status} | hasData=${hasData} | hasError=${hasError} | ${elapsed}ms`);
      return res.json({ ok: resp.ok && hasData, status: resp.status, hasData, hasError, errorCode, errorMsg, elapsed, snippet });
    } catch (err: any) {
      return res.json({ ok: false, error: err.message });
    }
  });

  app.get("/api/entsoe/all-prices", isAuthenticated, async (req, res) => {
    try {
      const { getAllCountriesPriceSummary, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured", configured: false });
      }
      const data = await getAllCountriesPriceSummary();

      // Enrich Turkey with EPİAŞ day-ahead price when ENTSO-E returns null.
      // Turkey's TSO (TEİAŞ) doesn't publish via ENTSO-E — prices come from
      // EPİAŞ (Energy Exchange Istanbul / EXIST) instead.
      const turkeyEntry = data.find(s => s.country === "Turkey");
      if (turkeyEntry && turkeyEntry.latestMonthAvg === null) {
        try {
          const { getTurkeyDayAheadPrices, isEpiasConfigured } = await import("./epiasData");
          if (isEpiasConfigured()) {
            const epias = await getTurkeyDayAheadPrices();
            if (epias.dailyAvgEUR !== null) {
              turkeyEntry.latestMonthAvg  = Math.round(epias.dailyAvgEUR * 100) / 100;
              turkeyEntry.latestMonthLabel = epias.date.slice(0, 7); // "YYYY-MM"
              turkeyEntry.estimated        = true;
              turkeyEntry.estimatedNote    = `EPİAŞ MCP day-ahead avg ${epias.dailyAvgTRY?.toFixed(0)} TRY/MWh (${epias.date})`;
              console.log(`[EPIAS] Injected Turkey price: ${turkeyEntry.latestMonthAvg} EUR/MWh`);
            }
          }
        } catch (epiasErr) {
          // EPİAŞ failure must never break the ENTSO-E response
          console.warn("[EPIAS] Turkey price enrichment failed:", epiasErr instanceof Error ? epiasErr.message : epiasErr);
        }
      }

      res.json(data);
    } catch (err: any) {
      console.error("ENTSO-E all-prices route error:", err);
      res.status(500).json({ message: "Failed to fetch ENTSO-E data", error: err.message });
    }
  });

  app.get("/api/entsoe/cross-border-flows/latest-hour", isAuthenticated, async (req, res) => {
    try {
      const { findLatestAvailableHourOffset, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured" });
      }
      const latestOffset = await findLatestAvailableHourOffset();
      const now = new Date();
      now.setUTCMinutes(0, 0, 0);
      const dataHour = new Date(now.getTime() - latestOffset * 60 * 60 * 1000);
      res.json({ latestOffset, dataHour: dataHour.toISOString() });
    } catch (err: any) {
      console.error("ENTSO-E latest-hour route error:", err);
      res.status(500).json({ message: "Failed to detect latest available hour", error: err.message });
    }
  });

  app.get("/api/entsoe/cross-border-flows", isAuthenticated, async (req, res) => {
    try {
      const { getCrossBorderFlows, isEntsoeConfigured } = await import("./entsoe");
      if (!isEntsoeConfigured()) {
        return res.status(503).json({ message: "ENTSOE_API_KEY not configured", configured: false });
      }
      const hourOffset = Math.max(0, Math.min(36, parseInt(req.query.hourOffset as string || "0", 10)));
      const data = await getCrossBorderFlows(hourOffset);
      const nonZero = data.filter(f => f.netMw !== 0).length;
      console.log(`[ENTSOE] cross-border-flows: ${data.length} pairs, ${nonZero} non-zero, hourOffset=${hourOffset}`);
      if (data.length > 0 && nonZero > 0) {
        const top3 = [...data].sort((a, b) => Math.abs(b.netMw) - Math.abs(a.netMw)).slice(0, 3);
        console.log(`[ENTSOE] top flows: ${top3.map(f => `${f.from}→${f.to} ${f.netMw}MW`).join(", ")}`);
      }
      res.json(data);
    } catch (err: any) {
      console.error("ENTSO-E cross-border flows route error:", err);
      res.status(500).json({ message: "Failed to fetch cross-border flow data", error: err.message });
    }
  });

  // ─── European Country GeoJSON (for transmission map) ─────────────────────
  let geoCache: { data: any; fetchedAt: number } | null = null;
  const GEO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Maps GISCO CNTR_ID → full country name used throughout the app.
  // GISCO (ec.europa.eu) uses ISO 3166-1 alpha-2 with two EU-specific exceptions:
  //   EL → Greece  (EU/NUTS code; ISO uses GR)
  //   UK → United Kingdom  (EU code; ISO uses GB)
  // Both variants are included so the filter works regardless of dataset version.
  const ISO_TO_COUNTRY: Record<string, string> = {
    // Western & Northern Europe
    "GB": "United Kingdom", "UK": "United Kingdom",
    "IE": "Ireland",
    "NO": "Norway",         "SE": "Sweden",       "DK": "Denmark",   "FI": "Finland",
    // Baltic States
    "EE": "Estonia",        "LV": "Latvia",       "LT": "Lithuania",
    // Central Western Europe
    "DE": "Germany",        "NL": "Netherlands",  "BE": "Belgium",
    "LU": "Luxembourg",     "FR": "France",       "CH": "Switzerland", "AT": "Austria",
    // Iberian
    "ES": "Spain",          "PT": "Portugal",
    // Central Eastern Europe
    "PL": "Poland",         "CZ": "Czech Republic", "SK": "Slovakia", "HU": "Hungary",
    // Southern Europe
    "IT": "Italy",          "SI": "Slovenia",     "HR": "Croatia",
    "GR": "Greece",         "EL": "Greece",       // EL = GISCO/EU code for Greece
    // South-Eastern Europe / Balkans
    "RO": "Romania",        "BG": "Bulgaria",     "RS": "Serbia",    "BA": "Bosnia",
    "ME": "Montenegro",     "MK": "North Macedonia", "AL": "Albania", "MD": "Moldova",
    "TR": "Turkey",
  };

  app.get("/api/geo/europe", isAuthenticated, async (req, res) => {
    try {
      if (geoCache && Date.now() - geoCache.fetchedAt < GEO_CACHE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(geoCache.data);
      }
      const url = "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_60M_2020_4326.geojson";
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`GISCO returned ${response.status}`);
      const raw = await response.json();
      const filtered: any = {
        type: "FeatureCollection",
        features: (raw.features as any[])
          .filter((f: any) => ISO_TO_COUNTRY[f.properties?.CNTR_ID])
          .map((f: any) => ({
            type: "Feature",
            properties: {
              isoCode: f.properties.CNTR_ID,
              country: ISO_TO_COUNTRY[f.properties.CNTR_ID],
              name: f.properties.NAME_ENGL,
            },
            geometry: f.geometry,
          })),
      };
      geoCache = { data: filtered, fetchedAt: Date.now() };
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(filtered);
    } catch (err: any) {
      console.error("GeoJSON Europe route error:", err);
      res.status(500).json({ message: "Failed to fetch European GeoJSON", error: err.message });
    }
  });

  // ─── NED — Netherlands National Energy Dashboard ─────────────────────────
  app.get("/api/ned/nl", isAuthenticated, async (req, res) => {
    try {
      const { getNetherlandsData } = await import("./ned");
      const data = await getNetherlandsData();
      res.json(data);
    } catch (err: any) {
      console.error("NED route error:", err);
      res.status(500).json({ message: "Failed to fetch NED data", error: err.message });
    }
  });

  // ─── PSE SA — Poland Grid Intelligence ───────────────────────────────────
  app.get("/api/pse/pl", isAuthenticated, async (req, res) => {
    try {
      const { getPolandData } = await import("./pse");
      const data = await getPolandData();
      res.json(data);
    } catch (err: any) {
      console.error("PSE route error:", err);
      res.status(500).json({ message: "Failed to fetch PSE data", error: err.message });
    }
  });

  // ─── Terna — Italy Grid Intelligence ─────────────────────────────────────
  app.get("/api/terna/it", isAuthenticated, async (req, res) => {
    try {
      const { getItalyData } = await import("./terna");
      const data = getItalyData();
      res.json(data);
    } catch (err: any) {
      console.error("Terna route error:", err);
      res.status(500).json({ message: "Failed to fetch Terna data", error: err.message });
    }
  });

  // ─── Fingrid — Finland Grid Intelligence ─────────────────────────────────
  app.get("/api/fingrid/fi", isAuthenticated, async (req, res) => {
    try {
      const { getFinlandData } = await import("./fingrid");
      const data = await getFinlandData();
      res.json(data);
    } catch (err: any) {
      console.error("Fingrid route error:", err);
      res.status(500).json({ message: "Failed to fetch Fingrid data", error: err.message });
    }
  });

  // ─── REE Spain — Spain Grid Intelligence ─────────────────────────────────
  app.get("/api/ree/es", isAuthenticated, async (req, res) => {
    try {
      const { getSpainData } = await import("./ree");
      const data = await getSpainData();
      res.json(data);
    } catch (err: any) {
      console.error("REE route error:", err);
      res.status(500).json({ message: "Failed to fetch REE data", error: err.message });
    }
  });

  // ─── Statnett Norway — Norway Grid Intelligence ───────────────────────────
  app.get("/api/statnett/no", isAuthenticated, async (req, res) => {
    try {
      const { getNorwayData } = await import("./statnett");
      const data = await getNorwayData();
      res.json(data);
    } catch (err: any) {
      console.error("Statnett route error:", err);
      res.status(500).json({ message: "Failed to fetch Statnett data", error: err.message });
    }
  });

  // ─── Elia Belgium Open Data — Belgium Grid Intelligence ──────────────────
  app.get("/api/elia/be", isAuthenticated, async (req, res) => {
    try {
      const { getBelgiumData } = await import("./elia");
      const data = await getBelgiumData();
      res.json(data);
    } catch (err: any) {
      console.error("Elia route error:", err);
      res.status(500).json({ message: "Failed to fetch Elia Belgium data", error: err.message });
    }
  });

  // ─── RTE France Open Data — France Grid Intelligence ─────────────────────
  app.get("/api/rte/fr", isAuthenticated, async (req, res) => {
    try {
      const { getFranceData } = await import("./rte");
      const data = await getFranceData();
      res.json(data);
    } catch (err: any) {
      console.error("RTE route error:", err);
      res.status(500).json({ message: "Failed to fetch RTE data", error: err.message });
    }
  });

  // ─── Energy Charts (Fraunhofer ISE) — Germany Actual Generation ──────────
  app.get("/api/energy-charts/de", isAuthenticated, async (req, res) => {
    try {
      const { getGermanyGeneration } = await import("./energycharts");
      const data = await getGermanyGeneration();
      res.json(data);
    } catch (err: any) {
      console.error("Energy Charts route error:", err);
      res.status(500).json({ message: "Failed to fetch Energy Charts data", error: err.message });
    }
  });

  // ─── Energy Charts — Installed Power, Grid Signal, Ren Share ─────────────
  app.get("/api/energy-charts/installed-power", isAuthenticated, async (req, res) => {
    try {
      const country = String(req.query.country || "de");
      const { getInstalledPower, COUNTRY_TO_EC_CODE } = await import("./energycharts");
      const code = Object.values(COUNTRY_TO_EC_CODE).includes(country) ? country : "de";
      res.json(await getInstalledPower(code));
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch installed power", error: err.message });
    }
  });

  app.get("/api/energy-charts/signal", isAuthenticated, async (req, res) => {
    try {
      const country = String(req.query.country || "de");
      const { getGridSignal, COUNTRY_TO_EC_CODE } = await import("./energycharts");
      const code = Object.values(COUNTRY_TO_EC_CODE).includes(country) ? country : "de";
      res.json(await getGridSignal(code));
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch grid signal", error: err.message });
    }
  });

  app.get("/api/energy-charts/ren-share", isAuthenticated, async (req, res) => {
    try {
      const country = String(req.query.country || "de");
      const { getRenShareDailyAvg, COUNTRY_TO_EC_CODE } = await import("./energycharts");
      const code = Object.values(COUNTRY_TO_EC_CODE).includes(country) ? country : "de";
      res.json(await getRenShareDailyAvg(code));
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch ren share data", error: err.message });
    }
  });

  // ─── Open Energy Platform (OEP) — MODEX Technology Benchmarks ────────────
  app.get("/api/oep/benchmarks", isAuthenticated, async (req, res) => {
    try {
      const { getOEPBenchmarks } = await import("./oep");
      const data = await getOEPBenchmarks();
      res.json(data);
    } catch (err: any) {
      console.error("OEP benchmarks route error:", err);
      res.status(500).json({ message: "Failed to fetch OEP benchmark data", error: err.message });
    }
  });

  app.get("/api/ireland/planning-applications", isAuthenticated, async (req, res) => {
    try {
      const { getPlanningApplications } = await import("./irelandData");
      const data = await getPlanningApplications();
      res.json(data);
    } catch (err: any) {
      console.error("Ireland planning applications route error:", err);
      res.status(500).json({ message: "Failed to fetch planning applications", error: err.message });
    }
  });

  app.get("/api/ireland/traffic-sensors", isAuthenticated, async (req, res) => {
    try {
      const { getTrafficSensors } = await import("./irelandData");
      res.json(getTrafficSensors());
    } catch (err: any) {
      console.error("Ireland traffic sensors route error:", err);
      res.status(500).json({ message: "Failed to fetch traffic sensor data", error: err.message });
    }
  });

  app.get("/api/ukpn/datacentres", isAuthenticated, async (req, res) => {
    try {
      const { isUkpnConfigured, getUKPNDataCentres } = await import("./ukpn");
      if (!isUkpnConfigured()) {
        return res.status(503).json({ message: "UKPN_API_KEY not configured", configured: false });
      }
      const data = await getUKPNDataCentres();
      if (!data) return res.status(404).json({ message: "No UKPN data centre data available" });
      res.json(data);
    } catch (err: any) {
      console.error("UKPN data centres route error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN data centre data", error: err.message });
    }
  });

  app.get("/api/powerplants", isAuthenticated, async (req, res) => {
    try {
      const { getPowerPlants } = await import("./powerplants");
      const data = await getPowerPlants();
      res.json(data);
    } catch (err: any) {
      console.error("Power plants route error:", err);
      res.status(500).json({ message: "Failed to fetch power plant data", error: err.message });
    }
  });

  // ─── UKPN Distribution Network Data ──────────────────────────────────────
  app.get("/api/ukpn/grid-substations", isAuthenticated, async (req, res) => {
    try {
      const { getGridSubstations } = await import("./ukpnData");
      const data = await getGridSubstations();
      res.json(data);
    } catch (err: any) {
      console.error("UKPN grid substations error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN grid substation data", error: err.message });
    }
  });

  app.get("/api/ukpn/connection-queue", isAuthenticated, async (req, res) => {
    try {
      const { getConnectionQueue } = await import("./ukpnData");
      const data = await getConnectionQueue();
      res.json(data);
    } catch (err: any) {
      console.error("UKPN connection queue error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN connection queue data", error: err.message });
    }
  });

  app.get("/api/ukpn/fault-levels", isAuthenticated, async (req, res) => {
    try {
      const { getFaultLevels } = await import("./ukpnData");
      const data = await getFaultLevels();
      res.json(data);
    } catch (err: any) {
      console.error("UKPN fault levels error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN fault level data", error: err.message });
    }
  });

  app.get("/api/ukpn/grid-primary-sites", isAuthenticated, async (req, res) => {
    try {
      const { getGridAndPrimarySites } = await import("./ukpnData");
      const data = await getGridAndPrimarySites();
      res.json(data);
    } catch (err: any) {
      console.error("UKPN grid & primary sites error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN grid & primary site data", error: err.message });
    }
  });

  app.get("/api/ukpn/dfes-headroom", isAuthenticated, async (req, res) => {
    try {
      const { getUKPNDFESHeadroom } = await import("./ukpnData");
      const data = await getUKPNDFESHeadroom();
      res.json(data);
    } catch (err: any) {
      console.error("UKPN DFES headroom error:", err);
      res.status(500).json({ message: "Failed to fetch UKPN DFES headroom data", error: err.message });
    }
  });

  app.get("/api/ssen/headroom", isAuthenticated, async (req, res) => {
    try {
      const { getSSENHeadroom } = await import("./ssenData");
      const data = await getSSENHeadroom();
      res.json(data);
    } catch (err: any) {
      console.error("SSEN headroom error:", err);
      res.status(500).json({ message: "Failed to fetch SSEN network headroom data", error: err.message });
    }
  });

  app.get("/api/ssen/dc-probability", isAuthenticated, async (req, res) => {
    try {
      const { getSSENDCProbability } = await import("./ssenData");
      const data = await getSSENDCProbability();
      res.json(data);
    } catch (err: any) {
      console.error("SSEN DC probability error:", err);
      res.status(500).json({ message: "Failed to compute SSEN DC probability", error: err.message });
    }
  });

  app.get("/api/npg/utilisation", isAuthenticated, async (req, res) => {
    try {
      const { getNPGUtilisation } = await import("./npgData");
      const data = await getNPGUtilisation();
      res.json(data);
    } catch (err: unknown) {
      console.error("NPG utilisation error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("not configured")) {
        res.status(503).json({ message: "NPG_API_KEY not configured. Register at northernpowergrid.opendatasoft.com to obtain an API key, then set NPG_API_KEY in secrets." });
      } else {
        res.status(500).json({ message: "Failed to fetch NPG utilisation data" });
      }
    }
  });

  app.get("/api/npg/connection-queue", isAuthenticated, async (req, res) => {
    try {
      const { getNPGConnectionQueue } = await import("./npgData");
      const data = await getNPGConnectionQueue();
      res.json(data);
    } catch (err: unknown) {
      console.error("NPG connection queue error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const msg = errMsg.includes("not configured") ? "NPG_API_KEY not configured" : "Failed to fetch NPG connection queue data";
      res.status(500).json({ message: msg });
    }
  });

  app.get("/api/npg/ndp-headroom", isAuthenticated, async (req, res) => {
    try {
      const { getNPGNDPHeadroom } = await import("./npgData");
      const data = await getNPGNDPHeadroom();
      res.json(data);
    } catch (err: unknown) {
      console.error("NPG NDP headroom error:", err);
      res.status(500).json({ message: "Failed to fetch NPg NDP headroom data" });
    }
  });

  // ─── NGED (National Grid Electricity Distribution) Data ───────────────
  function ngedErrorResponse(err: any, fallbackMessage: string): { status: number; body: { message: string; error: string } } {
    if (err?.name === "NGEDApiKeyMissingError") {
      return { status: 503, body: { message: err.message, error: err.message } };
    }
    return { status: 500, body: { message: fallbackMessage, error: err?.message || "Unknown error" } };
  }

  app.get("/api/nged/network-capacity", isAuthenticated, async (req, res) => {
    try {
      const { getNetworkCapacity } = await import("./ngedData");
      const data = await getNetworkCapacity();
      res.json(data);
    } catch (err: any) {
      console.error("NGED network capacity error:", err);
      const resp = ngedErrorResponse(err, "Failed to fetch NGED network capacity data");
      res.status(resp.status).json(resp.body);
    }
  });

  app.get("/api/nged/opportunity-map", isAuthenticated, async (req, res) => {
    try {
      const { getOpportunityMap } = await import("./ngedData");
      const data = await getOpportunityMap();
      res.json(data);
    } catch (err: any) {
      console.error("NGED opportunity map error:", err);
      const resp = ngedErrorResponse(err, "Failed to fetch NGED opportunity map data");
      res.status(resp.status).json(resp.body);
    }
  });

  app.get("/api/nged/generation-register", isAuthenticated, async (req, res) => {
    try {
      const { getGenerationRegister } = await import("./ngedData");
      const data = await getGenerationRegister();
      res.json(data);
    } catch (err: any) {
      console.error("NGED generation register error:", err);
      const resp = ngedErrorResponse(err, "Failed to fetch NGED generation register data");
      res.status(resp.status).json(resp.body);
    }
  });

  app.get("/api/nged/gcr-summary-by-technology", isAuthenticated, async (req, res) => {
    try {
      const { getGCRSummaryByTechnology } = await import("./ngedData");
      const data = await getGCRSummaryByTechnology();
      res.json(data);
    } catch (err: any) {
      console.error("NGED GCR summary error:", err);
      const resp = ngedErrorResponse(err, "Failed to fetch NGED GCR summary data");
      res.status(resp.status).json(resp.body);
    }
  });

  app.get("/api/nged/embedded-capacity-register", isAuthenticated, async (req, res) => {
    try {
      const { getEmbeddedCapacityRegister } = await import("./ngedData");
      const data = await getEmbeddedCapacityRegister();
      res.json(data);
    } catch (err: any) {
      console.error("NGED embedded capacity register error:", err);
      const resp = ngedErrorResponse(err, "Failed to fetch NGED embedded capacity register data");
      res.status(resp.status).json(resp.body);
    }
  });

  // ─── Electricity North West (ENW) Data ───────────────────────────────────
  app.get("/api/enw/headroom", isAuthenticated, async (req, res) => {
    try {
      const { getENWHeadroom } = await import("./enwData");
      const data = await getENWHeadroom();
      res.json(data);
    } catch (err: unknown) {
      console.error("ENW headroom error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("not configured")) {
        res.status(503).json({ message: "ENW_API_KEY not configured. Set ENW_API_KEY in secrets." });
      } else {
        res.status(500).json({ message: "Failed to fetch ENW headroom data" });
      }
    }
  });

  // ─── ONS (Operador Nacional do Sistema Elétrico — Brazil) Data ───────────
  app.get("/api/ons/generation", isAuthenticated, async (_req, res) => {
    try {
      const { getGeneration } = await import("./onsData");
      res.json(await getGeneration());
    } catch (err) {
      console.error("ONS generation error:", err);
      res.status(500).json({ message: "Failed to fetch ONS generation data" });
    }
  });

  app.get("/api/ons/demand", isAuthenticated, async (_req, res) => {
    try {
      const { getDemand } = await import("./onsData");
      res.json(await getDemand());
    } catch (err) {
      console.error("ONS demand error:", err);
      res.status(500).json({ message: "Failed to fetch ONS demand data" });
    }
  });

  app.get("/api/ons/load-curve", isAuthenticated, async (_req, res) => {
    try {
      const { getLoadCurve } = await import("./onsData");
      res.json(await getLoadCurve());
    } catch (err) {
      console.error("ONS load curve error:", err);
      res.status(500).json({ message: "Failed to fetch ONS load curve data" });
    }
  });

  app.get("/api/ons/capacity", isAuthenticated, async (_req, res) => {
    try {
      const { getCapacity } = await import("./onsData");
      res.json(await getCapacity());
    } catch (err) {
      console.error("ONS capacity error:", err);
      res.status(500).json({ message: "Failed to fetch ONS capacity data" });
    }
  });

  app.get("/api/ons/cross-border", isAuthenticated, async (_req, res) => {
    try {
      const { getInternationalExchange } = await import("./onsData");
      res.json(await getInternationalExchange());
    } catch (err) {
      console.error("ONS cross-border error:", err);
      res.status(500).json({ message: "Failed to fetch ONS international exchange data" });
    }
  });

  app.get("/api/ons/subsystem-exchange", isAuthenticated, async (_req, res) => {
    try {
      const { getSubsystemExchange } = await import("./onsData");
      res.json(await getSubsystemExchange());
    } catch (err) {
      console.error("ONS subsystem exchange error:", err);
      res.status(500).json({ message: "Failed to fetch ONS subsystem exchange data" });
    }
  });

  app.get("/api/ons/capacity-factor", isAuthenticated, async (_req, res) => {
    try {
      const { getCapacityFactor } = await import("./onsData");
      res.json(await getCapacityFactor());
    } catch (err) {
      console.error("ONS capacity factor error:", err);
      res.status(500).json({ message: "Failed to fetch ONS capacity factor data" });
    }
  });

  app.get("/api/ons/thermal-dispatch", isAuthenticated, async (_req, res) => {
    try {
      const { getThermalDispatch } = await import("./onsData");
      res.json(await getThermalDispatch());
    } catch (err) {
      console.error("ONS thermal dispatch error:", err);
      res.status(500).json({ message: "Failed to fetch ONS thermal dispatch data" });
    }
  });

  // ─── EIA (US Energy Information Administration) Data ─────────────────────
  function eiaErrorResponse(err: unknown): { status: number; body: { message: string } } {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not configured")) return { status: 503, body: { message: msg } };
    return { status: 500, body: { message: `EIA data fetch failed: ${msg}` } };
  }

  app.get("/api/eia/generation", isAuthenticated, async (_req, res) => {
    try {
      const { getGenerationByFuelType } = await import("./eiaData");
      res.json(await getGenerationByFuelType());
    } catch (err) {
      console.error("EIA generation error:", err);
      const r = eiaErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get("/api/eia/prices", isAuthenticated, async (_req, res) => {
    try {
      const { getRetailPrices } = await import("./eiaData");
      res.json(await getRetailPrices());
    } catch (err) {
      console.error("EIA prices error:", err);
      const r = eiaErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get("/api/eia/demand", isAuthenticated, async (_req, res) => {
    try {
      const { getRegionDemand } = await import("./eiaData");
      res.json(await getRegionDemand());
    } catch (err) {
      console.error("EIA demand error:", err);
      const r = eiaErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get("/api/eia/interchange", isAuthenticated, async (_req, res) => {
    console.log(`[EIA route] /api/eia/interchange hit — EIA_API_KEY present: ${!!process.env.EIA_API_KEY}`);
    try {
      const { getInterchangeData } = await import("./eiaData");
      res.json(await getInterchangeData());
    } catch (err) {
      console.error("EIA interchange error:", err);
      const r = eiaErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  // ─── EPİAŞ (EXIST) Turkey Electricity Market ─────────────────────────────

  function epiasErrorResponse(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not configured")) return { status: 503, body: { message: msg } };
    return { status: 500, body: { message: `EPİAŞ data fetch failed: ${msg}` } };
  }

  app.get("/api/epias/prices", isAuthenticated, async (_req, res) => {
    try {
      const { getTurkeyDayAheadPrices, isEpiasConfigured } = await import("./epiasData");
      if (!isEpiasConfigured()) return res.status(503).json({ message: "EPIAS_USERNAME / EPIAS_PASSWORD not configured" });
      res.json(await getTurkeyDayAheadPrices());
    } catch (err) {
      console.error("[EPIAS] prices route error:", err);
      const r = epiasErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get("/api/epias/generation", isAuthenticated, async (_req, res) => {
    try {
      const { getTurkeyGeneration, isEpiasConfigured } = await import("./epiasData");
      if (!isEpiasConfigured()) return res.status(503).json({ message: "EPIAS_USERNAME / EPIAS_PASSWORD not configured" });
      res.json(await getTurkeyGeneration());
    } catch (err) {
      console.error("[EPIAS] generation route error:", err);
      const r = epiasErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  app.get("/api/epias/consumption", isAuthenticated, async (_req, res) => {
    try {
      const { getTurkeyConsumption, isEpiasConfigured } = await import("./epiasData");
      if (!isEpiasConfigured()) return res.status(503).json({ message: "EPIAS_USERNAME / EPIAS_PASSWORD not configured" });
      res.json(await getTurkeyConsumption());
    } catch (err) {
      console.error("[EPIAS] consumption route error:", err);
      const r = epiasErrorResponse(err);
      res.status(r.status).json(r.body);
    }
  });

  // ─── World Bank Open Data ─────────────────────────────────────────────────
  app.get("/api/worldbank/indicators", isAuthenticated, async (req, res) => {
    try {
      const country = typeof req.query.country === "string" ? req.query.country : "";
      if (!country) return res.status(400).json({ message: "country query parameter is required" });
      const { getCountryIndicators } = await import("./worldBankData");
      const result = await getCountryIndicators(country);
      if (!result) return res.status(404).json({ message: `No World Bank mapping for country: ${country}` });
      res.json(result);
    } catch (err) {
      console.error("World Bank indicators error:", err);
      res.status(500).json({ message: "Failed to fetch World Bank indicators" });
    }
  });

  // ─── Data Centre Dataset (1GigLabs primary + supplementary fallback) ───────
  app.get("/api/1gl/datacentres", isAuthenticated, async (req, res) => {
    try {
      const { getDcInsightsRecords, isDcInsightsAvailable } = await import("./dcInsightsData");
      if (isDcInsightsAvailable()) {
        return res.json(getDcInsightsRecords());
      }
      // Fallback: 1GL DB records
      const records = await storage.listOneGLDatacentres();
      res.json(records);
    } catch (err: any) {
      console.error("Datacentres list error:", err);
      res.status(500).json({ message: "Failed to fetch data centres" });
    }
  });

  // Supplementary refresh — fetches 1GL API into the DB fallback store (admin only)
  app.post("/api/1gl/refresh", isAuthenticated, async (req, res) => {
    try {
      const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      const userEmail = (req.session?.userEmail || "").toLowerCase();
      if (adminEmails.length === 0 || !adminEmails.includes(userEmail)) {
        return res.status(403).json({ message: "Admin access required. Set ADMIN_EMAILS in environment secrets." });
      }

      const { isOneGLConfigured, scrapeOneGLDatacentres, clearOneGLCache } = await import("./DCData");
      if (!isOneGLConfigured()) {
        return res.status(400).json({ message: "ONEGL_MAPBOX_TOKEN is not configured. 1GL tile API is unavailable." });
      }
      clearOneGLCache();
      const records = await scrapeOneGLDatacentres(true);
      const result = await storage.upsertOneGLDatacentres(records);
      res.json({
        message: `1GL supplementary refresh complete`,
        scraped: records.length,
        inserted: result.inserted,
        updated: result.updated,
      });
    } catch (err: any) {
      console.error("1GL refresh error:", err);
      res.status(500).json({ message: err.message || "Failed to refresh 1GL data" });
    }
  });

  // ── EMODnet Human Activities – offshore wind farms ────────────────────────
  // Source: https://ows.emodnet-humanactivities.eu/wfs (open, no key)
  let emodnetWindCache: { data: any; fetchedAt: number } | null = null;
  const EMODNET_WIND_TTL = 24 * 60 * 60 * 1000; // 24h

  app.get("/api/emodnet/windfarms", isAuthenticated, async (req, res) => {
    try {
      if (emodnetWindCache && Date.now() - emodnetWindCache.fetchedAt < EMODNET_WIND_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(emodnetWindCache.data);
      }
      const url = "https://ows.emodnet-humanactivities.eu/wfs?service=WFS&version=1.1.0&request=getFeature&typeName=emodnet:windfarms&outputFormat=application/json";
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`EMODnet WFS error: ${resp.status}`);
      const geojson = await resp.json();
      // Simplify: return only fields we need
      const features = (geojson.features || []).map((f: any) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name: f.properties.name,
          country: f.properties.country,
          status: f.properties.status,
          power_mw: f.properties.power_mw,
          n_turbines: f.properties.n_turbines,
          type_inst: f.properties.type_inst,
          year: f.properties.year,
          dist_coast: f.properties.dist_coast,
          notes: f.properties.notes,
        },
      }));
      const result = { type: "FeatureCollection", features };
      emodnetWindCache = { data: result, fetchedAt: Date.now() };
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(result);
    } catch (err: any) {
      console.error("EMODnet wind farms error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch EMODnet wind farm data" });
    }
  });

  // ── EMODnet Human Activities – submarine power cables ─────────────────────
  let emodnetCablesCache: { data: any; fetchedAt: number } | null = null;
  const EMODNET_CABLES_TTL = 24 * 60 * 60 * 1000; // 24h
  const CABLE_LAYERS = [
    "pcablesbshcontis",  // Germany / Baltic (89)
    "pcablesshom",       // France SHOM (142)
    "pcablesrijks",      // Netherlands Rijkswaterstaat (37)
    "pcablesnve",        // Norway NVE (918)
  ] as const;

  app.get("/api/emodnet/powercables", isAuthenticated, async (req, res) => {
    try {
      if (emodnetCablesCache && Date.now() - emodnetCablesCache.fetchedAt < EMODNET_CABLES_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(emodnetCablesCache.data);
      }
      const allFeatures: any[] = [];
      await Promise.all(
        CABLE_LAYERS.map(async (layer) => {
          const url = `https://ows.emodnet-humanactivities.eu/wfs?service=WFS&version=1.1.0&request=getFeature&typeName=emodnet:${layer}&outputFormat=application/json`;
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const geojson = await resp.json();
            (geojson.features || []).forEach((f: any) => {
              allFeatures.push({
                type: "Feature",
                geometry: f.geometry,
                properties: {
                  source: layer,
                  name: f.properties.name_ || f.properties.name || "",
                  status: f.properties.status || "",
                  featuretyp: f.properties.featuretyp || f.properties.type || "",
                },
              });
            });
          } catch (e) {
            console.warn(`EMODnet cable layer ${layer} failed:`, e);
          }
        })
      );
      const result = { type: "FeatureCollection", features: allFeatures };
      emodnetCablesCache = { data: result, fetchedAt: Date.now() };
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(result);
    } catch (err: any) {
      console.error("EMODnet power cables error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch EMODnet power cable data" });
    }
  });

  // ── Submarine Cable Map – proxy for submarinecablemap.com API ──────────────
  let subCablesCache: { data: any; fetchedAt: number } | null = null;
  let subLandingPointsCache: { data: any; fetchedAt: number } | null = null;
  const SUB_CABLE_TTL = 24 * 60 * 60 * 1000;

  app.get("/api/submarine-cables/cables", isAuthenticated, async (req, res) => {
    try {
      if (subCablesCache && Date.now() - subCablesCache.fetchedAt < SUB_CABLE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(subCablesCache.data);
      }
      const resp = await fetch("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json");
      if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
      const data = await resp.json();
      subCablesCache = { data, fetchedAt: Date.now() };
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    } catch (err: any) {
      console.error("Submarine cables proxy error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch submarine cable data" });
    }
  });

  app.get("/api/submarine-cables/landing-points", isAuthenticated, async (req, res) => {
    try {
      if (subLandingPointsCache && Date.now() - subLandingPointsCache.fetchedAt < SUB_CABLE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(subLandingPointsCache.data);
      }
      const resp = await fetch("https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json");
      if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
      const data = await resp.json();
      subLandingPointsCache = { data, fetchedAt: Date.now() };
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    } catch (err: any) {
      console.error("Submarine landing points proxy error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch landing point data" });
    }
  });

  const subCableDetailCache = new Map<string, { data: any; fetchedAt: number }>();

  app.get("/api/submarine-cables/cable/:id", isAuthenticated, async (req, res) => {
    try {
      const cableId = req.params.id;
      const cached = subCableDetailCache.get(cableId);
      if (cached && Date.now() - cached.fetchedAt < SUB_CABLE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(cached.data);
      }
      const resp = await fetch(`https://www.submarinecablemap.com/api/v3/cable/${encodeURIComponent(cableId)}.json`);
      if (!resp.ok) throw new Error(`Upstream returned ${resp.status}`);
      const data = await resp.json();
      subCableDetailCache.set(cableId, { data, fetchedAt: Date.now() });
      if (subCableDetailCache.size > 500) {
        const oldest = [...subCableDetailCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        if (oldest) subCableDetailCache.delete(oldest[0]);
      }
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.json(data);
    } catch (err: any) {
      console.error("Submarine cable detail proxy error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch cable detail" });
    }
  });

  app.get("/api/ember/country-energy", isAuthenticated, async (req, res) => {
    try {
      const country = req.query.country as string;
      if (!country) return res.status(400).json({ message: "country parameter required" });
      const { getCountryEmberData } = await import("./ember");
      const data = await getCountryEmberData(country);
      if (!data) return res.status(404).json({ message: `No Ember data available for: ${country}` });
      res.json(data);
    } catch (err: any) {
      console.error("Ember API route error:", err);
      res.status(500).json({ message: "Failed to fetch Ember energy data" });
    }
  });

  // ── ADMIE (Greek TSO) grid data ─────────────────────────────────────────
  const admieCache = new Map<string, { data: any; fetchedAt: number }>();
  const ADMIE_TTL = 60 * 60 * 1000; // 1h

  async function fetchAdmieXls(fileCategory: string, date: string): Promise<any[][]> {
    const metaUrl = `https://www.admie.gr/getOperationMarketFile?dateStart=${date}&dateEnd=${date}&FileCategory=${fileCategory}`;
    const metaResp = await fetch(metaUrl);
    if (!metaResp.ok) throw new Error(`ADMIE meta fetch failed: ${metaResp.status}`);
    const meta = await metaResp.json() as any[];
    if (!Array.isArray(meta) || meta.length === 0) throw new Error(`No ADMIE file for ${fileCategory} on ${date}`);
    const fileUrl = meta[0].file_path;
    const xlsResp = await fetch(fileUrl);
    if (!xlsResp.ok) throw new Error(`ADMIE XLS download failed: ${xlsResp.status}`);
    const buffer = await xlsResp.arrayBuffer();
    const XLSX = await import("@e965/xlsx");
    const wb = XLSX.read(Buffer.from(buffer));
    const sheetName = wb.SheetNames.find((s: string) => s !== "XDO_METADATA") || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  }

  app.get("/api/admie/grid", isAuthenticated, async (req, res) => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = (req.query.date as string) || yesterday.toISOString().split("T")[0];

      const cacheKey = `admie-grid-${dateStr}`;
      const cached = admieCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < ADMIE_TTL) {
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.json(cached.data);
      }

      const [loadRows, resRows, flowRows] = await Promise.all([
        fetchAdmieXls("RealTimeSCADASystemLoad", dateStr),
        fetchAdmieXls("RealTimeSCADARES", dateStr),
        fetchAdmieXls("RealTimeSCADAImportsExports", dateStr),
      ]);

      // Parse system load — row 2, columns 1–24
      const loadDataRow = loadRows[2] ?? [];
      const systemLoad = Array.from({ length: 24 }, (_, i) => ({
        hour: i + 1,
        mwh: typeof loadDataRow[i + 1] === "number" ? Math.round(loadDataRow[i + 1] as number) : 0,
      }));

      // Parse RES — row 2, columns 1–24
      const resDataRow = resRows[2] ?? [];
      const resSeries = Array.from({ length: 24 }, (_, i) => ({
        hour: i + 1,
        mwh: typeof resDataRow[i + 1] === "number" ? Math.round(resDataRow[i + 1] as number) : 0,
      }));

      // Parse flows — pattern: [null, "COUNTRY REALTIME NET (MWh)"], [date header], [date, v1..v24]
      const flowsByCountry: Record<string, number[]> = {};
      let ri = 0;
      while (ri < flowRows.length) {
        const row = flowRows[ri];
        if (row && row[0] === null && typeof row[1] === "string" && (row[1] as string).includes("REALTIME NET")) {
          const m = (row[1] as string).match(/^([A-Z/]+)\s+REALTIME/);
          if (m) {
            const country = m[1];
            const dataRow = flowRows[ri + 2] ?? [];
            flowsByCountry[country] = Array.from({ length: 24 }, (_, j) =>
              typeof dataRow[j + 1] === "number" ? Math.round(dataRow[j + 1] as number) : 0
            );
          }
          ri += 3;
        } else {
          ri++;
        }
      }

      const countryKeys = Object.keys(flowsByCountry);
      const flows = Array.from({ length: 24 }, (_, i) => {
        const obj: Record<string, number> = { hour: i + 1 };
        for (const c of countryKeys) {
          obj[c.toLowerCase().replace("/", "_")] = flowsByCountry[c][i] ?? 0;
        }
        return obj;
      });

      // Country net totals (MWh/day, positive = import to Greece)
      const netByCountry: Record<string, number> = {};
      for (const c of countryKeys) {
        netByCountry[c] = Math.round(flowsByCountry[c].reduce((a, b) => a + b, 0));
      }

      // Summary
      const loadVals = systemLoad.map(h => h.mwh).filter(v => v > 0);
      const resVals = resSeries.map(h => h.mwh).filter(v => v > 0);
      const totalLoad = loadVals.reduce((a, b) => a + b, 0);
      const totalRes  = resVals.reduce((a, b) => a + b, 0);
      const summary = {
        peakLoad:    Math.max(...loadVals),
        minLoad:     Math.min(...loadVals),
        avgLoad:     Math.round(totalLoad / (loadVals.length || 1)),
        peakRes:     Math.max(...resVals),
        avgRes:      Math.round(totalRes / (resVals.length || 1)),
        resSharePct: totalLoad > 0 ? Math.round((totalRes / totalLoad) * 100) : 0,
        netByCountry,
        totalNetImportMwh: Math.round(Object.values(netByCountry).reduce((a, b) => a + b, 0)),
      };

      const data = { date: dateStr, systemLoad, res: resSeries, flows, summary };
      admieCache.set(cacheKey, { data, fetchedAt: Date.now() });
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.json(data);
    } catch (err: any) {
      console.error("ADMIE grid route error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch ADMIE data" });
    }
  });

  // ── OpenRouteService isochrones (HEIGit) ────────────────────────────────
  // Drive-time accessibility zones for DC site selection
  app.post("/api/ors/isochrones", isAuthenticated, async (req, res) => {
    try {
      const { lng, lat, ranges, profile = "driving-car" } = req.body as {
        lng: number; lat: number; ranges: number[]; profile?: string;
      };
      if (typeof lng !== "number" || typeof lat !== "number" || !Array.isArray(ranges)) {
        return res.status(400).json({ message: "lng, lat and ranges[] are required" });
      }
      const key = process.env.HEIGIT_API_KEY;
      if (!key) return res.status(503).json({ message: "ORS API key not configured" });

      const validProfiles = ["driving-car", "driving-hgv", "cycling-regular", "foot-walking"];
      const safeProfile = validProfiles.includes(profile) ? profile : "driving-car";
      const safeRanges = ranges.slice(0, 4).map(r => Math.min(Math.max(r, 60), 3600));

      const resp = await fetch(`https://api.openrouteservice.org/v2/isochrones/${safeProfile}`, {
        method: "POST",
        headers: { "Authorization": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: [[lng, lat]],
          range: safeRanges,
          range_type: "time",
          attributes: ["area", "reachfactor"],
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`ORS error ${resp.status}: ${err.slice(0, 200)}`);
      }
      const data = await resp.json();
      res.json(data);
    } catch (err: any) {
      console.error("ORS isochrones error:", err);
      res.status(500).json({ message: err.message || "Failed to generate isochrones" });
    }
  });

  return httpServer;
}
