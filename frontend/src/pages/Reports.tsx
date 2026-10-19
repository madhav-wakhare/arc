import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DayBars } from "../components/charts";
import { EmptyLine, ItemRows, Panel, ProjectBars, Stat, StatRow, delta } from "../components/dash";
import { useActions } from "../components/Layout";
import { Button, IconButton, PageHeader } from "../components/ui";
import { api, type Weekly } from "../lib/api";
import { fmtDate, fmtMinutes, todayIso } from "../lib/meta";

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Reports() {
  const [week, setWeek] = useState(todayIso());
  const { openItem } = useActions();
  const { data } = useQuery({
    queryKey: ["weekly", week],
    queryFn: () => api.get<Weekly>(`/reports/weekly?week_start=${week}`),
  });
  const today = todayIso();
  const thisWeek = !!data && today >= data.week_start && today <= data.week_end;
  const period = "last week";

  const perDay = data?.minutes_per_day.map((d) => ({ date: d.date, value: d.task + d.learning + d.note })) ?? [];
  const busiest = perDay.reduce<{ date: string; value: number } | null>((b, d) => (d.value > (b?.value ?? 0) ? d : b), null);

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        title="Weekly report"
        actions={
          <div className="flex items-center gap-1">
            {!thisWeek && (
              <Button size="sm" className="mr-2" onClick={() => setWeek(today)}>
                This week
              </Button>
            )}
            <IconButton onClick={() => setWeek(shift(data?.week_start ?? week, -7))} title="Previous week">
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton onClick={() => setWeek(shift(data?.week_start ?? week, 7))} title="Next week" disabled={thisWeek}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
        }
      />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <p className="-mt-3 h-5 text-[13px] text-fg-3">
          {data &&
            `${fmtDate(data.week_start, { weekday: "short", month: "short", day: "numeric" })} – ${fmtDate(data.week_end, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}${thisWeek ? " · this week" : ""}`}
        </p>

        <StatRow>
          <Stat label="Completed" value={data?.current.completed ?? "–"} sub={data && delta(data.current.completed, data.previous.completed, period)} />
          <Stat
            label="Time logged"
            value={data ? fmtMinutes(data.current.minutes) : "–"}
            sub={data && delta(data.current.minutes, data.previous.minutes, period)}
          />
          <Stat
            label="Learning time"
            value={data ? fmtMinutes(data.current.learning_minutes) : "–"}
            sub={data && delta(data.current.learning_minutes, data.previous.learning_minutes, period)}
          />
          <Stat label="Created" value={data?.current.created ?? "–"} sub={data && delta(data.current.created, data.previous.created, period)} />
          <Stat
            label="Radar topics"
            value={data?.jots_captured ?? "–"}
            sub={data?.jots_captured ? `${data.jots_converted} turned into tickets` : null}
          />
        </StatRow>

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title="Time per day" className="lg:col-span-2">
            <p className="mb-4 text-[13px] text-fg-3">
              Total <span className="font-medium text-fg">{fmtMinutes(data?.current.minutes ?? 0)}</span>
              {busiest && (
                <>
                  {" "}
                  · busiest day <span className="font-medium text-fg">{fmtDate(busiest.date, { weekday: "long" })}</span>
                </>
              )}
            </p>
            <DayBars data={perDay} kind="minutes" dateFormat={{ weekday: "short" }} />
          </Panel>

          <Panel title="Time by project">
            <ProjectBars rows={data?.minutes_by_project ?? []} />
          </Panel>

          <Panel title={`Completed · ${data?.completed.length ?? 0}`}>
            <ItemRows
              items={data?.completed ?? []}
              onOpen={openItem}
              empty="Nothing completed this week"
              right={(i) => <span className="text-xs text-fg-3">{fmtDate(i.completed_at, { weekday: "short" })}</span>}
            />
          </Panel>

          <Panel title={`Carried over · ${data?.unfinished.length ?? 0}`} className="lg:col-span-2">
            <ItemRows
              items={data?.unfinished ?? []}
              onOpen={openItem}
              empty="Nothing left over"
              right={(i) => (
                <span className="flex items-center gap-3 text-xs text-fg-3">
                  {i.logged_minutes > 0 && <span className="tabular-nums">{fmtMinutes(i.logged_minutes)}</span>}
                  <span>{i.status === "in_progress" ? "In progress" : i.status === "today" ? "Planned" : "Due"}</span>
                </span>
              )}
            />
          </Panel>

          <Panel title="Daily reviews" className="lg:col-span-3">
            {!data?.reviews.length ? (
              <EmptyLine>No reviews this week. Write one at the end of the day on the Today page.</EmptyLine>
            ) : (
              <div className="-my-3 divide-y divide-line">
                {data.reviews.map((r) => (
                  <div key={r.date} className="grid gap-4 py-4 md:grid-cols-[110px_1fr_1fr_1fr]">
                    <p className="text-[13px] font-medium">{fmtDate(r.date, { weekday: "short", month: "short", day: "numeric" })}</p>
                    {[
                      ["Went well", r.went_well],
                      ["Blocked", r.blockers],
                      ["Tomorrow", r.tomorrow],
                    ].map(([label, text]) => (
                      <div key={label}>
                        <p className="text-xs text-fg-3">{label}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-fg-2">{text || "—"}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
