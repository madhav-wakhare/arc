/** Today's plan and the end-of-day review, shown on the Dashboard (they used to be the Today page). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronDown, ChevronRight, Clock, Play, Plus, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Item, type Review } from "../lib/api";
import { useRefreshItems, useTimer, useUpdateItem } from "../lib/hooks";
import { ItemIcon, PriorityIcon, StatusIcon, dueTone, fmtDate, fmtMinutes, todayIso } from "../lib/meta";
import { Panel } from "./dash";
import { PendingBadge } from "./ItemCard";
import { LogWorkModal } from "./ItemDrawer";
import { useActions } from "./Layout";
import { Button, IconButton, useToast } from "./ui";

function Row({ item, onLog }: { item: Item; onLog: (i: Item) => void }) {
  const { openItem } = useActions();
  const update = useUpdateItem();
  const refresh = useRefreshItems();
  const { data: timer } = useTimer();
  const running = timer?.item_id === item.id;
  const start = useMutation({ mutationFn: () => api.post(`/items/${item.id}/timer/start`), onSuccess: refresh });
  const stop = useMutation({ mutationFn: () => api.post("/timer/stop"), onSuccess: refresh });
  const done = item.status === "done";
  return (
    <div className={clsx("group flex items-center gap-3 px-4 py-2.5", running && "bg-accent-soft")}>
      <button
        onClick={() => update.mutate({ id: item.id, status: done ? "today" : "done" })}
        className={clsx(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
          done ? "border-good bg-good text-white" : "border-line-strong hover:border-good",
        )}
        title={done ? "Mark as not done" : "Mark as done"}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      <button onClick={() => openItem(item.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <ItemIcon item={item} />
        <span className="hidden shrink-0 whitespace-nowrap font-mono text-xs text-fg-3 sm:inline">{item.key}</span>
        <span className="truncate text-[14px]">{item.title}</span>
      </button>
      <div className="flex shrink-0 items-center gap-3 text-xs text-fg-3">
        {item.priority !== "none" && <span className="hidden sm:inline"><PriorityIcon priority={item.priority} /></span>}
        {item.due_date && <span className={clsx("hidden sm:inline", dueTone(item))}>{fmtDate(item.due_date)}</span>}
        <span className="hidden items-center gap-1 sm:flex">
          <Clock size={12} /> {fmtMinutes(item.logged_minutes)}
        </span>
        <PendingBadge item={item} />
        <span className="hidden sm:inline"><StatusIcon status={item.status} /></span>
        {!done &&
          (running ? (
            <IconButton className="size-7 text-accent" title="Stop timer and log time" onClick={() => stop.mutate()}>
              <Square size={12} fill="currentColor" />
            </IconButton>
          ) : (
            <IconButton className="size-7" title="Start timer" onClick={() => start.mutate()}>
              <Play size={13} />
            </IconButton>
          ))}
        <IconButton className="hidden size-7 sm:inline-flex" title="Log work" onClick={() => onLog(item)}>
          <Plus size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/** Today's plan: overdue, planned and done today, with timer and log work, plus a picker from the backlog. */
export function TodayPanel() {
  const { data: items = [] } = useQuery({ queryKey: ["items", "today"], queryFn: () => api.get<Item[]>("/items?view=today") });
  const { data: backlog = [] } = useQuery({ queryKey: ["items", "backlog"], queryFn: () => api.get<Item[]>("/items?status=backlog") });
  const { newItem } = useActions();
  const update = useUpdateItem();
  const [logItem, setLogItem] = useState<Item | null>(null);
  const [picking, setPicking] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const t = todayIso();

  const open = items.filter((i) => i.status !== "done");
  const done = items.filter((i) => i.status === "done");
  const overdue = open.filter((i) => i.due_date && i.due_date < t);
  const planned = open.filter((i) => !(i.due_date && i.due_date < t));
  const suggestions = backlog.filter((i) => !items.some((x) => x.id === i.id)).slice(0, 10);

  // Long days stay short: the planned list shows the first few, and done items stay folded until asked for.
  const LIMIT = 8;
  const section = (title: string, list: Item[], tone?: string, fold?: { open: boolean; toggle: () => void }) => {
    if (!list.length) return null;
    const shown = fold && !fold.open ? [] : title === "Planned" && !showAll ? list.slice(0, LIMIT) : list;
    const Chevron = fold?.open ? ChevronDown : ChevronRight;
    return (
      <div>
        <div
          onClick={fold?.toggle}
          className={clsx(
            "flex items-center gap-1 border-b border-line bg-surface-2/50 px-4 py-1.5 text-xs font-medium",
            tone ?? "text-fg-2",
            fold && "cursor-pointer select-none hover:bg-surface-2",
          )}
        >
          {fold && <Chevron size={12} />}
          {title} · {list.length}
        </div>
        <div className="divide-y divide-line">
          {shown.map((i) => (
            <Row key={i.id} item={i} onLog={setLogItem} />
          ))}
        </div>
        {shown.length < list.length && !fold && (
          <button onClick={() => setShowAll(true)} className="w-full border-t border-line py-2 text-xs text-fg-3 hover:bg-surface-2 hover:text-fg">
            Show all {list.length}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex h-12 items-center gap-2 border-b border-line px-5">
        <h3 className="text-[14px] font-medium">Today · {open.length}</h3>
        <div className="flex-1" />
        {suggestions.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setPicking(!picking)}>
            {picking ? "Done picking" : "Plan from backlog"}
          </Button>
        )}
        <Button size="sm" icon={<Plus size={13} />} onClick={() => newItem({ status: "today" })}>
          Add
        </Button>
      </div>
      {picking && (
        <div className="flex flex-wrap gap-2 border-b border-line bg-surface-2/40 px-5 py-3">
          {suggestions.map((i) => (
            <button
              key={i.id}
              onClick={() => update.mutate({ id: i.id, status: "today" })}
              className="flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] hover:border-accent"
            >
              <Plus size={13} className="text-fg-3" />
              <ItemIcon item={i} size={13} />
              <span className="truncate">{i.title}</span>
              <PendingBadge item={i} />
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-fg-3">Nothing planned for today. Plan from the backlog or add an item.</p>
      ) : (
        <>
          {section("Overdue", overdue, "text-critical")}
          {section("Planned", planned)}
          {section("Done", done, "text-good", { open: showDone, toggle: () => setShowDone(!showDone) })}
        </>
      )}
      {logItem && <LogWorkModal item={logItem} open onClose={() => setLogItem(null)} />}
    </div>
  );
}

const REVIEW_FIELDS = [
  { key: "went_well", label: "Went well" },
  { key: "blockers", label: "Blocked by" },
  { key: "tomorrow", label: "Tomorrow" },
] as const;

/** End-of-day review: three short lines that save on their own when you leave a field. */
export function EndOfDayReview() {
  const day = todayIso();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["review", day], queryFn: () => api.get<Review>(`/reviews/${day}`) });
  const [form, setForm] = useState({ went_well: "", blockers: "", tomorrow: "" });
  useEffect(() => {
    if (data) setForm({ went_well: data.went_well, blockers: data.blockers, tomorrow: data.tomorrow });
  }, [data]);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.put<Review>(`/reviews/${day}`, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review", day] }),
    onError: (e: Error) => toast(e.message, "error"),
  });
  const dirty = !!data && REVIEW_FIELDS.some((f) => form[f.key] !== data[f.key]);
  return (
    <Panel
      title="End of day"
      action={
        <span className="text-xs text-fg-3">
          {save.isPending ? "Saving…" : data?.updated_at ? `Saved ${fmtDate(data.updated_at, { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      }
    >
      <div className="-mx-1 divide-y divide-line">
        {REVIEW_FIELDS.map((f) => (
          <label key={f.key} className="flex items-start gap-3 px-1 py-2">
            <span className="w-20 shrink-0 pt-px text-xs text-fg-3">{f.label}</span>
            <textarea
              rows={1}
              placeholder="…"
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              onBlur={() => dirty && save.mutate()}
              className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-fg-3/60"
            />
          </label>
        ))}
      </div>
    </Panel>
  );
}
