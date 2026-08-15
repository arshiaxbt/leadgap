"use client";

import type { NewsItem } from "@/lib/types";

export function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No matching headlines yet.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.slice(0, 10).map((item) => (
        <li key={item.id} className="py-3">
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--text)] hover:text-[var(--signal)]"
          >
            {item.title}
          </a>
          <div className="mt-1 text-xs text-[var(--faint)]">
            {item.source}
            {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString()}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
