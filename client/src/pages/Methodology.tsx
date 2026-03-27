import logoUrl from "@/assets/1giglabs-logo.png";
import { UserMenu } from "@/components/UserMenu";
import { Footer } from "@/components/Footer";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Zap, Database, Brain, Globe, RefreshCw, ShieldCheck,
  BookOpen, ArrowLeft, BarChart3, FileText, AlertCircle,
} from "lucide-react";

const LIVE_API_SOURCES = [
  {
    flag: "🇧🇪",
    country: "Belgium",
    tso: "Elia",
    link: "opendata.elia.be",
    description: "104 open datasets at 15-minute resolution covering nuclear, gas, wind (offshore/onshore), solar, hydro, and storage generation. No authentication required. Updated continuously.",
    refresh: "15 min",
    badge: "Live",
  },
  {
    flag: "🇩🇪",
    country: "Germany",
    tso: "Energy Charts (Fraunhofer ISE) + MaStR",
    link: "energy-charts.info",
    description: "Fraunhofer ISE Energy Charts API provides actual generation by source. MaStR (Marktstammdatenregister) bulk export provides 31,986 operational wind turbines (88.83 GW) and 81,415 combustion plants by Bundesland, plus 554 registered large electricity consumers.",
    refresh: "6 hr",
    badge: "Live",
  },
  {
    flag: "🇬🇧",
    country: "United Kingdom",
    tso: "NESO (National Energy System Operator)",
    link: "api.neso.energy",
    description: "5 live datasets: national demand forecast, 14-day generation forecast, 52-week seasonal outlook, transmission loss factors, and TRESP regional demand. Plus SSEP strategic spatial zone shapefiles and the TEC (Transmission Entry Capacity) register of all grid-connected generation assets.",
    refresh: "30 min",
    badge: "Live",
  },
  {
    flag: "🇳🇱",
    country: "Netherlands",
    tso: "NED.nl",
    link: "api.ned.nl",
    description: "Nationale Energie Dashboard — aggregated real-time and hourly renewable generation data including wind onshore, wind offshore, solar, and total load.",
    refresh: "1 hr",
    badge: "Live",
  },
  {
    flag: "🇫🇷",
    country: "France",
    tso: "RTE (Réseau de Transport d'Électricité)",
    link: "digital.iservices.rte-france.com",
    description: "OAuth 2.0 authenticated API providing actual generation by fuel type (nuclear, wind, solar, hydro, gas, coal, biomass). France operates one of Europe's largest nuclear fleets and this data shows real-time output from each technology.",
    refresh: "30 min",
    badge: "Live",
  },
  {
    flag: "🇪🇸",
    country: "Spain",
    tso: "REE / ESIOS (Red Eléctrica de España)",
    link: "apidatos.ree.es",
    description: "Spanish grid operator's open data API providing generation by technology (solar, wind, hydro, gas, nuclear, coal) plus demand and balance data. Spain's high solar penetration makes this data particularly useful for PPA analysis.",
    refresh: "1 hr",
    badge: "Live",
  },
  {
    flag: "🇳🇴",
    country: "Norway",
    tso: "Statnett",
    link: "driftsdata.statnett.no",
    description: "Real-time Nordic grid data covering Norway, Sweden, Denmark, Finland, Estonia, Latvia, and Lithuania. Shows hydro, wind, thermal production, consumption, and cross-border flows. Norway's hydro dominance makes it a unique price-forming market in Europe.",
    refresh: "5 min",
    badge: "Live",
  },
  {
    flag: "🇫🇮",
    country: "Finland",
    tso: "Fingrid",
    link: "data.fingrid.fi",
    description: "4 live datasets via Fingrid's open API: wind generation, solar generation, nuclear generation, and total consumption. Covers Finland's growing renewable base and nuclear capacity.",
    refresh: "3 min",
    badge: "Live",
  },
  {
    flag: "🇵🇱",
    country: "Poland",
    tso: "PSE SA (Polskie Sieci Elektroenergetyczne)",
    link: "api.raporty.pse.pl",
    description: "OData REST API providing 15-minute generation data mapped to ENTSO-E fuel codes (B01–B20). Covers hard coal, lignite, natural gas, wind onshore, solar, biomass, and hydro. Poland remains one of Europe's most coal-intensive grids.",
    refresh: "6 hr",
    badge: "Live",
  },
  {
    flag: "🇮🇪",
    country: "Ireland",
    tso: "CSO (Central Statistics Office)",
    link: "data.cso.ie",
    description: "MEC02 quarterly electricity data tracking data centre electricity consumption from 2015–2024. Ireland's DC share has grown from 5% (2015) to 21.8% (2024), the highest proportion in Europe.",
    refresh: "Quarterly",
    badge: "Official",
  },
  {
    flag: "🇮🇹",
    country: "Italy",
    tso: "Terna",
    link: "terna.it",
    description: "Terna annual statistics and Dati Statistici 2024 — generation by fuel type (gas, solar, hydro, wind, geothermal, biomass). Terna uses embedded Power BI for its public dashboard without a JSON API; data is compiled from official publications.",
    refresh: "Annual",
    badge: "Static",
  },
];

const MARKET_INTEL_SOURCES = [
  {
    category: "Energy Economics",
    sources: [
      "IEA — Energy and AI 2025",
      "IEA 4E TCP — DC Energy Methodology Review 2025",
      "BP Energy Outlook 2025",
      "Goldman Sachs Research — AI Power Demand 2025",
      "Ember — Grids for Data Centres 2025",
      "ICIS — European DC Power Demand 2035",
    ],
  },
  {
    category: "European Market Research",
    sources: [
      "DC Byte — Global Data Centre Index 2025",
      "S&P Global / 451 Research — European DC Power 2025",
      "KPMG Ireland — DC Market 2026",
      "AlgorithmWatch — Germany Grid Saturation 2025",
      "Addleshaws Goddard — Future Data Centres Germany 2025",
    ],
  },
  {
    category: "Grid & Regulatory",
    sources: [
      "ENTSO-E Transparency Platform (Open Power System Data)",
      "DE-LU Electricity Market 2019–2025 (Kaggle)",
      "ENTSO-E TYNDP 2024 — Ten-Year Network Development Plan",
      "CRU/2025/236 — Ireland LEU Connection Policy",
      "EirGrid Generation Capacity Statement 2023–2032",
      "Elia Annual Report 2024",
      "NordREG — Nordic Market Report 2025",
    ],
  },
  {
    category: "Technology Benchmarks",
    sources: [
      "OEP MODEX — Danish Energy Agency 2020 CAPEX/OPEX",
      "Siala 2020 — German Offshore Wind Expansion Model",
      "MaStR 2026 — Germany 31,986 wind turbines, 554 large consumers",
      "Bundesnetzagentur — Solar Q4-2024 by Bundesland",
    ],
  },
];

const COUNTRY_INTEL_SOURCES = [
  "NESO — UK Strategic Spatial Energy Plan (SSEP)",
  "REE PNIEC 2024 — Spain 81% renewables target",
  "PSE SA — Poland grid capacity data",
  "Fingrid — Finland Nordic integration",
  "NVE — Norway hydro reservoir statistics",
  "RTE Bilan Prévisionnel — France 2024",
  "GSE Annual Report — Italy 2023",
];

const HOW_IT_WORKS_STEPS = [
  {
    icon: Globe,
    title: "Select a Country",
    description: "Choose one of 14 European countries from the dropdown. Each country has a tailored dataset of live grid intelligence specific to its TSO, market structure, and DC landscape.",
  },
  {
    icon: Database,
    title: "Live Data Aggregation",
    description: "Country-specific APIs are queried in real time — grid operator data, TSO publications, CSO statistics — and rendered as interactive charts alongside the AI report.",
  },
  {
    icon: Brain,
    title: "AI System Prompt Enrichment",
    description: "Before every OpenAI call, the system prompt is pre-loaded with 62+ cited sources: ENTSO-E pricing, MaStR grid data, Ember energy mix, OEP technology benchmarks, DC market intelligence, and regulatory frameworks specific to that country.",
  },
  {
    icon: FileText,
    title: "Structured Analysis Generation",
    description: "GPT-5.1 generates a validated JSON response covering power pricing, grid constraints, regulatory environment, DC power demand, location suitability scores, investor insights, and a market summary.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Assembly",
    description: "The structured AI output is rendered into the interactive dashboard. Data sources are server-injected (not AI-generated) to guarantee citation accuracy. Live grid charts update independently of the AI analysis.",
  },
  {
    icon: ShieldCheck,
    title: "Analyst Review",
    description: "Power Trends is a decision-support tool for 1GigLabs analysts. All outputs are intended to supplement — not replace — primary research and expert judgment.",
  },
];

function badgeClasses(badge: string) {
  if (badge === "Live") return "border-green-200 text-green-700 bg-green-50";
  if (badge === "Official") return "border-blue-200 text-blue-700 bg-blue-50";
  return "border-slate-200 text-slate-600 bg-slate-50";
}

export default function Methodology() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="https://1giglabs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white p-2 rounded-lg hover:opacity-90 transition-opacity">
            <img src={logoUrl} alt="1GigLabs" className="h-8 w-auto object-contain" />
          </a>
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-back-to-app">
                <ArrowLeft className="w-4 h-4" />
                Back to Power Trends
              </button>
            </Link>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Breadcrumb + Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
            <BookOpen className="w-4 h-4" />
            Methodology & Data Sources
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            How Power Trends Works
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Power Trends is 1GigLabs' AI-powered intelligence platform for European data centre site selection.
            It combines live TSO grid data with structured market research to produce analyst-grade power infrastructure assessments.
          </p>
        </div>

        {/* Section 1 — Our Mission */}
        <Card className="mb-10 border-blue-100 bg-blue-50/40">
          <CardContent className="p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
                <Zap className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">Our Mission</h2>
                <p className="text-slate-600 leading-relaxed mb-3">
                  Europe's data centre market is growing rapidly — driven by AI training workloads, cloud migration, and hyperscaler expansion — but the power infrastructure constraints that determine viable DC locations are complex, fragmented, and fast-changing. TSO grid APIs, national energy statistics, regulatory filings, and market research all speak different languages.
                </p>
                <p className="text-slate-600 leading-relaxed mb-3">
                  Power Trends aggregates these sources into a single, structured intelligence layer covering 14 European countries: Belgium, Denmark, Finland, France, Germany, Ireland, Italy, Netherlands, Norway, Poland, Spain, Sweden, Switzerland, and the United Kingdom.
                </p>
                <p className="text-slate-600 leading-relaxed">
                  Our audience is investors evaluating data centre market opportunities and data centre providers — including hyperscalers — assessing locations for HPC, cloud, and AI deployments. Every analysis is grounded in primary data and cited research, not generalist AI inference.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — How It Works */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-blue-600" />
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <Card key={i} className="border-slate-100">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <step.icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Step {i + 1}</span>
                      </div>
                      <p className="font-semibold text-slate-800 text-sm mb-1">{step.title}</p>
                      <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Section 3 — AI Analysis Methodology */}
        <Card className="mb-12 border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Brain className="w-5 h-5 text-blue-600" />
              AI Analysis Methodology
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="font-semibold text-slate-700 mb-1 text-xs uppercase tracking-wide">Model</p>
                <p className="font-bold text-slate-900 text-base">GPT-5.1</p>
                <p className="text-xs text-slate-500">OpenAI — latest reasoning model</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="font-semibold text-slate-700 mb-1 text-xs uppercase tracking-wide">Cited Sources</p>
                <p className="font-bold text-slate-900 text-base">62+</p>
                <p className="text-xs text-slate-500">In system prompt at generation time</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="font-semibold text-slate-700 mb-1 text-xs uppercase tracking-wide">Cache Duration</p>
                <p className="font-bold text-slate-900 text-base">30 days</p>
                <p className="text-xs text-slate-500">Reports cached per country</p>
              </div>
            </div>
            <p>
              Each Power Trends report is generated by an AI system prompt that pre-loads country-specific market intelligence before the model writes a single word. The prompt includes electricity price history (ENTSO-E, 2015–2025), live grid data snapshots, DC market size figures, regulatory frameworks, PPA availability assessments, and hyperscaler investment commitments — all from named, cited sources.
            </p>
            <p>
              Outputs are structured as validated JSON against a fixed schema (power pricing, grid constraints, regulatory environment, data centre power demand, location suitability scores, investor insights). This ensures consistent, comparable output across all 14 countries. The schema is validated server-side before the report is stored.
            </p>
            <p>
              Data source citations are <strong>server-injected</strong> at render time — they are not hallucinated by the AI. The 62+ source array is compiled and maintained separately from the AI response, ensuring citation integrity.
            </p>
            <p>
              Reports are cached per country for 30 days. Use the "Force Refresh" option to generate a new analysis at any time.
            </p>
          </CardContent>
        </Card>

        {/* Section 4 — Live Grid Data APIs */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-2 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            Live Grid Data APIs
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            Country-specific grid operator data is fetched in real time and displayed as interactive charts independently of the AI analysis. Each source is free or open-access unless noted.
          </p>
          <div className="space-y-4">
            {LIVE_API_SOURCES.map((src, i) => (
              <Card key={i} className="border-slate-100 hover:border-blue-100 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-2xl flex-shrink-0 mt-0.5">{src.flag}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-slate-800">{src.country}</span>
                          <span className="text-slate-400">—</span>
                          <a
                            href={`https://${src.link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-700 font-medium hover:underline"
                          >
                            {src.tso}
                          </a>
                          <Badge variant="outline" className={`text-xs ${badgeClasses(src.badge)}`}>
                            {src.badge}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mb-2 font-mono">{src.link}</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{src.description}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Refresh</p>
                      <Badge variant="outline" className="text-xs border-slate-200 text-slate-600 bg-slate-50">
                        {src.refresh}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All Countries row */}
          <Card className="mt-4 border-slate-100">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">🌍</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-slate-800">All Countries</span>
                    <span className="text-slate-400">—</span>
                    <span className="text-sm text-blue-700 font-medium">Ember + Open Energy Platform (OEP) + ENTSO-E Price History</span>
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-600 bg-slate-50">Static</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-2 font-mono">ember-climate.org · openenergyplatform.org · open-power-system-data.org</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <strong>Ember</strong> provides annual energy mix and CO₂ intensity data for all countries. <strong>OEP MODEX</strong> (Danish Energy Agency 2020) provides peer-reviewed technology cost benchmarks for wind energy (CAPEX, OPEX, lifetime) used to contextualise PPA economics. <strong>ENTSO-E day-ahead price history</strong> (2015–2025) compiled from Open Power System Data and Kaggle datasets covers 10 European bidding zones.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 5 — Market Intelligence Sources */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-2 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Market Intelligence Sources
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            62+ research publications and datasets embedded in the AI system prompt. These inform investment ratings, location recommendations, and regulatory analysis.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {MARKET_INTEL_SOURCES.map((cat, i) => (
              <Card key={i} className="border-slate-100">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700">{cat.category}</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <ul className="space-y-1.5">
                    {cat.sources.map((s, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-2" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Country-Specific Intelligence — full width */}
          <Card className="border-slate-100">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-slate-700">Country-Specific Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
                {COUNTRY_INTEL_SOURCES.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-2" />
                    {s}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Section 6 — Limitations & Caveats */}
        <Card className="mb-12 border-amber-100 bg-amber-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Limitations & Caveats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              <strong>AI-generated content:</strong> The structured analysis sections (power pricing, grid constraints, location scores, investor insights, summary) are generated by a large language model. While grounded in cited research, they reflect the model's interpretation of that research and should be treated as a starting point for analyst review, not a definitive source of truth.
            </p>
            <p>
              <strong>Data freshness:</strong> Live grid data is cached at the intervals shown above. Some country datasets (Italy, Switzerland, Denmark, Sweden) currently use static data from official publications rather than live APIs; these are updated as new API integrations are completed.
            </p>
            <p>
              <strong>Citation currency:</strong> Market research sources reflect the publication dates cited. The energy infrastructure and data centre markets move quickly; significant regulatory or market developments after a publication's date may not be reflected.
            </p>
            <p>
              <strong>Scope:</strong> Power Trends focuses on power infrastructure for data centre deployment. It does not cover network connectivity, land availability, construction costs, water rights, or other non-power site selection criteria.
            </p>
            <p>
              <strong>ENTSO-E integration:</strong> Live ENTSO-E Transparency Platform data (day-ahead prices and generation actuals) requires an approved API key. Historical price data is available via compiled datasets; live ENTSO-E data will be added once the key is approved.
            </p>
          </CardContent>
        </Card>

        {/* Footer CTA */}
        <div className="text-center pb-4 space-y-4">
          <Link href="/">
            <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl transition-colors" data-testid="button-back-to-power-trends">
              <ArrowLeft className="w-4 h-4" />
              Back to Power Trends
            </button>
          </Link>
          <p className="text-xs text-slate-400">© 2026 1GigLabs Ltd. All rights reserved.</p>
        </div>

      </main>
      <Footer />
    </div>
  );
}
