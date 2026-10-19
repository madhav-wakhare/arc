/** Shared building blocks for the Dashboard and Weekly report. */
import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { Item } from "../lib/api";
import { ItemIcon, fmtDate, fmtMinutes } from "../lib/meta";
import { ProjectIcon } from "../lib/projectIcons";
import { PendingBadge } from "./ItemCard";
import { Card } from "./ui";

/** Short axis label: minutes under an hour, otherwise hours. */
export function axisMinutes(v: number) {
  if (v === 0) return "0";
  return v < 60 ? `${v}m` : `${+(v / 60).toFixed(1)}h`;
}

/** "+12% vs <period>", only when there is something to compare with. */
export function delta(current: number, previous: number, period: string) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `Same as ${period}`;
  return `${pct > 0 ? "+" : ""}${pct}% vs ${period}`;
}

export function Stat({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-[13px] text-fg-3">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 h-4 truncate text-xs text-fg-3">{sub}</p>
    </>
  );
  const cls = "block px-5 py-4";
  return to ? (
    <Link to={to} className={clsx(cls, "transition-colors hover:bg-surface-2/60")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row of stats inside one card, split by thin dividers. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <Card className="grid grid-cols-2 overflow-hidden md:grid-cols-5 [&>*]:border-line md:[&>*:not(:first-child)]:border-l max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:nth-child(even)]:border-l">
      {children}
    </Card>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx("flex flex-col", className)}>
      <div className="flex h-12 items-center justify-between border-b border-line px-5">
        <h3 className="text-[14px] font-medium">{title}</h3>
        {action}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </Card>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[13px] text-fg-3">{children}</p>;
}

type Kind = "minutes" | "count";

function Tip({ active, payload, label, kind, noun }: TooltipProps<number, string> & { kind: Kind; noun: string }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value) || 0;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow)]">
      <p className="text-fg-3">{fmtDate(String(label), { weekday: "short", month: "short", day: "numeric" })}</p>
      <p className="mt-0.5 font-medium tabular-nums text-fg">{kind === "minutes" ? fmtMinutes(v) : `${v} ${noun}`}</p>
    </div>
  );
}

/** Single-series bar chart over days. */
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
  if (!data.some((d) => d.value > 0))
    return (
      <div className="flex items-center justify-center text-[13px] text-fg-3" style={{ height }}>
        No activity in this period
      </div>
    );
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} dy={6} tickFormatter={(d) => fmtDate(d, dateFormat)} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tickFormatter={kind === "minutes" ? axisMinutes : (v) => String(v)}
          />
          <Tooltip content={<Tip kind={kind} noun={noun} />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="value" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={kind === "minutes" ? 40 : 22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectBars({ rows }: { rows: { id: number; name: string; icon: string | null; minutes: number }[] }) {
  if (!rows.length) return <EmptyLine>No time logged</EmptyLine>;
  const max = Math.max(1, ...rows.map((p) => p.minutes));
  return (
    <div className="space-y-4">
      {rows.map((p) => (
        <div key={p.id}>
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <ProjectIcon icon={p.icon} size={14} />
              {p.name}
            </span>
            <span className="tabular-nums text-fg-2">{fmtMinutes(p.minutes)}</span>
          </div>
          <div className="h-1 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-fg-2" style={{ width: `${(p.minutes / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact clickable list of items. */
export function ItemRows({
  items,
  onOpen,
  empty,
  right,
}: {
  items: Item[];
  onOpen: (id: number) => void;
  empty: string;
  right?: (i: Item) => ReactNode;
}) {
  if (!items.length) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <div className="-mx-2 -my-1">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onOpen(i.id)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-2"
        >
          <ItemIcon item={i} size={14} />
          <span className="min-w-0 flex-1 truncate">{i.title}</span>
          {right ? right(i) : <PendingBadge item={i} />}
        </button>
      ))}
    </div>
  );
}
