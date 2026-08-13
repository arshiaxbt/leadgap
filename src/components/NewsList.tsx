"use client";

import type { NewsItem } from "@/lib/types";

export function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No matched headlines yet.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800">
      {items.slice(0, 12).map((item) => (
        <li key={item.id} className="py-2.5">
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-zinc-200 hover:text-white"
          >
            {item.title}
          </a>
          <div className="mt-1 text-xs text-zinc-500">
            {item.source}
            {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleString()}` : ""}
            {item.symbols.length ? ` · ${item.symbols.slice(0, 4).join(", ")}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
