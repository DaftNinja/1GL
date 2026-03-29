import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ── Embed token ───────────────────────────────────────────────────────────────

/** The embed token from `?embed=` URL param, or null when not in embed mode. */
export const embedToken: string | null =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("embed")
    : null;

/** True when the app is running as an embedded iframe with a valid token param. */
export const isEmbedMode = embedToken !== null;

// Patch window.fetch once so that every /api/ call in the app automatically
// carries the embed token — no changes needed in individual components.
if (embedToken) {
  const _origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/") && !input.includes("embed=")) {
      const sep = input.includes("?") ? "&" : "?";
      input = `${input}${sep}embed=${encodeURIComponent(embedToken)}`;
    }
    return _origFetch(input, init);
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
