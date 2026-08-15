import { fmtPct } from "@/lib/format";

export function ExpectedActual({
  expected,
  actual,
  emphasizeGap = false,
}: {
  expected: number;
  actual: number;
  emphasizeGap?: boolean;
}) {
  const residual = expected - actual;
  return (
    <div className="grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
      <Cell label="Expected" value={fmtPct(expected)} />
      <Cell label="Actual" value={fmtPct(actual)} tone="text-[var(--perp)]" />
      <Cell
        label="Gap"
        value={fmtPct(residual)}
        tone={emphasizeGap ? "text-[var(--signal)]" : "text-[var(--dim)]"}
      />
    </div>
  );
}

function Cell({ label, value, tone = "text-[var(--text)]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-[var(--surface)] px-2 py-2">
      <div className="lg-label">{label}</div>
      <div className={`num mt-0.5 text-[13px] font-medium ${tone}`}>{value}</div>
    </div>
  );
}
