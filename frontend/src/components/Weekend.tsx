/** Weekend plan pieces shared by the Weekend page and the Dashboard. */
import { useDraggable } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRightLeft,
  BookMarked,
  Clapperboard,
  Coffee,
  Dumbbell,
  GraduationCap,
  House,
  MapPin,
  MoreHorizontal,
  Palette,
  Plane,
  Search,
  Sparkles,
  Sun,
  Sunrise,
  Moon,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, type Idea, type Item, type LifeCategory, type PlanEntry, type Weekend, type WeekendSlot } from "../lib/api";
import { useRevisions } from "../lib/hooks";
import { ItemIcon, PriorityIcon, fmtDate, todayIso, addDays } from "../lib/meta";
import { useActions } from "./Layout";
import { Button, Card, Checkbox, Input, Menu, Modal, Tabs, useToast } from "./ui";

export const CATEGORIES: { value: LifeCategory; label: string; icon: LucideIcon }[] = [
  { value: "travel", label: "Travel", icon: Plane },
  { value: "movie", label: "Movie", icon: Clapperboard },
  { value: "outing", label: "Outing", icon: MapPin },
  { value: "social", label: "Friends & family", icon: Users },
  { value: "fitness", label: "Fitness", icon: Dumbbell },
  { value: "hobby", label: "Hobby", icon: Palette },
  { value: "chores", label: "Chores", icon: House },
  { value: "rest", label: "Rest", icon: Coffee },
  { value: "other", label: "Other", icon: Sparkles },
];
export const categoryMeta = (c: LifeCategory) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];

export const SLOTS: { value: WeekendSlot; label: string; icon: LucideIcon }[] = [
  { value: "morning", label: "Morning", icon: Sunrise },
  { value: "afternoon", label: "Afternoon", icon: Sun },
  { value: "evening", label: "Evening", icon: Moon },
];

export const dayName = (day: string) => fmtDate(day, { weekday: "long" });

export function useWeekend(day?: string) {
  return useQuery({
    queryKey: ["weekend", day ?? "current"],
    queryFn: () => api.get<Weekend>(day ? `/weekend?day=${day}` : "/weekend"),
  });
}
export const useIdeas = () => useQuery({ queryKey: ["weekend-ideas"], queryFn: () => api.get<Idea[]>("/weekend/ideas") });

export function useRefreshWeekend() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["weekend"] });
    qc.invalidateQueries({ queryKey: ["weekend-ideas"] });
  };
}

export function usePlanMutations() {
  const refresh = useRefreshWeekend();
  const toast = useToast();
  const onError = (e: Error) => toast(e.message, "error");
  return {
    add: useMutation({
      mutationFn: (body: Record<string, unknown>) => api.post<PlanEntry>("/weekend/entries", body),
      onSuccess: refresh,
      onError,
    }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number } & Record<string, unknown>) => api.patch<PlanEntry>(`/weekend/entries/${id}`, patch),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/weekend/entries/${id}`), onSuccess: refresh, onError }),
  };
}

/** Icon for an activity: graduation cap for study, bookmark for revise, the category for life. */
export function KindIcon({ entry, size = 14 }: { entry: Pick<PlanEntry, "kind" | "category">; size?: number }) {
  if (entry.kind === "study") return <GraduationCap size={size} className="shrink-0 text-accent" />;
  if (entry.kind === "revise") return <BookMarked size={size} className="shrink-0 text-accent/70" />;
  const Icon = categoryMeta(entry.category).icon;
  return <Icon size={size} className="shrink-0 text-life" />;
}

/** One planned activity. Study entries open their ticket; the menu moves it to another slot. */
export function EntryRow({
  entry,
  saturday,
  draggable,
  compact,
}: {
  entry: PlanEntry;
  saturday: string;
  draggable?: boolean;
  compact?: boolean;
}) {
  const { openItem } = useActions();
  const { update, remove } = usePlanMutations();
  const drag = useDraggable({ id: `entry-${entry.id}`, data: { entry }, disabled: !draggable });
  const sunday = addDays(saturday, 1);
  const moveTargets = [saturday, sunday].flatMap((day) =>
    SLOTS.filter((s) => !(day === entry.day && s.value === entry.slot)).map((s) => ({
      label: `${dayName(day)} ${s.label.toLowerCase()}`,
      onClick: () => update.mutate({ id: entry.id, day, slot: s.value }),
    })),
  );
  const done = !!entry.done;
  return (
    <div
      ref={drag.setNodeRef}
      {...(draggable ? { ...drag.listeners, ...drag.attributes } : {})}
      className={clsx(
        "group flex min-h-9 items-center gap-2.5 rounded-md px-2 text-[13px] outline-none transition-colors hover:bg-surface-2",
        draggable && "cursor-grab touch-manipulation active:cursor-grabbing",
        drag.isDragging && "opacity-30",
      )}
    >
      <span onPointerDown={(e) => e.stopPropagation()}>
        <Checkbox checked={done} onChange={(v) => update.mutate({ id: entry.id, done: v })} />
      </span>
      <KindIcon entry={entry} />
      <button
        type="button"
        onPointerDown={(e) => entry.item_id && e.stopPropagation()}
        onClick={() => entry.item_id && openItem(entry.item_id)}
        className={clsx(
          "min-w-0 flex-1 truncate text-left",
          done && "text-fg-3",
          entry.item_id ? "hover:underline" : "cursor-[inherit]",
        )}
        title={entry.title}
      >
        {entry.title}
      </button>
      {entry.item_key && !compact && <span className="shrink-0 font-mono text-[11px] text-fg-3">{entry.item_key}</span>}
      {!compact && (
        <span
          onPointerDown={(e) => e.stopPropagation()}
          className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
        >
          <Menu
            trigger={
              <button className="flex size-6 items-center justify-center rounded text-fg-3 hover:bg-surface-3 hover:text-fg" title="More">
                <MoreHorizontal size={14} />
              </button>
            }
            items={[
              ...moveTargets.map((t) => ({ ...t, icon: <ArrowRightLeft size={13} className="text-fg-3" /> })),
              { label: "Remove from plan", icon: <Trash2 size={13} />, danger: true, onClick: () => remove.mutate(entry.id) },
            ]}
          />
        </span>
      )}
    </div>
  );
}

/** Category picker as small pills. */
export function CategoryPills({ value, onChange }: { value: LifeCategory; onChange: (c: LifeCategory) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          className={clsx(
            "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            value === c.value ? "border-life/50 bg-life-soft text-fg" : "border-line text-fg-2 hover:bg-surface-2 hover:text-fg",
          )}
        >
          <c.icon size={13} className={value === c.value ? "text-life" : ""} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

type AddTab = "life" | "study" | "revise";

/** Add something to one slot: a life activity (typed or from ideas), a ticket to study, or a topic to revise. */
export function AddActivityModal({
  target,
  onClose,
}: {
  target: { day: string; slot: WeekendSlot } | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<AddTab>("life");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LifeCategory>("other");
  const [q, setQ] = useState("");
  const { add } = usePlanMutations();
  const ideas = useIdeas();
  const items = useQuery({ queryKey: ["items", "all"], queryFn: () => api.get<Item[]>("/items"), enabled: !!target });
  const revisions = useRevisions();

  const close = () => {
    setTitle("");
    setQ("");
    setCategory("other");
    onClose();
  };
  const put = (body: Record<string, unknown>) =>
    target && add.mutate({ ...target, ...body }, { onSuccess: close });

  const match = (s: string) => s.toLowerCase().includes(q.trim().toLowerCase());
  const openIdeas = (ideas.data ?? []).filter((i) => !i.done_at && match(i.title));
  const study = (items.data ?? [])
    .filter((i) => i.status !== "done" && match(`${i.key} ${i.title}`))
    .sort((a, b) => Number(b.type === "learning") - Number(a.type === "learning"));
  const topics = (revisions.data ?? []).filter((r) => r.status === "active" && match(r.title));

  const slotLabel = target ? `${dayName(target.day)} ${SLOTS.find((s) => s.value === target.slot)!.label.toLowerCase()}` : "";
  const pick = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2";

  return (
    <Modal open={!!target} onClose={close} title={`Add to ${slotLabel}`} width="max-w-lg">
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setQ("");
        }}
        tabs={[
          { value: "life", label: "Life" },
          { value: "study", label: "Study" },
          { value: "revise", label: "Revise" },
        ]}
        className="mb-4"
      />

      {tab === "life" && (
        <div className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) put({ kind: "life", title, category });
            }}
          >
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What will you do? e.g. Trek to Rajmachi" />
            <CategoryPills value={category} onChange={setCategory} />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={!title.trim() || add.isPending}>
                Add
              </Button>
            </div>
          </form>
          {(ideas.data ?? []).some((i) => !i.done_at) && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-3">Or pick from your ideas</p>
              <div className="max-h-56 overflow-y-auto rounded-md border border-line p-1">
                {openIdeas.map((i) => {
                  const Icon = categoryMeta(i.category).icon;
                  return (
                    <button key={i.id} className={pick} onClick={() => put({ idea_id: i.id })}>
                      <Icon size={14} className="shrink-0 text-life" />
                      <span className="min-w-0 flex-1 truncate">{i.title}</span>
                      {i.planned_day && <span className="text-[11px] text-fg-3">planned {fmtDate(i.planned_day, { weekday: "short" })}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab !== "life" && (
        <div className="space-y-2">
          <Input
            autoFocus
            icon={<Search size={14} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "study" ? "Find an open ticket" : "Find a Revisit topic"}
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-line p-1">
            {tab === "study" &&
              (study.length ? (
                study.map((i) => (
                  <button key={i.id} className={pick} onClick={() => put({ item_id: i.id })}>
                    <ItemIcon item={i} size={14} />
                    <span className="shrink-0 font-mono text-[11px] text-fg-3">{i.key}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    {i.priority !== "none" && <PriorityIcon priority={i.priority} size={13} />}
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-[13px] text-fg-3">No open tickets match</p>
              ))}
            {tab === "revise" &&
              (topics.length ? (
                topics.map((r) => (
                  <button key={r.id} className={pick} onClick={() => put({ revision_id: r.id })}>
                    <BookMarked size={14} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.priority !== "none" && <PriorityIcon priority={r.priority} size={13} />}
                  </button>
                ))
              ) : (
                <p className="py-6 text-center text-[13px] text-fg-3">No Revisit topics match</p>
              ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Dashboard panel on Saturday and Sunday: today's slots at a glance. */
export function WeekendTodayPanel({ action }: { action?: ReactNode }) {
  const today = todayIso();
  const { data: wk } = useWeekend(today);
  if (!wk) return null;
  const entries = wk.entries.filter((e) => e.day === today);
  const done = entries.filter((e) => e.done).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex h-12 items-center gap-2 border-b border-line px-5">
        <h3 className="text-[14px] font-medium">{dayName(today)} plan</h3>
        {entries.length > 0 && (
          <span className="text-xs tabular-nums text-fg-3">
            · {done}/{entries.length} done
          </span>
        )}
        <div className="flex-1" />
        {action}
      </div>
      <div className="grid divide-line md:grid-cols-3 md:divide-x max-md:divide-y">
        {SLOTS.map((s) => {
          const list = entries.filter((e) => e.slot === s.value);
          return (
            <div key={s.value} className="px-3 py-3">
              <p className="mb-1 flex items-center gap-2 px-2 text-xs font-medium text-fg-3">
                <s.icon size={13} /> {s.label}
              </p>
              {list.map((e) => (
                <EntryRow key={e.id} entry={e} saturday={wk.saturday} compact />
              ))}
              {!list.length && <p className="flex h-9 items-center px-2 text-[13px] text-fg-3/70">Free</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
