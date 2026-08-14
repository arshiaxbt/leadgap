import { fmtPct, signedClass } from "@/lib/format";

export function ExpectedActual({
  expected,
  actual,
}: {
  expected: number;
  actual: number;
}) {
  const residual = expected - actual;
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Math.abs(residual), 0.004);
  return (
    <div className="space-y-1">
      <Bar label="Expected" value={expected} scale={scale} />
      <Bar label="Actual" value={actual} scale={scale} />
      <Bar label="Gap" value={residual} scale={scale} emphasize />
    </div>
  );
}

function Bar({
  label,
  value,
  scale,
  emphasize = false,
}: {
  label: string;
  value: number;
  scale: number;
  emphasize?: boolean;
}) {
  const pct = Math.min(100, (Math.abs(value) / scale) * 100);
  const pos = value >= 0;
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)_48px] items-center gap-1.5 text-[11px]">
      <span className="text-[#5c6478]">{label}</span>
      <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
        <div
          className={`absolute inset-y-0 ${pos ? "left-1/2" : "right-1/2"} rounded-full ${
            pos ? "bg-[#3ee0a8]" : "bg-rose-400"
          } ${emphasize ? "opacity-100" : "opacity-70"}`}
          style={{ width: `${pct / 2}%` }}
        />
      </div>
      <span className={`num text-right ${signedClass(value)}`}>{fmtPct(value)}</span>
    </div>
  );
}
