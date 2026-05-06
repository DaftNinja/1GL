const API_KEY = process.env.SCRAPERAPI_KEY;
const BASE_URL = "http://api.scraperapi.com";

interface ScraperOptions {
  render?: boolean;
  country?: string;
}

export async function fetchPage(url: string, options?: ScraperOptions): Promise<string> {
  // If SCRAPERAPI_KEY is not set, fall back to native fetch (for development)
  if (!API_KEY) {
    console.warn("[ScraperService] SCRAPERAPI_KEY not set, falling back to native fetch");
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      throw new Error(`Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Use ScraperAPI for production
  const params = new URLSearchParams({
    api_key: API_KEY,
    url,
  });

  if (options?.render) {
    params.append("render", "true");
  }
  if (options?.country) {
    params.append("country_code", options.country);
  }

  const apiUrl = `${BASE_URL}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    throw new Error(`ScraperAPI failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
