/**
 * Energy-Charts API health tracking (fallback for ENTSO-E, German grid signals).
 * Mirrors entsoeHealth.ts pattern for consistency.
 */

export interface EnergyChartsHealthStatus {
  apiReachable: boolean;
  lastSuccessfulFetch: string | null;      // ISO timestamp
  lastAttempt: string | null;               // ISO timestamp
  lastError: string | null;
  consecutiveFailures: number;
  servedAsGermanFallback: boolean;          // True if Energy-Charts was used when ENTSO-E failed
  lastFallbackUse: string | null;           // ISO timestamp of last fallback use
}

const status: EnergyChartsHealthStatus = {
  apiReachable: true,
  lastSuccessfulFetch: null,
  lastAttempt: null,
  lastError: null,
  consecutiveFailures: 0,
  servedAsGermanFallback: false,
  lastFallbackUse: null,
};

export function getEnergyChartsHealth(): EnergyChartsHealthStatus {
  return { ...status };
}

export function recordEnergyChartsSuccess(): void {
  const now = new Date().toISOString();
  status.apiReachable = true;
  status.lastSuccessfulFetch = now;
  status.lastAttempt = now;
  status.lastError = null;
  status.consecutiveFailures = 0;
}

export function recordEnergyChartsFailure(error: string): void {
  status.apiReachable = false;
  status.lastAttempt = new Date().toISOString();
  status.lastError = error;
  status.consecutiveFailures += 1;
}

export function recordEnergyChartsUsedAsFallback(): void {
  status.servedAsGermanFallback = true;
  status.lastFallbackUse = new Date().toISOString();
}
