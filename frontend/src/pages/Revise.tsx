import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, BookMarked, Check, ChevronDown, Pencil, Play, Plus, RotateCcw, Search, Square, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useActions } from "../components/Layout";
import { AddRevisionModal, RevisionForm, type RevisionFields } from "../components/Revise";
import { Button, Card, Drawer, IconButton, Input, Kbd, Modal, PageHeader, Tabs, useToast } from "../components/ui";
import { api, type Priority, type Revision, type RevisionSession } from "../lib/api";
import { useNow, useRefreshItems, useRevisions } from "../lib/hooks";
import { PRIORITIES, PriorityIcon, fmtDateTime, fmtMinutes, hostOf, parseDuration, priorityMeta, timeAgo } from "../lib/meta";

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

const SOURCE: Record<Revision["source"], string> = { manual: "Added manually", ticket: "From ticket", radar: "From Radar" };

/** Small muted label above a block of content. */
function Label({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-xs font-medium text-fg-3">{children}</span>
      {action}
    </div>
  );
}

/** One "key value" pair in the properties line. */
function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-fg-3">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------- detail panel

function RevisionPanel({ rev, onClose }: { rev: Revision; onClose: () => void }) {
  const { openItem } = useActions();
  const refresh = useRefreshItems();
  const toast = useToast();
  const now = useNow();
  const toForm = (r: Revision): RevisionFields => ({
    title: r.title,
    question: r.question,
    notes: r.notes,
    url: r.url ?? "",
    priority: r.priority,
  });
  const [form, setForm] = useState<RevisionFields>(toForm(rev));
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(!rev.question);
  const [showHistory, setShowHistory] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [spent, setSpent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const minutes = parseDuration(spent);

  useEffect(() => {
    setForm(toForm(rev));
    setRevealed(!rev.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev.id, rev.question, rev.notes, rev.title, rev.url, rev.priority]);

  const sessions = useQuery({
    queryKey: ["revisions", rev.id, "sessions", rev.session_count],
    queryFn: () => api.get<RevisionSession[]>(`/revisions/${rev.id}/sessions`),
    enabled: showHistory && rev.session_count > 0,
  });

  const call = useMutation({
    mutationFn: ({ method, path, body }: { method: "post" | "patch" | "del"; path: string; body?: unknown; done?: string; close?: boolean }) =>
      method === "post" ? api.post(path, body) : method === "patch" ? api.patch(path, body) : api.del(path),
    onSuccess: (_d, v) => {
      refresh();
      if (v.done) toast(v.done);
      if (v.close) onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const secs = rev.timer_started_at ? Math.max(0, Math.floor((now - new Date(rev.timer_started_at).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const active = rev.status === "active";

  return (
    <div className="flex flex-col">
      {/* Title row */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{rev.title}</h2>
          <p className="mt-1 text-[13px] text-fg-3">
            {SOURCE[rev.source]} · {timeAgo(rev.created_at)}
            {rev.status === "revised" && rev.revised_at && <> · revised {fmtDateTime(rev.revised_at)}</>}
          </p>
        </div>
        <div className="-mr-2 flex shrink-0 items-center">
          {!editing && (
            <IconButton title="Edit" onClick={() => setEditing(true)}>
              <Pencil size={15} />
            </IconButton>
          )}
          <IconButton title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} />
          </IconButton>
          <IconButton title="Close (Esc)" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
      </div>

      {/* Properties line */}
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line py-3">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-fg-3">Priority</span>
          <span className="relative flex items-center gap-1.5 font-medium">
            <PriorityIcon priority={rev.priority} size={13} />
            {priorityMeta(rev.priority).label}
            <ChevronDown size={12} className="text-fg-3" />
            <select
              aria-label="Priority"
              value={rev.priority}
              onChange={(e) => call.mutate({ method: "patch", path: `/revisions/${rev.id}`, body: { priority: e.target.value as Priority } })}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </span>
        </label>
        <Prop label="Last revised">{rev.last_revised_at ? timeAgo(rev.last_revised_at) : "Never"}</Prop>
        <Prop label="Time spent">{fmtMinutes(rev.total_minutes)}</Prop>
        <button
          onClick={() => rev.session_count && setShowHistory(!showHistory)}
          className={clsx("flex items-center gap-2 text-[13px]", rev.session_count ? "hover:text-fg" : "cursor-default")}
        >
          <span className="text-fg-3">Sessions</span>
          <span className="font-medium tabular-nums">{rev.session_count}</span>
          {rev.session_count > 0 && <ChevronDown size={12} className={clsx("text-fg-3 transition-transform", showHistory && "rotate-180")} />}
        </button>
      </div>

      {showHistory && rev.session_count > 0 && (
        <div className="border-b border-line py-2">
          {sessions.data?.map((s) => (
            <div key={s.id} className="group flex items-center gap-3 py-1.5 text-[13px]">
              <span className="w-16 font-medium tabular-nums">{fmtMinutes(s.minutes)}</span>
              <span className="flex-1 text-fg-3">{fmtDateTime(s.created_at)}</span>
              <button
                title="Delete session"
                onClick={() => call.mutate({ method: "del", path: `/revision-sessions/${s.id}` })}
                className="text-fg-3 opacity-0 hover:text-critical group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {editing ? (
        <div className="mt-6 space-y-4">
          <RevisionForm value={form} onChange={setForm} />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setForm(toForm(rev));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!form.title.trim()}
              onClick={() => {
                call.mutate({ method: "patch", path: `/revisions/${rev.id}`, body: form, done: "Saved" });
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {rev.question && (
            <section>
              <Label>Question</Label>
              <p className="text-[16px] leading-relaxed">{rev.question}</p>
            </section>
          )}

          <section>
            <Label
              action={
                rev.question &&
                revealed && (
                  <button onClick={() => setRevealed(false)} className="text-xs text-fg-3 hover:text-fg">
                    Hide
                  </button>
                )
              }
            >
              Notes
            </Label>
            {!revealed ? (
              <Button size="sm" onClick={() => setRevealed(true)}>
                Show notes
              </Button>
            ) : rev.notes ? (
              <p className="whitespace-pre-wrap text-[14px] leading-7 text-fg-2">{rev.notes}</p>
            ) : (
              <button onClick={() => setEditing(true)} className="text-[13px] text-fg-3 hover:text-fg">
                Add notes
              </button>
            )}
          </section>

          {(rev.url || (rev.item_id && !rev.item_deleted)) && (
            <section>
              <Label>References</Label>
              <div className="space-y-1.5 text-[13px]">
                {rev.url && (
                  <a href={rev.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-fg-2 hover:text-fg">
                    <span className="truncate">{hostOf(rev.url) || rev.url}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-fg-3" />
                  </a>
                )}
                {rev.item_id && !rev.item_deleted && (
                  <button onClick={() => openItem(rev.item_id!)} className="flex items-center gap-1.5 text-fg-2 hover:text-fg">
                    <span className="font-mono text-xs text-fg-3">{rev.item_key}</span>
                    <span className="truncate">{rev.item_title}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-fg-3" />
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Action bar */}
      {!editing && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {active ? (
            <div className="flex items-center gap-2">
              {rev.timer_started_at ? (
                <Button
                  icon={<Square size={10} fill="currentColor" />}
                  onClick={() => call.mutate({ method: "post", path: `/revisions/${rev.id}/timer/stop`, done: "Session logged" })}
                >
                  <span className="font-mono tabular-nums">{clock}</span>
                  <span className="text-fg-3">Stop</span>
                </Button>
              ) : (
                <Button icon={<Play size={12} />} onClick={() => call.mutate({ method: "post", path: `/revisions/${rev.id}/timer/start` })}>
                  Start session
                </Button>
              )}
              {!rev.timer_started_at && (
                <Button variant="ghost" onClick={() => setLogOpen(true)}>
                  Log time
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}
          {active ? (
            <Button
              variant="primary"
              icon={<Check size={15} />}
              onClick={() => call.mutate({ method: "patch", path: `/revisions/${rev.id}`, body: { status: "revised" }, done: `Revised “${rev.title}”`, close: true })}
            >
              Mark as revised
            </Button>
          ) : (
            <Button
              icon={<RotateCcw size={14} />}
              onClick={() => call.mutate({ method: "patch", path: `/revisions/${rev.id}`, body: { status: "active" }, done: "Back on your list", close: true })}
            >
              Revise again
            </Button>
          )}
        </div>
      )}

      <Modal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="Log time"
        width="max-w-sm"
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
              Log
            </Button>
          </>
        }
      >
        <Input autoFocus value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="20m, 1h 15m" />
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete topic?"
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => call.mutate({ method: "del", path: `/revisions/${rev.id}`, done: "Deleted", close: true })}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">This removes “{rev.title}”, its notes and its sessions.</p>
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

  // A link to a revised topic opens the right tab.
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
    <Card className="overflow-hidden">
      <div className="border-b border-line p-2">
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
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
        {!isLoading && visible.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-[13px] text-fg-2">{q ? "No topics match" : tab === "active" ? "Nothing to revise" : "Nothing revised yet"}</p>
            {tab === "active" && !q && (
              <p className="mt-1 text-xs text-fg-3">
                Press <Kbd>R</Kbd> to add something you want to remember.
              </p>
            )}
          </div>
        )}
        <div className="divide-y divide-line">
          {visible.map((r) => (
            <button
              key={r.id}
              onClick={() => select(r.id === selectedId ? null : r.id)}
              className={clsx(
                "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                r.id === selectedId ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              {r.id === selectedId && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px]">{r.title}</span>
                  {r.timer_started_at && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Session running" />}
                </span>
                <span className="mt-0.5 block text-xs text-fg-3">
                  {r.status === "revised" && r.revised_at
                    ? `Revised ${timeAgo(r.revised_at)}`
                    : r.last_revised_at
                      ? `Last revised ${timeAgo(r.last_revised_at)}`
                      : "Not revised yet"}
                  {r.total_minutes > 0 && ` · ${fmtMinutes(r.total_minutes)}`}
                </span>
              </span>
              {r.priority !== "none" && <PriorityIcon priority={r.priority} size={14} />}
            </button>
          ))}
        </div>
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
              Add topic
            </Button>
          </>
        }
      />

      <div className={clsx("grid items-start gap-5 px-4 md:px-6 lg:px-8", split && "grid-cols-[340px_minmax(0,1fr)]")}>
        {list}
        {split && (
          <Card className="sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto px-8 py-7">
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
