import type { InputHTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#1e2636] bg-[#10141c]/90 ${className}`}>{children}</div>
  );
}

export function Pill({
  tone = "mute",
  children,
}: {
  tone?: "lead" | "perp" | "mute" | "danger" | "warn" | "long" | "short";
  children: ReactNode;
}) {
  const tones = {
    lead: "bg-[#3ee0a8]/12 text-[#3ee0a8]",
    perp: "bg-[#4d8dff]/12 text-[#8bb4ff]",
    mute: "bg-white/5 text-[#8b93a7]",
    danger: "bg-rose-500/15 text-rose-300",
    warn: "bg-amber-500/15 text-amber-200",
    long: "bg-emerald-500/15 text-emerald-300",
    short: "bg-rose-500/15 text-rose-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#1e2636] bg-[#0b0e14] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-2.5 py-1 text-xs capitalize ${
            value === opt.id ? "bg-white text-[#07080c]" : "text-[#8b93a7] hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Panel className="px-5 py-8 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#8b93a7]">{body}</p>
    </Panel>
  );
}

export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8b93a7]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3ee0a8] opacity-40" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3ee0a8]" />
      </span>
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
    <label className="block text-xs text-[#8b93a7]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[#1e2636] bg-[#07080c] px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-[#5c6478] focus:border-[#3ee0a8]/40 ${props.className ?? ""}`}
    />
  );
}
