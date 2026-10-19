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
import { CalendarHeart, CalendarPlus, Check, ChevronLeft, ChevronRight, Lightbulb, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { Button, Card, IconButton, Input, Menu, PageHeader, Select, Switch, Tabs, useToast } from "../components/ui";
import { api, type Idea, type LifeCategory, type PlanEntry, type Settings, type Weekend, type WeekendSlot } from "../lib/api";
import { useSettings } from "../lib/hooks";
import { fmtDate, todayIso, addDays } from "../lib/meta";

type Target = { day: string; slot: WeekendSlot };

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
    <div className="px-3 py-3">
      <div className="mb-1 flex items-center gap-2 px-2 text-xs font-medium text-fg-3">
        <slot.icon size={13} />
        {slot.label}
        <div className="flex-1" />
        <button onClick={onAdd} className="rounded p-0.5 hover:bg-surface-2 hover:text-fg" title={`Add to ${slot.label.toLowerCase()}`}>
          <Plus size={14} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          "min-h-10 rounded-md border border-dashed transition-colors",
          isOver ? "border-accent bg-accent-soft" : "border-transparent",
        )}
      >
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} saturday={saturday} draggable />
        ))}
        {!entries.length && (
          <button onClick={onAdd} className="flex h-9 w-full items-center px-2 text-left text-[13px] text-fg-3/70 hover:text-fg-3">
            Free
          </button>
        )}
      </div>
    </div>
  );
}

function DayCard({
  day,
  saturday,
  entries,
  onAdd,
}: {
  day: string;
  saturday: string;
  entries: PlanEntry[];
  onAdd: (t: Target) => void;
}) {
  const isToday = day === todayIso();
  const done = entries.filter((e) => e.done).length;
  return (
    <Card className={clsx("overflow-hidden", isToday && "border-accent/40")}>
      <div className="flex h-12 items-center gap-2 border-b border-line px-5">
        <h3 className="text-[14px] font-medium">{dayName(day)}</h3>
        <span className="text-[13px] text-fg-3">{fmtDate(day)}</span>
        {isToday && <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Today</span>}
        <div className="flex-1" />
        {entries.length > 0 && (
          <span className="text-xs tabular-nums text-fg-3">
            {done}/{entries.length} done
          </span>
        )}
      </div>
      <div className="divide-y divide-line">
        {SLOTS.map((s) => (
          <Slot
            key={s.value}
            day={day}
            slot={s}
            saturday={saturday}
            entries={entries.filter((e) => e.slot === s.value)}
            onAdd={() => onAdd({ day, slot: s.value })}
          />
        ))}
      </div>
    </Card>
  );
}

/** Study vs revise vs life, as one bar plus a short nudge. */
function Balance({ entries }: { entries: PlanEntry[] }) {
  const n = (k: PlanEntry["kind"]) => entries.filter((e) => e.kind === k).length;
  const study = n("study");
  const revise = n("revise");
  const life = n("life");
  const total = entries.length;
  const done = entries.filter((e) => e.done).length;
  const nudge =
    total === 0
      ? "Nothing planned yet. Mix some study with something for yourself."
      : life === 0
        ? "All learning so far. Add something for yourself: a movie, a walk, people."
        : study + revise === 0
          ? "A full break this weekend. Enjoy it."
          : life / total >= 0.3
            ? "Good balance."
            : "Mostly learning. Room for one more thing just for fun?";
  const segments = [
    { label: "Study", value: study, cls: "bg-accent" },
    { label: "Revise", value: revise, cls: "bg-accent/45" },
    { label: "Life", value: life, cls: "bg-life" },
  ];
  return (
    <Card className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span className={clsx("size-2 rounded-full", s.cls)} />
            <span className="text-fg-2">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}</span>
          </span>
        ))}
        <span className="text-fg-3 max-sm:w-full sm:ml-auto">{nudge}</span>
        {total > 0 && (
          <span className="tabular-nums text-fg-2 sm:border-l sm:border-line sm:pl-5">
            {done}/{total} done
          </span>
        )}
      </div>
      <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-3">
        {total > 0 &&
          segments
            .filter((s) => s.value)
            .map((s) => <div key={s.label} className={clsx("h-full transition-all", s.cls)} style={{ width: `${(s.value / total) * 100}%` }} />)}
      </div>
    </Card>
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
      <div className="flex h-12 items-center gap-2 border-b border-line px-5">
        <Lightbulb size={15} className="text-fg-3" />
        <h3 className="text-[14px] font-medium">Ideas</h3>
        <div className="flex-1" />
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "open", label: `To do ${open.length || ""}` },
            { value: "done", label: "Done" },
          ]}
          className="[&>button]:h-6 [&>button]:px-2 [&>button]:text-xs"
        />
      </div>
      <form
        className="flex gap-2 border-b border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Movie, place, thing to try" className="min-w-0 flex-1" />
        <Select value={category} onChange={(e) => setCategory(e.target.value as LifeCategory)} className="w-28 shrink-0" title="Category">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <IconButton type="submit" title="Add idea" disabled={!title.trim()} className="border border-line">
          <Plus size={15} />
        </IconButton>
      </form>
      <div className="max-h-[520px] overflow-y-auto p-2">
        {list.map((i) => (
          <IdeaRow key={i.id} idea={i} saturday={saturday} />
        ))}
        {!list.length && (
          <p className="px-3 py-8 text-center text-[13px] text-fg-3">
            {tab === "open" ? "Collect movies, places and things to try during the week. Drag them into a slot." : "Nothing done yet."}
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
        title="Weekend"
        actions={
          <>
            <label className="flex h-9 items-center gap-2.5 rounded-md border border-line px-3 text-[13px]">
              Weekend mode
              <Switch checked={settings?.weekend_mode ?? false} onChange={(v) => mode.mutate(v)} label="Weekend mode" />
            </label>
            {!isCurrent && <Button onClick={() => setDay(undefined)}>This weekend</Button>}
            <div className="flex h-9 items-center rounded-md border border-line">
              <IconButton className="size-[34px] rounded-r-none" title="Previous weekend" onClick={() => wk && setDay(wk.previous)}>
                <ChevronLeft size={15} />
              </IconButton>
              <span className="min-w-24 px-1 text-center text-[13px] tabular-nums">{range}</span>
              <IconButton className="size-[34px] rounded-l-none" title="Next weekend" onClick={() => wk && setDay(wk.next)}>
                <ChevronRight size={15} />
              </IconButton>
            </div>
          </>
        }
      />
      {wk && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={() => setDragging(null)} onDragEnd={onDragEnd}>
          <div className="space-y-5 px-4 md:px-6 lg:px-8">
            <Balance entries={wk.entries} />
            <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
              {[wk.saturday, wk.sunday].map((d) => (
                <DayCard key={d} day={d} saturday={wk.saturday} entries={wk.entries.filter((e) => e.day === d)} onAdd={setTarget} />
              ))}
              <div className="lg:col-span-2 xl:col-span-1">
                <IdeasCard saturday={wk.saturday} />
              </div>
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
