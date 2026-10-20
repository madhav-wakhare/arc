/** Dashboard helpers: a "Needs attention" strip and a one-at-a-time Radar review. */
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, BookMarked, GraduationCap, Hourglass, Radar as RadarIcon, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Overview } from "../lib/api";
import { useJots, useProjects, useRefreshItems } from "../lib/hooks";
import { hostOf, timeAgo } from "../lib/meta";
import { Panel } from "./dash";
import { Button, useToast } from "./ui";

/** One line with what needs you today. Hidden when nothing does. */
export function AttentionStrip({ now }: { now: Overview | undefined }) {
  if (!now) return null;
  const chips = [
    now.overdue > 0 && { to: "/list", icon: AlertCircle, tone: "text-critical", text: `${now.overdue} overdue` },
    now.stale_open > 0 && { to: "/list", icon: Hourglass, tone: "text-critical", text: `${now.stale_open} waiting 30+ days` },
    now.inbox_open > 0 && { to: "#radar-review", icon: RadarIcon, tone: "text-accent", text: `${now.inbox_open} Radar topics to review` },
  ].filter(Boolean) as { to: string; icon: typeof AlertCircle; tone: string; text: string }[];
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5">
      <span className="mr-1 text-xs font-medium text-fg-3">Needs attention</span>
      {chips.map((c) =>
        c.to.startsWith("#") ? (
          <a
            key={c.text}
            href={c.to}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(c.to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-fg-2 hover:border-line-strong hover:text-fg"
          >
            <c.icon size={13} className={c.tone} /> {c.text}
          </a>
        ) : (
          <Link
            key={c.text}
            to={c.to}
            className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] text-fg-2 hover:border-line-strong hover:text-fg"
          >
            <c.icon size={13} className={c.tone} /> {c.text}
          </Link>
        ),
      )}
    </div>
  );
}

/**
 * Review Radar topics one at a time, oldest first: send it to Topics (a Learning ticket in the
 * Skill Development project), keep it on Revisit, dismiss it, or skip it for now.
 */
export function RadarReview() {
  const { data: jots = [] } = useJots();
  const { data: projects = [] } = useProjects();
  const refresh = useRefreshItems();
  const toast = useToast();
  const [skipped, setSkipped] = useState<number[]>([]);

  const queue = jots.filter((j) => j.status === "open").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pending = queue.filter((j) => !skipped.includes(j.id));
  const jot = pending[0] ?? null;
  const learning = projects.find((p) => p.key === "LRN" && !p.archived) ?? projects.find((p) => !p.archived);

  const act = useMutation({
    mutationFn: async (action: "topic" | "revisit" | "dismiss") => {
      if (!jot) return;
      if (action === "topic") await api.post(`/jots/${jot.id}/convert`, { project_id: learning!.id, type: "learning", status: "backlog" });
      if (action === "revisit") await api.post(`/jots/${jot.id}/revise`);
      if (action === "dismiss") await api.patch(`/jots/${jot.id}`, { status: "archived" });
      return action;
    },
    onSuccess: (action) => {
      refresh();
      toast(action === "topic" ? "Added to Topics" : action === "revisit" ? "Added to Revisit" : "Topic dismissed");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (!queue.length) return null;
  return (
    <div id="radar-review" className="scroll-mt-4">
      <Panel
        title={`Review Radar · ${queue.length}`}
        action={
          <Link to="/radar" className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
            Radar <ArrowRight size={12} />
          </Link>
        }
      >
        {jot ? (
          <div key={jot.id} className="anim-fade">
            <p className="text-[15px] font-medium leading-snug">{jot.body}</p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-fg-3">
              <span>{timeAgo(jot.created_at)}</span>
              {jot.url && <span>· {hostOf(jot.url)}</span>}
              {jot.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
            {jot.details && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-fg-2">{jot.details}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button size="sm" variant="primary" icon={<GraduationCap size={13} />} disabled={act.isPending || !learning} onClick={() => act.mutate("topic")}>
                To Topics
              </Button>
              <Button size="sm" icon={<BookMarked size={13} />} disabled={act.isPending} onClick={() => act.mutate("revisit")}>
                To Revisit
              </Button>
              <Button size="sm" variant="ghost" icon={<X size={13} />} disabled={act.isPending} onClick={() => act.mutate("dismiss")}>
                Dismiss
              </Button>
              <Button size="sm" variant="ghost" icon={<SkipForward size={13} />} onClick={() => setSkipped([...skipped, jot.id])}>
                Later
              </Button>
            </div>
            <p className="mt-3 text-right text-[11px] tabular-nums text-fg-3">
              {queue.length - pending.length + 1} of {queue.length}
            </p>
          </div>
        ) : (
          <div className="py-4 text-center text-[13px] text-fg-3">
            You skipped the rest for now.{" "}
            <button onClick={() => setSkipped([])} className="text-accent hover:underline">
              Start over
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}
