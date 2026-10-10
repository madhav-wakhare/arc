import clsx from "clsx";
import { ChevronDown, PanelLeftClose } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ItemType, Priority, Project, Status } from "../lib/api";
import { PRIORITIES, STATUSES, TYPES } from "../lib/meta";
import { Checkbox, IconButton } from "./ui";
import { ProjectIcon } from "../lib/projectIcons";

export type Filters = {
  status: Status[];
  type: ItemType[];
  priority: Priority[];
  project: number[];
  label: string[];
};
export const emptyFilters: Filters = { status: [], type: [], priority: [], project: [], label: [] };

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex h-10 w-full items-center gap-2 px-1 text-[14px] font-medium">
        <ChevronDown size={15} className={clsx("transition-transform", !open && "-rotate-90")} />
        {title}
      </button>
      {open && <div className="divide-y divide-line overflow-hidden rounded-md border border-line">{children}</div>}
    </div>
  );
}

function Option({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      className="h-10 bg-surface px-3 text-[14px] hover:bg-surface-2"
      label={<span className="flex items-center gap-2">{children}</span>}
    />
  );
}

export function FilterPanel({
  filters,
  setFilters,
  projects,
  labels,
  showStatus = true,
  onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  projects: Project[];
  labels: string[];
  showStatus?: boolean;
  onClose: () => void;
}) {
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K][number], on: boolean) => {
    const cur = filters[key] as Filters[K][number][];
    setFilters({ ...filters, [key]: on ? [...cur, value] : cur.filter((v) => v !== value) });
  };
  const count = Object.values(filters).reduce((s, v) => s + v.length, 0);

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <span className="text-[15px] font-medium">Filters</span>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <button onClick={() => setFilters(emptyFilters)} className="text-xs text-fg-3 hover:text-fg">
              Clear ({count})
            </button>
          )}
          <IconButton onClick={onClose} title="Hide filters">
            <PanelLeftClose size={16} />
          </IconButton>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {showStatus && (
          <Group title="Status">
            {STATUSES.map((s) => (
              <Option key={s.value} checked={filters.status.includes(s.value)} onChange={(v) => toggle("status", s.value, v)}>
                <s.icon size={14} className={s.tone} /> {s.label}
              </Option>
            ))}
          </Group>
        )}
        <Group title="Type">
          {TYPES.map((s) => (
            <Option key={s.value} checked={filters.type.includes(s.value)} onChange={(v) => toggle("type", s.value, v)}>
              <s.icon size={14} className={s.tone} /> {s.label}
            </Option>
          ))}
        </Group>
        <Group title="Priority">
          {PRIORITIES.map((s) => (
            <Option key={s.value} checked={filters.priority.includes(s.value)} onChange={(v) => toggle("priority", s.value, v)}>
              <s.icon size={14} className={s.tone} /> {s.label}
            </Option>
          ))}
        </Group>
        <Group title="Projects">
          {projects.map((p) => (
            <Option key={p.id} checked={filters.project.includes(p.id)} onChange={(v) => toggle("project", p.id, v)}>
              <ProjectIcon icon={p.icon} size={14} /> {p.name}
            </Option>
          ))}
        </Group>
        {labels.length > 0 && (
          <Group title="Labels" defaultOpen={false}>
            {labels.map((l) => (
              <Option key={l} checked={filters.label.includes(l)} onChange={(v) => toggle("label", l, v)}>
                {l}
              </Option>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

export function applyFilters<T extends { status: Status; type: ItemType; priority: Priority; project_id: number; labels: string[]; title: string; key: string }>(
  items: T[],
  f: Filters,
  text = "",
): T[] {
  const q = text.trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.status.length || f.status.includes(i.status)) &&
      (!f.type.length || f.type.includes(i.type)) &&
      (!f.priority.length || f.priority.includes(i.priority)) &&
      (!f.project.length || f.project.includes(i.project_id)) &&
      (!f.label.length || f.label.some((l) => i.labels.includes(l))) &&
      (!q || i.title.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)),
  );
}
