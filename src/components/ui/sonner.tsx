"use client";

import type { CSSProperties } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      gap={8}
      offset={16}
      mobileOffset={{ bottom: 64, right: 16 }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--long)]" />,
        info: <InfoIcon className="size-4 text-[var(--odds)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warn)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--short)]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[var(--muted)]" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "border border-[var(--line-strong)] bg-[var(--surface)] font-sans text-[13px] text-[var(--text)] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)]",
          title: "text-[var(--text)]",
          description: "text-[var(--muted)]",
          success: "border-[color-mix(in_srgb,var(--long)_35%,var(--line))]",
          error: "border-[color-mix(in_srgb,var(--short)_35%,var(--line))]",
          warning: "border-[color-mix(in_srgb,var(--warn)_35%,var(--line))]",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line-strong)",
          "--success-bg": "var(--surface)",
          "--error-bg": "var(--surface)",
          "--border-radius": "10px",
        } as CSSProperties
      }
      {...props}
    />
  );
}
