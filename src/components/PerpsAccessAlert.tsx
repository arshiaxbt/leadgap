import { cn } from "@/lib/utils";
import { PERPS_INVITE_LABEL, PERPS_INVITE_URL } from "@/lib/brand";
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
      {access.href || access.kind === "invite" ? (
        <a
          href={access.href ?? PERPS_INVITE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block break-all text-[var(--warn)] hover:underline"
        >
          {access.cta ?? PERPS_INVITE_LABEL}
        </a>
      ) : null}
    </div>
  );
}
