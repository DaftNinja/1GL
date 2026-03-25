import { useState, useEffect } from "react";
import { Loader2, Unlock, ExternalLink } from "lucide-react";
import logoUrl from "@/assets/1giglabs-logo.png";

function isInCrossOriginIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function IframeStorageGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "ok" | "blocked" | "denied">("checking");

  useEffect(() => {
    if (!isInCrossOriginIframe()) {
      setStatus("ok");
      return;
    }

    if (!document.hasStorageAccess) {
      setStatus("ok");
      return;
    }

    document.hasStorageAccess().then((hasAccess) => {
      setStatus(hasAccess ? "ok" : "blocked");
    }).catch(() => {
      setStatus("ok");
    });
  }, []);

  async function requestAccess() {
    setStatus("checking");
    try {
      await document.requestStorageAccess();
      window.location.reload();
    } catch {
      setStatus("denied");
    }
  }

  if (status === "ok") return <>{children}</>;

  const appUrl = window.location.href;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <img src={logoUrl} alt="1GigLabs" className="h-10 w-auto object-contain mx-auto" />

        {status === "checking" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-slate-500">Loading…</p>
          </div>
        )}

        {status === "blocked" && (
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
              <Unlock className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">One more step</h2>
              <p className="text-sm text-slate-500">
                Your browser needs permission to load live data inside this page.
                Tap the button below to enable it.
              </p>
            </div>
            <button
              onClick={requestAccess}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Load Power Data
            </button>
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-blue-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab instead
            </a>
          </div>
        )}

        {status === "denied" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Browser blocked access</h2>
              <p className="text-sm text-slate-500">
                Your browser's privacy settings are preventing data from loading here.
                Open the app directly for the full experience.
              </p>
            </div>
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open 1GigLabs Power Trends
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
