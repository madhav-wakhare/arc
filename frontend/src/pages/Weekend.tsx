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
import { Button, Card, IconButton, Input, Menu, PageHeader, Select, Switch, useToast } from "../components/ui";
import { api, type Idea, type LifeCategory, type PlanEntry, type Settings, type Weekend, type WeekendSlot } from "../lib/api";
import { useSettings } from "../lib/hooks";
import { fmtDate, todayIso, addDays } from "../lib/meta";

type Target = { day: string; slot: WeekendSlot };

/** One time-of-day cell for one day. Empty cells stay blank; "Add" shows on hover. */
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
    <div
      ref={setNodeRef}
      className={clsx("group/slot min-h-[76px] px-2 py-2 transition-colors", isOver && "bg-accent-soft")}
    >
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} saturday={saturday} draggable />
      ))}
      <button
        onClick={onAdd}
        className={clsx(
          "flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-3 transition-opacity hover:bg-surface-2 hover:text-fg",
          entries.length ? "opacity-0 group-hover/slot:opacity-100 focus-visible:opacity-100" : "opacity-0 group-hover/slot:opacity-100 focus-visible:opacity-100 max-md:opacity-60",
        )}
        title={`Add to ${dayName(day)} ${slot.label.toLowerCase()}`}
      >
        <Plus size={13} /> Add
      </button>
    </div>
  );
}

/** Saturday and Sunday side by side, one row per time of day. Stacks into one column on a phone. */
function PlanGrid({ wk, onAdd }: { wk: Weekend; onAdd: (t: Target) => void }) {
  const days = [wk.saturday, wk.sunday];
  const head = (d: string) => {
    const list = wk.entries.filter((e) => e.day === d);
    const done = list.filter((e) => e.done).length;
    return (
      <div className="flex h-11 items-center gap-2 px-4">
        <span className="text-[14px] font-medium">{dayName(d)}</span>
        <span className="text-[13px] text-fg-3">{fmtDate(d)}</span>
        {d === todayIso() && <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Today</span>}
        <div className="flex-1" />
        {list.length > 0 && (
          <span className="text-xs tabular-nums text-fg-3">
            {done}/{list.length}
          </span>
        )}
      </div>
    );
  };
  const label = (slot: (typeof SLOTS)[number]) => (
    <div className="flex items-start gap-2 px-4 pt-4 text-xs font-medium text-fg-3">
      <slot.icon size={13} className="mt-px" /> {slot.label}
    </div>
  );
  const cell = (d: string, slot: (typeof SLOTS)[number]) => (
    <Slot day={d} slot={slot} saturday={wk.saturday} entries={wk.entries.filter((e) => e.day === d && e.slot === slot.value)} onAdd={() => onAdd({ day: d, slot: slot.value })} />
  );
  return (
    <Card className="overflow-hidden">
      {/* desktop: label column + two day columns */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[120px_1fr_1fr] divide-x divide-line border-b border-line">
          <div />
          {days.map((d) => (
            <div key={d}>{head(d)}</div>
          ))}
        </div>
        {SLOTS.map((slot) => (
          <div key={slot.value} className="grid grid-cols-[120px_1fr_1fr] divide-x divide-line border-b border-line last:border-b-0">
            {label(slot)}
            {days.map((d) => (
              <div key={d}>{cell(d, slot)}</div>
            ))}
          </div>
        ))}
      </div>
      {/* phone: one day after the other */}
      <div className="divide-y divide-line md:hidden">
        {days.map((d) => (
          <div key={d}>
            {head(d)}
            {SLOTS.map((slot) => (
              <div key={slot.value} className="border-t border-line">
                <div className="px-4 pt-3 text-xs font-medium text-fg-3">{slot.label}</div>
                {cell(d, slot)}
              </div>
            ))}
          </div>
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
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex h-11 items-center gap-3 border-b border-line px-4">
        <h3 className="text-[14px] font-medium">Ideas</h3>
        <div className="flex-1" />
        {(["open", "done"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx("text-xs transition-colors", tab === t ? "font-medium text-fg" : "text-fg-3 hover:text-fg-2")}
          >
            {t === "open" ? `To do${open.length ? ` · ${open.length}` : ""}` : "Done"}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-b border-line p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add an idea" className="min-w-0 flex-1" />
        <Select value={category} onChange={(e) => setCategory(e.target.value as LifeCategory)} className="w-[104px] shrink-0" title="Category">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <IconButton type="submit" title="Add idea" disabled={!title.trim()}>
          <Plus size={15} />
        </IconButton>
      </form>
      <div className="max-h-[520px] overflow-y-auto p-2">
        {list.map((i) => (
          <IdeaRow key={i.id} idea={i} saturday={saturday} />
        ))}
        {!list.length && (
          <p className="px-3 py-8 text-center text-[13px] text-fg-3">
            {tab === "open" ? "Movies, places, things to try. Drag one into a slot." : "Nothing done yet."}
          </p>
        )}
      </div>
    </Card>
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
    <div className="mx-auto w-full max-w-[1440px] pb-10">
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
          <div className="space-y-5 px-4 md:px-6 lg:px-8">
            <Summary entries={wk.entries} />
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <PlanGrid wk={wk} onAdd={setTarget} />
              <IdeasCard saturday={wk.saturday} />
            </div>
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
