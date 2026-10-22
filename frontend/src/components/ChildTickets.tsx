/** Child tickets, Jira style: an item can own other tickets, one level deep, and each shows its parent. */
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CornerDownRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { api, type Item } from "../lib/api";
import { useRefreshItems, useUpdateItem } from "../lib/hooks";
import { STATUSES, StatusIcon } from "../lib/meta";
import { useActions } from "./Layout";
import { Select, useToast } from "./ui";

export function ChildTickets({ item }: { item: Item }) {
  const { openItem } = useActions();
  const refresh = useRefreshItems();
  const update = useUpdateItem();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const children = item.children ?? [];
  const add = useMutation({
    mutationFn: () =>
      api.post<Item>("/items", { project_id: item.project_id, title: title.trim(), parent_id: item.id, type: "task", status: "backlog" }),
    onSuccess: (c) => {
      setTitle("");
      refresh();
      toast(`${c.key} added as a child of ${item.key}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // A child ticket cannot have children of its own.
  if (item.parent_key) return null;
  const pct = children.length ? Math.round((item.child_done / item.child_count) * 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">Child tickets</h3>
        {children.length > 0 && (
          <span className="flex items-center gap-2 text-xs text-fg-3">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
            </span>
            {item.child_done}/{item.child_count} done
          </span>
        )}
      </div>
      <div className="space-y-px">
        {children.map((c) => (
          <div
            key={c.id}
            onClick={() => openItem(c.id)}
            className="group -mx-2 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
          >
            <StatusIcon status={c.status} />
            <span className="shrink-0 font-mono text-xs text-fg-3">{c.key}</span>
            <span className={clsx("min-w-0 flex-1 truncate text-[13px]", c.status === "done" && "text-fg-3 line-through")}>{c.title}</span>
            <span className="shrink-0 text-xs text-fg-3">{STATUSES.find((s) => s.value === c.status)?.label}</span>
            <button
              title="Remove from this ticket (the child ticket stays)"
              className="text-fg-3 opacity-0 hover:text-critical group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                update.mutate({ id: c.id, parent_id: null });
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) add.mutate();
          }}
        >
          <Plus size={14} className="text-fg-3" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add child ticket"
            className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
          />
        </form>
      </div>
    </div>
  );
}

/** "Parent" in the drawer's side panel: link this ticket under another one, or unlink it. */
export function ParentPicker({ item }: { item: Item }) {
  const update = useUpdateItem();
  const { data: all = [] } = useQuery({ queryKey: ["items", "parent-options"], queryFn: () => api.get<Item[]>("/items") });
  if (item.child_count > 0) return <p className="px-2.5 py-1.5 text-[13px] text-fg-3">Has child tickets</p>;
  const options = all.filter((i) => i.id !== item.id && !i.parent_key && (i.status !== "done" || i.id === item.parent_id));
  return (
    <Select
      icon={<CornerDownRight size={14} />}
      value={item.parent_key ? item.parent_id! : ""}
      onChange={(e) => update.mutate({ id: item.id, parent_id: e.target.value ? Number(e.target.value) : null })}
    >
      <option value="">None</option>
      {options.map((i) => (
        <option key={i.id} value={i.id}>
          {i.key} · {i.title.length > 40 ? `${i.title.slice(0, 40)}…` : i.title}
        </option>
      ))}
    </Select>
  );
}
