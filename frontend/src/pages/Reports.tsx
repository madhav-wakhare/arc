import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileBarChart } from "lucide-react";
import { useState } from "react";
import { PendingBadge } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { Kpi, ShareList, TimeSeriesCard } from "../components/charts";
import { Button, Card, Empty, IconButton, PageHeader } from "../components/ui";
import { api, type Item, type Weekly } from "../lib/api";
import { TypeIcon, fmtDate, fmtHours, fmtMinutes, todayIso } from "../lib/meta";

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ItemList({ items, empty }: { items: Item[]; empty: string }) {
  const { openItem } = useActions();
  if (!items.length) return <Empty title={empty} />;
  return (
    <div className="-mx-2 space-y-0.5">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => openItem(i.id)}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-surface-2"
        >
          <TypeIcon type={i.type} />
          <span className="font-mono text-xs text-fg-3">{i.key}</span>
          <span className="min-w-0 flex-1 truncate">{i.title}</span>
          {i.logged_minutes > 0 && <span className="font-mono text-xs text-fg-3">{fmtMinutes(i.logged_minutes)}</span>}
          <PendingBadge item={i} />
        </button>
      ))}
    </div>
  );
}

export default function Reports() {
  const [week, setWeek] = useState(todayIso());
  const { data } = useQuery({
    queryKey: ["weekly", week],
    queryFn: () => api.get<Weekly>(`/reports/weekly?week_start=${week}`),
  });
  const thisWeek = data && todayIso() >= data.week_start && todayIso() <= data.week_end;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<FileBarChart size={18} />}
        title="Weekly report"
        actions={
          <div className="flex items-center gap-1">
            <IconButton onClick={() => setWeek(shift(data?.week_start ?? week, -7))} title="Previous week">
              <ChevronLeft size={16} />
            </IconButton>
            <span className="min-w-44 text-center text-[13px] font-medium">
              {data ? `${fmtDate(data.week_start)} – ${fmtDate(data.week_end, { month: "short", day: "numeric", year: "numeric" })}` : ""}
            </span>
            <IconButton onClick={() => setWeek(shift(data?.week_start ?? week, 7))} title="Next week" disabled={thisWeek}>
              <ChevronRight size={16} />
            </IconButton>
            {!thisWeek && (
              <Button size="sm" onClick={() => setWeek(todayIso())}>
                This week
              </Button>
            )}
          </div>
        }
      />
      {data && (
        <div className="space-y-4 px-4 md:px-6 lg:px-8">
          <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Completed" value={data.current.completed} current={data.current.completed} previous={data.previous.completed} period="vs last week" />
            <Kpi label="Time logged" value={fmtHours(data.current.minutes)} current={data.current.minutes} previous={data.previous.minutes} period="vs last week" />
            <Kpi
              label="Learning time"
              value={fmtHours(data.current.learning_minutes)}
              current={data.current.learning_minutes}
              previous={data.previous.learning_minutes}
              period="vs last week"
            />
            <Kpi label="Created" value={data.current.created} current={data.current.created} previous={data.previous.created} period="vs last week" invert />
            <Kpi label="Topics added" value={data.jots_captured} />
            <Kpi label="Topics ticketed" value={data.jots_converted} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <TimeSeriesCard
              className="lg:col-span-2"
              title="Time logged per day"
              data={data.minutes_per_day}
              total={fmtMinutes(data.current.minutes)}
              fmt={fmtMinutes}
              axisFmt={(v) => (v === 0 ? "0" : v < 60 ? `${v}m` : `${+(v / 60).toFixed(1)}h`)}
            />
            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-medium">Time by project</h3>
              <ShareList rows={data.minutes_by_project.map((p) => ({ label: p.name, icon: p.icon, value: p.minutes }))} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 text-[15px] font-medium">Completed · {data.completed.length}</h3>
              <ItemList items={data.completed} empty="Nothing completed this week" />
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 text-[15px] font-medium">Not finished · {data.unfinished.length}</h3>
              <ItemList items={data.unfinished} empty="No open items in Today or past due" />
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-3 text-[15px] font-medium">Daily reviews</h3>
            {!data.reviews.length ? (
              <Empty title="No reviews this week" hint="Write one at the end of the day on the Today page." />
            ) : (
              <div className="divide-y divide-line">
                {data.reviews.map((r) => (
                  <div key={r.date} className="grid gap-3 py-3 md:grid-cols-[120px_1fr_1fr_1fr]">
                    <p className="text-[13px] font-medium">{fmtDate(r.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                    {[
                      ["Went well", r.went_well],
                      ["Blocked", r.blockers],
                      ["Tomorrow", r.tomorrow],
                    ].map(([label, text]) => (
                      <div key={label}>
                        <p className="text-xs text-fg-3">{label}</p>
                        <p className="whitespace-pre-wrap text-[13px] text-fg-2">{text || "—"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
