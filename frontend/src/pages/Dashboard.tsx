import { useQuery } from "@tanstack/react-query";
import { CalendarRange, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { useActions } from "../components/Layout";
import { PendingBadge } from "../components/ItemCard";
import { Kpi, ShareList, TimeSeriesCard } from "../components/charts";
import { Card, Empty, PageHeader, Select, Tabs } from "../components/ui";
import { api, type DayByType, type ItemType, type Overview } from "../lib/api";
import { useLocalState } from "../lib/hooks";
import { STATUSES, StatusIcon, TypeIcon, fmtHours, fmtMinutes } from "../lib/meta";

type Tab = "overview" | ItemType;

const only = (data: DayByType[], tab: Tab) =>
  tab === "overview"
    ? data
    : data.map((d) => ({ date: d.date, task: 0, learning: 0, note: 0, [tab]: d[tab] }) as DayByType);

const sum = (data: DayByType[]) => data.reduce((s, d) => s + d.task + d.learning + d.note, 0);

export default function Dashboard() {
  const [days, setDays] = useLocalState("smriti-dash-days", 30);
  const [tab, setTab] = useLocalState<Tab>("smriti-dash-tab", "overview");
  const { openItem } = useActions();
  const { data } = useQuery({
    queryKey: ["stats", days],
    queryFn: () => api.get<Overview>(`/stats/overview?days=${days}`),
  });

  const period = `vs previous ${days} days`;
  const completed = data ? only(data.completed_per_day, tab) : [];
  const minutes = data ? only(data.minutes_per_day, tab) : [];
  const created = data ? only(data.created_per_day, tab) : [];
  const statusTotal = data?.by_status.reduce((s, x) => s + x.count, 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<LayoutDashboard size={18} />}
        title="Dashboard"
        actions={
          <Select icon={<CalendarRange size={14} />} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </Select>
        }
      />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "task", label: "Work" },
            { value: "learning", label: "Learning" },
            { value: "note", label: "Notes" },
          ]}
        />

        {data && (
          <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Open items" value={data.open} />
            <Kpi label="Completed" value={data.current.completed} current={data.current.completed} previous={data.previous.completed} period={period} />
            <Kpi label="Time logged" value={fmtHours(data.current.minutes)} current={data.current.minutes} previous={data.previous.minutes} period={period} />
            <Kpi
              label="Learning time"
              value={fmtHours(data.current.learning_minutes)}
              current={data.current.learning_minutes}
              previous={data.previous.learning_minutes}
              period={period}
            />
            <Kpi label="Overdue" value={<span className={data.overdue ? "text-critical" : ""}>{data.overdue}</span>} />
            <Link to="/radar" className="rounded-md hover:opacity-80">
              <Kpi label="Topics to review" value={data.inbox_open} />
            </Link>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <TimeSeriesCard title="Completed items" data={completed} total={sum(completed)} />
          <TimeSeriesCard
            title="Time logged"
            data={minutes}
            total={fmtMinutes(sum(minutes))}
            fmt={fmtMinutes}
            axisFmt={(v) => `${Math.round(v / 60)}h`}
          />
          <TimeSeriesCard title="Created items" data={created} total={sum(created)} />

          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-medium">Time by project</h3>
            <p className="mb-4 text-[13px] text-fg-2">
              Total <span className="font-semibold text-fg">{fmtMinutes(data?.current.minutes ?? 0)}</span>
            </p>
            <ShareList rows={(data?.minutes_by_project ?? []).map((p) => ({ label: p.name, icon: p.icon, value: p.minutes }))} />
          </Card>

          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-medium">Items by status</h3>
            <p className="mb-4 text-[13px] text-fg-2">
              Total <span className="font-semibold text-fg">{statusTotal}</span>
            </p>
            <div className="mb-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              {STATUSES.map((s) => {
                const c = data?.by_status.find((x) => x.status === s.value)?.count ?? 0;
                return c ? (
                  <div
                    key={s.value}
                    className="h-full"
                    style={{ width: `${(c / statusTotal) * 100}%`, background: `var(--${s.value === "done" ? "good" : s.value === "in_progress" ? "warning" : s.value === "today" ? "series-task" : "border-strong"})` }}
                  />
                ) : null;
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STATUSES.map((s) => (
                <div key={s.value} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-[13px]">
                  <span className="flex items-center gap-2 text-fg-2">
                    <StatusIcon status={s.value} /> {s.label}
                  </span>
                  <span className="font-mono tabular-nums">{data?.by_status.find((x) => x.status === s.value)?.count ?? 0}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-medium">Longest pending</h3>
            <p className="mb-3 text-[13px] text-fg-2">Open items, oldest first</p>
            {!data?.oldest_open.length ? (
              <Empty title="Nothing pending" />
            ) : (
              <div className="-mx-2 space-y-0.5">
                {data.oldest_open.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => openItem(i.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-2"
                  >
                    <TypeIcon type={i.type} />
                    <span className="font-mono text-xs text-fg-3">{i.key}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <PendingBadge item={i} />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
