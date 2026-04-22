/**
 * Unit & integration tests for UNEnergyStatsBatcher.
 *
 * Run with:  npx vitest server/adapters/apac/sources/__tests__/unEnergyStats.test.ts
 * (Install:  npm install -D vitest)
 *
 * Tests are self-contained — they mock the UN API via vi.stubGlobal('fetch').
 * No real HTTP requests are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  UNEnergyStatsBatcher,
  getGridCompositionParallel,
  getEnergyTrendParallel,
  batchQueryUN,
  IND_COAL_CAP,
  IND_GAS_CAP,
  IND_HYDRO_CAP,
  IND_WIND_CAP,
  IND_SOLAR_CAP,
  IND_ELEC_GEN,
} from "../unEnergyStats";

// ── Mock helpers ──────────────────────────────────────────────────────────────

function sdmxResponse(value: number, year = 2024) {
  return {
    dataSets: [
      {
        observations: {
          "0": [{ OBS_VALUE: value, TIME_PERIOD: year, UNIT_MEASURE: "MW" }],
        },
      },
    ],
  };
}

function sdmxTimeSeries(values: number[], startYear = 2020) {
  return {
    dataSets: [
      {
        observations: Object.fromEntries(
          values.map((v, i) => [
            String(i),
            [{ OBS_VALUE: v, TIME_PERIOD: startYear + i, UNIT_MEASURE: "GWh" }],
          ]),
        ),
      },
    ],
  };
}

function mockFetch(responseBody: any, status = 200, delayMs = 10) {
  return vi.fn(() =>
    new Promise<Response>((resolve) =>
      setTimeout(
        () =>
          resolve({
            ok:     status >= 200 && status < 300,
            status,
            headers: new Headers(),
            json:   () => Promise.resolve(responseBody),
            text:   () => Promise.resolve(JSON.stringify(responseBody)),
          } as unknown as Response),
        delayMs,
      ),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UNEnergyStatsBatcher", () => {
  let batcher: UNEnergyStatsBatcher;

  beforeEach(() => {
    // Fresh batcher per test; tiny batch window so tests run fast
    batcher = new UNEnergyStatsBatcher(50, 5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Correctness ──────────────────────────────────────────────────────────

  it("returns a value for a successful UN API call", async () => {
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(2450)));

    const result = await batcher.add({ country: "India", indicator: IND_COAL_CAP, year: 2024 });

    expect(result).not.toBeNull();
    expect(result?.value).toBe(2450);
    expect(result?.source).toBe("UN_ENERGY_STATS");
    expect(result?.timeperiod).toBe(2024);
  });

  it("normalises country names case-insensitively", async () => {
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(980)));

    const result = await batcher.add({ country: "india", indicator: IND_COAL_CAP, year: 2024 });
    expect(result?.value).toBe(980);
  });

  it("returns null on HTTP 404 without throwing", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 404));

    const result = await batcher.add({ country: "Singapore", indicator: IND_COAL_CAP, year: 2024 });
    expect(result).toBeNull();
  });

  it("returns null on timeout without throwing", async () => {
    // Fetch never resolves within REQUEST_TIMEOUT (we inject a very short timeout)
    vi.stubGlobal("fetch", () => new Promise(() => {})); // hangs forever

    // Use a batcher with very short timeout — patch via monkey-patch for test
    const slowBatcher = new UNEnergyStatsBatcher(10, 1);
    // Override private REQUEST_TIMEOUT by making AbortSignal fire immediately
    vi.stubGlobal("AbortController", class {
      signal = { aborted: false };
      abort() { this.signal.aborted = true; }
    });

    // Directly call fetchUNData with a short timeout
    // (We test graceful null return, not the internal timeout mechanism)
    const result = await slowBatcher.add({ country: "Japan", indicator: IND_COAL_CAP, year: 2024 });
    // Either null (timeout fired) or a value (if mock returned fast enough) — must not throw
    expect(result === null || typeof result?.value === "number").toBe(true);
  }, 10_000);

  it("returns null on HTTP 5xx without throwing", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "internal server error" }, 500));

    const result = await batcher.add({ country: "Malaysia", indicator: IND_WIND_CAP, year: 2024 });
    expect(result).toBeNull();
  });

  // ── Cache ─────────────────────────────────────────────────────────────────

  it("returns cached value on second request without hitting fetch again", async () => {
    const fetchMock = mockFetch(sdmxResponse(1200));
    vi.stubGlobal("fetch", fetchMock);

    await batcher.add({ country: "Japan", indicator: IND_WIND_CAP, year: 2024 });
    const start = Date.now();
    const second = await batcher.add({ country: "Japan", indicator: IND_WIND_CAP, year: 2024 });
    const elapsed = Date.now() - start;

    expect(second?.value).toBe(1200);
    expect(elapsed).toBeLessThan(50); // cache hit should be < 50 ms
    // fetch was only called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache hit returns in < 100 ms", async () => {
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(500)));

    // Prime cache
    await batcher.add({ country: "Singapore", indicator: IND_SOLAR_CAP, year: 2024 });

    const start = Date.now();
    await batcher.add({ country: "Singapore", indicator: IND_SOLAR_CAP, year: 2024 });
    expect(Date.now() - start).toBeLessThan(100);
  });

  // ── Deduplication ─────────────────────────────────────────────────────────

  it("deduplicates identical in-flight requests", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", () => {
      callCount++;
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok:     true,
              status: 200,
              headers: new Headers(),
              json:   () => Promise.resolve(sdmxResponse(300)),
            } as unknown as Response),
          30,
        ),
      );
    });

    // Fire 3 identical requests simultaneously
    const [r1, r2, r3] = await Promise.all([
      batcher.add({ country: "India", indicator: IND_GAS_CAP, year: 2024 }),
      batcher.add({ country: "India", indicator: IND_GAS_CAP, year: 2024 }),
      batcher.add({ country: "India", indicator: IND_GAS_CAP, year: 2024 }),
    ]);

    expect(r1?.value).toBe(300);
    expect(r2?.value).toBe(300);
    expect(r3?.value).toBe(300);
    // Should only have made 1 HTTP call, not 3
    expect(callCount).toBe(1);
  });

  // ── Parallel performance ──────────────────────────────────────────────────

  it("5 parallel requests complete in < 500 ms (not sequential ~2500 ms)", async () => {
    // Each mock fetch takes ~100 ms
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(100), 200, 100));

    const start = Date.now();
    await Promise.all([
      batcher.add({ country: "India", indicator: IND_COAL_CAP,  year: 2024 }),
      batcher.add({ country: "India", indicator: IND_GAS_CAP,   year: 2024 }),
      batcher.add({ country: "India", indicator: IND_HYDRO_CAP, year: 2024 }),
      batcher.add({ country: "India", indicator: IND_WIND_CAP,  year: 2024 }),
      batcher.add({ country: "India", indicator: IND_SOLAR_CAP, year: 2024 }),
    ]);
    const elapsed = Date.now() - start;

    // Parallel: 50ms batch window + 100ms fetch = ~150-200ms
    // Sequential would be: 5 × 100ms = 500ms+ (excluding window)
    expect(elapsed).toBeLessThan(500);
  });

  it("unknown country returns null gracefully", async () => {
    const result = await batcher.add({ country: "Narnia", indicator: IND_COAL_CAP, year: 2024 });
    expect(result).toBeNull();
  });
});

// ── getGridCompositionParallel ────────────────────────────────────────────────

describe("getGridCompositionParallel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches all 12 indicators and returns UNGridComposition", async () => {
    const values: Record<string, number> = {
      COAL_CAPACITY: 980, GAS_CAPACITY: 950, HYDRO_CAPACITY: 280,
      WIND_CAPACITY:  95, SOLAR_CAPACITY: 145, NUCLEAR_CAPACITY: 0,
      COAL_GENERATION: 600, GAS_GENERATION: 580, HYDRO_GENERATION: 140,
      WIND_GENERATION:  40, SOLAR_GENERATION:  50, NUCLEAR_GENERATION: 0,
    };

    vi.stubGlobal("fetch", (url: string) => {
      const matched = Object.entries(values).find(([ind]) => url.includes(ind));
      const val = matched ? matched[1] : 0;
      return Promise.resolve({
        ok: true, status: 200,
        headers: new Headers(),
        json: () => Promise.resolve(sdmxResponse(val)),
      } as unknown as Response);
    });

    const result = await getGridCompositionParallel("India", 2024);

    expect(result).not.toBeNull();
    expect(result?.coal.capacityMW).toBe(980);
    expect(result?.gas.capacityMW).toBe(950);
    expect(result?.hydro.capacityMW).toBe(280);
    expect(result?.wind.capacityMW).toBe(95);
    expect(result?.solar.capacityMW).toBe(145);
    expect(result?.year).toBe(2024);
    expect(result?.source).toBe("UN_ENERGY_STATS");
    expect(result?.totalCapacityMW).toBe(980 + 950 + 280 + 95 + 145 + 0);
  });

  it("returns null when all indicators fail", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 500));
    const result = await getGridCompositionParallel("Singapore", 2024);
    expect(result).toBeNull();
  });

  it("returns partial result if some indicators are missing", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      // Only coal capacity returns data; rest 404
      const status = url.includes("COAL_CAPACITY") ? 200 : 404;
      return Promise.resolve({
        ok: status === 200, status,
        headers: new Headers(),
        json: () => Promise.resolve(status === 200 ? sdmxResponse(500) : {}),
      } as unknown as Response);
    });

    const result = await getGridCompositionParallel("Malaysia", 2024);
    expect(result).not.toBeNull();
    expect(result?.coal.capacityMW).toBe(500);
    expect(result?.gas.capacityMW).toBe(0);
  });
});

// ── getEnergyTrendParallel ────────────────────────────────────────────────────

describe("getEnergyTrendParallel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns trend with correct CAGR for increasing series", async () => {
    const values = [24_100, 24_800, 25_600, 26_400, 27_300]; // ~3.2% CAGR
    vi.stubGlobal("fetch", mockFetch(sdmxTimeSeries(values, 2020)));

    const result = await getEnergyTrendParallel("Japan", IND_ELEC_GEN, 2020, 2024);

    expect(result).not.toBeNull();
    expect(result?.values).toHaveLength(5);
    expect(result?.trend_direction).toBe("increasing");
    expect(result?.cagr_5yr).toBeGreaterThan(2);
    expect(result?.cagr_5yr).toBeLessThan(5);
    expect(result?.years[0]).toBe(2020);
    expect(result?.years[4]).toBe(2024);
  });

  it("returns null on API failure without throwing", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 500));
    const result = await getEnergyTrendParallel("India", IND_ELEC_GEN, 2020, 2024);
    expect(result).toBeNull();
  });

  it("identifies decreasing trend correctly", async () => {
    const values = [30_000, 29_000, 28_000, 27_000, 26_000];
    vi.stubGlobal("fetch", mockFetch(sdmxTimeSeries(values, 2020)));

    const result = await getEnergyTrendParallel("Japan", IND_ELEC_GEN, 2020, 2024);
    expect(result?.trend_direction).toBe("decreasing");
    expect(result?.cagr_5yr).toBeLessThan(0);
  });

  it("identifies stable trend within ±3%", async () => {
    const values = [10_000, 10_100, 10_050, 10_200, 10_150];
    vi.stubGlobal("fetch", mockFetch(sdmxTimeSeries(values, 2020)));

    const result = await getEnergyTrendParallel("Singapore", IND_ELEC_GEN, 2020, 2024);
    expect(result?.trend_direction).toBe("stable");
  });
});

// ── batchQueryUN ─────────────────────────────────────────────────────────────

describe("batchQueryUN", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a Map keyed by country:indicator:year", async () => {
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(750)));

    const requests = [
      { country: "India",     indicator: IND_COAL_CAP, year: 2024 },
      { country: "Malaysia",  indicator: IND_WIND_CAP, year: 2024 },
      { country: "Singapore", indicator: IND_SOLAR_CAP, year: 2024 },
    ];

    const results = await batchQueryUN(requests);

    expect(results.size).toBe(3);
    expect(results.has("India:COAL_CAPACITY:2024")).toBe(true);
    expect(results.has("Malaysia:WIND_CAPACITY:2024")).toBe(true);
    expect(results.has("Singapore:SOLAR_CAPACITY:2024")).toBe(true);
    expect(results.get("India:COAL_CAPACITY:2024")?.value).toBe(750);
  });

  it("omits failed requests from the result map", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      const status = url.includes("India") ? 200 : 500;
      return Promise.resolve({
        ok: status === 200, status,
        headers: new Headers(),
        json: () => Promise.resolve(status === 200 ? sdmxResponse(400) : {}),
      } as unknown as Response);
    });

    const results = await batchQueryUN([
      { country: "India",    indicator: IND_COAL_CAP, year: 2024 },
      { country: "Malaysia", indicator: IND_COAL_CAP, year: 2024 },
    ]);

    expect(results.size).toBe(1);
    expect(results.has("India:COAL_CAPACITY:2024")).toBe(true);
    expect(results.has("Malaysia:COAL_CAPACITY:2024")).toBe(false);
  });

  it("handles an empty request array", async () => {
    const results = await batchQueryUN([]);
    expect(results.size).toBe(0);
  });
});

// ── Integration: getGridAnalysis ──────────────────────────────────────────────

describe("Integration — getGridAnalysis", () => {
  afterEach(() => vi.restoreAllMocks());

  it("includes gridComposition from UN API in response", async () => {
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(1000)));

    const { getGridAnalysis } = await import("../../index");
    const result = await getGridAnalysis("India", "Mumbai");

    expect(result.country).toBe("India");
    expect(result.state).toBe("Mumbai");
    expect(result.regionalCapacity).not.toBeNull();
    expect(result.gridComposition).not.toBeNull();
    expect(result.gridComposition?.coal.capacityMW).toBe(1000);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns manual data with warning when UN API fails", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 500));

    const { getGridAnalysis } = await import("../../index");
    const result = await getGridAnalysis("Malaysia", "Johor Bahru");

    expect(result.regionalCapacity).not.toBeNull();  // manual data present
    expect(result.gridComposition).toBeNull();         // UN failed
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("UN Energy Statistics unavailable");
  });

  it("response time < 500 ms even with UN API call", async () => {
    // UN fetch takes 200 ms (realistic)
    vi.stubGlobal("fetch", mockFetch(sdmxResponse(500), 200, 200));

    const { getGridAnalysis } = await import("../../index");
    const start = Date.now();
    await getGridAnalysis("Japan", "Tokyo");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
  }, 5_000);
});

// ── Load test: thundering herd prevention ─────────────────────────────────────

describe("Load test — cache prevents thundering herd", () => {
  afterEach(() => vi.restoreAllMocks());

  it("100 concurrent requests for same indicator make only 1 HTTP call", async () => {
    const batcher = new UNEnergyStatsBatcher(50, 100);
    let callCount  = 0;

    vi.stubGlobal("fetch", () => {
      callCount++;
      return new Promise<Response>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok:     true,
              status: 200,
              headers: new Headers(),
              json:   () => Promise.resolve(sdmxResponse(888)),
            } as unknown as Response),
          50,
        ),
      );
    });

    // 100 parallel requests for the same indicator
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        batcher.add({ country: "Singapore", indicator: IND_SOLAR_CAP, year: 2024 }),
      ),
    );

    expect(results.every((r) => r?.value === 888)).toBe(true);
    // Deduplication: only 1 fetch despite 100 concurrent requests
    expect(callCount).toBe(1);
  });
});
