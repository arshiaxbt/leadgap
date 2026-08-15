import { APP_GITHUB, APP_NAME, APP_X } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="relative z-20 shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-[11px] text-[var(--dim)]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2">
        <p className="min-w-0 truncate">
          {APP_NAME} · Probability is the signal. The perp is the trade. Not financial advice.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <a href={APP_GITHUB} target="_blank" rel="noreferrer" aria-label="GitHub" className="hover:text-[var(--muted)]">
            <GitHubIcon />
          </a>
          <a href={APP_X} target="_blank" rel="noreferrer" aria-label="X" className="hover:text-[var(--muted)]">
            <XIcon />
          </a>
        </div>
      </div>
    </footer>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.486 2 12.021c0 4.424 2.865 8.18 6.839 9.504.5.093.682-.217.682-.483 0-.237-.009-.866-.013-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.621.069-.609.069-.609 1.004.071 1.532 1.032 1.532 1.032.892 1.531 2.341 1.089 2.91.833.091-.647.35-1.089.636-1.34-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.254-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.56 9.56 0 0 1 12 6.844a9.56 9.56 0 0 1 2.504.337c1.909-1.296 2.748-1.026 2.748-1.026.546 1.378.203 2.396.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.338 4.695-4.566 4.943.359.31.679.922.679 1.859 0 1.341-.012 2.421-.012 2.751 0 .268.18.58.688.481A10.02 10.02 0 0 0 22 12.021C22 6.486 17.523 2 12 2Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.59l-5.16-6.74L5.06 22H1.79l8.03-9.17L1.5 2h6.75l4.66 6.17L18.244 2Zm-1.16 18.06h1.8L7.01 3.84H5.08l12.004 16.22Z" />
    </svg>
  );
}
