import { useQuery } from "@tanstack/react-query";
import { Quote as QuoteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Quote, type Settings } from "../lib/api";

// Clicks to skip ahead are shared by every page, so moving between pages keeps the order.
let skipped = 0;

/**
 * Glass pill in the top bar that shows your quotes one at a time.
 * The quote shown depends on the clock, so every page shows the same one and the order continues.
 * Hover pauses it; a click shows the next quote.
 */
export function QuoteDock() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => api.get<Quote[]>("/quotes") });
  const [now, setNow] = useState(Date.now());
  const [, force] = useState(0);
  const hovered = useRef(false);

  const list = quotes.data ?? [];
  const periodMs = (settings.data?.quotes_interval ?? 20) * 1000;

  useEffect(() => {
    const t = setInterval(() => !hovered.current && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!settings.data?.quotes_enabled || list.length === 0) return null;
  const index = (Math.floor(now / periodMs) + skipped) % list.length;
  const q = list[index];

  return (
    <button
      type="button"
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => (hovered.current = false)}
      onClick={() => {
        skipped += 1;
        force((n) => n + 1);
      }}
      title={list.length > 1 ? "Next quote" : undefined}
      className="glass-dock flex h-9 min-w-0 max-w-[560px] items-center gap-2.5 px-4 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
    >
      <QuoteIcon size={13} className="shrink-0 text-accent" />
      <span key={q.id} className="anim-fade flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[13px] text-fg-2">{q.text}</span>
        {q.author && <span className="shrink-0 text-xs text-fg-3">— {q.author}</span>}
      </span>
      {list.length > 1 && (
        <span className="ml-1 shrink-0 font-mono text-[10px] tabular-nums text-fg-3">
          {index + 1}/{list.length}
        </span>
      )}
    </button>
  );
}
