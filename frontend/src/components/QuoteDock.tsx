import { useQuery } from "@tanstack/react-query";
import { Quote as QuoteIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type Quote, type Settings } from "../lib/api";

// Clicks to skip ahead are shared by every page, so moving between pages keeps the order.
let skipped = 0;

/**
 * Glass dock in the top bar that shows your quotes one at a time.
 * It grows sideways to fit the quote on one line and only wraps to a second line when it must.
 * The quote shown depends on the clock, so every page shows the same one and the order continues.
 * Hover pauses it (and shows the full quote if it is cut off); a click shows the next quote.
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

  useLayoutEffect(() => {
    const el = textRef.current;
    setClipped(!!el && el.scrollHeight > el.clientHeight + 1);
  }, [q?.id, q?.text]);

  if (!settings.data?.quotes_enabled || !q) return null;

  return (
    <div
      className="relative hidden min-w-0 max-w-full @5xl/hdr:block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => {
          skipped += 1;
          force((n) => n + 1);
        }}
        title={list.length > 1 ? "Next quote" : undefined}
        className="glass-dock flex min-h-9 max-w-full items-center gap-2.5 rounded-[18px] px-4 py-2 text-left"
      >
        <QuoteIcon size={13} className="shrink-0 text-accent" />
        <p key={q.id} ref={textRef} className="anim-fade line-clamp-2 min-w-0 text-[13px] leading-[1.4] text-fg-2">
          {q.text}
          {q.author && <span className="whitespace-nowrap text-fg-3">{"  —  "}{q.author}</span>}
        </p>
      </button>

      {hover && clipped && (
        <div className="glass-dock anim-drop absolute left-1/2 top-full z-30 mt-2 w-[min(560px,90vw)] -translate-x-1/2 rounded-2xl px-5 py-4">
          <p className="text-[14px] leading-relaxed text-fg">{q.text}</p>
          {q.author && <p className="mt-2 text-xs text-fg-3">— {q.author}</p>}
        </div>
      )}
    </div>
  );
}
