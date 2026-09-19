import type { GapRow } from "@/lib/types";

export function SignalEvidence({ row }: { row: GapRow }) {
  const timing = row.timing,
    execution = row.execution;
  const label =
    timing?.status === "odds-leads"
      ? `Odds preceded the perp by ${timing.lagMinutes} min`
      : timing?.status === "perp-leads"
        ? `Perp preceded the odds by ${Math.abs(timing.lagMinutes ?? 0)} min`
        : timing?.status === "simultaneous"
          ? "Movements were simultaneous at minute resolution"
          : "Insufficient or conflicting timing evidence";
  return (
    <div className="mt-4 rounded-lg border border-line p-4 text-[12px] leading-relaxed text-subtle">
      <p className="font-medium text-text">Research evidence</p>
      <p className="mt-1">
        {label}.{" "}
        {timing && (
          <>
            Based on {timing.samples} paired returns;{" "}
            {Math.round(timing.coverage * 100)}% coverage.
          </>
        )}
      </p>
      {timing?.correlation != null && (
        <p>
          Lag correlation {timing.correlation.toFixed(2)}. Association does not
          establish causation.
        </p>
      )}
      <p className="mt-2">$100 notional · 30-minute holding estimate</p>
      <p>
        {execution?.status === "pass" && execution.totalCost != null
          ? `Estimated round-trip costs: ${(execution.totalCost * 100).toFixed(3)}%. Includes spread, depth-based slippage, taker fees and adverse funding.`
          : execution?.status === "fail"
            ? "Quote-quality checks did not pass."
            : "Execution costs unknown: fresh quotes, comparison quotes or fee inputs are unavailable."}
      </p>
      {!!row.candidateReasons?.length && (
        <p className="mt-2">
          Pending checks:{" "}
          {row.candidateReasons.map((r) => r.replaceAll("-", " ")).join(", ")}.
        </p>
      )}
      <p className="mt-2">
        A candidate is a research screen, not a forecast of profit or a
        guaranteed fill.
      </p>
    </div>
  );
}
