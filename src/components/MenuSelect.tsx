"use client";

import { useEffect, useRef, useState } from "react";

export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  align = "left",
  className = "",
  menuClassName = "",
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
  ariaLabel?: string;
  align?: "left" | "right";
  className?: string;
  menuClassName?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, width: 160 });
  const current = options.find((o) => o.id === value)?.label ?? value;

  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.max(r.width, 140);
    let left = align === "right" ? r.right - width : r.left;
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
    setBox({ top: r.bottom + 4, left, width });
  }, [align, open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      const t = ev.target as Node;
      if (btn.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={`lg-focus inline-flex max-w-full items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[12px] text-[var(--text)] hover:bg-[var(--hover)] ${className}`}
      >
        <span className="min-w-0 truncate">{current}</span>
        <svg viewBox="0 0 12 12" className={`h-2 w-2 shrink-0 text-[var(--muted)] ${open ? "rotate-180" : ""}`} aria-hidden>
          <path fill="currentColor" d="M2.2 4.2 6 8l3.8-3.8-.9-.9L6 6.2 3.1 3.3z" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panel}
          role="listbox"
          style={{ top: box.top, left: box.left, minWidth: box.width }}
          className={`fixed z-50 max-h-[min(70vh,320px)] overflow-auto border border-[var(--line)] bg-[var(--elevated)] ${menuClassName}`}
        >
          {options.map((opt) => {
            const on = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`lg-focus block w-full truncate px-3 py-1.5 text-left text-[13px] ${
                  on
                    ? "bg-[var(--hover)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
