"use client";

import { useEffect, useState } from "react";

type Status = {
  ready: boolean;
  recommended: string;
  configured: { id: string; model: string }[];
};

export function SetupBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/interpret")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ ready: false, recommended: "groq", configured: [] }));
  }, []);

  if (!status || status.ready) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
      Interpretation is using the rules fallback until you add a free API key. Paste{" "}
      <code className="text-amber-100">GROQ_API_KEY</code> into{" "}
      <code className="text-amber-100">.env.local</code> (see README) and restart the server. No
      OpenAI key and no local model.
    </div>
  );
}
