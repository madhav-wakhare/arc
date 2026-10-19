/** Bar chart for the Weekly report: plain HTML and CSS, no chart library. */
import { useState } from "react";
import { fmtDate, fmtMinutes } from "../lib/meta";

/** Short axis label: minutes under an hour, otherwise hours. */
export function axisMinutes(v: number) {
  if (v === 0) return "0";
  return v < 60 ? `${v}m` : `${+(v / 60).toFixed(1)}h`;
}

type Kind = "minutes" | "count";

/** Top of the scale: a round number at or above the largest value (whole hours for minutes). */
function niceMax(max: number, kind: Kind) {
  if (kind === "count") return Math.max(4, Math.ceil(max / 4) * 4);
  const step = max <= 60 ? 15 : 60;
  return Math.max(step, Math.ceil(max / step) * step);
}

/** Single-series bar chart over days, with gridlines, a value axis and a hover tooltip. */
export function DayBars({
  data,
  kind,
  noun = "",
  dateFormat,
  height = 240,
}: {
  data: { date: string; value: number }[];
  kind: Kind;
  noun?: string;
  dateFormat: Intl.DateTimeFormatOptions;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.some((d) => d.value > 0))
    return (
      <div className="flex items-center justify-center text-[13px] text-fg-3" style={{ height }}>
        No activity in this period
      </div>
    );

  const top = niceMax(Math.max(...data.map((d) => d.value)), kind);
  const ticks = [4, 3, 2, 1, 0].map((i) => (top * i) / 4);
  const label = (v: number) => (kind === "minutes" ? axisMinutes(Math.round(v)) : String(Math.round(v)));
  const maxBar = kind === "minutes" ? 40 : 22;

  return (
    <div className="flex text-[11px] text-fg-3" style={{ height }}>
      {/* value axis */}
      <div className="flex w-11 shrink-0 flex-col justify-between pb-6 pr-2 text-right tabular-nums">
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
            {label(t)}
          </span>
        ))}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* gridlines */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
          {ticks.map((t) => (
            <div key={t} className="border-t border-line" />
          ))}
        </div>
        <div className="relative flex flex-1 items-end">
          {data.map((d, i) => (
            <div
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="relative flex h-full flex-1 items-end justify-center rounded-t-sm transition-colors"
              style={{ background: hover === i ? "var(--surface-2)" : undefined }}
            >
              <div
                className="w-[60%] rounded-t-[3px] bg-accent transition-[height] duration-300"
                style={{ height: `${(d.value / top) * 100}%`, maxWidth: maxBar }}
              />
              {hover === i && (
                <div
                  style={{ bottom: `calc(${(d.value / top) * 100}% + 6px)` }}
                  className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow)]"
                >
                  <p className="text-fg-3">{fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                  <p className="mt-0.5 font-medium tabular-nums text-fg">{kind === "minutes" ? fmtMinutes(d.value) : `${d.value} ${noun}`}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        {/* day axis */}
        <div className="flex h-6 items-end">
          {data.map((d) => (
            <span key={d.date} className="flex-1 truncate text-center">
              {fmtDate(d.date, dateFormat)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
