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
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronDown, Filter, Plus, Search, Settings2, SquareKanban, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ItemCard } from "../components/ItemCard";
import { FilterPanel, applyFilters, emptyFilters, type Filters } from "../components/FilterPanel";
import { useActions } from "../components/Layout";
import { DeleteProjectModal, ProjectModal } from "../components/ProjectModal";
import { Button, IconButton, Input, Menu, PageHeader } from "../components/ui";
import { api, type Item, type Status } from "../lib/api";
import { useLocalState, useProjects, useUpdateItem } from "../lib/hooks";
import { STATUSES, StatusIcon, fmtMinutes } from "../lib/meta";

function DraggableCard({ item }: { item: Item }) {
  const { openItem } = useActions();
  const drag = useDraggable({ id: `item-${item.id}`, data: { item } });
  const drop = useDroppable({ id: `before-${item.id}`, data: { item } });
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      {...drag.listeners}
      {...drag.attributes}
      className={clsx(
        "touch-manipulation outline-none",
        drag.isDragging && "opacity-30",
        drop.isOver && !drag.isDragging && "border-t-2 border-accent pt-1",
      )}
    >
      <ItemCard item={item} onOpen={() => openItem(item.id)} />
    </div>
  );
}

// How far back the Done column looks, like Jira's "completed issues" window.
type DoneRange = "7" | "30" | "all";
const DONE_RANGES: { value: DoneRange; label: string; short: string }[] = [
  { value: "7", label: "Last 7 days", short: "7 days" },
  { value: "30", label: "Last 30 days", short: "30 days" },
  { value: "all", label: "Lifetime", short: "Lifetime" },
];

function DoneRangeMenu({ value, onChange }: { value: DoneRange; onChange: (v: DoneRange) => void }) {
  const current = DONE_RANGES.find((r) => r.value === value)!;
  return (
    <Menu
      trigger={
        <button
          title="Show done items completed in…"
          className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {current.short}
          <ChevronDown size={12} />
        </button>
      }
      items={DONE_RANGES.map((r) => ({
        label: (
          <span className="flex w-full items-center justify-between">
            {r.label}
            {r.value === value && <Check size={13} className="text-accent" />}
          </span>
        ),
        onClick: () => onChange(r.value),
      }))}
    />
  );
}

function Column({
  status,
  items,
  extra,
  footer,
}: {
  status: Status;
  items: Item[];
  extra?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const meta = STATUSES.find((s) => s.value === status)!;
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { status } });
  const { newItem } = useActions();
  const minutes = items.reduce((s, i) => s + i.logged_minutes, 0);
  return (
    <div className="flex w-[300px] shrink-0 flex-col md:w-auto md:min-w-[240px] md:flex-1">
      <div className="mb-2 flex h-9 items-center gap-2 px-1">
        <StatusIcon status={status} size={15} />
        <span className="text-[14px] font-medium">{meta.label}</span>
        <span className="font-mono text-xs text-fg-3">{items.length}</span>
        {minutes > 0 && <span className="truncate whitespace-nowrap text-xs text-fg-3">· {fmtMinutes(minutes)}</span>}
        <div className="flex-1" />
        {extra}
        <button onClick={() => newItem({ status })} className="rounded p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" title="Add item">
          <Plus size={15} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={clsx(
          "flex min-h-40 flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2/50",
        )}
      >
        {items.map((i) => (
          <DraggableCard key={i.id} item={i} />
        ))}
        {footer}
      </div>
    </div>
  );
}

export default function Board() {
  const { data: items = [] } = useQuery({ queryKey: ["items", "all"], queryFn: () => api.get<Item[]>("/items") });
  const { data: projects = [] } = useProjects();
  const [params, setParams] = useSearchParams();
  const [stored, setFilters] = useLocalState<Filters>("smriti-board-filters", emptyFilters);
  const [showFilters, setShowFilters] = useLocalState("smriti-board-filter-panel", true);
  const [text, setText] = useState("");
  const [active, setActive] = useState<Item | null>(null);
  const [editProject, setEditProject] = useState(false);
  const [deleteProject, setDeleteProject] = useState(false);
  const [doneRange, setDoneRange] = useLocalState<DoneRange>("smriti-done-range", "7");
  const update = useUpdateItem();
  const qc = useQueryClient();
  const { newItem } = useActions();

  const projectParam = Number(params.get("project")) || null;
  const filters: Filters = projectParam ? { ...stored, project: [projectParam] } : stored;
  const setAll = (f: Filters) => {
    if (projectParam)
      setParams((p) => {
        p.delete("project");
        return p;
      });
    setFilters(f);
  };
  const project = projects.find((p) => p.id === projectParam);
  const labels = useMemo(() => [...new Set(items.flatMap((i) => i.labels))].sort(), [items]);

  const visible = applyFilters(items, { ...filters, status: [] }, text);
  // The Done column only shows items completed within the chosen window (7 days by default).
  const cutoff = doneRange === "all" ? 0 : Date.now() - Number(doneRange) * 86_400_000;
  const isOldDone = (i: Item) => i.status === "done" && !!i.completed_at && new Date(i.completed_at).getTime() < cutoff;
  const hiddenDone = visible.filter(isOldDone).length;
  const byStatus = (s: Status) =>
    visible
      .filter((i) => i.status === s && !isOldDone(i))
      .sort((a, b) => a.position - b.position);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const item = e.active.data.current?.item as Item | undefined;
    if (!item || !e.over) return;
    let status: Status;
    let position: number;
    const target = e.over.data.current as { status?: Status; item?: Item };
    if (target.item) {
      if (target.item.id === item.id) return;
      status = target.item.status;
      const col = byStatus(status).filter((i) => i.id !== item.id);
      const idx = col.findIndex((i) => i.id === target.item!.id);
      const prev = col[idx - 1]?.position ?? target.item.position - 1000;
      position = (prev + target.item.position) / 2;
    } else {
      status = target.status!;
      const col = byStatus(status).filter((i) => i.id !== item.id);
      position = (col[col.length - 1]?.position ?? 0) + 1000;
    }
    // optimistic move
    qc.setQueryData<Item[]>(["items", "all"], (old) =>
      old?.map((i) => (i.id === item.id ? { ...i, status, position } : i)),
    );
    update.mutate({ id: item.id, status, position });
  };

  return (
    <div className="flex h-full">
      {showFilters && (
        <div className="hidden lg:block">
          <FilterPanel
            filters={filters}
            setFilters={setAll}
            projects={projects}
            labels={labels}
            showStatus={false}
            onClose={() => setShowFilters(false)}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          quotes="board"
          icon={<SquareKanban size={18} />}
          title={project ? `${project.name} board` : "Board"}
          actions={
            <>
              {project && (
                <>
                  <IconButton tone="danger" title="Delete project" onClick={() => setDeleteProject(true)}>
                    <Trash2 size={15} />
                  </IconButton>
                  <Button icon={<Settings2 size={14} />} onClick={() => setEditProject(true)}>
                    Edit project
                  </Button>
                </>
              )}
              {!showFilters && (
                <Button className="hidden lg:inline-flex" icon={<Filter size={14} />} onClick={() => setShowFilters(true)}>
                  Filters
                </Button>
              )}
              <Input
                icon={<Search size={14} />}
                placeholder="Filter by title or key"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-56"
              />
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => newItem({ project_id: projectParam ?? undefined })}>
                New
              </Button>
            </>
          }
        />
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActive((e.active.data.current?.item as Item) ?? null)}
          onDragCancel={() => setActive(null)}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:px-6 lg:px-8">
            {STATUSES.map((s) => (
              <Column
                key={s.value}
                status={s.value}
                items={byStatus(s.value)}
                extra={s.value === "done" && <DoneRangeMenu value={doneRange} onChange={setDoneRange} />}
                footer={
                  s.value === "done" &&
                  hiddenDone > 0 && (
                    <p className="mt-1 py-1.5 text-center text-xs text-fg-3">
                      {hiddenDone} older {hiddenDone === 1 ? "item" : "items"} hidden
                    </p>
                  )
                }
              />
            ))}
          </div>
          <DragOverlay>{active && <ItemCard item={active} onOpen={() => {}} dragging />}</DragOverlay>
        </DndContext>
        <ProjectModal open={editProject} project={project} onClose={() => setEditProject(false)} />
        <DeleteProjectModal
          project={deleteProject ? project ?? null : null}
          onClose={() => setDeleteProject(false)}
          onDeleted={() => setAll({ ...stored, project: [] })}
        />
      </div>
    </div>
  );
}
