"use client";

import { safeHttpsUrl } from "@/lib/safe-url";
import type { NewsItem } from "@/lib/types";

function NewsLink({ href, title }: { href: string; title: string }) {
  const safe = safeHttpsUrl(href);
  if (!safe) return <span className="text-sm text-[var(--text)]">{title}</span>;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-[var(--text)] hover:text-[var(--signal)]"
    >
      {title}
    </a>
  );
}

export function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No matching headlines yet.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.slice(0, 10).map((item) => (
        <li key={item.id} className="py-3">
          <NewsLink href={item.link} title={item.title} />
          <div className="mt-1 text-xs text-[var(--faint)]">
            {item.source}
            {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString()}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
