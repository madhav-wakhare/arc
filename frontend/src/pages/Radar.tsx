import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, Ban, BookmarkPlus, Split, ExternalLink, Link2, Plus, Radar as RadarIcon, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AddTopicModal, defaultProject } from "../components/Jots";
import { useActions } from "../components/Layout";
import {
  Button,
  Card,
  Drawer,
  Field,
  IconButton,
  Input,
  Kbd,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from "../components/ui";
import { api, type Item, type ItemType, type Jot, type JotStatus, type Priority, type Status } from "../lib/api";
import { useJots, useProjects, useRefreshItems } from "../lib/hooks";
import { PRIORITIES, STATUSES, TYPES, TypeIcon, daysBetween, fmtDate, fmtDateTime, hostOf, splitTopic } from "../lib/meta";

const TAB_LABEL: Record<JotStatus, string> = { open: "To review", converted: "Ticketed", archived: "Dismissed" };

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

function dayLabel(iso: string) {
  const d = daysBetween(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return fmtDate(iso, d < 7 ? { weekday: "long" } : { month: "short", day: "numeric", year: "numeric" });
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-fg-3">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- detail panel

function TopicPanel({ jot, onGone, onClose }: { jot: Jot; onGone: () => void; onClose?: () => void }) {
  const { data: projects = [] } = useProjects();
  const active = projects.filter((p) => !p.archived);
  const { openItem } = useActions();
  const refresh = useRefreshItems();
  const toast = useToast();

  const [body, setBody] = useState(jot.body);
  const [details, setDetails] = useState(jot.details);
  const [url, setUrl] = useState(jot.url ?? "");
  const [type, setType] = useState<ItemType>("learning");
  const [projectId, setProjectId] = useState(0);
  const [status, setStatus] = useState<Status>("backlog");
  const [priority, setPriority] = useState<Priority>("none");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reset = () => {
    setBody(jot.body);
    setDetails(jot.details);
    setUrl(jot.url ?? "");
  };
  useEffect(reset, [jot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setProjectId(defaultProject(projects, type)?.id ?? 0), [type, projects]);

  const dirty = body !== jot.body || details !== jot.details || url !== (jot.url ?? "");
  const ticketLive = jot.status === "converted" && jot.item_id && !jot.item_deleted;

  const save = useMutation({
    mutationFn: () => api.patch<Jot>(`/jots/${jot.id}`, { body, details, url }),
    onSuccess: () => {
      refresh();
      toast("Topic saved");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const setJotStatus = useMutation({
    mutationFn: (s: "open" | "archived") => api.patch(`/jots/${jot.id}`, { status: s }),
    onSuccess: (_d, s) => {
      refresh();
      toast(s === "archived" ? "Topic dismissed" : "Topic moved back to review");
      onGone();
    },
  });
  const parts = splitTopic(body);
  const split = useMutation({
    mutationFn: async () => {
      if (dirty) await api.patch(`/jots/${jot.id}`, { body, details, url });
      return api.post<Jot[]>(`/jots/${jot.id}/split`);
    },
    onSuccess: (made) => {
      refresh();
      toast(`Split into ${made.length} topics`);
      onGone();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const toRevise = useMutation({
    mutationFn: async () => {
      if (dirty) await api.patch(`/jots/${jot.id}`, { body, details, url });
      return api.post(`/jots/${jot.id}/revise`);
    },
    onSuccess: () => {
      refresh();
      toast(`Moved “${body}” to Revisit`);
      onGone();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/jots/${jot.id}`),
    onSuccess: () => {
      refresh();
      toast("Topic deleted");
      setConfirmDelete(false);
      onGone();
    },
  });
  const createTicket = useMutation({
    mutationFn: async () => {
      if (dirty) await api.patch(`/jots/${jot.id}`, { body, details, url });
      return api.post<{ item: Item }>(`/jots/${jot.id}/convert`, { project_id: projectId, type, status, priority });
    },
    onSuccess: ({ item }) => {
      refresh();
      toast(`${item.key} created`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <div className="anim-panel space-y-7">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{jot.body}</h2>
          <p className="mt-0.5 text-[13px] text-fg-3">Added {fmtDateTime(jot.created_at)}</p>
        </div>
        {onClose && (
          <IconButton title="Close (Esc)" onClick={onClose} className="-mr-2 -mt-1">
            <X size={17} />
          </IconButton>
        )}
      </div>
      <section className="space-y-4">
        <Field label="Topic">
          <Input value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label="Notes" hint={jot.tags.length ? `Labels from #tags: ${jot.tags.join(", ")}` : "Use #tags to add labels."}>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Where you heard about it and why it matters"
            className="min-h-24"
          />
        </Field>
        <Field label="Link">
          <div className="flex gap-2">
            <Input icon={<Link2 size={15} />} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="flex-1" />
            {jot.url && (
              <a href={jot.url} target="_blank" rel="noreferrer" title="Open link">
                <IconButton tabIndex={-1} className="size-9 border border-line">
                  <ExternalLink size={15} />
                </IconButton>
              </a>
            )}
          </div>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {jot.status === "open" && (
              <Button icon={<Ban size={14} />} onClick={() => setJotStatus.mutate("archived")}>
                Dismiss
              </Button>
            )}
            {jot.status !== "converted" && parts.length > 1 && (
              <Button icon={<Split size={14} />} onClick={() => split.mutate()} disabled={split.isPending} title={parts.join(" · ")}>
                Split into {parts.length}
              </Button>
            )}
            {jot.status !== "converted" && (
              <Button icon={<BookmarkPlus size={14} />} onClick={() => toRevise.mutate()} title="Keep it on your Revisit list">
                Move to Revisit
              </Button>
            )}
            {jot.status === "archived" && (
              <Button icon={<RotateCcw size={14} />} onClick={() => setJotStatus.mutate("open")}>
                Move to review
              </Button>
            )}
            <IconButton tone="danger" title="Delete topic" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
          <div className="flex gap-2">
            <Button onClick={reset} disabled={!dirty}>
              Reset
            </Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={!dirty || !body.trim() || save.isPending}>
              Save
            </Button>
          </div>
        </div>
      </section>

      <div className="border-t border-line" />

      {ticketLive ? (
        <Section title="Ticket" description={`Created ${fmtDateTime(jot.converted_at!)}`}>
          <button
            onClick={() => openItem(jot.item_id!)}
            className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-4 py-3 text-left hover:border-line-strong"
          >
            {jot.item_type && <TypeIcon type={jot.item_type} size={16} />}
            <span className="font-mono text-[13px] text-fg-2">{jot.item_key}</span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{jot.item_title}</span>
            <span className="flex items-center gap-1 text-[13px] text-fg-2">
              Open <ArrowUpRight size={14} />
            </span>
          </button>
        </Section>
      ) : (
        <Section
          title="Create ticket"
          description={
            jot.status === "converted"
              ? `Ticket ${jot.item_key ?? ""} was deleted. You can create a new one.`
              : "Adds this topic to the board. The link and labels come with it."
          }
        >
          <Tabs
            value={type}
            onChange={setType}
            tabs={(["learning", "task"] as ItemType[]).map((v) => TYPES.find((t) => t.value === v)!).map((t) => ({
              value: t.value,
              label: (
                <span className="flex items-center gap-1.5">
                  <t.icon size={13} className={t.tone} /> {t.label}
                </span>
              ),
            }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Project">
              <Select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.filter((s) => s.value !== "done").map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              disabled={!projectId || !body.trim() || createTicket.isPending}
              onClick={() => createTicket.mutate()}
            >
              Create {type === "learning" ? "learning" : "task"} ticket
            </Button>
          </div>
        </Section>
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
          The topic is deleted for good.{ticketLive ? ` Ticket ${jot.item_key} stays on the board.` : ""}
        </p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function Radar() {
  const { data: jots = [], isLoading } = useJots();
  const [tab, setTab] = useState<JotStatus>("open");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const isDesktop = useIsDesktop();

  const q = filter.trim().toLowerCase();
  const visible = jots.filter(
    (j) =>
      j.status === tab &&
      (!q || j.body.toLowerCase().includes(q) || j.details.toLowerCase().includes(q) || j.tags.some((t) => t.includes(q))),
  );
  const selected = jots.find((j) => j.id === selectedId) ?? null;

  // Nothing opens by default. Changing tab closes the open topic.
  useEffect(() => setSelectedId(null), [tab]);

  // Esc closes the open topic, unless you are typing in a field.
  useEffect(() => {
    if (!selectedId) return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !document.querySelector('[role="dialog"]'))
        setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId]);

  const groups: [string, Jot[]][] = [];
  for (const j of visible) {
    const day = (tab === "converted" && j.converted_at ? j.converted_at : j.created_at).slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last[0] === day) last[1].push(j);
    else groups.push([day, [j]]);
  }
  const count = (s: JotStatus) => jots.filter((j) => j.status === s).length;

  const list = (
    <Card className="p-2">
      <Tabs
        value={tab}
        onChange={setTab}
        className={clsx("flex", isDesktop && selected ? "w-full [&>button]:flex-1" : "w-fit")}
        tabs={(["open", "converted", "archived"] as JotStatus[]).map((s) => ({
          value: s,
          label: `${TAB_LABEL[s]} · ${count(s)}`,
        }))}
      />
      <div className="mt-2 max-h-[calc(100vh-220px)] overflow-y-auto">
        {!isLoading && visible.length === 0 && (
          <div className="px-3 py-10 text-center">
            <p className="text-[13px] text-fg-2">
              {q ? "No topics match" : tab === "open" ? "Nothing to review" : `No ${TAB_LABEL[tab].toLowerCase()} topics`}
            </p>
            {tab === "open" && !q && (
              <p className="mt-1 text-xs text-fg-3">
                Press <Kbd>N</Kbd> when you hear about something new.
              </p>
            )}
          </div>
        )}
        {groups.map(([day, items]) => (
          <div key={day} className="mt-2 first:mt-1">
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-fg-3">{dayLabel(day)}</p>
            {items.map((j) => (
              <button
                key={j.id}
                onClick={() => setSelectedId(j.id === selectedId ? null : j.id)}
                className={clsx(
                  "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                  j.id === selectedId ? "border-line-strong bg-surface-3" : "border-transparent hover:bg-surface-2",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px]">{j.body}</span>
                  {j.status === "converted" && j.item_key && (
                    <span className={clsx("font-mono text-[11px]", j.item_deleted ? "text-fg-3 line-through" : "text-fg-2")}>
                      {j.item_key}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 truncate text-xs text-fg-3">
                  {j.details ? <span className="truncate">{j.details}</span> : j.url ? <span>{hostOf(j.url)}</span> : null}
                  {j.tags.slice(0, 3).map((t) => (
                    <span key={t} className="shrink-0">#{t}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<RadarIcon size={18} />}
        title="Radar"
        actions={
          <>
            <Input icon={<Search size={14} />} placeholder="Search topics" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-52" />
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Add topic
            </Button>
          </>
        }
      />
      <p className="-mt-2 mb-5 px-4 text-[13px] text-fg-3 md:px-6 lg:px-8">
        Tools, concepts and ideas you heard about. Review them here and turn the useful ones into tickets. Topics stay off
        the board until then.
      </p>
      <div
        className={clsx(
          "grid items-start gap-5 px-4 md:px-6 lg:px-8",
          isDesktop && selected && "grid-cols-[340px_minmax(0,1fr)]",
        )}
      >
        {list}
        {isDesktop && selected && (
          <Card className="sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto p-6">
            <TopicPanel
              key={selected.id}
              jot={selected}
              onGone={() => setSelectedId(null)}
              onClose={() => setSelectedId(null)}
            />
          </Card>
        )}
      </div>

      {!isDesktop && selected && (
        <Drawer open onClose={() => setSelectedId(null)}>
          <div className="overflow-y-auto p-5">
            <TopicPanel key={selected.id} jot={selected} onGone={() => setSelectedId(null)} onClose={() => setSelectedId(null)} />
          </div>
        </Drawer>
      )}

      <AddTopicModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => setTab("open")}
      />
    </div>
  );
}
