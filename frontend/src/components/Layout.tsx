import clsx from "clsx";
import {
  BookOpen,
  CalendarCheck,
  CalendarHeart,
  ChevronDown,
  FileBarChart,
  LayoutDashboard,
  Radar as RadarIcon,
  BookMarked,
  ListTodo,
  CirclePlus,
  Menu,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Settings as SettingsIcon,
  Square,
  Trash2,
  Quote as QuoteIcon,
  SquareKanban,
  Sun,
} from "lucide-react";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ItemType, type Quote, type Status } from "../lib/api";
import { useJots, useRevisions, useLocalState, useNow, useProjects, useRefreshItems, useSettings, useTimer, useTrash } from "../lib/hooks";
import { AddTopicModal } from "./Jots";
import { AddRevisionModal } from "./Revise";
import { CommandPalette } from "./CommandPalette";
import { ItemDrawer } from "./ItemDrawer";
import { NewItemModal } from "./NewItemModal";
import { ProjectModal } from "./ProjectModal";
import { IconButton, Kbd } from "./ui";
import { ProjectIcon } from "../lib/projectIcons";

export type NewItemDefaults = { type?: ItemType; status?: Status; project_id?: number; url?: string };

type Actions = {
  openItem: (id: number) => void;
  newItem: (defaults?: NewItemDefaults) => void;
  openSearch: () => void;
  quickNote: () => void;
  addRevision: () => void;
};
const ActionsCtx = createContext<Actions>({
  openItem: () => {},
  newItem: () => {},
  openSearch: () => {},
  quickNote: () => {},
  addRevision: () => {},
});
export const useActions = () => useContext(ActionsCtx);

// Sidebar order chosen by the user: Board 2nd, Radar 3rd.
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/board", label: "Board", icon: SquareKanban },
  { to: "/radar", label: "Radar", icon: RadarIcon },
  { to: "/today", label: "Today", icon: CalendarCheck },
  { to: "/list", label: "All items", icon: ListTodo },
  { to: "/learning", label: "Learning", icon: BookOpen },
  { to: "/revisit", label: "Revisit", icon: BookMarked },
  { to: "/reports", label: "Weekly report", icon: FileBarChart },
  { to: "/weekend", label: "Weekend", icon: CalendarHeart, weekendOnly: true },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111111" : "#ffffff");
    try {
      localStorage.setItem("smriti-theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

// Arc mark: three rounded bars that rise and fall like an arc ("rainbow steps").
// They grow up from the baseline one after another on load; on hover an accent shimmer runs
// across them. (Earlier marks are in git: the Smriti "S" at tag smriti-final, the stepped "A" at arc-v1.)
const LOGO_BLOCKS = [
  { x: 4, y: 18, w: 6, h: 10 },
  { x: 11, y: 11, w: 10, h: 17 },
  { x: 22, y: 18, w: 6, h: 10 },
];

/**
 * Each bar is a <g> (build-in) around a <rect> (shimmer), so the two animations never restart
 * each other. See .logo-mark in index.css.
 */
function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="logo-mark flex items-center gap-2.5">
      <svg viewBox="2 5.5 28 28" className="size-7 shrink-0 overflow-visible" fill="var(--fg)" aria-hidden>
        {LOGO_BLOCKS.map((b, i) => (
          <g key={i} className="logo-block" style={{ "--i": i } as CSSProperties}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" />
          </g>
        ))}
      </svg>
      {!compact && <span className="logo-word text-[22px] font-medium tracking-tight">Arc</span>}
    </div>
  );
}

function RunningTimer({ compact }: { compact: boolean }) {
  const { data: timer } = useTimer();
  const now = useNow();
  const refresh = useRefreshItems();
  const { openItem } = useActions();
  const stop = useMutation({ mutationFn: () => api.post("/timer/stop"), onSuccess: refresh });
  if (!timer) return null;
  const secs = Math.max(0, Math.floor((now - new Date(timer.started_at).getTime()) / 1000));
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const clock = `${hh ? hh + ":" : ""}${mm}:${ss}`;
  if (compact)
    return (
      <IconButton title={`Stop timer ${timer.key}`} onClick={() => stop.mutate()} className="mx-auto text-accent">
        <Square size={14} fill="currentColor" />
      </IconButton>
    );
  return (
    <div className="mx-3 mb-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-fg-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          Timer running
        </span>
        <span className="font-mono text-sm tabular-nums">{clock}</span>
      </div>
      <button onClick={() => openItem(timer.item_id)} className="mt-2 block w-full truncate text-left text-[13px] hover:underline">
        <span className="font-mono text-fg-3">{timer.key}</span> {timer.title}
      </button>
      <button
        onClick={() => stop.mutate()}
        className="mt-2.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-line text-xs font-medium hover:bg-surface-2"
      >
        <Square size={11} fill="currentColor" /> Stop and log time
      </button>
    </div>
  );
}

function Sidebar({ compact, onToggle, onNavigate }: { compact: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const { data: projects } = useProjects();
  const { data: settings } = useSettings();
  const { data: trash } = useTrash();
  const { data: quotes } = useQuery({ queryKey: ["quotes"], queryFn: () => api.get<Quote[]>("/quotes") });
  const quoteCount = quotes?.length ?? 0;
  const trashCount = (trash?.items.filter((i) => !i.deleted_with_project).length ?? 0) + (trash?.projects.length ?? 0);
  const { openSearch, newItem, quickNote } = useActions();
  const { data: jots } = useJots();
  const inboxCount = jots?.filter((j) => j.status === "open").length ?? 0;
  const { data: revisions } = useRevisions();
  const counts: Record<string, number> = {
    "/radar": inboxCount,
    "/revisit": revisions?.filter((r) => r.status === "active").length ?? 0,
  };
  const [theme, toggleTheme] = useTheme();
  const [groupOpen, setGroupOpen] = useLocalState("smriti-nav-open", true);
  const [newProject, setNewProject] = useState(false);
  const [params] = useSearchParams();
  const loc = useLocation();
  const activeProject = loc.pathname === "/board" ? params.get("project") : null;
  const isMac = navigator.platform.toLowerCase().includes("mac");

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors",
      compact ? "justify-center" : "px-2.5",
      isActive ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
    );

  return (
    <aside className={clsx("flex h-full flex-col overflow-hidden bg-sidebar transition-[width] duration-200 ease-out", compact ? "w-[60px]" : "w-[232px]")}>
      <div className={clsx("flex h-14 items-center", compact ? "justify-center" : "justify-between pl-4 pr-2.5")}>
        {compact ? (
          <NavLink to="/" onClick={onNavigate} title="Dashboard" className="logo-link rounded-md">
            <Logo compact />
          </NavLink>
        ) : (
          <>
            <NavLink to="/" onClick={onNavigate} title="Dashboard" className="logo-link rounded-md">
              <Logo />
            </NavLink>
            <IconButton onClick={onToggle} title="Collapse sidebar" className="hidden md:inline-flex">
              <PanelLeft size={17} />
            </IconButton>
          </>
        )}
      </div>

      <div className={clsx(compact ? "space-y-2 px-2.5" : "space-y-1.5 px-2.5")}>
        {compact ? (
          <>
            <IconButton onClick={onToggle} title="Expand sidebar" className="w-full">
              <PanelLeft size={16} />
            </IconButton>
            <IconButton onClick={openSearch} title="Search" className="w-full">
              <Search size={16} />
            </IconButton>
            <IconButton onClick={() => newItem()} title="New work item" className="w-full">
              <Plus size={16} />
            </IconButton>
            <IconButton onClick={quickNote} title="Add topic to Radar (N)" className="w-full">
              <CirclePlus size={16} />
            </IconButton>
          </>
        ) : (
          <>
            <button
              onClick={openSearch}
              className="flex h-8 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg-3 hover:border-line-strong"
            >
              <Search size={14} />
              <span className="flex-1 text-left">Search...</span>
              <span className="flex gap-1">
                <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <button
              onClick={() => newItem()}
              className="flex h-8 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg hover:bg-surface-2"
            >
              <Plus size={14} />
              <span className="flex-1 text-left">New work item</span>
              <Kbd>C</Kbd>
            </button>
            <button
              onClick={quickNote}
              className="flex h-8 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg hover:bg-surface-2"
            >
              <RadarIcon size={14} />
              <span className="flex-1 text-left">Add topic</span>
              <Kbd>N</Kbd>
            </button>
          </>
        )}
      </div>

      <nav className={clsx("mt-4 flex-1 overflow-y-auto pb-4", compact ? "px-2.5" : "px-2.5")}>
        {!compact && (
          <button
            onClick={() => setGroupOpen(!groupOpen)}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-fg hover:bg-surface-2"
          >
            <SquareKanban size={16} strokeWidth={1.75} />
            <span className="flex-1 text-left">Workspace</span>
            <ChevronDown size={14} className={clsx("transition-transform", !groupOpen && "-rotate-90")} />
          </button>
        )}
        {(groupOpen || compact) && (
          <div className={clsx("space-y-0.5", compact ? "" : "ml-[17px] mt-0.5 border-l border-line pl-2")}>
            {NAV.filter((n) => !n.weekendOnly || settings?.weekend_mode).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={onNavigate} title={n.label}>
                <n.icon size={16} strokeWidth={1.75} />
                {!compact && <span className="flex-1">{n.label}</span>}
                {!compact && !!counts[n.to] && (
                  <span className="rounded bg-surface-3 px-1.5 font-mono text-[11px] text-fg-2">{counts[n.to]}</span>
                )}
              </NavLink>
            ))}
          </div>
        )}

        {!compact && (
          <div className="mt-5">
            <div className="flex items-center justify-between pb-1 pl-2.5 pr-1">
              <NavLink to="/projects" onClick={onNavigate} className="text-xs font-medium text-fg-3 hover:text-fg">
                Projects
              </NavLink>
              <IconButton className="size-6" onClick={() => setNewProject(true)} title="New project">
                <Plus size={14} />
              </IconButton>
            </div>
            {projects?.filter((p) => !p.archived).map((p) => (
              <NavLink
                key={p.id}
                to={`/board?project=${p.id}`}
                onClick={onNavigate}
                className={() => linkCls({ isActive: activeProject === String(p.id) })}
              >
                <ProjectIcon icon={p.icon} size={15} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono text-[11px] text-fg-3">{p.open_count}</span>
              </NavLink>
            ))}
          </div>
        )}
        <div className="mt-5">
          <NavLink to="/quotes" className={linkCls} onClick={onNavigate} title="Quotes">
            <QuoteIcon size={16} strokeWidth={1.75} />
            {!compact && <span className="flex-1">Quotes</span>}
            {!compact && !!quoteCount && <span className="font-mono text-[11px] text-fg-3">{quoteCount}</span>}
          </NavLink>
          <NavLink to="/trash" className={linkCls} onClick={onNavigate} title="Trash">
            <Trash2 size={16} strokeWidth={1.75} />
            {!compact && <span className="flex-1">Trash</span>}
            {!compact && trashCount > 0 && <span className="font-mono text-[11px] text-fg-3">{trashCount}</span>}
          </NavLink>
          <NavLink to="/settings" className={linkCls} onClick={onNavigate} title="Settings">
            <SettingsIcon size={16} strokeWidth={1.75} />
            {!compact && "Settings"}
          </NavLink>
        </div>
      </nav>

      <RunningTimer compact={compact} />

      <div className={clsx("border-t border-line py-3", compact ? "space-y-2 px-2.5" : "px-2.5")}>
        <div className={clsx("flex items-center", compact ? "flex-col gap-1" : "justify-between")}>
          <div className={clsx("flex items-center", compact ? "flex-col" : "gap-1")}>
            <IconButton onClick={toggleTheme} title={theme === "dark" ? "Light theme" : "Dark theme"}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
          </div>
          <span className="font-mono text-[11px] text-fg-3">v{settings?.version ?? "0.1.0"}</span>
        </div>
      </div>
      <ProjectModal open={newProject} onClose={() => setNewProject(false)} />
    </aside>
  );
}

export function Layout() {
  const location = useLocation();
  const [compact, setCompact] = useLocalState("smriti-sidebar-compact", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [newDefaults, setNewDefaults] = useState<NewItemDefaults | null>(null);
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get("item")) || null;

  const actions: Actions = {
    openItem: (id) =>
      setParams((p) => {
        p.set("item", String(id));
        return p;
      }),
    newItem: (d = {}) => setNewDefaults(d),
    openSearch: () => setSearchOpen(true),
    quickNote: () => setNoteOpen(true),
    addRevision: () => setReviseOpen(true),
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setNewDefaults({});
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNoteOpen(true);
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        setReviseOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="flex h-full">
        <div className="hidden border-r border-line md:block">
          <Sidebar compact={compact} onToggle={() => setCompact(!compact)} />
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="anim-fade absolute inset-0 bg-[var(--overlay)]" onClick={() => setMobileOpen(false)} />
            <div className="anim-sidebar absolute inset-y-0 left-0 border-r border-line shadow-[var(--shadow)]">
              <Sidebar compact={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center gap-2 border-b border-line px-3 md:hidden">
            <IconButton onClick={() => setMobileOpen(true)} aria-label="Menu">
              <Menu size={18} />
            </IconButton>
            <Logo />
            <div className="flex-1" />
            <IconButton onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={17} />
            </IconButton>
            <IconButton onClick={() => setNoteOpen(true)} aria-label="Add topic">
              <RadarIcon size={17} />
            </IconButton>
            <IconButton onClick={() => setNewDefaults({})} aria-label="New item">
              <Plus size={18} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div key={location.pathname} className="anim-page h-full">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NewItemModal defaults={newDefaults} onClose={() => setNewDefaults(null)} />
      <AddTopicModal open={noteOpen} onClose={() => setNoteOpen(false)} />
      <AddRevisionModal open={reviseOpen} onClose={() => setReviseOpen(false)} />
      <ItemDrawer
        itemId={openId}
        onClose={() =>
          setParams((p) => {
            p.delete("item");
            return p;
          })
        }
      />
    </ActionsCtx.Provider>
  );
}

export function Section({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
