import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ItemRows, Panel, Stat, StatRow } from "../components/dash";
import { useActions } from "../components/Layout";
import { RevisePreview } from "../components/RevisePreview";
import { PageHeader } from "../components/ui";
import { api, type Item, type Overview, type Weekly } from "../lib/api";
import { fmtDate, fmtMinutes, statusMeta, todayIso } from "../lib/meta";

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

/** Dashboard = where things stand right now. History lives in the Weekly report. */
export default function Dashboard() {
  const { openItem } = useActions();
  const { data: now } = useQuery({ queryKey: ["stats", 1], queryFn: () => api.get<Overview>("/stats/overview?days=1") });
  const { data: today = [] } = useQuery({ queryKey: ["items", "today"], queryFn: () => api.get<Item[]>("/items?view=today") });
  const { data: week } = useQuery({ queryKey: ["weekly", todayIso()], queryFn: () => api.get<Weekly>("/reports/weekly") });

  const planned = today.filter((i) => i.status !== "done");
  const inProgress = now?.by_status.find((s) => s.status === "in_progress")?.count ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader title="Dashboard" />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <p className="-mt-3 text-[13px] text-fg-3">{fmtDate(todayIso(), { weekday: "long", month: "long", day: "numeric" })}</p>

        <StatRow>
          <Stat label="Open items" value={now?.open ?? "–"} to="/board" />
          <Stat label="In progress" value={now ? inProgress : "–"} to="/board" />
          <Stat
            label="Overdue"
            value={<span className={now?.overdue ? "text-critical" : ""}>{now?.overdue ?? "–"}</span>}
            to="/today"
          />
          <Stat label="Logged today" value={now ? fmtMinutes(now.current.minutes) : "–"} />
          <Stat label="Topics to review" value={now?.inbox_open ?? "–"} to="/radar" />
        </StatRow>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
          <Panel title={`Today · ${planned.length}`} action={<PanelLink to="/today">Plan today</PanelLink>}>
            <ItemRows
              items={planned}
              onOpen={openItem}
              empty="Nothing planned for today"
              right={(i) => (
                <span className="flex items-center gap-3 text-xs text-fg-3">
                  {i.logged_minutes > 0 && <span className="tabular-nums">{fmtMinutes(i.logged_minutes)}</span>}
                  {i.due_date && i.due_date < todayIso() ? (
                    <span className="w-20 text-right text-critical">Overdue</span>
                  ) : (
                    <span className="w-20 text-right">{statusMeta(i.status).label}</span>
                  )}
                </span>
              )}
            />
          </Panel>

          <Panel title={`To revise · ${now?.revise_open ?? 0}`} action={<PanelLink to="/revise">Revise</PanelLink>}>
            <RevisePreview limit={5} />
          </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Waiting longest" action={<PanelLink to="/list">All items</PanelLink>}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
