import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItemRows, Panel, Stat, StatRow } from "../components/dash";
import { useActions } from "../components/Layout";
import { RevisePreview } from "../components/RevisePreview";
import { EndOfDayReview, TodayPanel } from "../components/TodayPlan";
import { WeekendTodayPanel } from "../components/Weekend";
import { PageHeader } from "../components/ui";
import { api, type Overview, type Weekly } from "../lib/api";
import { useSettings } from "../lib/hooks";
import { fmtDate, fmtMinutes, todayIso } from "../lib/meta";

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

/** Dashboard = where things stand right now, and today's plan. History lives in the Weekly report. */
export default function Dashboard() {
  const { openItem } = useActions();
  const { data: now } = useQuery({ queryKey: ["stats", 1], queryFn: () => api.get<Overview>("/stats/overview?days=1") });
  const { data: week } = useQuery({ queryKey: ["weekly", todayIso()], queryFn: () => api.get<Weekly>("/reports/weekly") });

  const { data: settings } = useSettings();
  const weekday = new Date().getDay();
  const showWeekend = !!settings?.weekend_mode && (weekday === 0 || weekday === 6);
  const inProgress = now?.by_status.find((s) => s.status === "in_progress")?.count ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader title="Dashboard" quotes="dashboard" />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <p className="-mt-3 text-[13px] text-fg-3">{fmtDate(todayIso(), { weekday: "long", month: "long", day: "numeric" })}</p>

        {showWeekend && <WeekendTodayPanel action={<PanelLink to="/weekend">Weekend plan</PanelLink>} />}

        <StatRow>
          <Stat label="Open items" value={now?.open ?? "–"} to="/board" />
          <Stat label="In progress" value={now ? inProgress : "–"} to="/board" />
          <Stat
            label="Overdue"
            value={<span className={now?.overdue ? "text-critical" : ""}>{now?.overdue ?? "–"}</span>}
            to="/list"
          />
          <Stat label="Logged today" value={now ? fmtMinutes(now.current.minutes) : "–"} />
          <Stat label="Topics to review" value={now?.inbox_open ?? "–"} to="/radar" />
        </StatRow>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
          <TodayPanel />

          <Panel title={`To revisit · ${now?.revise_open ?? 0}`} action={<PanelLink to="/learning/revisit">Revisit</PanelLink>}>
            <RevisePreview limit={5} />
          </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Waiting longest" action={<PanelLink to="/list">List view</PanelLink>}>
              <ItemRows items={now?.oldest_open.slice(0, 5) ?? []} onOpen={openItem} empty="Nothing open" />
            </Panel>

            <Panel title="This week" action={<PanelLink to="/reports">Weekly report</PanelLink>}>
              <dl className="grid grid-cols-3 gap-4">
                {[
                  ["Completed", week?.current.completed ?? "–"],
                  ["Time logged", week ? fmtMinutes(week.current.minutes) : "–"],
                  ["Learning", week ? fmtMinutes(week.current.learning_minutes) : "–"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-fg-3">{label}</dt>
                    <dd className="mt-1 text-[15px] font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <EndOfDayReview />
          </div>
        </div>
      </div>
    </div>
  );
}
