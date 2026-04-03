interface DataSourceMeta {
  source: "live" | "stale_cache";
  dataAge: string | null;
  apiStatus: "ok" | "unavailable";
  lastSuccessfulFetch: string | null;
  message: string | null;
}

interface DataSourceStatusProps {
  meta: DataSourceMeta | null | undefined;
  sourceName?: string;
  noDataMessage?: string;
  hasData?: boolean;
}

export function DataSourceStatus({
  meta,
  sourceName = "data source",
  noDataMessage,
  hasData = true,
}: DataSourceStatusProps) {
  if (!meta || (meta.source === "live" && meta.apiStatus === "ok")) return null;

  const isUnavailable = meta.apiStatus === "unavailable" || meta.source === "stale_cache";
  if (!isUnavailable) return null;

  const message =
    !hasData
      ? (noDataMessage ?? `${sourceName} temporarily unavailable. Data will appear when the source is restored.`)
      : meta.dataAge
        ? `${sourceName} temporarily unavailable. Showing last available data from ${meta.dataAge} ago.`
        : `${sourceName} temporarily unavailable. Showing last available data.`;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="shrink-0 text-base">&#9888;</span>
      <span>{message}</span>
    </div>
  );
}
