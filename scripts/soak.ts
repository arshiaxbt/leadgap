import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
type Sample = {
  t: number;
  ok: boolean;
  age: number | null;
  status: string;
  size: number;
};
async function main() {
  const origin = process.env.DATA_SERVICE_URL,
    secret = process.env.DATA_SERVICE_SECRET;
  if (!origin || !secret)
    throw new Error("Configure DATA_SERVICE_URL and DATA_SERVICE_SECRET.");
  const hours = Number(process.argv[2] ?? 72);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168)
    throw new Error("Choose up to 168 hours.");
  const startedAt = Date.now(),
    directory = `artifacts/soak/${new Date(startedAt).toISOString().replaceAll(":", "-")}`,
    file = `${directory}/samples.jsonl`,
    end = startedAt + hours * 3600_000;
  await mkdir(directory, { recursive: true });
  console.log("Soak output:", directory);
  while (true) {
    let sample: Sample = {
      t: Date.now(),
      ok: false,
      age: null,
      status: "unreachable",
      size: 0,
    };
    try {
      const r = await fetch(new URL("/health", origin), {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) {
        const h = await r.json();
        const age = h.asOf ? sample.t - h.asOf : null;
        sample = {
          ...sample,
          age,
          status: h.status,
          size: h.size ?? 0,
          ok: h.status === "healthy" && age !== null && age < 90_000,
        };
      }
    } catch {}
    await appendFile(file, JSON.stringify(sample) + "\n");
    console.log(new Date(sample.t).toISOString(), sample.status, sample.age);
    // Include a final sample at/after the deadline, rather than ending up to
    // one minute short and incorrectly failing the 72-hour duration gate.
    if (sample.t >= end) break;
    await sleep(Math.max(0, Math.min(60_000, end - Date.now())));
  }
  const samples = (await readFile(file, "utf8"))
    .trim()
    .split("\n")
    .map((v) => JSON.parse(v) as Sample)
    .filter((s) => s.t >= end - hours * 3600_000);
  const durationMs = (samples.at(-1)?.t ?? 0) - (samples[0]?.t ?? 0),
    coverage = samples.filter((s) => s.ok).length / Math.max(samples.length, 1),
    maxGapMs = Math.max(
      0,
      ...samples.slice(1).map((s, i) => s.t - samples[i].t),
    );
  const report = {
    durationMs,
    samples: samples.length,
    freshHealthyFraction: coverage,
    maxGapMs,
    maxStorageBytes: Math.max(0, ...samples.map((s) => s.size)),
    pass:
      durationMs >= 71.99 * 3600_000 && coverage >= 0.99 && maxGapMs < 180_000,
    providerQuotaReview:
      "Required: verify CPU, D1 reads/writes and Vercel function usage in provider dashboards.",
  };
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
  if (!report.pass) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
