import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { polymarketEventUrl } from "@/lib/brand";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`lg-pane ${className}`}>{children}</div>;
}

export function Pill({
  tone = "mute",
  children,
}: {
  tone?: "lead" | "perp" | "mute" | "danger" | "warn" | "long" | "short";
  children: ReactNode;
}) {
  const tones = {
    lead: "border-[color-mix(in_srgb,var(--signal)_45%,transparent)] text-[var(--signal)]",
    perp: "border-[var(--line)] text-[var(--perp)]",
    mute: "border-[var(--line)] text-[var(--muted)]",
    danger: "border-[color-mix(in_srgb,var(--short)_45%,transparent)] text-[var(--short)]",
    warn: "border-[color-mix(in_srgb,var(--warn)_45%,transparent)] text-[var(--warn)]",
    long: "border-[color-mix(in_srgb,var(--long)_45%,transparent)] text-[var(--long)]",
    short: "border-[color-mix(in_srgb,var(--short)_45%,transparent)] text-[var(--short)]",
  };
  return (
    <span className={`inline-flex items-center border px-1.5 py-px text-[10px] font-medium tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact,
  large,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  compact?: boolean;
  large?: boolean;
}) {
  return (
    <div className="inline-flex items-stretch border border-[var(--line)] bg-[var(--surface)]">
      {options.map((opt, i) => {
        const active = value === opt.id;
        const pad = compact ? "px-1.5 py-0.5 text-[10px]" : large ? "px-3 py-1.5 text-[13px]" : "px-2 py-1 text-[11px]";
        return (
          <button
            key={opt.id}
            type="button"
            aria-label={opt.hint ? `${opt.label}. ${opt.hint}` : undefined}
            onClick={() => onChange(opt.id)}
            className={`group relative border-r border-[var(--line)] last:border-r-0 ${pad} ${
              active
                ? "bg-[var(--hover)] text-[var(--text)]"
                : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            }`}
          >
            {opt.label}
            {opt.hint ? (
              <span className={`lg-tip ${i === options.length - 1 ? "right-0 left-auto" : "left-0"}`}>{opt.hint}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function PolymarketEventLink({
  slug,
  children = "Polymarket",
  className = "text-[11px] text-[var(--muted)] hover:text-[var(--signal)]",
}: {
  slug?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const href = polymarketEventUrl(slug);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={className}>
      {children}
    </a>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="px-4 py-6 text-center">
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{body}</p>
    </Panel>
  );
}

export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
      <span className="h-1.5 w-1.5 bg-[var(--signal)]" />
      {label ?? "Live"}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="lg-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`lg-input px-2 py-1 ${props.className ?? ""}`} />;
}

export function Btn({
  variant = "ghost",
  size = "sm",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "signal" | "long" | "short";
  size?: "sm" | "md";
}) {
  const sizes = size === "md" ? "px-3 py-1.5 text-[12px]" : "px-2 py-0.5 text-[11px]";
  const variants = {
    ghost:
      "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40",
    signal:
      "border border-[color-mix(in_srgb,var(--signal)_50%,var(--line))] text-[var(--signal)] hover:bg-[color-mix(in_srgb,var(--signal)_10%,transparent)] disabled:opacity-40",
    long: "border border-[color-mix(in_srgb,var(--long)_50%,var(--line))] text-[var(--long)] disabled:opacity-40",
    short: "border border-[color-mix(in_srgb,var(--short)_50%,var(--line))] text-[var(--short)] disabled:opacity-40",
  };
  return (
    <button type="button" {...props} className={`font-medium tracking-wide ${sizes} ${variants[variant]} ${className}`} />
  );
}

export function Metric({
  label,
  value,
  tone = "text-[var(--text)]",
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="px-3 py-2">
      <div className="lg-label">{label}</div>
      <div className={`num mt-0.5 text-[15px] font-medium leading-none ${tone}`}>{value}</div>
    </div>
  );
}
