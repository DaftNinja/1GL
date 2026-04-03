export interface EntsoeHealthStatus {
  apiReachable: boolean;
  lastSuccessfulFetch: string | null;  // ISO timestamp
  lastAttempt: string | null;          // ISO timestamp
  lastError: string | null;
  consecutiveFailures: number;
  servingStaleCache: boolean;
  staleCacheAge: number | null;        // minutes since last successful fetch
}

const status: EntsoeHealthStatus = {
  apiReachable: true,
  lastSuccessfulFetch: null,
  lastAttempt: null,
  lastError: null,
  consecutiveFailures: 0,
  servingStaleCache: false,
  staleCacheAge: null,
};

export function getEntsoeHealth(): EntsoeHealthStatus {
  return { ...status };
}

export function recordEntsoeSuccess(): void {
  const now = new Date().toISOString();
  status.apiReachable = true;
  status.lastSuccessfulFetch = now;
  status.lastAttempt = now;
  status.lastError = null;
  status.consecutiveFailures = 0;
  status.servingStaleCache = false;
  status.staleCacheAge = null;
}

export function recordEntsoeFailure(
  error: string,
  servingStale: boolean,
  staleCacheAgeMinutes: number | null,
): void {
  status.apiReachable = false;
  status.lastAttempt = new Date().toISOString();
  status.lastError = error;
  status.consecutiveFailures += 1;
  status.servingStaleCache = servingStale;
  status.staleCacheAge = staleCacheAgeMinutes;
}
