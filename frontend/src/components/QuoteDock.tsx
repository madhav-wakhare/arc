import { useQuery } from "@tanstack/react-query";
import { Quote as QuoteIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type Quote, type Settings } from "../lib/api";

// Clicks to skip ahead are shared by every page, so moving between pages keeps the order.
let skipped = 0;

/**
 * Glass dock in the top bar that shows your quotes one at a time.
 * The quote shown depends on the clock, so every page shows the same one and the order continues.
 * Up to two lines fit in the dock; hovering pauses it and shows the full quote below when it is longer.
 * A click shows the next quote.
 */
export function QuoteDock() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const quotes = useQuery({ queryKey: ["quotes"], queryFn: () => api.get<Quote[]>("/quotes") });
  const [now, setNow] = useState(Date.now());
  const [, force] = useState(0);
  const [hover, setHover] = useState(false);
  const [clipped, setClipped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const list = quotes.data ?? [];
  const periodMs = (settings.data?.quotes_interval ?? 20) * 1000;
  const index = list.length ? (Math.floor(now / periodMs) + skipped) % list.length : 0;
  const q = list[index];

  useEffect(() => {
    if (hover) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hover]);

  // Is the quote cut off at two lines? Then hovering shows the full text.
  useLayoutEffect(() => {
    const el = textRef.current;
    setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [q?.id, q?.text]);

  if (!settings.data?.quotes_enabled || !q) return null;

  return (
    <div className="relative hidden min-w-0 max-w-[640px] @sm:block" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => {
          skipped += 1;
          force((n) => n + 1);
        }}
        title={list.length > 1 ? "Click for the next quote" : undefined}
        className="glass-dock flex min-h-9 w-full min-w-0 items-center gap-3 rounded-2xl px-4 py-1.5 text-left"
      >
        <QuoteIcon size={13} className="shrink-0 text-accent" />
        <span key={q.id} className="anim-fade min-w-0 flex-1">
          <p ref={textRef} className="line-clamp-2 text-[13px] leading-[1.35] text-fg-2">
            {q.text}
          </p>
        </span>
        {(q.author || list.length > 1) && (
          <span className="flex shrink-0 flex-col items-end gap-0.5 pl-1 text-right">
            {q.author && <span className="max-w-36 truncate text-xs text-fg-3">{q.author}</span>}
            {list.length > 1 && (
              <span className="font-mono text-[10px] tabular-nums text-fg-3">
                {index + 1}/{list.length}
              </span>
            )}
          </span>
        )}
      </button>

      {hover && clipped && (
        <div className="glass-dock anim-drop absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl px-5 py-4 text-left">
          <p className="text-[14px] leading-relaxed text-fg">{q.text}</p>
          {q.author && <p className="mt-2 text-xs text-fg-3">— {q.author}</p>}
        </div>
      )}
    </div>
  );
}
