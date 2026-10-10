import clsx from "clsx";
import { ChartColumn, ChartLine, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { DayByType, ItemType } from "../lib/api";
import { fmtDate, fmtMinutes } from "../lib/meta";
import { Card, IconButton } from "./ui";
import { ProjectIcon } from "../lib/projectIcons";

export const SERIES: { key: ItemType; label: string; color: string }[] = [
  { key: "task", label: "Task", color: "var(--series-task)" },
  { key: "learning", label: "Learning", color: "var(--series-learning)" },
  { key: "note", label: "Note", color: "var(--series-note)" },
];

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, label, fmt }: TooltipProps<number, string> & { fmt: Fmt }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow)]">
      <p className="mb-1.5 font-medium text-fg">{fmtDate(String(label), { weekday: "short", month: "short", day: "numeric" })}</p>
      {payload
        .slice()
        .reverse()
        .map((p) => (
          <div key={p.dataKey as string} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-fg-2">
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-mono tabular-nums text-fg">{fmt(Number(p.value) || 0)}</span>
          </div>
        ))}
      {payload.length > 1 && (
        <div className="mt-1 flex justify-between border-t border-line pt-1 text-fg-2">
          <span>Total</span>
          <span className="font-mono tabular-nums text-fg">{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
      {series.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Bifrost-style card: title, total, legend, bar/line/table toggle. */
export function TimeSeriesCard({
  title,
  data,
  total,
  fmt = (v) => String(v),
  axisFmt,
  height = 220,
  className,
}: {
  title: string;
  data: DayByType[];
  total: ReactNode;
  fmt?: Fmt;
  axisFmt?: Fmt;
  height?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<"bar" | "line" | "table">("bar");
  const present = SERIES.filter((s) => data.some((d) => d[s.key] > 0));
  const series = present.length ? present : SERIES;
  const empty = !data.some((d) => d.task + d.learning + d.note > 0);
  const tick = (d: string) => fmtDate(d, data.length > 10 ? { month: "short", day: "numeric" } : { weekday: "short" });

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="date" tickFormatter={tick} tickLine={false} axisLine={false} minTickGap={24} dy={6} />
      <YAxis tickFormatter={axisFmt ?? fmt} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
      <Tooltip content={<ChartTooltip fmt={fmt} />} />
    </>
  );

  return (
    <Card className={clsx("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <h3 className="text-[15px] font-medium">{title}</h3>
          <p className="text-[13px] text-fg-2">
            Total <span className="font-semibold text-fg">{total}</span>
          </p>
          <Legend series={series} />
        </div>
        <div className="flex gap-0.5">
          <IconButton active={mode === "bar"} onClick={() => setMode("bar")} title="Bar chart">
            <ChartColumn size={16} />
          </IconButton>
          <IconButton active={mode === "line"} onClick={() => setMode("line")} title="Line chart">
            <ChartLine size={16} />
          </IconButton>
          <IconButton active={mode === "table"} onClick={() => setMode("table")} title="Table">
            <Table2 size={16} />
          </IconButton>
        </div>
      </div>
      <div className="mt-4 flex-1" style={{ minHeight: height }}>
        {empty && mode !== "table" ? (
          <div className="flex h-full items-center justify-center text-[13px] text-fg-3" style={{ height }}>
            No data available
          </div>
        ) : mode === "table" ? (
          <div className="overflow-auto" style={{ maxHeight: height }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface text-fg-3">
                <tr>
                  <th className="py-1.5 text-left font-medium">Date</th>
                  {series.map((s) => (
                    <th key={s.key} className="py-1.5 text-right font-medium">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {data.filter((d) => d.task + d.learning + d.note > 0).map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="py-1.5 font-sans">{fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" })}</td>
                    {series.map((s) => (
                      <td key={s.key} className="py-1.5 text-right">{fmt(d[s.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {mode === "bar" ? (
              <BarChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="20%">
                {axes}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId="a"
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth={1}
                    maxBarSize={28}
                    radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                {axes}
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

/** Plane-style KPI: label, big number, change vs previous period. */
export function Kpi({
  label,
  value,
  current,
  previous,
  period = "vs last period",
  invert,
}: {
  label: string;
  value: ReactNode;
  current?: number;
  previous?: number;
  period?: string;
  invert?: boolean;
}) {
  let delta: ReactNode = null;
  if (current !== undefined && previous !== undefined) {
    const diff = current - previous;
    const pct = previous ? Math.round((diff / previous) * 100) : current ? 100 : 0;
    const up = diff >= 0;
    const good = invert ? !up : up;
    const Icon = up ? TrendingUp : TrendingDown;
    delta = (
      <p className="mt-2 flex items-center gap-1.5 text-[13px]">
        <span className={clsx("flex items-center gap-1 font-medium", diff === 0 ? "text-fg-3" : good ? "text-good" : "text-critical")}>
          <Icon size={14} /> {Math.abs(pct)}%
        </span>
        <span className="text-fg-3">{period}</span>
      </p>
    );
  }
  return (
    <div>
      <p className="text-[13px] text-fg-2">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      {delta}
    </div>
  );
}

/** Horizontal share bar list, for time by project. */
export function ShareList({ rows }: { rows: { label: string; icon: string | null; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="flex h-40 items-center justify-center text-[13px] text-fg-3">No data available</div>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} className="group">
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <ProjectIcon icon={r.icon} size={14} />
              {r.label}
            </span>
            <span className="font-mono text-xs tabular-nums text-fg-2">{fmtMinutes(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
