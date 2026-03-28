import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import { AIContentLabel } from "@/components/AIContentLabel";
import {
  Zap, TrendingUp, MapPin, RefreshCw, Loader2,
  ChevronDown, ChevronUp, FileCode, Shield, AlertTriangle,
  Battery, Sun, Wind, Gauge, Scale, Building2, Globe, BookOpen, Mail,
} from "lucide-react";
import { Link } from "wouter";
import html2canvas from "html2canvas";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { GIGLABS_COUNTRIES } from "@shared/schema";
import type { PowerTrendContent } from "@shared/schema";

import logoUrl from "@/assets/1giglabs-logo.png";
import { UserMenu } from "@/components/UserMenu";
import { Footer } from "@/components/Footer";
import { SSEPMap } from "@/components/SSEPMap";
import { DemandForecast } from "@/components/DemandForecast";
import { Forecast14Day } from "@/components/Forecast14Day";
import { SeasonalForecast } from "@/components/SeasonalForecast";
import { GridLosses } from "@/components/GridLosses";
import { RegionalDemand } from "@/components/RegionalDemand";
import { TECRegister } from "@/components/TECRegister";
import { NGEDGenerationRegister } from "@/components/NGEDGenerationRegister";
import IrelandDCConsumption from "@/components/IrelandDCConsumption";
import EmberEnergyChart from "@/components/EmberEnergyChart";
import InstalledPowerChart from "@/components/InstalledPowerChart";
import GridSignalWidget from "@/components/GridSignalWidget";
import RenShareChart from "@/components/RenShareChart";
import GermanyGridChart from "@/components/GermanyGridChart";
import NetherlandsGridChart from "@/components/NetherlandsGridChart";
import FranceGridChart from "@/components/FranceGridChart";
import SpainGridChart from "@/components/SpainGridChart";
import NorwayGridChart from "@/components/NorwayGridChart";
import BelgiumGridChart from "@/components/BelgiumGridChart";
import FinlandGridChart from "@/components/FinlandGridChart";
import PolandGridChart from "@/components/PolandGridChart";
import ItalyGridChart from "@/components/ItalyGridChart";
import GreeceGridChart from "@/components/GreeceGridChart";
import ElectricityPricesChart from "@/components/ElectricityPricesChart";
import OEPBenchmarkChart from "@/components/OEPBenchmarkChart";
import ENTSOETransmissionMap from "@/components/ENTSOETransmissionMap";
import CrossBorderFlows from "@/components/CrossBorderFlows";
import USGridChart from "@/components/USGridChart";
import BrazilGridChart from "@/components/BrazilGridChart";

const COLORS = [
  '#1565C0', '#1976D2', '#2196F3', '#42A5F5',
  '#64B5F6', '#0D47A1', '#1E88E5', '#90CAF9',
];

const ENERGY_COLORS: Record<string, string> = {
  'Solar': '#F59E0B',
  'Wind': '#2196F3',
  'Hydro': '#06B6D4',
  'Nuclear': '#8B5CF6',
  'Other': '#64B5F6',
};

function formatGW(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} TW`;
  return `${value.toFixed(1)} GW`;
}

function formatMW(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} GW`;
  return `${value.toFixed(0)} MW`;
}

export default function PowerTrends() {
  const queryClient = useQueryClient();
  const [selectedCountry, setSelectedCountry] = useState<string>("United Kingdom");
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: trendData, isLoading: isLoadingExisting } = useQuery<{ id: number; country: string; content: PowerTrendContent; createdAt: string } | null>({
    queryKey: ['/api/power-trends/latest', selectedCountry],
    queryFn: async () => {
      if (!selectedCountry) return null;
      const res = await fetch(`/api/power-trends/latest?country=${encodeURIComponent(selectedCountry)}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load Power Trends data");
      return res.json();
    },
    enabled: !!selectedCountry,
  });

  const { mutate: generateTrends, isPending: isGenerating } = useMutation({
    mutationFn: async ({ country, forceRefresh }: { country: string; forceRefresh: boolean }) => {
      const res = await apiRequest('POST', `/api/power-trends/generate${forceRefresh ? '?forceRefresh=true' : ''}`, { country });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/power-trends/latest', selectedCountry] });
      toast({ title: "Power Trends Generated", description: `Power analysis for ${selectedCountry} has been generated.` });
    },
    onError: (error: Error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const content = trendData?.content as PowerTrendContent | undefined;

  const handleGenerate = (forceRefresh: boolean) => {
    if (!selectedCountry) {
      toast({ title: "Select a Country", description: "Please choose a country from the dropdown first.", variant: "destructive" });
      return;
    }
    generateTrends({ country: selectedCountry, forceRefresh });
  };

  const handleCountryChange = (value: string) => {
    setSelectedCountry(value);
    setExpandedLocation(null);
  };

  const reportRef = useRef<HTMLDivElement>(null);

  const handleExportHTML = async () => {
    if (!content || !trendData) return;
    const country = trendData.country || selectedCountry;
    const reportDate = trendData.createdAt
      ? new Date(trendData.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    toast({ title: "Generating HTML...", description: "Building your Power Trends report." });

    let logoBase64 = "";
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("Could not convert logo to base64", e);
    }

    const esc = (s: string | number | undefined) => {
      if (s == null) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const severityClass = (severity: string) => {
      if (severity === 'Critical' || severity === 'High') return 'severity-high';
      if (severity === 'Medium') return 'severity-medium';
      return 'severity-low';
    };

    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Power Trends - ${esc(country)} | 1GigLabs</title>
<style>
  :root {
    --primary: #1976D2;
    --primary-light: #E3F2FD;
    --primary-dark: #1565C0;
    --text: #1e293b;
    --text-secondary: #475569;
    --bg: #f8fafc;
    --white: #ffffff;
    --border: #e2e8f0;
    --green: #16a34a;
    --green-bg: #f0fdf4;
    --red-bg: #fef2f2;
    --red-text: #dc2626;
    --orange-bg: #fff7ed;
    --orange-text: #ea580c;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 1100px; margin: 0 auto; padding: 40px 32px; }
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid var(--primary); }
  .header img { height: 40px; margin-bottom: 16px; }
  .header h1 { font-size: 28px; color: var(--primary-dark); margin-bottom: 4px; }
  .header p { color: var(--text-secondary); font-size: 14px; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 20px; color: var(--primary-dark); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .metric-card { background: var(--white); border-radius: 12px; padding: 20px; border: 1px solid var(--border); }
  .metric-card .label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
  .metric-card .value { font-size: 24px; font-weight: 700; color: var(--primary-dark); margin: 4px 0; }
  .metric-card .sub { font-size: 12px; color: var(--text-secondary); }
  .card { background: var(--white); border-radius: 12px; padding: 20px; border: 1px solid var(--border); margin-bottom: 12px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .severity-high { background: var(--red-bg); color: var(--red-text); }
  .severity-medium { background: var(--orange-bg); color: var(--orange-text); }
  .severity-low { background: var(--green-bg); color: var(--green); }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); }
  .footer img { height: 24px; }
  .location-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .score { display: inline-block; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 700; font-size: 14px; color: white; }
  .score-high { background: var(--green); }
  .score-medium { background: #f59e0b; }
  .score-low { background: var(--red-text); }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
  th { background: var(--primary-light); color: var(--primary-dark); font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    ${logoBase64 ? `<img src="${logoBase64}" alt="1GigLabs" /><br/>` : ''}
    <h1>Power Trends Analysis: ${esc(country)}</h1>
    <p>Generated ${reportDate} | Confidential</p>
  </div>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 32px 24px 32px;">
    <p style="color:#92400e;font-size:13px;margin:0;">⚠ <strong>AI-Generated Content</strong> — This report was generated by AI (GPT-5.1). All data, figures, and insights should be independently verified before use in decision-making.</p>
  </div>

  <div class="metric-grid">
    ${content.gridCapacity ? `<div class="metric-card">
      <div class="label">Grid Capacity</div>
      <div class="value">${content.gridCapacity.totalCapacityGW?.toFixed(1) ?? '—'} GW</div>
      <div class="sub">${content.gridCapacity.availableCapacityGW?.toFixed(1) ?? '—'} GW available · ${content.gridCapacity.reservedForDataCentresGW?.toFixed(1) ?? '—'} GW reserved DC</div>
    </div>` : ''}
    ${content.dataCentrePowerDemand ? `<div class="metric-card">
      <div class="label">DC Power Demand</div>
      <div class="value">${content.dataCentrePowerDemand.currentDemandGW?.toFixed(1) ?? '—'} GW</div>
      <div class="sub">${content.dataCentrePowerDemand.projectedDemand2030GW?.toFixed(1) ?? '—'} GW by 2030 · ${content.dataCentrePowerDemand.shareOfNationalDemandPercent ?? '—'}% of national demand</div>
    </div>` : ''}
    ${content.renewableEnergy ? `<div class="metric-card">
      <div class="label">Renewable Share</div>
      <div class="value">${content.renewableEnergy.renewableSharePercent ?? '—'}%</div>
      <div class="sub">Wind ${content.renewableEnergy.windCapacityGW?.toFixed(1) ?? '—'} GW · Solar ${content.renewableEnergy.solarCapacityGW?.toFixed(1) ?? '—'} GW</div>
    </div>` : ''}
    ${content.investorInsights ? `<div class="metric-card">
      <div class="label">Investor Rating</div>
      <div class="value" style="font-size:18px">${esc(content.investorInsights.overallRating)}</div>
      <div class="sub">Market attractiveness</div>
    </div>` : ''}
  </div>

  ${content.powerPricing ? `<div class="section">
    <h2>Power Pricing</h2>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Average Industrial Price</td><td>£${content.powerPricing.averageIndustrialPriceMWh?.toFixed(2) ?? '—'}/MWh</td></tr>
      <tr><td>Peak Price</td><td>£${content.powerPricing.peakPriceMWh?.toFixed(2) ?? '—'}/MWh</td></tr>
      <tr><td>Off-Peak Price</td><td>£${content.powerPricing.offPeakPriceMWh?.toFixed(2) ?? '—'}/MWh</td></tr>
      <tr><td>Price Volatility</td><td>${esc(content.powerPricing.priceVolatilityIndex)}</td></tr>
      <tr><td>PPA Availability</td><td>${esc(content.powerPricing.renewablePPAAvailability)}</td></tr>
    </table>
    <p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">${esc(content.powerPricing.priceTrend)}</p>
  </div>` : ''}

  ${content.dataCentrePowerDemand ? `<div class="section">
    <h2>Data Centre Power Demand</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <table>
          <tr><th colspan="2">Demand Overview</th></tr>
          <tr><td>Current Demand</td><td>${content.dataCentrePowerDemand.currentDemandGW?.toFixed(2) ?? '—'} GW</td></tr>
          <tr><td>Projected 2030</td><td>${content.dataCentrePowerDemand.projectedDemand2030GW?.toFixed(2) ?? '—'} GW</td></tr>
          <tr><td>Share of National Demand</td><td>${content.dataCentrePowerDemand.shareOfNationalDemandPercent ?? '—'}%</td></tr>
          <tr><td>Annual Growth Rate</td><td>${esc(content.dataCentrePowerDemand.annualGrowthRate)}</td></tr>
        </table>
      </div>
      ${content.dataCentrePowerDemand.workloadBreakdown && content.dataCentrePowerDemand.workloadBreakdown.length > 0 ? `
      <div class="card">
        <table>
          <tr><th>Workload Type</th><th>Share</th></tr>
          ${content.dataCentrePowerDemand.workloadBreakdown.map(w => `<tr><td>${esc(w.workload)}</td><td>${w.sharePercent}%</td></tr>`).join('')}
        </table>
      </div>` : ''}
    </div>
    ${content.dataCentrePowerDemand.keyDrivers && content.dataCentrePowerDemand.keyDrivers.length > 0 ? `
    <div class="card">
      <strong style="font-size:13px;display:block;margin-bottom:8px">Key Demand Drivers</strong>
      <ul style="list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${content.dataCentrePowerDemand.keyDrivers.map(d => `<li style="font-size:13px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--border)">▸ ${esc(d)}</li>`).join('')}
      </ul>
    </div>` : ''}
  </div>` : ''}

  ${content.gridConstraints && content.gridConstraints.length > 0 ? `<div class="section">
    <h2>Grid Constraints</h2>
    ${content.gridConstraints.map(gc => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>${esc(gc.region)}</strong>
        <span class="badge ${severityClass(gc.severity)}">${esc(gc.severity)}</span>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:4px"><strong>${esc(gc.constraintType)}</strong></p>
      <p style="font-size:13px;color:var(--text-secondary)">${esc(gc.description)}</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">Mitigation: ${esc(gc.mitigationTimeline)}</p>
    </div>`).join('')}
  </div>` : ''}

  ${content.regulatoryEnvironment ? `<div class="section">
    <h2>Regulatory Environment</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="card">
        <strong style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Planning Framework</strong>
        <p style="margin-top:6px;font-size:13px">${esc(content.regulatoryEnvironment.planningFramework)}</p>
      </div>
      <div class="card">
        <strong style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Grid Connection Timeline</strong>
        <p style="margin-top:6px;font-size:13px">${esc(content.regulatoryEnvironment.gridConnectionTimeline)}</p>
      </div>
    </div>
    ${content.regulatoryEnvironment.keyRegulations && content.regulatoryEnvironment.keyRegulations.length > 0 ? `
    <div style="margin-bottom:12px">
      <h3 style="font-size:14px;color:var(--primary-dark);margin-bottom:8px">Key Regulations</h3>
      <table>
        <tr><th>Regulation</th><th>Description</th><th>Impact</th></tr>
        ${content.regulatoryEnvironment.keyRegulations.map(r => `<tr><td style="font-weight:600">${esc(r.regulation)}</td><td style="font-size:12px">${esc(r.description)}</td><td><span class="badge severity-medium">${esc(r.impact)}</span></td></tr>`).join('')}
      </table>
    </div>` : ''}
    ${content.regulatoryEnvironment.incentives && content.regulatoryEnvironment.incentives.length > 0 ? `
    <div style="margin-bottom:12px">
      <h3 style="font-size:14px;color:var(--primary-dark);margin-bottom:8px">Incentives</h3>
      <table>
        <tr><th>Incentive</th><th>Description</th><th>Value</th></tr>
        ${content.regulatoryEnvironment.incentives.map(inc => `<tr><td style="font-weight:600">${esc(inc.incentive)}</td><td style="font-size:12px">${esc(inc.description)}</td><td><span class="badge severity-low">${esc(inc.value)}</span></td></tr>`).join('')}
      </table>
    </div>` : ''}
    ${content.regulatoryEnvironment.restrictions && content.regulatoryEnvironment.restrictions.length > 0 ? `
    <div>
      <h3 style="font-size:14px;color:var(--primary-dark);margin-bottom:8px">Restrictions</h3>
      <table>
        <tr><th>Restriction</th><th>Description</th><th>Severity</th></tr>
        ${content.regulatoryEnvironment.restrictions.map(r => `<tr><td style="font-weight:600">${esc(r.restriction)}</td><td style="font-size:12px">${esc(r.description)}</td><td><span class="badge ${severityClass(r.severity)}">${esc(r.severity)}</span></td></tr>`).join('')}
      </table>
    </div>` : ''}
  </div>` : ''}

  ${content.locations && content.locations.length > 0 ? `<div class="section">
    <h2>Location Suitability</h2>
    <div class="location-grid">
      ${[...content.locations].sort((a, b) => b.suitabilityScore - a.suitabilityScore).map(loc => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <strong>${esc(loc.location)}</strong>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(loc.region)}</div>
          </div>
          <span class="score ${loc.suitabilityScore >= 70 ? 'score-high' : loc.suitabilityScore >= 50 ? 'score-medium' : 'score-low'}">${loc.suitabilityScore}</span>
        </div>
        <table>
          <tr><td>Power Rating</td><td>${esc(loc.powerAvailabilityRating)}</td></tr>
          <tr><td>Grid Capacity</td><td>${formatMW(loc.gridCapacityMW)}</td></tr>
          <tr><td>Renewable Access</td><td>${loc.renewableAccessPercent}%</td></tr>
          <tr><td>Avg PUE</td><td>${loc.averagePUE?.toFixed(2) ?? '—'}</td></tr>
          <tr><td>Connection Timeline</td><td>${loc.connectionTimelineMonths} months</td></tr>
          ${loc.coolingAdvantage ? `<tr><td>Cooling Advantage</td><td style="font-size:12px">${esc(loc.coolingAdvantage)}</td></tr>` : ''}
        </table>
        ${loc.keyRisks && loc.keyRisks.length > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
          <strong style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Key Risks</strong>
          <ul style="list-style:none;margin-top:4px;">
            ${loc.keyRisks.map(r => `<li style="font-size:12px;color:#dc2626;padding:2px 0">▸ ${esc(r)}</li>`).join('')}
          </ul>
        </div>` : ''}
      </div>`).join('')}
    </div>
  </div>` : ''}

  ${content.trends && content.trends.length > 0 ? `<div class="section">
    <h2>Market &amp; Technology Trends</h2>
    <table>
      <tr><th>Trend</th><th>Impact</th><th>Timeframe</th><th>Relevance</th></tr>
      ${content.trends.map(t => `
      <tr>
        <td style="font-weight:600">${esc(t.trend)}</td>
        <td style="font-size:12px">${esc(t.impact)}</td>
        <td><span class="badge" style="background:#f1f5f9;color:var(--text-secondary);border:1px solid var(--border)">${esc(t.timeframe)}</span></td>
        <td style="font-size:12px">${esc(t.relevance)}</td>
      </tr>`).join('')}
    </table>
  </div>` : ''}

  ${content.investorInsights ? `<div class="section">
    <h2>Investor Insights</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      ${content.investorInsights.keyOpportunities && content.investorInsights.keyOpportunities.length > 0 ? `
      <div class="card">
        <strong style="font-size:12px;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px">Key Opportunities</strong>
        <ul style="list-style:none;margin-top:8px;">
          ${content.investorInsights.keyOpportunities.map(o => `<li style="font-size:13px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--border)">✓ ${esc(o)}</li>`).join('')}
        </ul>
      </div>` : ''}
      ${content.investorInsights.keyRisks && content.investorInsights.keyRisks.length > 0 ? `
      <div class="card">
        <strong style="font-size:12px;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px">Key Risks</strong>
        <ul style="list-style:none;margin-top:8px;">
          ${content.investorInsights.keyRisks.map(r => `<li style="font-size:13px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--border)">▲ ${esc(r)}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
    <div class="card" style="background:var(--primary-light);border-color:var(--primary)">
      <p style="font-size:14px;margin-bottom:12px">${esc(content.investorInsights.recommendedStrategy)}</p>
      <p style="font-size:13px;color:var(--text-secondary)">${esc(content.investorInsights.hyperscalerOutlook)}</p>
    </div>
  </div>` : ''}

  ${content.summary ? `<div class="section">
    <h2>Summary</h2>
    <p style="font-size:14px;line-height:1.8">${esc(content.summary)}</p>
  </div>` : ''}

  ${content.dataSources && content.dataSources.length > 0 ? `
  <div class="section">
    <h2>Data Sources</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${content.dataSources.map((ds, i) => `
      <div style="padding:12px;border-radius:8px;background:var(--primary-light);border:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${i + 1}</div>
        <div>
          <div style="font-weight:600;font-size:13px;">${esc(ds.source)}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${esc(ds.publisher)} (${ds.year})</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${esc(ds.description)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <div class="footer">
    <div>
      ${logoBase64 ? `<img src="${logoBase64}" alt="1GigLabs" /><br/>` : ''}
      <span>&copy; ${new Date().getFullYear()} 1GigLabs. All rights reserved.</span>
    </div>
    <div>
      <span>Private &amp; Confidential</span><br/>
      <a href="https://1giglabs.com" target="_blank">1giglabs.com</a>
    </div>
  </div>
</div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `1GigLabs-PowerTrends-${country.replace(/\s+/g, '-')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Success", description: "HTML report downloaded successfully." });
  };

  const renewableChartData = content?.renewableEnergy ? [
    { name: 'Solar', value: content.renewableEnergy.solarCapacityGW },
    { name: 'Wind', value: content.renewableEnergy.windCapacityGW },
    { name: 'Hydro', value: content.renewableEnergy.hydroCapacityGW },
    { name: 'Nuclear', value: content.renewableEnergy.nuclearCapacityGW },
  ].filter(d => d.value > 0) : [];

  const gridGrowthData = content?.gridCapacity?.projectedGrowth ?? [];

  const workloadData = content?.dataCentrePowerDemand?.workloadBreakdown ?? [];

  const locationChartData = content?.locations
    ? [...content.locations]
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
      .map(loc => ({ name: loc.location, score: loc.suitabilityScore, capacity: loc.gridCapacityMW }))
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="https://1giglabs.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white p-2 rounded-lg hover:opacity-90 transition-opacity">
            <img src={logoUrl} alt="1GigLabs" className="h-8 w-auto object-contain" data-testid="img-logo" />
          </a>
          <div className="flex items-center gap-2">
            <Link href="/power-map">
              <button className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-power-map">
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">Power Map</span>
              </button>
            </Link>
            <Link href="/methodology">
              <button className="flex items-center gap-1.5 text-sm font-medium methodology-glow hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50" data-testid="button-methodology">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Methodology</span>
              </button>
            </Link>
            <a href="https://www.1giglabs.com/#contact" target="_blank" rel="noopener noreferrer" data-testid="button-contact" className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors px-3 py-2 rounded-lg hover:bg-blue-50">
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Contact</span>
            </a>
            <UserMenu />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-serif text-slate-900 mb-3" data-testid="text-page-title">
            Power Trends
          </h1>
          <p className="text-slate-500 mb-8 max-w-xl mx-auto">
            Analyse power distribution, availability, capacity, and regulatory trends for data centre location selection.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
            <Select value={selectedCountry} onValueChange={handleCountryChange} data-testid="select-country">
              <SelectTrigger className="w-full sm:w-64 h-12 text-base" data-testid="select-country-trigger">
                <SelectValue placeholder="Choose a country..." />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {GIGLABS_COUNTRIES.map(country => (
                  <SelectItem key={country} value={country} data-testid={`select-country-${country.toLowerCase().replace(/\s+/g, '-')}`}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="lg"
              onClick={() => handleGenerate(false)}
              disabled={!selectedCountry || isGenerating}
              className="w-full sm:w-auto px-8 h-12 shadow-lg shadow-blue-500/20"
              data-testid="button-generate-power-trends"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Generate Analysis
                </>
              )}
            </Button>
          </div>
          {isGenerating && (
            <p className="text-sm text-slate-500 mt-3">This may take up to a minute...</p>
          )}
        </motion.div>

        {/* European Transmission System Map — always visible */}
        <ENTSOETransmissionMap />

        {/* Cross-border Physical Flows — always visible */}
        <CrossBorderFlows />

        {/* Country-specific live data charts — visible as soon as a country is selected */}
        {selectedCountry && (
          <>
            {/* EIA Data - United States only */}
            {selectedCountry === "United States" && (
              <>
                <SectionHeader
                  title="US Grid Intelligence"
                  subtitle="Live data from the US Energy Information Administration (EIA) — real-time generation, demand, and retail prices"
                />
                <USGridChart />
              </>
            )}

            {/* ONS Data - Brazil only */}
            {selectedCountry === "Brazil" && (
              <>
                <SectionHeader
                  title="Brazil Grid Intelligence"
                  subtitle="Live data from ONS — Operador Nacional do Sistema Elétrico · dados.ons.org.br"
                />
                <BrazilGridChart />
              </>
            )}

            {/* NESO Data - UK only */}
            {selectedCountry.toLowerCase().includes("united kingdom") && (
              <>
                <SectionHeader title="UK Grid Intelligence" subtitle="Live data from the National Energy System Operator (NESO)" />
                <DemandForecast />
                <Forecast14Day />
                <SeasonalForecast />
                <GridLosses />
                <RegionalDemand />
                <TECRegister />
                <NGEDGenerationRegister />
                <SSEPMap />
              </>
            )}

            {/* Ireland CSO Electricity Data */}
            {selectedCountry.toLowerCase().includes("ireland") && (
              <>
                <SectionHeader
                  title="Ireland Grid Intelligence"
                  subtitle="Data centre electricity consumption from the Central Statistics Office (CSO) — MEC02"
                />
                <IrelandDCConsumption />
              </>
            )}

            {/* Germany MaStR Grid Infrastructure */}
            {selectedCountry.toLowerCase().includes("germany") && (
              <>
                <SectionHeader
                  title="Germany Grid Infrastructure Intelligence"
                  subtitle="Renewable capacity by state — sourced from Marktstammdatenregister (MaStR) bulk export, 12-Mar-2026"
                />
                <GermanyGridChart />
              </>
            )}

            {/* Netherlands Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("netherlands") && (
              <NetherlandsGridChart />
            )}

            {/* France Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("france") && (
              <FranceGridChart />
            )}

            {/* Spain Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("spain") && (
              <SpainGridChart />
            )}

            {/* Norway Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("norway") && (
              <NorwayGridChart />
            )}

            {/* Finland Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("finland") && (
              <FinlandGridChart />
            )}

            {/* Poland Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("poland") && (
              <PolandGridChart />
            )}

            {/* Italy Grid Intelligence */}
            {selectedCountry.toLowerCase().includes("italy") && (
              <ItalyGridChart />
            )}

            {selectedCountry.toLowerCase().includes("belgium") && (
              <BelgiumGridChart />
            )}

            {/* Greece Grid Intelligence — ADMIE SCADA */}
            {selectedCountry.toLowerCase().includes("greece") && (
              <>
                <SectionHeader
                  title="Greece Grid Intelligence"
                  subtitle="Real-time SCADA data from ADMIE / IPTO — system load, RES injections & cross-border flows"
                />
                <GreeceGridChart />
              </>
            )}

            {/* OEP MODEX — Renewable Technology Economics (all countries) */}
            <>
              <SectionHeader
                title="Renewable Technology Economics"
                subtitle="Wind CAPEX & fixed OPEX benchmarks from the MODEX model benchmark dataset — Danish Energy Agency 2020 via Open Energy Platform"
              />
              <OEPBenchmarkChart showExpansion={selectedCountry.toLowerCase().includes("germany")} />
            </>

            {/* Electricity Price Intelligence */}
            <ElectricityPricesChart country={selectedCountry} />

            {/* Ember Energy — Grid Mix & Carbon Intensity */}
            <>
              <SectionHeader
                title="Grid Energy Mix & Carbon Intensity"
                subtitle={`Live Ember Energy data — annual generation sources and CO₂ emissions intensity for ${selectedCountry}`}
              />
              <EmberEnergyChart country={selectedCountry} />
            </>

            {/* Live Grid Signal + Renewable Share Trend */}
            {["United Kingdom", "Germany", "France", "Netherlands", "Belgium", "Ireland", "Spain", "Italy", "Poland", "Denmark", "Sweden", "Norway", "Finland", "Switzerland", "Portugal"].includes(selectedCountry) && (
              <>
                <SectionHeader
                  title="Live Grid Signal & Renewable Trend"
                  subtitle={`Real-time renewable share of generation and 90-day daily average trend for ${selectedCountry} · Fraunhofer ISE Energy Charts`}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <GridSignalWidget country={selectedCountry} />
                  <RenShareChart country={selectedCountry} />
                </div>
              </>
            )}

            {/* Installed Power Capacity */}
            {["United Kingdom", "Germany", "France", "Netherlands", "Belgium", "Ireland", "Spain", "Italy", "Poland", "Denmark", "Sweden", "Norway", "Finland", "Switzerland", "Portugal"].includes(selectedCountry) && (
              <>
                <SectionHeader
                  title="Installed Power Capacity (2010–2030)"
                  subtitle={`Grid capacity buildout trajectory and national energy plan projections to 2030 for ${selectedCountry} · Fraunhofer ISE Energy Charts`}
                />
                <InstalledPowerChart country={selectedCountry} />
              </>
            )}
          </>
        )}

        {isLoadingExisting && selectedCountry && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-slate-500">Loading power trends data...</p>
          </div>
        )}

        {content && !isLoadingExisting && (
          <motion.div ref={reportRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900" data-testid="text-analysis-title">
                  {trendData?.country || selectedCountry} Power Trends
                </h2>
                {trendData?.createdAt && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                    Generated {new Date(trendData.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportHTML} data-testid="button-export-html">
                  <FileCode className="w-4 h-4 mr-1" />
                  Export HTML
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleGenerate(true)} disabled={isGenerating} data-testid="button-refresh">
                  <RefreshCw className={`w-4 h-4 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <AIContentLabel generatedAt={trendData?.createdAt} />

            {/* Top-level metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {content.gridCapacity && (
                <MetricCard
                  title="Grid Capacity"
                  value={formatGW(content.gridCapacity.totalCapacityGW)}
                  subValue={`${formatGW(content.gridCapacity.availableCapacityGW)} available`}
                  icon={<Zap className="w-5 h-5" />}
                  className="bg-gradient-to-br from-blue-50 to-white border border-blue-100"
                />
              )}
              {content.dataCentrePowerDemand && (
                <MetricCard
                  title="DC Power Demand"
                  value={formatGW(content.dataCentrePowerDemand.currentDemandGW)}
                  subValue={`${content.dataCentrePowerDemand.shareOfNationalDemandPercent}% of national demand`}
                  icon={<Battery className="w-5 h-5" />}
                  className="bg-gradient-to-br from-sky-50 to-white border border-sky-100"
                />
              )}
              {content.renewableEnergy && (
                <MetricCard
                  title="Renewable Share"
                  value={`${content.renewableEnergy.renewableSharePercent}%`}
                  subValue="Current energy mix"
                  icon={<Sun className="w-5 h-5" />}
                  className="bg-gradient-to-br from-green-50 to-white border border-green-100"
                />
              )}
              {content.investorInsights && (
                <MetricCard
                  title="Investor Rating"
                  value={content.investorInsights.overallRating}
                  subValue="Market attractiveness"
                  icon={<TrendingUp className="w-5 h-5" />}
                  className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100"
                />
              )}
            </div>

            {/* Power Pricing */}
            {content.powerPricing && (
              <>
                <SectionHeader title="Power Pricing & Market Dynamics" subtitle={`Electricity costs and market conditions in ${trendData?.country || selectedCountry}`} />
                <Card className="mb-8 border-none shadow-md">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Avg Industrial</p>
                        <p className="text-lg font-bold text-blue-700" data-testid="text-avg-price">£{content.powerPricing.averageIndustrialPriceMWh?.toFixed(2) ?? '—'}/MWh</p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Peak Price</p>
                        <p className="text-lg font-bold text-red-600">£{content.powerPricing.peakPriceMWh?.toFixed(2) ?? '—'}/MWh</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Off-Peak</p>
                        <p className="text-lg font-bold text-green-600">£{content.powerPricing.offPeakPriceMWh?.toFixed(2) ?? '—'}/MWh</p>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">Volatility</p>
                        <p className="text-lg font-bold text-orange-600">{content.powerPricing.priceVolatilityIndex}</p>
                      </div>
                      <div className="text-center p-3 bg-sky-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-1">PPA Availability</p>
                        <p className="text-lg font-bold text-sky-600">{content.powerPricing.renewablePPAAvailability}</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      <span className="font-semibold text-blue-700">Price Outlook: </span>
                      {content.powerPricing.priceTrend}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Charts: Energy Mix + Grid Growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="border-none shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-slate-900">Energy Mix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={renewableChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {renewableChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={ENERGY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(1)} GW`, 'Capacity']}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend
                          layout="vertical"
                          verticalAlign="middle"
                          align="right"
                          wrapperStyle={{ paddingLeft: '20px', fontSize: '12px', fontWeight: 500 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold text-slate-900">Projected Grid Capacity Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={gridGrowthData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${v} GW`} />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(1)} GW`, 'Capacity']}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Line type="monotone" dataKey="capacityGW" stroke="#1976D2" strokeWidth={3} dot={{ fill: '#1976D2', r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* DC Power Demand */}
            {content.dataCentrePowerDemand && (
              <>
                <SectionHeader title="Data Centre Power Demand" subtitle={`Current and projected demand from data centres in ${trendData?.country || selectedCountry}`} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <Card className="border-none shadow-md">
                    <CardContent className="p-6">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-slate-500">Current Demand</p>
                          <p className="text-xl font-bold text-blue-700">{formatGW(content.dataCentrePowerDemand.currentDemandGW)}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-slate-500">Projected 2030</p>
                          <p className="text-xl font-bold text-blue-700">{formatGW(content.dataCentrePowerDemand.projectedDemand2030GW)}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-500">National Share</p>
                          <p className="text-xl font-bold text-slate-700">{content.dataCentrePowerDemand.shareOfNationalDemandPercent}%</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-xs text-slate-500">Growth Rate</p>
                          <p className="text-xl font-bold text-green-600">{content.dataCentrePowerDemand.annualGrowthRate}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-slate-700">Key Demand Drivers</h4>
                        {(content.dataCentrePowerDemand.keyDrivers ?? []).map((driver, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            {driver}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg font-bold text-slate-900">Workload Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={workloadData}
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              paddingAngle={2}
                              dataKey="sharePercent"
                              nameKey="workload"
                            >
                              {workloadData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number) => [`${value}%`, 'Share']}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {/* Grid Constraints */}
            {content.gridConstraints && (
              <>
                <SectionHeader title="Grid Constraints & Risks" subtitle="Key infrastructure limitations affecting data centre deployments" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {content.gridConstraints.map((constraint, i) => (
                <Card key={i} className="border-none shadow-md" data-testid={`card-constraint-${i}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`w-4 h-4 ${
                          constraint.severity === 'Critical' ? 'text-red-500' :
                          constraint.severity === 'High' ? 'text-orange-500' :
                          constraint.severity === 'Medium' ? 'text-yellow-500' :
                          'text-green-500'
                        }`} />
                        <h3 className="font-bold text-slate-900 text-sm">{constraint.region}</h3>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        constraint.severity === 'Critical' ? 'bg-red-50 text-red-600' :
                        constraint.severity === 'High' ? 'bg-orange-50 text-orange-600' :
                        constraint.severity === 'Medium' ? 'bg-yellow-50 text-yellow-600' :
                        'bg-green-50 text-green-600'
                      }`}>
                        {constraint.severity}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-blue-600 mb-1">{constraint.constraintType}</p>
                    <p className="text-sm text-slate-500 mb-2">{constraint.description}</p>
                    <p className="text-xs text-slate-400">
                      <span className="font-medium">Mitigation:</span> {constraint.mitigationTimeline}
                    </p>
                  </CardContent>
                </Card>
                  ))}
                </div>
              </>
            )}

            {/* Location Suitability */}
            {content.locations && content.locations.length > 0 && (
              <>
                <SectionHeader title="Location Suitability Assessment" subtitle="Power infrastructure readiness scores for key data centre locations" />
                <Card className="border-none shadow-md mb-6">
                  <CardContent className="p-4">
                    <div style={{ height: Math.max(350, locationChartData.length * 55 + 30) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={locationChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                          <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={11} />
                          <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={180} tick={{ fill: '#475569' }} interval={0} />
                          <Tooltip
                            formatter={(value: number, name: string) => {
                              if (name === 'score') return [`${value}/100`, 'Suitability'];
                              return [formatMW(value), 'Grid Capacity'];
                            }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="score" fill="#1976D2" radius={[0, 4, 4, 0]} maxBarSize={28} name="score" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {content.locations
                    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
                    .map(loc => {
                      const isExpanded = expandedLocation === loc.location;
                      return (
                        <Card
                          key={loc.location}
                          className="border-none shadow-md hover:shadow-lg transition-all cursor-pointer"
                          onClick={() => setExpandedLocation(isExpanded ? null : loc.location)}
                          data-testid={`card-location-${loc.location.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <CardContent className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                                  loc.suitabilityScore >= 70 ? 'bg-green-500' :
                                  loc.suitabilityScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}>
                                  {loc.suitabilityScore}
                                </div>
                                <div>
                                  <h3 className="font-bold text-slate-900">{loc.location}</h3>
                                  <p className="text-xs text-slate-500">{loc.region}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  loc.powerAvailabilityRating === 'Excellent' ? 'bg-green-50 text-green-600' :
                                  loc.powerAvailabilityRating === 'Good' ? 'bg-blue-50 text-blue-600' :
                                  loc.powerAvailabilityRating === 'Moderate' ? 'bg-yellow-50 text-yellow-600' :
                                  'bg-red-50 text-red-600'
                                }`}>
                                  {loc.powerAvailabilityRating}
                                </span>
                                {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-2">
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{formatMW(loc.gridCapacityMW)}</span>
                              <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">{loc.renewableAccessPercent}% renewable</span>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">PUE {loc.averagePUE?.toFixed(2) ?? '—'}</span>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-slate-100 mt-3 pt-3">
                                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                                      <div>
                                        <span className="text-xs text-slate-400 block">Cooling Advantage</span>
                                        <span className="font-medium text-slate-700">{loc.coolingAdvantage}</span>
                                      </div>
                                      <div>
                                        <span className="text-xs text-slate-400 block">Connection Timeline</span>
                                        <span className="font-medium text-slate-700">{loc.connectionTimelineMonths} months</span>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-xs font-semibold text-slate-700 block mb-1">Key Risks</span>
                                      {(loc.keyRisks ?? []).map((risk, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                          <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                          {risk}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </>
            )}

            {/* Regulatory Environment */}
            {content.regulatoryEnvironment && (
              <>
                <SectionHeader title="Regulatory Environment" subtitle="Planning frameworks, regulations, and incentives affecting data centre power" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  <Card className="border-none shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-blue-600" /> Key Regulations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(content.regulatoryEnvironment.keyRegulations ?? []).map((reg, i) => (
                          <div key={i} className="p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-slate-900">{reg.regulation}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                reg.impact === 'Positive' ? 'bg-green-50 text-green-600' :
                                reg.impact === 'Negative' ? 'bg-red-50 text-red-600' :
                                'bg-slate-100 text-slate-600'
                              }`}>{reg.impact}</span>
                            </div>
                            <p className="text-xs text-slate-500">{reg.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" /> Incentives
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(content.regulatoryEnvironment.incentives ?? []).map((inc, i) => (
                          <div key={i} className="p-3 bg-green-50/50 rounded-lg border border-green-100">
                            <span className="font-medium text-sm text-slate-900 block mb-1">{inc.incentive}</span>
                            <p className="text-xs text-slate-500 mb-1">{inc.description}</p>
                            <span className="text-xs font-semibold text-green-600">{inc.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-red-500" /> Restrictions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(content.regulatoryEnvironment.restrictions ?? []).map((rest, i) => (
                          <div key={i} className="p-3 bg-red-50/50 rounded-lg border border-red-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-slate-900">{rest.restriction}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                rest.severity === 'High' ? 'bg-red-50 text-red-600' :
                                rest.severity === 'Medium' ? 'bg-orange-50 text-orange-600' :
                                'bg-yellow-50 text-yellow-600'
                              }`}>{rest.severity}</span>
                            </div>
                            <p className="text-xs text-slate-500">{rest.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="mb-8 border-none shadow-sm bg-blue-50/50">
                  <CardContent className="p-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      <span className="font-semibold text-blue-700">Planning Framework: </span>
                      {content.regulatoryEnvironment.planningFramework}
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed mt-2">
                      <span className="font-semibold text-blue-700">Grid Connection Timeline: </span>
                      {content.regulatoryEnvironment.gridConnectionTimeline}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Market Trends */}
            {content.trends && content.trends.length > 0 && (
              <>
                <SectionHeader title="Power Market Trends" subtitle={`Key trends shaping power infrastructure for data centres in ${trendData?.country || selectedCountry}`} />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {content.trends.map((trend, i) => (
                    <Card key={i} className="border-none shadow-md" data-testid={`card-trend-${i}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            trend.impact === 'High' ? 'bg-red-50 text-red-600' :
                            trend.impact === 'Medium' ? 'bg-yellow-50 text-yellow-600' :
                            'bg-green-50 text-green-600'
                          }`}>
                            {trend.impact} Impact
                          </span>
                          <span className="text-xs text-slate-400">{trend.timeframe}</span>
                        </div>
                        <h3 className="font-bold text-slate-900 mb-2">{trend.trend}</h3>
                        <p className="text-sm text-slate-500">{trend.relevance}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {/* Investor Insights */}
            {content.investorInsights && (
              <>
                <SectionHeader title="Investor Insights" subtitle="Strategic guidance for data centre investment decisions" />
                <Card className="border-none shadow-md bg-gradient-to-br from-blue-600 to-blue-800 text-white mb-8">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">Market Rating: {content.investorInsights.overallRating}</h3>
                        <p className="text-blue-200 text-sm">{trendData?.country || selectedCountry} Data Centre Power Market</p>
                      </div>
                    </div>
                    <p className="text-blue-100 leading-relaxed mb-4">{content.investorInsights.recommendedStrategy}</p>
                    <p className="text-blue-200 leading-relaxed mb-4 text-sm">{content.investorInsights.hyperscalerOutlook}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold text-blue-100 mb-2 text-sm">Key Opportunities</h4>
                        {(content.investorInsights.keyOpportunities ?? []).map((opp, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-blue-100 mb-1">
                            <TrendingUp className="w-3 h-3 text-green-300 flex-shrink-0" />
                            {opp}
                          </div>
                        ))}
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-100 mb-2 text-sm">Key Risks</h4>
                        {(content.investorInsights.keyRisks ?? []).map((risk, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-blue-100 mb-1">
                            <AlertTriangle className="w-3 h-3 text-orange-300 flex-shrink-0" />
                            {risk}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Summary */}
            {content.summary && (
              <Card className="border-none shadow-md bg-gradient-to-br from-blue-600 to-sky-700 text-white mb-8">
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold mb-3">Power Market Summary</h3>
                  <p className="text-blue-100 leading-relaxed">{content.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Data Sources */}
            {content.dataSources && content.dataSources.length > 0 && (
              <>
                <SectionHeader title="Data Sources & Citations" subtitle="Research reports and data used in this analysis" />
                <Card className="border-none shadow-md mb-8">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {content.dataSources.map((ds, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100" data-testid={`data-source-${i}`}>
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm leading-tight">{ds.source}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{ds.publisher} ({ds.year})</p>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ds.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>
        )}

        {selectedCountry && !content && !isLoadingExisting && !isGenerating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 mb-2">No power trends analysis found for {selectedCountry}.</p>
            <p className="text-sm text-slate-400">Click "Generate Analysis" to create one.</p>
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}
