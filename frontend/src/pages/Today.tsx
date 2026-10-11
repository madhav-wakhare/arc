import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, BookMarked, CalendarCheck, Check, Clock, Play, Plus, Square } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { PendingBadge } from "../components/ItemCard";
import { LogWorkModal } from "../components/ItemDrawer";
import { useActions } from "../components/Layout";
import { RevisePreview } from "../components/RevisePreview";
import { Button, Card, Empty, Field, IconButton, PageHeader, Textarea, useToast } from "../components/ui";
import { api, type Item, type Overview, type Review } from "../lib/api";
import { useRefreshItems, useTimer, useUpdateItem } from "../lib/hooks";
import { PriorityIcon, StatusIcon, TypeIcon, dueTone, fmtDate, fmtMinutes, todayIso } from "../lib/meta";

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
        <TypeIcon type={item.type} />
        <span className="hidden font-mono text-xs text-fg-3 sm:inline">{item.key}</span>
        <span className={clsx("truncate text-[14px]", done && "text-fg-3 line-through")}>{item.title}</span>
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

function DailyReview() {
  const day = todayIso();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["review", day], queryFn: () => api.get<Review>(`/reviews/${day}`) });
  const [form, setForm] = useState({ went_well: "", blockers: "", tomorrow: "" });
  useEffect(() => {
    if (data) setForm({ went_well: data.went_well, blockers: data.blockers, tomorrow: data.tomorrow });
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.put<Review>(`/reviews/${day}`, form),
    onSuccess: () => toast("Daily review saved"),
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-medium">End-of-day review</h3>
          <p className="text-[13px] text-fg-3">
            {data?.updated_at ? `Saved ${fmtDate(data.updated_at, { hour: "2-digit", minute: "2-digit" })}` : "Not saved yet"}
          </p>
        </div>
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Save review
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="What went well">
          <Textarea className="min-h-28" value={form.went_well} onChange={(e) => setForm({ ...form, went_well: e.target.value })} />
        </Field>
        <Field label="What blocked me">
          <Textarea className="min-h-28" value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} />
        </Field>
        <Field label="Plan for tomorrow">
          <Textarea className="min-h-28" value={form.tomorrow} onChange={(e) => setForm({ ...form, tomorrow: e.target.value })} />
        </Field>
      </div>
    </Card>
  );
}

export default function Today() {
  const { data: items = [] } = useQuery({ queryKey: ["items", "today"], queryFn: () => api.get<Item[]>("/items?view=today") });
  const { data: backlog = [] } = useQuery({
    queryKey: ["items", "backlog"],
    queryFn: () => api.get<Item[]>("/items?status=backlog"),
  });
  const { newItem } = useActions();
  const update = useUpdateItem();
  const [logItem, setLogItem] = useState<Item | null>(null);
  const t = todayIso();

  const open = items.filter((i) => i.status !== "done");
  const done = items.filter((i) => i.status === "done");
  const overdue = open.filter((i) => i.due_date && i.due_date < t);
  const planned = open.filter((i) => !(i.due_date && i.due_date < t));
  const { data: stats } = useQuery({ queryKey: ["stats", 1], queryFn: () => api.get<Overview>("/stats/overview?days=1") });
  const loggedToday = stats?.current.minutes ?? 0;
  const suggestions = backlog.filter((i) => !items.some((x) => x.id === i.id)).slice(0, 8);

  const section = (title: string, list: Item[], tone?: string) =>
    list.length > 0 && (
      <div>
        <div className={clsx("border-b border-line bg-surface-2/50 px-4 py-2 text-xs font-medium", tone ?? "text-fg-2")}>
          {title} · {list.length}
        </div>
        <div className="divide-y divide-line">
          {list.map((i) => (
            <Row key={i.id} item={i} onLog={setLogItem} />
          ))}
        </div>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<CalendarCheck size={18} />}
        title={
          <span>
            Today <span className="ml-1 text-[14px] font-normal text-fg-3">{fmtDate(t, { weekday: "long", month: "long", day: "numeric" })}</span>
          </span>
        }
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => newItem({ status: "today" })}>
            Add to today
          </Button>
        }
      />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Planned", open.length],
            ["Done today", done.length],
            ["Logged today", fmtMinutes(loggedToday)],
          ].map(([label, v]) => (
            <Card key={label} className="p-3 sm:p-4">
              <p className="text-xs text-fg-2 sm:text-[13px]">{label}</p>
              <p className="mt-1.5 text-lg font-semibold tabular-nums sm:text-2xl">{v}</p>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          {items.length === 0 ? (
            <Empty
              icon={<CalendarCheck size={28} />}
              title="Nothing planned for today"
              hint="Pull items from the backlog below, or add a new one."
            />
          ) : (
            <>
              {section("Overdue", overdue, "text-critical")}
              {section("Planned", planned)}
              {section("Done", done, "text-good")}
            </>
          )}
        </Card>

        {suggestions.length > 0 && (
          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-medium">Plan from backlog</h3>
            <p className="mb-3 text-[13px] text-fg-3">Click to move an item into Today.</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((i) => (
                <button
                  key={i.id}
                  onClick={() => update.mutate({ id: i.id, status: "today" })}
                  className="flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] hover:border-accent"
                >
                  <Plus size={13} className="text-fg-3" />
                  <TypeIcon type={i.type} size={13} />
                  <span className="truncate">{i.title}</span>
                  <PendingBadge item={i} />
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-medium">
              <BookMarked size={15} className="text-fg-2" /> Keep in mind
            </h3>
            <Link to="/revisit" className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
              Revisit <ArrowRight size={12} />
            </Link>
          </div>
          <RevisePreview limit={4} />
        </Card>

        <DailyReview />
      </div>
      {logItem && <LogWorkModal item={logItem} open onClose={() => setLogItem(null)} />}
    </div>
  );
}
