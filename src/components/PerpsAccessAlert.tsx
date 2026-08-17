import { cn } from "@/lib/utils";
import type { PerpsAccess } from "@/lib/perpsAccess";

export function PerpsAccessAlert({
  access,
  className,
}: {
  access: PerpsAccess;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-b border-[color-mix(in_srgb,var(--warn)_55%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--text)]",
        className,
      )}
    >
      <p>{access.message}</p>
      {access.href ? (
        <a
          href={access.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block break-all text-[var(--warn)] hover:underline"
        >
          {access.cta ?? "Request Perps access"}
        </a>
      ) : null}
    </div>
  );
}
