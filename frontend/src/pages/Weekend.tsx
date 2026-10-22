import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarHeart, CalendarPlus, Check, ChevronLeft, ChevronRight, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AddActivityModal,
  CATEGORIES,
  EntryRow,
  KindIcon,
  SLOTS,
  categoryMeta,
  dayName,
  useIdeas,
  usePlanMutations,
  useRefreshWeekend,
  useWeekend,
} from "../components/Weekend";
import { Button, Card, IconButton, Menu, PageHeader, Switch, useToast } from "../components/ui";
import { api, type Idea, type LifeCategory, type PlanEntry, type Settings, type Weekend, type WeekendSlot } from "../lib/api";
import { useSettings } from "../lib/hooks";
import { fmtDate, todayIso, addDays } from "../lib/meta";

type Target = { day: string; slot: WeekendSlot };

/** One time of day inside a day card: its label, its activities, and a quiet "Add" line. */
function Slot({
  day,
  slot,
  entries,
  saturday,
  onAdd,
}: {
  day: string;
  slot: (typeof SLOTS)[number];
  entries: PlanEntry[];
  saturday: string;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot|${day}|${slot.value}`, data: { day, slot: slot.value } });
  return (
    <div ref={setNodeRef} className={clsx("rounded-md px-2 py-2.5 transition-colors", isOver && "bg-accent-soft")}>
      <p className="mb-1 flex items-center gap-2 px-2 text-xs text-fg-3">
        <slot.icon size={13} /> {slot.label}
      </p>
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} saturday={saturday} draggable />
      ))}
      <button
        onClick={onAdd}
        className={clsx(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-fg-3/70 transition hover:bg-surface-2 hover:text-fg",
          entries.length > 0 && "text-fg-3/50",
        )}
        title={`Add to ${dayName(day)} ${slot.label.toLowerCase()}`}
      >
        <Plus size={13} /> {entries.length ? "Add" : "Free"}
      </button>
    </div>
  );
}

/** One card per day with its three times of day stacked. Saturday and Sunday sit side by side. */
function DayCard({ wk, day, onAdd }: { wk: Weekend; day: string; onAdd: (t: Target) => void }) {
  const list = wk.entries.filter((e) => e.day === day);
  const done = list.filter((e) => e.done).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex h-11 items-center gap-2 border-b border-line px-4">
        <span className="text-[14px] font-medium">{dayName(day)}</span>
        <span className="text-[13px] text-fg-3">{fmtDate(day)}</span>
        {day === todayIso() && <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Today</span>}
        <div className="flex-1" />
        {list.length > 0 && (
          <span className="text-xs tabular-nums text-fg-3">
            {done}/{list.length} done
          </span>
        )}
      </div>
      <div className="p-1.5">
        {SLOTS.map((slot) => (
          <Slot
            key={slot.value}
            day={day}
            slot={slot}
            saturday={wk.saturday}
            entries={list.filter((e) => e.slot === slot.value)}
            onAdd={() => onAdd({ day, slot: slot.value })}
          />
        ))}
      </div>
    </Card>
  );
}

/** One quiet line under the title: the mix of study, revise and life, and a short nudge. */
function Summary({ entries }: { entries: PlanEntry[] }) {
  const n = (k: PlanEntry["kind"]) => entries.filter((e) => e.kind === k).length;
  const study = n("study");
  const revise = n("revise");
  const life = n("life");
  const total = entries.length;
  const done = entries.filter((e) => e.done).length;
  if (!total) return <p className="-mt-3 text-[13px] text-fg-3">Nothing planned yet. Mix some study with something for yourself.</p>;
  const nudge =
    life === 0
      ? "All learning so far. Add something for yourself."
      : study + revise === 0
        ? "A full break. Enjoy it."
        : life / total >= 0.3
          ? "Good balance."
          : "Mostly learning. Room for one more thing just for fun?";
  const parts = [
    { label: "study", value: study, cls: "bg-accent" },
    { label: "revise", value: revise, cls: "bg-accent/45" },
    { label: "life", value: life, cls: "bg-life" },
  ];
  return (
    <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-3">
      <span className="flex h-1.5 w-28 gap-px overflow-hidden rounded-full bg-surface-3">
        {parts
          .filter((p) => p.value)
          .map((p) => (
            <span key={p.label} className={clsx("h-full", p.cls)} style={{ width: `${(p.value / total) * 100}%` }} />
          ))}
      </span>
      {parts.map((p) => (
        <span key={p.label} className="flex items-center gap-1.5">
          <span className={clsx("size-1.5 rounded-full", p.cls)} />
          <span className="tabular-nums text-fg-2">{p.value}</span> {p.label}
        </span>
      ))}
      <span>·</span>
      <span className="tabular-nums">
        {done}/{total} done
      </span>
      <span>·</span>
      <span>{nudge}</span>
    </div>
  );
}

function IdeaRow({ idea, saturday }: { idea: Idea; saturday: string }) {
  const refresh = useRefreshWeekend();
  const { add } = usePlanMutations();
  const drag = useDraggable({ id: `idea-${idea.id}`, data: { idea }, disabled: !!idea.done_at });
  const patch = useMutation({ mutationFn: (body: Partial<Idea> & { done?: boolean }) => api.patch(`/weekend/ideas/${idea.id}`, body), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api.del(`/weekend/ideas/${idea.id}`), onSuccess: refresh });
  const Icon = categoryMeta(idea.category).icon;
  const planTargets = [saturday, addDays(saturday, 1)].flatMap((day) =>
    SLOTS.map((s) => ({
      label: `${dayName(day)} ${s.label.toLowerCase()}`,
      icon: <CalendarPlus size={13} className="text-fg-3" />,
      onClick: () => add.mutate({ day, slot: s.value, idea_id: idea.id }),
    })),
  );
  return (
    <div
      ref={drag.setNodeRef}
      {...(idea.done_at ? {} : { ...drag.listeners, ...drag.attributes })}
      className={clsx(
        "group flex min-h-9 items-center gap-2.5 rounded-md px-2 text-[13px] outline-none hover:bg-surface-2",
        !idea.done_at && "cursor-grab touch-manipulation active:cursor-grabbing",
        drag.isDragging && "opacity-30",
      )}
      title={idea.note || undefined}
    >
      <Icon size={14} className={clsx("shrink-0", idea.done_at ? "text-fg-3" : "text-life")} />
      <span className={clsx("min-w-0 flex-1 truncate", idea.done_at && "text-fg-3")}>{idea.title}</span>
      {idea.planned_day && !idea.done_at && (
        <span className="shrink-0 text-[11px] text-fg-3">{fmtDate(idea.planned_day, { weekday: "short" })}</span>
      )}
      {idea.done_at && <span className="shrink-0 text-[11px] text-fg-3">{fmtDate(idea.done_at)}</span>}
      <span onPointerDown={(e) => e.stopPropagation()} className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <Menu
          trigger={
            <button className="flex size-6 items-center justify-center rounded text-fg-3 hover:bg-surface-3 hover:text-fg" title="More">
              <MoreHorizontal size={14} />
            </button>
          }
          items={[
            ...(idea.done_at ? [] : planTargets),
            idea.done_at
              ? { label: "Back to ideas", icon: <RotateCcw size={13} />, onClick: () => patch.mutate({ done: false }) }
              : { label: "Mark as done", icon: <Check size={13} />, onClick: () => patch.mutate({ done: true }) },
            { label: "Delete idea", icon: <Trash2 size={13} />, danger: true, onClick: () => remove.mutate() },
          ]}
        />
      </span>
    </div>
  );
}

function IdeasCard({ saturday }: { saturday: string }) {
  const { data: ideas = [] } = useIdeas();
  const refresh = useRefreshWeekend();
  const toast = useToast();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LifeCategory>("movie");
  const add = useMutation({
    mutationFn: () => api.post("/weekend/ideas", { title, category }),
    onSuccess: () => {
      setTitle("");
      refresh();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const open = ideas.filter((i) => !i.done_at);
  const done = ideas.filter((i) => i.done_at);
  const list = tab === "open" ? open : done;
  const Icon = categoryMeta(category).icon;
  return (
    <section>
      <div className="mb-2 flex items-center gap-3 px-1">
        <h3 className="text-[14px] font-medium">Ideas</h3>
        <span className="text-xs text-fg-3">Movies, places, things to try. Drag one onto a day.</span>
        <div className="flex-1" />
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("text-xs transition-colors", tab === t ? "font-medium text-fg" : "text-fg-3 hover:text-fg-2")}
          >
            {t === "open" ? `To do${open.length ? ` · ${open.length}` : ""}` : `Done${done.length ? ` · ${done.length}` : ""}`}
          </button>
        ))}
      </div>
      <Card className="p-1.5">
        {tab === "open" && (
          <form
            className="flex h-9 items-center gap-2.5 rounded-md px-2 focus-within:bg-surface-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) add.mutate();
            }}
          >
            <Menu
              trigger={
                <button type="button" title={`Category: ${categoryMeta(category).label}`} className="flex size-5 items-center justify-center text-life">
                  <Icon size={14} />
                </button>
              }
              items={CATEGORIES.map((c) => ({ label: c.label, icon: <c.icon size={13} className="text-life" />, onClick: () => setCategory(c.value) }))}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Add an idea · ${categoryMeta(category).label}`}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
            />
            {title.trim() && <span className="text-[11px] text-fg-3">Enter</span>}
          </form>
        )}
        {list.length > 0 && (
          <div className="grid gap-x-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((i) => (
              <IdeaRow key={i.id} idea={i} saturday={saturday} />
            ))}
          </div>
        )}
        {tab === "done" && !list.length && <p className="px-3 py-6 text-center text-[13px] text-fg-3">Nothing done yet.</p>}
      </Card>
    </section>
  );
}

/** Weekend: plan Saturday and Sunday in three slots, mixing study, revise and life. */
export default function WeekendPage() {
  const [day, setDay] = useState<string | undefined>();
  const { data: wk } = useWeekend(day);
  const { data: current } = useWeekend();
  const { data: settings } = useSettings();
  const { add, update } = usePlanMutations();
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const [dragging, setDragging] = useState<{ title: string; kind: PlanEntry["kind"]; category: LifeCategory } | null>(null);

  const mode = useMutation({
    mutationFn: (v: boolean) => api.put<Settings>("/settings", { weekend_mode: v }),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { entry?: PlanEntry; idea?: Idea };
    if (d.entry) setDragging(d.entry);
    else if (d.idea) setDragging({ title: d.idea.title, kind: "life", category: d.idea.category });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const to = e.over?.data.current as Target | undefined;
    const d = e.active.data.current as { entry?: PlanEntry; idea?: Idea };
    if (!to) return;
    if (d.entry && (d.entry.day !== to.day || d.entry.slot !== to.slot)) {
      // Move it right away; the server answer replaces it.
      qc.setQueryData<Weekend>(["weekend", day ?? "current"], (old) =>
        old && { ...old, entries: old.entries.map((x) => (x.id === d.entry!.id ? { ...x, ...to, position: Number.MAX_SAFE_INTEGER } : x)) },
      );
      update.mutate({ id: d.entry.id, ...to, position: Date.now() });
    }
    if (d.idea) add.mutate({ ...to, idea_id: d.idea.id });
  };

  const isCurrent = !wk || wk.saturday === current?.saturday;
  const range = wk ? `${fmtDate(wk.saturday, { month: "short", day: "numeric" })} – ${fmtDate(wk.sunday, { day: "numeric" })}` : "";

  return (
    <div className="mx-auto w-full max-w-[1100px] pb-10">
      <PageHeader
        icon={<CalendarHeart size={18} />}
        title={
          <span className="flex items-baseline gap-2.5">
            Weekend <span className="text-[14px] font-normal tabular-nums text-fg-3">{range}</span>
          </span>
        }
        actions={
          <>
            <div className="flex items-center gap-0.5">
              <IconButton title="Previous weekend" onClick={() => wk && setDay(wk.previous)}>
                <ChevronLeft size={16} />
              </IconButton>
              <Button size="sm" variant="ghost" disabled={isCurrent} onClick={() => setDay(undefined)}>
                This weekend
              </Button>
              <IconButton title="Next weekend" onClick={() => wk && setDay(wk.next)}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
            <span className="mx-1 h-5 w-px bg-line" />
            <label className="flex items-center gap-2 text-[13px] text-fg-2" title="Show Weekend in the sidebar and its plan on the Dashboard on Saturday and Sunday">
              Weekend mode
              <Switch checked={settings?.weekend_mode ?? false} onChange={(v) => mode.mutate(v)} label="Weekend mode" />
            </label>
          </>
        }
      />
      {wk && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
          <div className="space-y-6 px-4 md:px-6 lg:px-8">
            <Summary entries={wk.entries} />
            <div className="grid gap-4 md:grid-cols-2">
              <DayCard wk={wk} day={wk.saturday} onAdd={setTarget} />
              <DayCard wk={wk} day={wk.sunday} onAdd={setTarget} />
            </div>
            <IdeasCard saturday={wk.saturday} />
          </div>
          <DragOverlay>
            {dragging && (
              <div className="flex h-9 items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-[13px] shadow-[var(--shadow)]">
                <KindIcon entry={dragging} />
                {dragging.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <AddActivityModal target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
