/**
 * ONS (Operador Nacional do Sistema Elétrico) — Brazil
 * Open data portal: https://dados.ons.org.br  (CKAN, no API key required)
 *
 * Pattern:
 *   1. package_show → resource list
 *   2. pick most-recent CSV resource
 *   3. download + parse
 *   4. cache in memory (file-cache on /tmp for restart resilience)
 */

import * as fs from "fs/promises";
import * as path from "path";

const ONS_BASE = "https://dados.ons.org.br";
const CKAN_PKG = `${ONS_BASE}/api/3/action/package_show`;
const FETCH_TIMEOUT_MS = 40_000;
const CACHE_DIR = path.join("/tmp", "ons-cache");

const TTL_1H  =  1 * 60 * 60 * 1_000;
const TTL_6H  =  6 * 60 * 60 * 1_000;
const TTL_24H = 24 * 60 * 60 * 1_000;

// ── In-memory cache ──────────────────────────────────────────────────────────

interface MemEntry { data: unknown; fetchedAt: number }
const _mem = new Map<string, MemEntry>();

function memGet<T>(key: string, ttlMs: number): T | null {
  const e = _mem.get(key);
  if (!e || Date.now() - e.fetchedAt > ttlMs) return null;
  return e.data as T;
}
function memSet<T>(key: string, data: T): T {
  _mem.set(key, { data, fetchedAt: Date.now() });
  return data;
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

/** Split one CSV line respecting double-quoted fields. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse CSV text into objects keyed by header.
 * Auto-detects comma vs semicolon delimiter (ONS uses semicolons).
 * Strips BOM. Returns at most `maxRows` most-recent rows.
 */
function parseCSV(raw: string, maxRows = 10_000): Record<string, string>[] {
  // Strip UTF-8 BOM
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0];
  const delim = (header.match(/;/g) ?? []).length > (header.match(/,/g) ?? []).length ? ";" : ",";
  const headers = splitLine(header, delim).map(h => h.replace(/"/g, "").trim());

  const start = Math.max(1, lines.length - maxRows);
  const result: Record<string, string>[] = [];
  for (let i = start; i < lines.length; i++) {
    const vals = splitLine(lines[i], delim);
    if (vals.every(v => v === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = vals[j] ?? ""; });
    result.push(row);
  }
  return result;
}

/** Case-insensitive column lookup across multiple candidate names. */
function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === c.toLowerCase()) return row[k] ?? "";
    }
  }
  return "";
}

function toNum(s: string): number {
  // Brazilian locale uses comma as decimal separator
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// ── CKAN / download helpers ───────────────────────────────────────────────────

async function ensureDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/** Fetch most-recent CSV resource URL from an ONS CKAN dataset. */
async function getLatestCsvUrl(datasetId: string): Promise<string> {
  const res = await fetch(`${CKAN_PKG}?id=${datasetId}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ONS package_show ${res.status} for ${datasetId}`);

  const json: any = await res.json();
  if (!json.success) throw new Error(`ONS CKAN returned success=false for ${datasetId}`);

  const resources: any[] = json.result?.resources ?? [];
  const csvs = resources.filter(r =>
    (r.format ?? "").toUpperCase() === "CSV" && (r.url || r.path)
  );
  if (!csvs.length) throw new Error(`No CSV resource found in ONS dataset ${datasetId}`);

  // Most-recent: try numeric sort on name (year), fall back to last in list
  csvs.sort((a, b) => {
    const yearA = parseInt((a.name ?? "").match(/\d{4}/)?.[0] ?? "0");
    const yearB = parseInt((b.name ?? "").match(/\d{4}/)?.[0] ?? "0");
    return yearB - yearA;
  });

  const url: string = csvs[0].url ?? csvs[0].path;
  console.log(`[ONS] ${datasetId} → ${csvs.length} CSV resources, using: ${url}`);
  // Enforce HTTPS
  return url.replace(/^http:\/\//, "https://");
}

/** Download CSV text, optionally caching to disk. */
async function downloadCsv(url: string, cacheFile?: string): Promise<string> {
  if (cacheFile) {
    try {
      const p = path.join(CACHE_DIR, cacheFile);
      const stat = await fs.stat(p);
      // Use disk cache if < 2 hours old (safety net between memory TTL checks)
      if (Date.now() - stat.mtimeMs < 2 * 60 * 60 * 1_000) {
        return fs.readFile(p, "utf-8");
      }
    } catch { /* cache miss */ }
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "text/csv, text/plain, */*" },
  });
  if (!res.ok) throw new Error(`ONS CSV download ${res.status}: ${url}`);
  const text = await res.text();

  if (cacheFile) {
    await ensureDir();
    await fs.writeFile(path.join(CACHE_DIR, cacheFile), text, "utf-8").catch(() => {});
  }
  return text;
}

/** Convenience: package_show → pick CSV → download → parse rows. */
async function fetchOnsRows(
  datasetId: string,
  cacheFile: string,
  maxRows = 10_000,
): Promise<Record<string, string>[]> {
  const url = await getLatestCsvUrl(datasetId);
  const csv = await downloadCsv(url, cacheFile);
  const rows = parseCSV(csv, maxRows);
  console.log(`[ONS] ${datasetId}: ${rows.length} rows parsed`);
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Generation by plant (hourly) — geracao-usina-2
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsGenerationPoint {
  date: string;
  plant: string;
  fuelType: string;
  subsystem: string;
  valueMWh: number;
}

export interface OnsGenerationResult {
  data: OnsGenerationPoint[];
  byFuelType: Record<string, number>;   // fuelType → total MWh (latest day)
  bySubsystem: Record<string, number>;  // subsystem → total MWh (latest day)
  latestDate: string | null;
  fetchedAt: string;
}

export async function getGeneration(): Promise<OnsGenerationResult> {
  const KEY = "ons:generation";
  const cached = memGet<OnsGenerationResult>(KEY, TTL_1H);
  if (cached) return cached;

  const rows = await fetchOnsRows("geracao-usina-2", "geracao_usina.csv", 20_000);
  if (!rows.length) throw new Error("ONS generation dataset returned no rows");

  const data: OnsGenerationPoint[] = rows.map(r => ({
    date:      col(r, "dat_referencia", "dat_cargaenergia", "din_instante"),
    plant:     col(r, "nom_usina", "nom_curto"),
    fuelType:  col(r, "nom_tipocombustivel", "nom_tipousina", "id_tipocombustivel"),
    subsystem: col(r, "id_subsistema", "nom_subsistema"),
    valueMWh:  toNum(col(r, "val_geracao", "val_cargaenergia")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");

  const latest = data.filter(d => d.date === latestDate);
  const byFuelType: Record<string, number> = {};
  const bySubsystem: Record<string, number> = {};
  for (const d of latest) {
    byFuelType[d.fuelType]   = (byFuelType[d.fuelType]   ?? 0) + d.valueMWh;
    bySubsystem[d.subsystem] = (bySubsystem[d.subsystem] ?? 0) + d.valueMWh;
  }

  return memSet(KEY, { data, byFuelType, bySubsystem, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Energy load/demand (daily) — carga-energia
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsDemandPoint {
  date: string;
  subsystem: string;
  energyGWh: number;
}

export interface OnsDemandResult {
  data: OnsDemandPoint[];
  latestBySubsystem: Record<string, number>;
  latestDate: string | null;
  fetchedAt: string;
}

export async function getDemand(): Promise<OnsDemandResult> {
  const KEY = "ons:demand";
  const cached = memGet<OnsDemandResult>(KEY, TTL_1H);
  if (cached) return cached;

  const rows = await fetchOnsRows("carga-energia", "carga_energia.csv", 5_000);
  if (!rows.length) throw new Error("ONS demand dataset returned no rows");

  const data: OnsDemandPoint[] = rows.map(r => ({
    date:      col(r, "dat_referencia", "dat_cargaenergia"),
    subsystem: col(r, "nom_subsistema", "id_subsistema"),
    energyGWh: toNum(col(r, "val_cargaenergia", "val_carga")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");
  const latestBySubsystem: Record<string, number> = {};
  for (const d of data.filter(d => d.date === latestDate)) {
    latestBySubsystem[d.subsystem] = d.energyGWh;
  }

  return memSet(KEY, { data, latestBySubsystem, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Hourly load curve — curva-carga
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsLoadPoint {
  instant: string;
  subsystem: string;
  loadMW: number;
}

export interface OnsLoadCurveResult {
  data: OnsLoadPoint[];
  latestTotalMW: number;
  latestInstant: string | null;
  fetchedAt: string;
}

export async function getLoadCurve(): Promise<OnsLoadCurveResult> {
  const KEY = "ons:load-curve";
  const cached = memGet<OnsLoadCurveResult>(KEY, TTL_1H);
  if (cached) return cached;

  const rows = await fetchOnsRows("curva-carga", "curva_carga.csv", 5_000);
  if (!rows.length) throw new Error("ONS load curve dataset returned no rows");

  const data: OnsLoadPoint[] = rows.map(r => ({
    instant:   col(r, "din_instante", "dat_referencia", "heure"),
    subsystem: col(r, "nom_subsistema", "id_subsistema"),
    loadMW:    toNum(col(r, "val_carga", "val_cargaenergia")),
  }));

  const latestInstant = data.reduce<string>((max, d) => d.instant > max ? d.instant : max, "");
  const latestTotalMW = data
    .filter(d => d.instant === latestInstant)
    .reduce((s, d) => s + d.loadMW, 0);

  return memSet(KEY, { data, latestTotalMW, latestInstant: latestInstant || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Installed generation capacity — capacidade-geracao
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsCapacityPoint {
  date: string;
  subsystem: string;
  plantType: string;
  installedMW: number;
}

export interface OnsCapacityResult {
  data: OnsCapacityPoint[];
  byPlantType: Record<string, number>;   // plantType → MW (latest snapshot)
  totalMW: number;
  latestDate: string | null;
  fetchedAt: string;
}

export async function getCapacity(): Promise<OnsCapacityResult> {
  const KEY = "ons:capacity";
  const cached = memGet<OnsCapacityResult>(KEY, TTL_24H);
  if (cached) return cached;

  const rows = await fetchOnsRows("capacidade-geracao", "capacidade_geracao.csv", 10_000);
  if (!rows.length) throw new Error("ONS capacity dataset returned no rows");

  const data: OnsCapacityPoint[] = rows.map(r => ({
    date:        col(r, "dat_referencia", "dat_cargaenergia"),
    subsystem:   col(r, "nom_subsistema", "id_subsistema"),
    plantType:   col(r, "nom_tipousina", "nom_tipocombustivel", "nom_fonteenergia"),
    installedMW: toNum(col(r, "val_potenciainstalada", "val_capacidade", "val_capacidadeinstalada")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");
  const byPlantType: Record<string, number> = {};
  for (const d of data.filter(d => d.date === latestDate)) {
    byPlantType[d.plantType] = (byPlantType[d.plantType] ?? 0) + d.installedMW;
  }
  const totalMW = Object.values(byPlantType).reduce((a, b) => a + b, 0);

  return memSet(KEY, { data, byPlantType, totalMW, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Cross-border energy exchange — intercambio-internacional
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsIntlExchangePoint {
  date: string;
  country: string;
  valueMWh: number;   // positive = export from Brazil, negative = import
}

export interface OnsIntlExchangeResult {
  data: OnsIntlExchangePoint[];
  latestByCountry: Record<string, number>;
  latestDate: string | null;
  fetchedAt: string;
}

export async function getInternationalExchange(): Promise<OnsIntlExchangeResult> {
  const KEY = "ons:cross-border";
  const cached = memGet<OnsIntlExchangeResult>(KEY, TTL_1H);
  if (cached) return cached;

  const rows = await fetchOnsRows("intercambio-internacional", "intercambio_intl.csv", 5_000);
  if (!rows.length) throw new Error("ONS international exchange dataset returned no rows");

  const data: OnsIntlExchangePoint[] = rows.map(r => ({
    date:     col(r, "dat_referencia", "din_instante"),
    country:  col(r, "nom_pais", "nom_paises", "nom_agente"),
    valueMWh: toNum(col(r, "val_intercambio", "val_exportacao", "val_importacao")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");
  const latestByCountry: Record<string, number> = {};
  for (const d of data.filter(d => d.date === latestDate)) {
    latestByCountry[d.country] = (latestByCountry[d.country] ?? 0) + d.valueMWh;
  }

  return memSet(KEY, { data, latestByCountry, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Subsystem energy exchange — intercambio-nacional
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsSubsysExchangePoint {
  instant: string;
  from: string;
  to: string;
  valueMWh: number;
}

export interface OnsSubsysExchangeResult {
  data: OnsSubsysExchangePoint[];
  latestFlows: Array<{ from: string; to: string; valueMWh: number }>;
  latestInstant: string | null;
  fetchedAt: string;
}

export async function getSubsystemExchange(): Promise<OnsSubsysExchangeResult> {
  const KEY = "ons:subsystem-exchange";
  const cached = memGet<OnsSubsysExchangeResult>(KEY, TTL_1H);
  if (cached) return cached;

  const rows = await fetchOnsRows("intercambio-nacional", "intercambio_nacional.csv", 5_000);
  if (!rows.length) throw new Error("ONS subsystem exchange dataset returned no rows");

  const data: OnsSubsysExchangePoint[] = rows.map(r => ({
    instant:  col(r, "din_instante", "dat_referencia"),
    from:     col(r, "nom_subsistema_de", "nom_subsistema_origem", "id_subsistema_de"),
    to:       col(r, "nom_subsistema_para", "nom_subsistema_destino", "id_subsistema_para"),
    valueMWh: toNum(col(r, "val_intercambio", "val_carga")),
  }));

  const latestInstant = data.reduce<string>((max, d) => d.instant > max ? d.instant : max, "");
  const latestFlows = data
    .filter(d => d.instant === latestInstant)
    .map(({ from, to, valueMWh }) => ({ from, to, valueMWh }));

  return memSet(KEY, { data, latestFlows, latestInstant: latestInstant || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Wind & solar capacity factor — fator-capacidade-2
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsCapacityFactorPoint {
  date: string;
  subsystem: string;
  plantType: string;
  factor: number;   // 0–1
}

export interface OnsCapacityFactorResult {
  data: OnsCapacityFactorPoint[];
  latestByType: Record<string, number>;
  latestDate: string | null;
  fetchedAt: string;
}

export async function getCapacityFactor(): Promise<OnsCapacityFactorResult> {
  const KEY = "ons:capacity-factor";
  const cached = memGet<OnsCapacityFactorResult>(KEY, TTL_6H);
  if (cached) return cached;

  const rows = await fetchOnsRows("fator-capacidade-2", "fator_capacidade.csv", 5_000);
  if (!rows.length) throw new Error("ONS capacity factor dataset returned no rows");

  const data: OnsCapacityFactorPoint[] = rows.map(r => ({
    date:      col(r, "dat_referencia", "din_instante"),
    subsystem: col(r, "nom_subsistema", "id_subsistema"),
    plantType: col(r, "nom_tipousina", "nom_tipocombustivel"),
    factor:    toNum(col(r, "val_fatorcapacidade", "val_fator")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");
  const latest = data.filter(d => d.date === latestDate);

  // Average factor per plant type across subsystems
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const d of latest) {
    if (!sums[d.plantType]) sums[d.plantType] = { sum: 0, count: 0 };
    sums[d.plantType].sum   += d.factor;
    sums[d.plantType].count += 1;
  }
  const latestByType: Record<string, number> = {};
  for (const [t, { sum, count }] of Object.entries(sums)) {
    latestByType[t] = count > 0 ? Math.round((sum / count) * 1000) / 1000 : 0;
  }

  return memSet(KEY, { data, latestByType, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Thermal generation by dispatch reason — geracao-termica-despacho-2
// ═══════════════════════════════════════════════════════════════════════════════

export interface OnsThermalDispatchPoint {
  date: string;
  reason: string;
  valueMWh: number;
}

export interface OnsThermalDispatchResult {
  data: OnsThermalDispatchPoint[];
  latestByReason: Record<string, number>;
  latestDate: string | null;
  fetchedAt: string;
}

export async function getThermalDispatch(): Promise<OnsThermalDispatchResult> {
  const KEY = "ons:thermal-dispatch";
  const cached = memGet<OnsThermalDispatchResult>(KEY, TTL_6H);
  if (cached) return cached;

  const rows = await fetchOnsRows("geracao-termica-despacho-2", "termica_despacho.csv", 5_000);
  if (!rows.length) throw new Error("ONS thermal dispatch dataset returned no rows");

  const data: OnsThermalDispatchPoint[] = rows.map(r => ({
    date:     col(r, "dat_referencia", "din_instante"),
    reason:   col(r, "nom_motivodespacho", "nom_motivo", "nom_razaodespacho"),
    valueMWh: toNum(col(r, "val_geracao", "val_cargaenergia")),
  }));

  const latestDate = data.reduce<string>((max, d) => d.date > max ? d.date : max, "");
  const latestByReason: Record<string, number> = {};
  for (const d of data.filter(d => d.date === latestDate)) {
    latestByReason[d.reason] = (latestByReason[d.reason] ?? 0) + d.valueMWh;
  }

  return memSet(KEY, { data, latestByReason, latestDate: latestDate || null, fetchedAt: new Date().toISOString() });
}
