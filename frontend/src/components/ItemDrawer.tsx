import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BookMarked,
  BookmarkPlus,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  History as HistoryIcon,
  Link2,
  MessageSquare,
  Play,
  Plus,
  Repeat,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Comment, type HistoryEntry, type Item, type Worklog } from "../lib/api";
import { useProjects, useRefreshItems, useTimer, useUpdateItem } from "../lib/hooks";
import {
  PRIORITIES,
  RECURRENCES,
  STATUSES,
  TYPES,
  PriorityIcon,
  StatusIcon,
  TypeIcon,
  daysBetween,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  hostOf,
  parseDuration,
  pendingDays,
  timeAgo,
} from "../lib/meta";
import { Thumb } from "./ItemCard";
import { ObsidianIcon } from "./ObsidianIcon";
import { Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Select, Tabs, Textarea, useToast } from "./ui";
import { ProjectIcon } from "../lib/projectIcons";

// ---------------------------------------------------------------- time tracking (Jira style)

export function TimeTracking({ item, onLog }: { item: Item; onLog: () => void }) {
  const logged = item.logged_minutes;
  const est = item.estimate_minutes ?? 0;
  const remaining = Math.max(0, est - logged);
  const over = est > 0 && logged > est;
  const total = Math.max(est, logged) || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={clsx("h-full rounded-full", over ? "bg-warning" : "bg-task")}
          style={{ width: `${(Math.min(logged, est || logged) / total) * 100}%` }}
        />
        {over && <div className="ml-[2px] h-full rounded-full bg-critical" style={{ width: `${((logged - est) / total) * 100}%` }} />}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-fg-2">
        <span>{fmtMinutes(logged)} logged</span>
        <span>{est ? (over ? `${fmtMinutes(logged - est)} over` : `${fmtMinutes(remaining)} remaining`) : "No estimate"}</span>
      </div>
      <Button size="sm" className="mt-2.5 w-full" icon={<Clock size={13} />} onClick={onLog}>
        Log work
      </Button>
    </div>
  );
}

function localInputValue(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LogWorkModal({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const [spent, setSpent] = useState("");
  const [started, setStarted] = useState(localInputValue());
  const [comment, setComment] = useState("");
  const refresh = useRefreshItems();
  const toast = useToast();
  const minutes = parseDuration(spent);

  useEffect(() => {
    if (open) {
      setSpent("");
      setComment("");
      setStarted(localInputValue());
    }
  }, [open]);

  const save = useMutation({
    mutationFn: () => api.post(`/items/${item.id}/worklogs`, { time_spent: spent, started_at: started, comment }),
    onSuccess: () => {
      refresh();
      toast(`Logged ${fmtMinutes(minutes ?? 0)} on ${item.key}`);
      onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const after = item.logged_minutes + (minutes && !Number.isNaN(minutes) ? minutes : 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Log work · ${item.key}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!minutes || Number.isNaN(minutes) || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TimeTracking item={{ ...item, logged_minutes: after }} onLog={() => {}} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time spent" hint="Use 2w 4d 6h 45m (1d = 8h)">
            <Input autoFocus value={spent} onChange={(e) => setSpent(e.target.value)} placeholder="1h 30m" />
          </Field>
          <Field label="Date started">
            <Input type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} />
          </Field>
        </div>
        <Field label="Work description">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you do?" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- property row

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-center gap-2">
      <span className="text-[13px] text-fg-3">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- activity

function Activity({ item }: { item: Item }) {
  const [tab, setTab] = useState<"comments" | "worklog" | "history">("comments");
  const [body, setBody] = useState("");
  const refresh = useRefreshItems();
  const toast = useToast();
  const comments = useQuery({
    queryKey: ["comments", item.id],
    queryFn: () => api.get<Comment[]>(`/items/${item.id}/comments`),
  });
  const worklogs = useQuery({
    queryKey: ["worklogs", item.id],
    queryFn: () => api.get<Worklog[]>(`/items/${item.id}/worklogs`),
  });
  const history = useQuery({
    queryKey: ["history", item.id],
    queryFn: () => api.get<HistoryEntry[]>(`/items/${item.id}/history`),
    enabled: tab === "history",
  });
  const addComment = useMutation({
    mutationFn: () => api.post(`/items/${item.id}/comments`, { body }),
    onSuccess: () => {
      setBody("");
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const del = useMutation({ mutationFn: (path: string) => api.del(path), onSuccess: refresh });

  const describe = (h: HistoryEntry) => {
    const label: Record<string, string> = {
      status: "changed status",
      priority: "changed priority",
      title: "renamed",
      due_date: "changed due date",
      type: "changed type",
      project_id: "moved project",
      estimate_minutes: "changed estimate",
      labels: "changed labels",
      url: "changed link",
      recurrence: "changed repeat",
    };
    if (h.field === "created") return <>created the item</>;
    if (h.field === "from_inbox") return <>created from Radar topic “{h.new_value}”</>;
    if (h.field === "restored") return <>restored from Trash</>;
    if (h.field === "revise") return <>added to Revise</>;
    if (h.field === "description") return <>edited the description</>;
    if (h.field === "worklog") return <>logged {h.new_value}</>;
    if (h.field === "obsidian") return <>exported to Obsidian · <span className="font-mono text-xs">{h.new_value}</span></>;
    const pretty = (v: string | null) =>
      h.field === "status"
        ? STATUSES.find((s) => s.value === v)?.label
        : h.field === "estimate_minutes"
          ? fmtMinutes(Number(v))
          : v || "none";
    return (
      <>
        {label[h.field] ?? `changed ${h.field}`} <span className="text-fg-3">from</span> {pretty(h.old_value)}{" "}
        <span className="text-fg-3">to</span> {pretty(h.new_value)}
      </>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Activity</h3>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "comments", label: `Comments ${comments.data?.length ? `· ${comments.data.length}` : ""}` },
            { value: "worklog", label: `Work log ${worklogs.data?.length ? `· ${worklogs.data.length}` : ""}` },
            { value: "history", label: "History" },
          ]}
        />
      </div>

      {tab === "comments" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface p-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) addComment.mutate();
              }}
              placeholder="Add a comment or a learning note..."
              rows={1}
              className="field-sizing-content min-h-9 w-full resize-none bg-transparent px-1 py-1 text-[13px] outline-none placeholder:text-fg-3"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" disabled={!body.trim()} onClick={() => addComment.mutate()}>
                Comment
              </Button>
            </div>
          </div>
          {comments.data?.map((c) => (
            <div key={c.id} className="group rounded-lg border border-line bg-surface px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between text-xs text-fg-3">
                <span>{timeAgo(c.created_at)}</span>
                <button className="opacity-0 hover:text-critical group-hover:opacity-100" onClick={() => del.mutate(`/comments/${c.id}`)}>
                  <Trash2 size={13} />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "worklog" && (
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
          {!worklogs.data?.length && <p className="p-4 text-center text-[13px] text-fg-3">No work logged yet.</p>}
          {worklogs.data?.map((w) => (
            <div key={w.id} className="group flex items-start gap-3 px-3 py-2.5">
              <Clock size={14} className="mt-0.5 text-fg-3" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">{fmtMinutes(w.minutes)}</span>
                  <span className="text-fg-3">· {fmtDateTime(w.started_at)}</span>
                </div>
                {w.comment && <p className="mt-0.5 text-[13px] text-fg-2">{w.comment}</p>}
              </div>
              <button className="text-fg-3 opacity-0 hover:text-critical group-hover:opacity-100" onClick={() => del.mutate(`/worklogs/${w.id}`)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "history" && (
        <ol className="relative ml-2 space-y-3 border-l border-line pl-5">
          {history.data?.map((h) => (
            <li key={h.id} className="relative text-[13px] text-fg-2">
              <span className="absolute -left-[25px] top-1.5 size-2 rounded-full border border-line-strong bg-surface" />
              {describe(h)} <span className="text-xs text-fg-3">· {timeAgo(h.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- drawer

export function ItemDrawer({ itemId, onClose }: { itemId: number | null; onClose: () => void }) {
  const { data: item, isError } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => api.get<Item>(`/items/${itemId}`),
    enabled: !!itemId,
  });
  const { data: projects = [] } = useProjects();
  const { data: timer } = useTimer();
  const update = useUpdateItem();
  const refresh = useRefreshItems();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [labels, setLabels] = useState("");
  const [estimate, setEstimate] = useState("");
  const [newSub, setNewSub] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDesc(item.description);
      setUrl(item.url ?? "");
      setLabels(item.labels.join(", "));
      setEstimate(item.estimate_minutes ? fmtMinutes(item.estimate_minutes) : "");
    }
  }, [item]);

  useEffect(() => {
    if (isError) onClose();
  }, [isError, onClose]);

  const exportNote = useMutation({
    mutationFn: () => api.post<Item>(`/items/${itemId}/export`),
    onSuccess: (i) => {
      refresh();
      toast(`Saved to Obsidian: ${i.obsidian_path}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const navigate = useNavigate();
  const addRevise = useMutation({
    mutationFn: () => api.post<{ id: number }>(`/items/${itemId}/revise`),
    onSuccess: () => {
      refresh();
      toast("Added to Revise");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const timerStart = useMutation({ mutationFn: () => api.post(`/items/${itemId}/timer/start`), onSuccess: refresh });
  const timerStop = useMutation({ mutationFn: () => api.post(`/timer/stop`), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: () => api.del(`/items/${itemId}`),
    onSuccess: () => {
      toast(`${item?.key} moved to Trash`);
      onClose();
      refresh();
    },
  });
  const subAdd = useMutation({
    mutationFn: () => api.post(`/items/${itemId}/subtasks`, { title: newSub }),
    onSuccess: () => {
      setNewSub("");
      refresh();
    },
  });
  const subPatch = useMutation({
    mutationFn: ({ id, ...p }: { id: number; done?: boolean }) => api.patch(`/subtasks/${id}`, p),
    onSuccess: refresh,
  });
  const subDel = useMutation({ mutationFn: (id: number) => api.del(`/subtasks/${id}`), onSuccess: refresh });

  if (!itemId) return null;
  const patch = (p: Partial<Item>) => item && update.mutate({ id: item.id, ...p });
  const timing = timer?.item_id === itemId;
  const pending = item ? pendingDays(item) : null;

  return (
    <Drawer open onClose={onClose}>
      {!item ? (
        <div className="p-6 text-fg-3">Loading...</div>
      ) : (
        <>
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
            <TypeIcon type={item.type} size={15} />
            <span className="font-mono text-[13px] text-fg-2">{item.key}</span>
            {item.recurrence !== "none" && (
              <span className="flex items-center gap-1 text-xs text-fg-3">
                <Repeat size={12} /> {RECURRENCES.find((r) => r.value === item.recurrence)?.label}
              </span>
            )}
            <div className="flex-1" />
            {item.url && (
              <Button
                size="sm"
                icon={<ObsidianIcon size={13} />}
                onClick={() => exportNote.mutate()}
                disabled={exportNote.isPending}
                title={item.obsidian_path ?? "Write this link as a note in your vault"}
              >
                <span className="hidden sm:inline">{item.obsidian_path ? "Re-export" : "Export to Obsidian"}</span>
              </Button>
            )}
            {item.revision_id ? (
              <Button size="sm" icon={<BookMarked size={13} />} onClick={() => navigate(`/revise?id=${item.revision_id}`)} title="Open in Revise">
                <span className="hidden sm:inline">In Revise</span>
              </Button>
            ) : (
              <Button size="sm" icon={<BookmarkPlus size={13} />} onClick={() => addRevise.mutate()} disabled={addRevise.isPending} title="Keep this on your Revise list">
                <span className="hidden sm:inline">Revise</span>
              </Button>
            )}
            {timing ? (
              <Button size="sm" icon={<Square size={11} fill="currentColor" />} onClick={() => timerStop.mutate()}>
                <span className="hidden sm:inline">Stop timer</span>
              </Button>
            ) : (
              <Button size="sm" icon={<Play size={12} />} onClick={() => timerStart.mutate()}>
                <span className="hidden sm:inline">Start timer</span>
              </Button>
            )}
            <IconButton title="Move to Trash" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </IconButton>
            <IconButton title="Close (Esc)" onClick={onClose}>
              <X size={17} />
            </IconButton>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            <div className="min-w-0 flex-1 space-y-6 p-5 lg:overflow-y-auto lg:p-6">
              <textarea
                value={title}
                rows={1}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== item.title && patch({ title })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLElement).blur())}
                className="field-sizing-content w-full resize-none bg-transparent text-xl font-semibold tracking-tight outline-none"
              />

              {(item.url || item.type === "learning") && (
                <div className="space-y-3">
                  <Input
                    icon={<Link2 size={15} />}
                    value={url}
                    placeholder="Paste a link"
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={() => url !== (item.url ?? "") && patch({ url })}
                  />
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 overflow-hidden rounded-lg border border-line bg-surface hover:border-line-strong"
                    >
                      <Thumb url={item.url} className="aspect-video w-40 shrink-0" />
                      <div className="min-w-0 py-2 pr-3">
                        <p className="truncate text-[13px] font-medium">{item.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-3">
                          {hostOf(item.url)} <ExternalLink size={11} />
                        </p>
                        {item.obsidian_path && (
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-accent">
                            <ObsidianIcon size={11} /> {item.obsidian_path}
                          </p>
                        )}
                      </div>
                    </a>
                  )}
                </div>
              )}

              <Textarea
                value={desc}
                placeholder="Add a description..."
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => desc !== item.description && patch({ description: desc })}
                className="field-sizing-content min-h-16 border-transparent bg-transparent px-0 hover:border-line focus:px-3"
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">Checklist</h3>
                  {item.subtask_count > 0 && (
                    <span className="text-xs text-fg-3">
                      {item.subtask_done}/{item.subtask_count}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {item.subtasks?.map((s) => (
                    <div key={s.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                      <Checkbox
                        checked={!!s.done}
                        onChange={(v) => subPatch.mutate({ id: s.id, done: v })}
                        label={<span className={clsx("text-[13px]", s.done && "text-fg-3 line-through")}>{s.title}</span>}
                        className="flex-1"
                      />
                      <button className="text-fg-3 opacity-0 hover:text-critical group-hover:opacity-100" onClick={() => subDel.mutate(s.id)}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <form
                    className="flex items-center gap-2 px-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newSub.trim()) subAdd.mutate();
                    }}
                  >
                    <Plus size={14} className="text-fg-3" />
                    <input
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      placeholder="Add an item"
                      className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
                    />
                  </form>
                </div>
              </div>

              <Activity item={item} />
            </div>

            <aside className="shrink-0 space-y-5 border-line p-5 lg:w-[300px] lg:overflow-y-auto lg:border-l">
              <div className="space-y-2.5">
                <Prop label="Status">
                  <Select icon={<StatusIcon status={item.status} />} value={item.status} onChange={(e) => patch({ status: e.target.value as Item["status"] })}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Prop>
                <Prop label="Priority">
                  <Select icon={<PriorityIcon priority={item.priority} />} value={item.priority} onChange={(e) => patch({ priority: e.target.value as Item["priority"] })}>
                    {PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Prop>
                <Prop label="Type">
                  <Select icon={<TypeIcon type={item.type} />} value={item.type} onChange={(e) => patch({ type: e.target.value as Item["type"] })}>
                    {TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Prop>
                <Prop label="Project">
                  <Select
                    icon={<ProjectIcon icon={item.project_icon} size={14} />}
                    value={item.project_id}
                    onChange={(e) => patch({ project_id: Number(e.target.value) })}
                  >
                    {projects.filter((p) => !p.archived || p.id === item.project_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Prop>
                <Prop label="Due date">
                  <Input type="date" value={item.due_date ?? ""} onChange={(e) => patch({ due_date: e.target.value || null })} />
                </Prop>
                <Prop label="Repeat">
                  <Select icon={<Repeat size={13} />} value={item.recurrence} onChange={(e) => patch({ recurrence: e.target.value as Item["recurrence"] })}>
                    {RECURRENCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </Prop>
                <Prop label="Labels">
                  <Input
                    value={labels}
                    placeholder="Add labels"
                    onChange={(e) => setLabels(e.target.value)}
                    onBlur={() => {
                      const next = labels.split(",").map((l) => l.trim()).filter(Boolean);
                      if (next.join(",") !== item.labels.join(",")) patch({ labels: next });
                    }}
                  />
                </Prop>
              </div>

              <div className="rounded-lg border border-line bg-surface p-4">
                <h4 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                  <Clock size={14} /> Time tracking
                </h4>
                <TimeTracking item={item} onLog={() => setLogOpen(true)} />
                <div className="mt-3">
                  <Field label="Original estimate">
                    <Input
                      value={estimate}
                      placeholder="e.g. 4h"
                      onChange={(e) => setEstimate(e.target.value)}
                      onBlur={() => {
                        const m = parseDuration(estimate);
                        if (m === null && item.estimate_minutes !== null) patch({ estimate_minutes: null });
                        else if (m !== null && !Number.isNaN(m) && m !== item.estimate_minutes) patch({ estimate_minutes: m });
                      }}
                    />
                  </Field>
                </div>
              </div>

              <div className="space-y-2 text-[13px]">
                {pending !== null && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-3"><CalendarClock size={14} /> Pending for</span>
                    <span className={clsx("font-medium", pending >= 14 ? "text-critical" : pending >= 7 ? "text-warning" : "")}>
                      {pending} {pending === 1 ? "day" : "days"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-fg-3"><HistoryIcon size={14} /> In this status</span>
                  <span>{daysBetween(item.status_changed_at)} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-fg-3"><MessageSquare size={14} /> Created</span>
                  <span>{fmtDate(item.created_at, { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                {item.completed_at && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-3"><Check size={14} /> Completed</span>
                    <span>{fmtDate(item.completed_at, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <LogWorkModal item={item} open={logOpen} onClose={() => setLogOpen(false)} />
          <Modal
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete ${item.key}?`}
            footer={
              <>
                <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => remove.mutate()}>
                  Move to Trash
                </Button>
              </>
            }
          >
            <p className="text-[13px] text-fg-2">
              The item goes to Trash with its checklist, comments and work log. You can restore it for 30 days.
              After that, Smriti deletes it for good.
              {item.obsidian_path && " The note in Obsidian stays in your vault."}
            </p>
          </Modal>
        </>
      )}
    </Drawer>
  );
}
