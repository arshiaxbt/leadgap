import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DataTable({
  className,
  containerClassName,
  ...props
}: ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div className={cn("min-h-0 min-w-0 overflow-auto", containerClassName)}>
      <table
        className={cn("w-full border-collapse text-[13px] text-[var(--text)]", className)}
        {...props}
      />
    </div>
  );
}

export function DataTableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("sticky top-0 z-10 bg-[var(--bg)] text-[11px] font-medium text-[var(--dim)]", className)}
      {...props}
    />
  );
}

export function DataTableHead({
  align = "left",
  className,
  ...props
}: ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "border-b border-[var(--line)] px-2 py-1.5 font-medium",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn(className)} {...props} />;
}

export function DataTableRow({
  selected = false,
  flash = false,
  interactive = false,
  className,
  tabIndex,
  ...props
}: ComponentProps<"tr"> & {
  selected?: boolean;
  flash?: boolean;
  interactive?: boolean;
}) {
  return (
    <tr
      {...props}
      tabIndex={tabIndex ?? (interactive ? 0 : undefined)}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "border-b border-[color-mix(in_srgb,var(--line)_75%,transparent)]",
        interactive &&
          "group cursor-pointer outline-none hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--odds)_40%,transparent)] focus-visible:ring-inset",
        selected && "bg-[var(--elevated)] shadow-[inset_2px_0_0_var(--odds)]",
        flash && "lg-print-flash",
        className,
      )}
    />
  );
}

export function DataTableCell({
  numeric = false,
  align,
  className,
  ...props
}: ComponentProps<"td"> & { numeric?: boolean; align?: "left" | "right" }) {
  const resolved = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "px-2 py-1.5 align-middle",
        resolved === "right" ? "text-right" : "text-left",
        numeric && "num tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableSkeleton({
  columns,
  rows = 8,
  columnWidths,
  containerClassName,
}: {
  columns: number;
  rows?: number;
  columnWidths?: number[];
  containerClassName?: string;
}) {
  const widths = Array.from({ length: columns }, (_, i) => columnWidths?.[i] ?? (i === 0 ? 72 : 40));
  return (
    <DataTable aria-busy="true" aria-label="Loading" containerClassName={containerClassName}>
      <DataTableHeader>
        <tr>
          {widths.map((width, i) => (
            <DataTableHead key={i} align={i === 0 ? "left" : "right"}>
              <Skeleton className="h-2.5" style={{ width: `${width}%` }} />
            </DataTableHead>
          ))}
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {Array.from({ length: rows }, (_, r) => (
          <DataTableRow key={r}>
            {widths.map((width, c) => (
              <DataTableCell key={c} numeric={c > 0}>
                <Skeleton className="h-3" style={{ width: `${Math.max(24, width - r)}%` }} />
              </DataTableCell>
            ))}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export function DataTableEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-8 text-center text-[13px] text-[var(--muted)]">{children}</div>
  );
}
