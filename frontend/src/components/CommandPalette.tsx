import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BookOpen,
  CalendarCheck,
  CornerDownLeft,
  FileBarChart,
  LayoutDashboard,
  ListTodo,
  Radar,
  BookMarked,
  MessageSquare,
  Plus,
  Search,
  Settings,
  SquareKanban,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, type Jot, type SearchHit } from "../lib/api";
import { StatusIcon, TypeIcon } from "../lib/meta";
import { useActions } from "./Layout";
import { Kbd } from "./ui";

type Entry = { id: string; icon: ReactNode; label: ReactNode; hint?: ReactNode; run: () => void };

function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <span className="truncate text-xs text-fg-3">
      {parts.map((p, i) =>
        p.startsWith("[") ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          p
        ),
      )}
    </span>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const { openItem, newItem, quickNote, addRevision } = useActions();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const { data: hits = [] } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get<SearchHit[]>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 0,
  });

  const { data: jotHits = [] } = useQuery({
    queryKey: ["jots", "search", debounced],
    queryFn: () => api.get<Jot[]>(`/jots?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length > 1,
  });

  const entries: Entry[] = useMemo(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const pages: Entry[] = [
      { id: "new", icon: <Plus size={15} />, label: "New work item", hint: <Kbd>C</Kbd>, run: () => (onClose(), newItem()) },
      { id: "note", icon: <Radar size={15} />, label: "Add topic to Radar", hint: <Kbd>N</Kbd>, run: () => (onClose(), quickNote()) },
      { id: "revise", icon: <BookMarked size={15} />, label: "Add to Revisit", hint: <Kbd>R</Kbd>, run: () => (onClose(), addRevision()) },
      {
        id: "new-learning",
        icon: <BookOpen size={15} />,
        label: "Save a video or link",
        run: () => (onClose(), newItem({ type: "learning" })),
      },
      { id: "p-dash", icon: <LayoutDashboard size={15} />, label: "Go to Dashboard", run: go("/") },
      { id: "p-board", icon: <SquareKanban size={15} />, label: "Go to Board", run: go("/board") },
      { id: "p-radar", icon: <Radar size={15} />, label: "Go to Radar", run: go("/radar") },
      { id: "p-today", icon: <CalendarCheck size={15} />, label: "Go to Today", run: go("/today") },
      { id: "p-list", icon: <ListTodo size={15} />, label: "Go to All items", run: go("/list") },
      { id: "p-learn", icon: <BookOpen size={15} />, label: "Go to Learning", run: go("/learning") },
      { id: "p-revise", icon: <BookMarked size={15} />, label: "Go to Revisit", run: go("/revisit") },
      { id: "p-rep", icon: <FileBarChart size={15} />, label: "Go to Weekly report", run: go("/reports") },
      { id: "p-set", icon: <Settings size={15} />, label: "Go to Settings", run: go("/settings") },
    ];
    const s = q.trim().toLowerCase();
    const filteredPages = s ? pages.filter((p) => String(p.label).toLowerCase().includes(s)) : pages;
    const results: Entry[] = s
      ? hits.map((h) => ({
          id: `i${h.id}`,
          icon: <TypeIcon type={h.type} size={15} />,
          label: (
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 truncate">
                <span className="font-mono text-xs text-fg-3">{h.key}</span>
                <span className="truncate">{h.title}</span>
              </span>
              {h.snippet && (
                <span className="flex items-center gap-1">
                  {h.match === "comment" && <MessageSquare size={11} className="shrink-0 text-fg-3" />}
                  <Snippet text={h.snippet} />
                </span>
              )}
            </span>
          ),
          hint: <StatusIcon status={h.status} />,
          run: () => (onClose(), openItem(h.id)),
        }))
      : [];
    const notes: Entry[] = s
      ? jotHits.slice(0, 6).map((j) => ({
          id: `j${j.id}`,
          icon: <Radar size={15} />,
          label: (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{j.body}</span>
              <span className="text-xs text-fg-3">
                Radar topic{j.status === "converted" && j.item_key ? ` · ticket ${j.item_key}` : j.status === "archived" ? " · dismissed" : ""}
              </span>
            </span>
          ),
          run: () => (j.status === "converted" && j.item_id && !j.item_deleted ? openItem(j.item_id) : go("/radar")()),
        }))
      : [];
    return [...results, ...notes, ...filteredPages];
  }, [q, hits, jotHits, navigate, onClose, openItem, newItem, quickNote, addRevision]);

  useEffect(() => setSel(0), [entries.length]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="anim-fade fixed inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div className="anim-pop relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow)]">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") entries[sel]?.run();
            }}
            placeholder="Search titles, notes, comments, or a key like LRN-12"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {entries.length === 0 && <p className="py-8 text-center text-sm text-fg-3">No results</p>}
          {entries.map((e, i) => (
            <button
              key={e.id}
              onMouseEnter={() => setSel(i)}
              onClick={e.run}
              className={clsx(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px]",
                i === sel ? "bg-surface-3" : "",
              )}
            >
              <span className="shrink-0 text-fg-2">{e.icon}</span>
              <span className="min-w-0 flex-1">{e.label}</span>
              {i === sel ? <CornerDownLeft size={13} className="text-fg-3" /> : e.hint}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
