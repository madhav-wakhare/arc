import clsx from "clsx";
import {
  BookOpen,
  CalendarCheck,
  ChevronDown,
  FileBarChart,
  LayoutDashboard,
  Radar as RadarIcon,
  BookMarked,
  ListTodo,
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
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

const LOGO_BLOCKS = [
  { x: 10, y: 2, w: 14 },
  { x: 4, y: 8, w: 6 },
  { x: 10, y: 14, w: 8 },
  { x: 18, y: 20, w: 6 },
  { x: 4, y: 26, w: 14 },
];

/**
 * Stepped "S" built from blocks, in the style of the Bifrost mark.
 * The blocks build in one by one on load; on hover an accent shimmer runs down them
 * (see .logo-mark in index.css). Each block is a <g> (build-in) around a <rect> (shimmer),
 * so the two animations never restart each other.
 */
function Logo() {
  return (
    <div className="logo-mark flex items-center gap-2.5">
      <svg viewBox="0 0 28 33" className="size-7 shrink-0 overflow-visible" fill="var(--fg)" aria-hidden>
        {LOGO_BLOCKS.map((b, i) => (
          <g key={i} className="logo-block" style={{ "--i": i } as CSSProperties}>
            <rect x={b.x} y={b.y} width={b.w} height="5" />
          </g>
        ))}
      </svg>
      <span className="logo-word text-[22px] font-medium tracking-tight">Smriti</span>
    </div>
  );
}

function RunningTimer() {
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

function Sidebar({
  onToggle,
  toggleTitle,
  onNavigate,
}: {
  onToggle: () => void;
  toggleTitle: string;
  onNavigate?: () => void;
}) {
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
      "flex h-9 items-center gap-3 rounded-md px-3 text-[14px] transition-colors",
      isActive ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
    );

  return (
    <aside className="flex h-full w-[264px] flex-col overflow-hidden bg-sidebar">
      <div className="flex h-16 items-center justify-between pl-5 pr-3">
        <NavLink to="/" onClick={onNavigate} title="Dashboard" className="logo-link rounded-md">
          <Logo />
        </NavLink>
        <Tooltip label={toggleTitle} shortcut={isMac ? "⌘B" : "Ctrl B"}>
          <IconButton onClick={onToggle} aria-label={toggleTitle}>
            <PanelLeft size={17} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="space-y-2 px-3">
        <button
          onClick={openSearch}
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-[14px] text-fg-3 hover:border-line-strong"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search...</span>
          <span className="flex gap-1">
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <button
          onClick={() => newItem()}
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-[14px] text-fg hover:bg-surface-2"
        >
          <Plus size={15} />
          <span className="flex-1 text-left">New work item</span>
          <Kbd>C</Kbd>
        </button>
        <button
          onClick={quickNote}
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-[14px] text-fg hover:bg-surface-2"
        >
          <RadarIcon size={15} />
          <span className="flex-1 text-left">Add topic</span>
          <Kbd>N</Kbd>
        </button>
      </div>

      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        <button
          onClick={() => setGroupOpen(!groupOpen)}
          className="flex h-9 w-full items-center gap-3 rounded-md border border-line bg-surface-2 px-3 text-[14px] font-medium"
        >
          <SquareKanban size={16} />
          <span className="flex-1 text-left">Workspace</span>
          <ChevronDown size={15} className={clsx("transition-transform", !groupOpen && "-rotate-90")} />
        </button>
        {groupOpen && (
          <div className="ml-[18px] mt-1 space-y-0.5 border-l border-line pl-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={onNavigate}>
                <n.icon size={16} strokeWidth={1.75} />
                <span className="flex-1">{n.label}</span>
                {!!counts[n.to] && (
                  <span className="rounded bg-surface-3 px-1.5 font-mono text-[11px] text-fg-2">{counts[n.to]}</span>
                )}
              </NavLink>
            ))}
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between px-3 pb-1">
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
              <ProjectIcon icon={p.icon} size={16} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="font-mono text-[11px] text-fg-3">{p.open_count}</span>
            </NavLink>
          ))}
        </div>
        <div className="mt-6">
          <NavLink to="/quotes" className={linkCls} onClick={onNavigate}>
            <QuoteIcon size={16} strokeWidth={1.75} />
            <span className="flex-1">Quotes</span>
            {!!quoteCount && <span className="font-mono text-[11px] text-fg-3">{quoteCount}</span>}
          </NavLink>
          <NavLink to="/trash" className={linkCls} onClick={onNavigate}>
            <Trash2 size={16} strokeWidth={1.75} />
            <span className="flex-1">Trash</span>
            {trashCount > 0 && <span className="font-mono text-[11px] text-fg-3">{trashCount}</span>}
          </NavLink>
          <NavLink to="/settings" className={linkCls} onClick={onNavigate}>
            <SettingsIcon size={16} strokeWidth={1.75} />
            Settings
          </NavLink>
        </div>
      </nav>

      <RunningTimer />

      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <IconButton onClick={toggleTheme} title={theme === "dark" ? "Light theme" : "Dark theme"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </IconButton>
          <span className="font-mono text-[11px] text-fg-3">v{settings?.version ?? "0.1.0"}</span>
        </div>
      </div>
      <ProjectModal open={newProject} onClose={() => setNewProject(false)} />
    </aside>
  );
}

/** Small dark label under a control, like the Claude desktop app ("Show sidebar ⌘B"). */
function Tooltip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-[80] mt-1.5 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg shadow-[var(--shadow)] group-hover/tip:flex">
        {label}
        {shortcut && <span className="font-mono text-[11px] text-fg-3">{shortcut}</span>}
      </span>
    </span>
  );
}

export function Layout() {
  const location = useLocation();
  // Hidden sidebar, like the Claude desktop app: only a toggle button stays; hovering it or the
  // left edge "peeks" the sidebar over the page, clicking the button pins it open again.
  const [hidden, setHidden] = useLocalState("smriti-sidebar-compact", false);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number>();
  const showPeek = () => {
    window.clearTimeout(peekTimer.current);
    setPeek(true);
  };
  const hidePeek = () => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(false), 220);
  };
  const isMac = navigator.platform.toLowerCase().includes("mac");
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
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "\\" || e.key.toLowerCase() === "b")) {
        e.preventDefault();
        setPeek(false);
        setHidden((h) => !h);
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
        {!hidden && (
          <div className="hidden border-r border-line md:block">
            <Sidebar toggleTitle="Hide sidebar" onToggle={() => setHidden(true)} />
          </div>
        )}
        {hidden && (
          <>
            {/* Thin hover zone on the left edge, and the toggle button in the top-left corner. */}
            <div className="fixed inset-y-0 left-0 z-40 hidden w-2 md:block" onMouseEnter={showPeek} onMouseLeave={hidePeek} />
            <div className="fixed left-3 top-3.5 z-40 hidden md:block" onMouseEnter={showPeek} onMouseLeave={hidePeek}>
              <Tooltip label="Show sidebar" shortcut={isMac ? "⌘B" : "Ctrl B"}>
                <IconButton
                  aria-label="Show sidebar"
                  className="border border-line bg-surface"
                  onClick={() => {
                    setPeek(false);
                    setHidden(false);
                  }}
                >
                  <PanelLeft size={17} />
                </IconButton>
              </Tooltip>
            </div>
            {peek && (
              <div
                className="anim-sidebar fixed inset-y-2 left-2 z-50 hidden overflow-hidden rounded-xl border border-line shadow-[var(--shadow)] md:block"
                onMouseEnter={showPeek}
                onMouseLeave={hidePeek}
              >
                <Sidebar
                  toggleTitle="Keep sidebar open"
                  onToggle={() => {
                    setPeek(false);
                    setHidden(false);
                  }}
                  onNavigate={() => setPeek(false)}
                />
              </div>
            )}
          </>
        )}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="anim-fade absolute inset-0 bg-[var(--overlay)]" onClick={() => setMobileOpen(false)} />
            <div className="anim-sidebar absolute inset-y-0 left-0 border-r border-line shadow-[var(--shadow)]">
              <Sidebar toggleTitle="Close menu" onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
        {/* With the sidebar hidden, leave room on the left for the toggle button. */}
        <main className={clsx("flex min-w-0 flex-1 flex-col", hidden && "md:pl-12")}>
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
