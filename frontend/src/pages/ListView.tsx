import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Filter, ListTodo, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterPanel, applyFilters, emptyFilters, type Filters } from "../components/FilterPanel";
import { PendingBadge } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { Button, Card, Empty, Input, PageHeader } from "../components/ui";
import { api, type Item } from "../lib/api";
import { useLocalState, useProjects } from "../lib/hooks";
import { PRIORITIES, PriorityIcon, StatusIcon, TypeIcon, dueTone, fmtDate, fmtMinutes, pendingDays, statusMeta } from "../lib/meta";

type SortKey = "key" | "title" | "status" | "priority" | "due_date" | "logged" | "pending" | "updated_at";

const sorters: Record<SortKey, (a: Item, b: Item) => number> = {
  key: (a, b) => a.id - b.id,
  title: (a, b) => a.title.localeCompare(b.title),
  status: (a, b) => a.status.localeCompare(b.status),
  priority: (a, b) =>
    PRIORITIES.findIndex((p) => p.value === a.priority) - PRIORITIES.findIndex((p) => p.value === b.priority),
  due_date: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  logged: (a, b) => a.logged_minutes - b.logged_minutes,
  pending: (a, b) => (pendingDays(a) ?? -1) - (pendingDays(b) ?? -1),
  updated_at: (a, b) => a.updated_at.localeCompare(b.updated_at),
};

export default function ListView() {
  const { data: items = [] } = useQuery({ queryKey: ["items", "all"], queryFn: () => api.get<Item[]>("/items") });
  const { data: projects = [] } = useProjects();
  const { openItem } = useActions();
  const [filters, setFilters] = useLocalState<Filters>("smriti-list-filters", emptyFilters);
  const [showFilters, setShowFilters] = useLocalState("smriti-list-filter-panel", true);
  const [sort, setSort] = useLocalState<{ key: SortKey; desc: boolean }>("smriti-list-sort", { key: "updated_at", desc: true });
  const [text, setText] = useState("");
  const labels = useMemo(() => [...new Set(items.flatMap((i) => i.labels))].sort(), [items]);

  const rows = applyFilters(items, filters, text).sort((a, b) => (sort.desc ? -1 : 1) * sorters[sort.key](a, b));

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={clsx("px-3 py-2.5 text-left font-medium", className)}>
      <button
        onClick={() => setSort({ key: k, desc: sort.key === k ? !sort.desc : true })}
        className="inline-flex items-center gap-1 hover:text-fg"
      >
        {children}
        {sort.key === k && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="flex h-full">
      {showFilters && (
        <div className="hidden lg:block">
          <FilterPanel filters={filters} setFilters={setFilters} projects={projects} labels={labels} onClose={() => setShowFilters(false)} />
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto pb-10">
        <PageHeader
          icon={<ListTodo size={18} />}
          title="All items"
          actions={
            <>
              {!showFilters && (
                <Button className="hidden lg:inline-flex" icon={<Filter size={14} />} onClick={() => setShowFilters(true)}>
                  Filters
                </Button>
              )}
              <Input icon={<Search size={14} />} placeholder="Filter by title or key" value={text} onChange={(e) => setText(e.target.value)} className="w-56" />
            </>
          }
        />
        <div className="px-4 md:px-6 lg:px-8">
          <Card className="overflow-x-auto">
            {rows.length === 0 ? (
              <Empty icon={<ListTodo size={28} />} title="No items match" hint="Change the filters or press C to add an item." />
            ) : (
              <table className="w-full min-w-[820px] text-[13px]">
                <thead className="border-b border-line text-xs text-fg-3">
                  <tr>
                    <Th k="key" className="w-28">Key</Th>
                    <Th k="title">Title</Th>
                    <Th k="status" className="w-32">Status</Th>
                    <Th k="priority" className="w-20">Priority</Th>
                    <Th k="due_date" className="w-24">Due</Th>
                    <Th k="logged" className="w-28">Logged</Th>
                    <Th k="pending" className="w-24">Pending</Th>
                    <Th k="updated_at" className="w-28">Updated</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((i) => (
                    <tr key={i.id} onClick={() => openItem(i.id)} className="cursor-pointer hover:bg-surface-2">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <TypeIcon type={i.type} />
                          <span className="font-mono text-xs text-fg-2">{i.key}</span>
                        </span>
                      </td>
                      <td className="max-w-0 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{i.title}</span>
                          {i.labels.map((l) => (
                            <span key={l} className="shrink-0 rounded border border-line px-1.5 text-[11px] text-fg-3">{l}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2 text-fg-2">
                          <StatusIcon status={i.status} /> {statusMeta(i.status).label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><PriorityIcon priority={i.priority} /></td>
                      <td className={clsx("px-3 py-2.5", dueTone(i))}>{fmtDate(i.due_date)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-fg-2">
                        {fmtMinutes(i.logged_minutes)}
                        {i.estimate_minutes ? <span className="text-fg-3"> / {fmtMinutes(i.estimate_minutes)}</span> : null}
                      </td>
                      <td className="px-3 py-2.5"><PendingBadge item={i} /></td>
                      <td className="px-3 py-2.5 text-fg-3">{fmtDate(i.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <p className="mt-2 text-xs text-fg-3">{rows.length} items</p>
        </div>
      </div>
    </div>
  );
}
