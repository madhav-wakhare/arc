import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { PendingBadge } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { Card, PageHeader, Tabs } from "../components/ui";
import { api, type Overview } from "../lib/api";
import { useLocalState } from "../lib/hooks";
import { STATUSES, TypeIcon, fmtDate, fmtMinutes, todayIso } from "../lib/meta";
import { ProjectIcon } from "../lib/projectIcons";

type Metric = "minutes" | "completed";

/** Short axis label: minutes under an hour, otherwise hours. */
function axisMinutes(v: number) {
  if (v === 0) return "0";
  return v < 60 ? `${v}m` : `${+(v / 60).toFixed(1)}h`;
}

function Stat({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) {
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

/** "+12% vs previous period", shown only when there is something to compare with. */
function delta(current: number, previous: number) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Same as previous period";
  return `${pct > 0 ? "+" : ""}${pct}% vs previous period`;
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
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

function ChartTip({ active, payload, label, metric }: TooltipProps<number, string> & { metric: Metric }) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value) || 0;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow)]">
      <p className="text-fg-3">{fmtDate(String(label), { weekday: "short", month: "short", day: "numeric" })}</p>
      <p className="mt-0.5 font-medium tabular-nums text-fg">{metric === "minutes" ? fmtMinutes(v) : `${v} completed`}</p>
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useLocalState<"7" | "30" | "90">("smriti-dash-range", "30");
  const [metric, setMetric] = useLocalState<Metric>("smriti-dash-metric", "minutes");
  const { openItem } = useActions();
  const { data } = useQuery({
    queryKey: ["stats", Number(days)],
    queryFn: () => api.get<Overview>(`/stats/overview?days=${days}`),
  });

  const series = (metric === "minutes" ? data?.minutes_per_day : data?.completed_per_day)?.map((d) => ({
    date: d.date,
    value: d.task + d.learning + d.note,
  }));
  const total = series?.reduce((s, d) => s + d.value, 0) ?? 0;
  const statusTotal = data?.by_status.reduce((s, x) => s + x.count, 0) ?? 0;
  const projectMax = Math.max(1, ...(data?.minutes_by_project.map((p) => p.minutes) ?? [0]));

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        title="Dashboard"
        actions={
          <Tabs
            value={days}
            onChange={setDays}
            tabs={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        }
      />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <p className="-mt-3 text-[13px] text-fg-3">
          {fmtDate(todayIso(), { weekday: "long", month: "long", day: "numeric" })} · last {days} days
        </p>

        <Card className="grid grid-cols-2 overflow-hidden md:grid-cols-5 [&>*]:border-line md:[&>*:not(:first-child)]:border-l max-md:[&>*:nth-child(n+3)]:border-t max-md:[&>*:nth-child(even)]:border-l">
          <Stat label="Open items" value={data?.open ?? "–"} to="/board" />
          <Stat label="Completed" value={data?.current.completed ?? "–"} sub={data && delta(data.current.completed, data.previous.completed)} />
          <Stat
            label="Time logged"
            value={data ? fmtMinutes(data.current.minutes) : "–"}
            sub={data?.current.learning_minutes ? `${fmtMinutes(data.current.learning_minutes)} on learning` : null}
          />
          <Stat
            label="Overdue"
            value={<span className={data?.overdue ? "text-critical" : ""}>{data?.overdue ?? "–"}</span>}
            to="/today"
          />
          <Stat label="Topics to review" value={data?.inbox_open ?? "–"} to="/radar" />
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel
            title="Activity"
            className="lg:col-span-2"
            action={
              <Tabs
                value={metric}
                onChange={setMetric}
                tabs={[
                  { value: "minutes", label: "Time logged" },
                  { value: "completed", label: "Completed" },
                ]}
              />
            }
          >
            <p className="text-[13px] text-fg-3">
              {metric === "minutes" ? "Total time" : "Items completed"}{" "}
              <span className="font-medium text-fg">{metric === "minutes" ? fmtMinutes(total) : total}</span>
            </p>
            <div className="mt-4 h-[240px]">
              {total === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px] text-fg-3">No activity in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                      dy={6}
                      tickFormatter={(d) => fmtDate(d, days === "7" ? { weekday: "short" } : { month: "short", day: "numeric" })}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      allowDecimals={false}
                      tickFormatter={metric === "minutes" ? axisMinutes : (v) => String(v)}
                    />
                    <Tooltip content={<ChartTip metric={metric} />} cursor={{ fill: "var(--surface-2)" }} />
                    <Bar dataKey="value" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel
            title="Waiting longest"
            action={
              <Link to="/list" className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
                All items <ArrowRight size={12} />
              </Link>
            }
          >
            {!data?.oldest_open.length ? (
              <p className="py-10 text-center text-[13px] text-fg-3">Nothing open</p>
            ) : (
              <div className="-mx-2 -my-1">
                {data.oldest_open.slice(0, 6).map((i) => (
                  <button
                    key={i.id}
                    onClick={() => openItem(i.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-2"
                  >
                    <TypeIcon type={i.type} size={14} />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <PendingBadge item={i} />
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Time by project">
            {!data?.minutes_by_project.length ? (
              <p className="py-8 text-center text-[13px] text-fg-3">No time logged</p>
            ) : (
              <div className="space-y-4">
                {data.minutes_by_project.map((p) => (
                  <div key={p.id}>
                    <div className="mb-1.5 flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2">
                        <ProjectIcon icon={p.icon} size={14} />
                        {p.name}
                      </span>
                      <span className="tabular-nums text-fg-2">{fmtMinutes(p.minutes)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-fg-2" style={{ width: `${(p.minutes / projectMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Items by status" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              {STATUSES.map((s) => {
                const c = data?.by_status.find((x) => x.status === s.value)?.count ?? 0;
                return (
                  <div key={s.value}>
                    <p className="flex items-center gap-2 text-[13px] text-fg-3">
                      <s.icon size={14} className={s.tone} /> {s.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{c}</p>
                    <div className="mt-2 h-1 rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-fg-2" style={{ width: statusTotal ? `${(c / statusTotal) * 100}%` : 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
