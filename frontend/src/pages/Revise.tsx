import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowUpRight,
  BookMarked,
  CircleCheck,
  CircleHelp,
  Clock,
  History,
  Play,
  Square,
  ExternalLink,
  Eye,
  EyeOff,
  NotebookText,
  PenLine,
  Pencil,
  Plus,
  Radar as RadarIcon,
  RotateCcw,
  Search,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useActions } from "../components/Layout";
import { AddRevisionModal, RevisionForm, type RevisionFields } from "../components/Revise";
import { Button, Card, Drawer, IconButton, Input, Kbd, Modal, PageHeader, Select, Tabs, useToast } from "../components/ui";
import { api, type Priority, type Revision, type RevisionSession } from "../lib/api";
import { useNow, useRefreshItems, useRevisions } from "../lib/hooks";
import { PRIORITIES, PriorityIcon, daysBetween, fmtDateTime, fmtMinutes, hostOf, parseDuration, timeAgo } from "../lib/meta";

type Tab = "active" | "revised";

function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [v, setV] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setV(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return v;
}

const SOURCE: Record<Revision["source"], { icon: ReactNode; label: string }> = {
  manual: { icon: <PenLine size={12} />, label: "Added by you" },
  ticket: { icon: <Ticket size={12} />, label: "From a ticket" },
  radar: { icon: <RadarIcon size={12} />, label: "From Radar" },
};

function Block({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/40">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-3">
          {icon}
          {title}
        </span>
        {action}
      </div>
      <div className="px-4 pb-4 pt-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- time spent revising

function Cell({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-fg-3">
        {icon}
        {label}
      </p>
      <div className="mt-1 truncate text-[14px] font-medium tabular-nums">{children}</div>
    </div>
  );
}

/** Priority, last revised, time spent and the revise timer for one topic. */
function SessionBar({ rev }: { rev: Revision }) {
  const refresh = useRefreshItems();
  const toast = useToast();
  const now = useNow();
  const [logOpen, setLogOpen] = useState(false);
  const [spent, setSpent] = useState("");
  const minutes = parseDuration(spent);

  const call = useMutation({
    mutationFn: ({ method, path, body }: { method: "post" | "patch"; path: string; body?: unknown; done?: string }) =>
      method === "post" ? api.post(path, body) : api.patch(path, body),
    onSuccess: (_d, v) => {
      refresh();
      if (v.done) toast(v.done);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const secs = rev.timer_started_at ? Math.max(0, Math.floor((now - new Date(rev.timer_started_at).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line sm:grid-cols-4 sm:divide-x [&>*]:border-line max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(even)]:border-l">
        <Cell icon={<PriorityIcon priority={rev.priority} size={12} />} label="Priority">
          <Select
            value={rev.priority}
            onChange={(e) => call.mutate({ method: "patch", path: `/revisions/${rev.id}`, body: { priority: e.target.value as Priority } })}
            className="-ml-1 [&_select]:h-7 [&_select]:border-transparent [&_select]:bg-transparent [&_select]:pl-1 [&_select]:text-[14px] [&_select]:font-medium"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Cell>
        <Cell icon={<History size={12} />} label="Last revised">
          {rev.last_revised_at ? timeAgo(rev.last_revised_at) : <span className="text-fg-3">Never</span>}
        </Cell>
        <Cell icon={<Clock size={12} />} label="Time spent">
          {rev.total_minutes ? fmtMinutes(rev.total_minutes) : <span className="text-fg-3">0m</span>}
        </Cell>
        <Cell icon={<RotateCcw size={12} />} label="Sessions">
          {rev.session_count}
        </Cell>
      </div>

      {rev.status === "active" && (
        <div className="flex flex-wrap items-center gap-2">
          {rev.timer_started_at ? (
            <>
              <span className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-[13px]">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent" />
                </span>
                Revising <span className="font-mono tabular-nums">{clock}</span>
              </span>
              <Button
                size="sm"
                icon={<Square size={11} fill="currentColor" />}
                onClick={() => call.mutate({ method: "post", path: `/revisions/${rev.id}/timer/stop`, done: "Session logged" })}
              >
                Stop and log
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" icon={<Play size={12} />} onClick={() => call.mutate({ method: "post", path: `/revisions/${rev.id}/timer/start` })}>
                Start revising
              </Button>
              <Button size="sm" icon={<Clock size={12} />} onClick={() => setLogOpen(true)}>
                Log time
              </Button>
            </>
          )}
        </div>
      )}

      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Log a revision session"
        footer={
          <>
            <Button onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!minutes || Number.isNaN(minutes)}
              onClick={() => {
                call.mutate({ method: "post", path: `/revisions/${rev.id}/sessions`, body: { time_spent: spent }, done: "Session logged" });
                setSpent("");
                setLogOpen(false);
              }}
            >
              Log session
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium">Time spent</span>
          <Input autoFocus value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="e.g. 20m or 1h 15m" />
          <span className="block text-xs text-fg-3">It counts as revised now. The topic stays on your list.</span>
        </label>
      </Modal>
    </div>
  );
}

function SessionList({ rev }: { rev: Revision }) {
  const refresh = useRefreshItems();
  const { data = [] } = useQuery({
    queryKey: ["revisions", rev.id, "sessions", rev.session_count],
    queryFn: () => api.get<RevisionSession[]>(`/revisions/${rev.id}/sessions`),
  });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/revision-sessions/${id}`), onSuccess: refresh });
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-3">
        <History size={13} /> Sessions
      </p>
      <div className="divide-y divide-line rounded-lg border border-line">
        {data.map((s) => (
          <div key={s.id} className="group flex items-center gap-3 px-4 py-2 text-[13px]">
            <Clock size={13} className="text-fg-3" />
            <span className="font-medium tabular-nums">{fmtMinutes(s.minutes)}</span>
            <span className="flex-1 text-fg-3">{fmtDateTime(s.created_at)}</span>
            <button
              title="Delete session"
              onClick={() => remove.mutate(s.id)}
              className="text-fg-3 opacity-0 hover:text-critical group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- detail panel

function RevisionPanel({ rev, onClose }: { rev: Revision; onClose: () => void }) {
  const { openItem } = useActions();
  const refresh = useRefreshItems();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(!rev.question);
  const toForm = (r: Revision): RevisionFields => ({ title: r.title, question: r.question, notes: r.notes, url: r.url ?? "", priority: r.priority });
  const [form, setForm] = useState<RevisionFields>(toForm(rev));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm(toForm(rev));
    setRevealed(!rev.question);
  }, [rev]);

  const save = useMutation({
    mutationFn: () => api.patch(`/revisions/${rev.id}`, form),
    onSuccess: () => {
      refresh();
      setEditing(false);
      toast("Saved");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const setStatus = useMutation({
    mutationFn: (status: Revision["status"]) => api.patch(`/revisions/${rev.id}`, { status }),
    onSuccess: (_d, status) => {
      refresh();
      toast(status === "revised" ? `Revised “${rev.title}”` : `“${rev.title}” is back on your list`);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/revisions/${rev.id}`),
    onSuccess: () => {
      refresh();
      toast("Deleted");
      onClose();
    },
  });

  const age = daysBetween(rev.created_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{rev.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-3">
            <span className="flex items-center gap-1.5">
              {SOURCE[rev.source].icon} {SOURCE[rev.source].label}
            </span>
            <span>
              {rev.status === "revised" && rev.revised_at
                ? `Revised ${fmtDateTime(rev.revised_at)}`
                : age === 0
                  ? "Added today"
                  : `On your list for ${age} ${age === 1 ? "day" : "days"}`}
            </span>
          </p>
        </div>
        <IconButton title="Close (Esc)" onClick={onClose} className="-mr-2 -mt-1">
          <X size={17} />
        </IconButton>
      </div>

      {!editing && <SessionBar rev={rev} />}

      {editing ? (
        <>
          <RevisionForm value={form} onChange={setForm} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {rev.question && (
            <Block icon={<CircleHelp size={13} />} title="Test yourself">
              <p className="text-[15px] leading-relaxed">{rev.question}</p>
              {!revealed && <p className="mt-2 text-xs text-fg-3">Answer it in your head, then show your notes.</p>}
            </Block>
          )}

          <Block
            icon={<NotebookText size={13} />}
            title="Notes"
            action={
              rev.question &&
              revealed && (
                <button onClick={() => setRevealed(false)} className="flex items-center gap-1.5 text-xs text-fg-2 hover:text-fg">
                  <EyeOff size={13} /> Hide
                </button>
              )
            }
          >
            {revealed ? (
              rev.notes ? (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg-2">{rev.notes}</p>
              ) : (
                <p className="text-[13px] text-fg-3">No notes yet. Click Edit to add a few lines.</p>
              )
            ) : (
              <button
                onClick={() => setRevealed(true)}
                className="flex h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-[13px] text-fg-3 hover:text-fg"
              >
                <Eye size={14} /> Show notes
              </button>
            )}
          </Block>

          {(rev.url || rev.item_id) && (
            <div className="space-y-2">
              {rev.url && (
                <a
                  href={rev.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-line px-4 py-2.5 text-[13px] hover:border-line-strong"
                >
                  <ExternalLink size={14} className="text-fg-3" />
                  <span className="min-w-0 flex-1 truncate">{rev.url}</span>
                  <span className="text-xs text-fg-3">{hostOf(rev.url)}</span>
                </a>
              )}
              {rev.item_id && !rev.item_deleted && (
                <button
                  onClick={() => openItem(rev.item_id!)}
                  className="flex w-full items-center gap-3 rounded-lg border border-line px-4 py-2.5 text-left text-[13px] hover:border-line-strong"
                >
                  <Ticket size={14} className="text-fg-3" />
                  <span className="font-mono text-xs text-fg-2">{rev.item_key}</span>
                  <span className="min-w-0 flex-1 truncate">{rev.item_title}</span>
                  <ArrowUpRight size={14} className="text-fg-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!editing && rev.session_count > 0 && <SessionList rev={rev} />}

      {!editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5">
          <div className="flex gap-2">
            <Button icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <IconButton tone="danger" title="Delete" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
          {rev.status === "active" ? (
            <Button variant="primary" icon={<CircleCheck size={15} />} onClick={() => setStatus.mutate("revised")}>
              Mark as revised
            </Button>
          ) : (
            <Button icon={<RotateCcw size={14} />} onClick={() => setStatus.mutate("active")}>
              Revise again
            </Button>
          )}
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this topic?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => remove.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">
          “{rev.title}” and its notes are deleted for good. To keep it, use “Mark as revised” instead.
        </p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Revise() {
  const { data: revisions = [], isLoading } = useRevisions();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>("active");
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const isDesktop = useIsDesktop();

  const selectedId = Number(params.get("id")) || null;
  const select = (id: number | null) =>
    setParams((p) => {
      if (id) p.set("id", String(id));
      else p.delete("id");
      return p;
    });
  const selected = revisions.find((r) => r.id === selectedId) ?? null;

  // Opening a link to a revised topic shows the right tab.
  useEffect(() => {
    if (selected && selected.status !== tab) setTab(selected.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !document.querySelector('[role="dialog"]'))
        select(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const q = filter.trim().toLowerCase();
  const visible = revisions.filter(
    (r) =>
      r.status === tab &&
      (!q || r.title.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q) || r.question.toLowerCase().includes(q)),
  );
  const count = (s: Tab) => revisions.filter((r) => r.status === s).length;
  const split = isDesktop && selected;

  const list = (
    <Card className="p-2">
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          select(null);
        }}
        className={clsx("flex", split ? "w-full [&>button]:flex-1" : "w-fit")}
        tabs={[
          { value: "active", label: `To revise · ${count("active")}` },
          { value: "revised", label: `Revised · ${count("revised")}` },
        ]}
      />
      <div className="mt-2 max-h-[calc(100vh-220px)] overflow-y-auto">
        {!isLoading && visible.length === 0 && (
          <div className="flex flex-col items-center px-3 py-12 text-center">
            <BookMarked size={26} className="text-fg-3" />
            <p className="mt-3 text-[13px] text-fg-2">
              {q ? "No topics match" : tab === "active" ? "Nothing to revise" : "Nothing revised yet"}
            </p>
            {tab === "active" && !q && (
              <p className="mt-1 max-w-xs text-xs text-fg-3">
                Add things you learned so they stay in front of you. Press <Kbd>R</Kbd> anywhere.
              </p>
            )}
          </div>
        )}
        {visible.map((r) => {
          const days = daysBetween(r.created_at);
          return (
            <button
              key={r.id}
              onClick={() => select(r.id === selectedId ? null : r.id)}
              className={clsx(
                "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                r.id === selectedId ? "border-line-strong bg-surface-3" : "border-transparent hover:bg-surface-2",
              )}
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-fg-2">
                {r.question ? <CircleHelp size={14} /> : <NotebookText size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{r.title}</span>
                <span className="mt-0.5 block truncate text-xs text-fg-3">{r.question || r.notes || (r.url ? hostOf(r.url) : SOURCE[r.source].label)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-[11px] text-fg-3">
                <span className="flex items-center gap-1.5">
                  {r.timer_started_at && <span className="size-1.5 rounded-full bg-accent" title="Revising now" />}
                  {r.priority !== "none" && <PriorityIcon priority={r.priority} size={12} />}
                  {r.status === "revised" && r.revised_at ? timeAgo(r.revised_at) : days === 0 ? "today" : `${days}d`}
                </span>
                {r.status === "active" && (
                  <span title="Last revised">{r.last_revised_at ? `revised ${timeAgo(r.last_revised_at)}` : "not revised"}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<BookMarked size={18} />}
        title="Revise"
        actions={
          <>
            <Input icon={<Search size={14} />} placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-52" />
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Add to Revise
            </Button>
          </>
        }
      />
      <p className="-mt-2 mb-5 px-4 text-[13px] text-fg-3 md:px-6 lg:px-8">
        Things you learned and want to remember. Read them again now and then; mark one as revised when you have it.
      </p>

      <div className={clsx("grid items-start gap-5 px-4 md:px-6 lg:px-8", split && "grid-cols-[360px_minmax(0,1fr)]")}>
        {list}
        {split && (
          <Card className="sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto p-6">
            <RevisionPanel key={selected.id} rev={selected} onClose={() => select(null)} />
          </Card>
        )}
      </div>

      {!isDesktop && selected && (
        <Drawer open onClose={() => select(null)}>
          <div className="overflow-y-auto p-5">
            <RevisionPanel key={selected.id} rev={selected} onClose={() => select(null)} />
          </div>
        </Drawer>
      )}

      <AddRevisionModal open={adding} onClose={() => setAdding(false)} onAdded={() => setTab("active")} />
    </div>
  );
}
