import clsx from "clsx";
import {
  Book,
  BookMarked,
  BookOpen,
  CheckSquare,
  GraduationCap,
  Newspaper,
  CalendarHeart,
  ChevronDown,
  FileBarChart,
  LayoutDashboard,
  Radar as RadarIcon,
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
import { Suspense, createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ItemType, type Quote, type Status } from "../lib/api";
import { useJots, useLocalState, useNow, useProjects, useRefreshItems, useSettings, useTimer, useTrash } from "../lib/hooks";
import { AddTopicModal } from "./Jots";
import { AddRevisionModal } from "./Revise";
import { CommandPalette } from "./CommandPalette";
import { ItemDrawer } from "./ItemDrawer";
import { NewItemModal } from "./NewItemModal";
import { ProjectModal } from "./ProjectModal";
import { IconButton, Kbd, Menu as UiMenu } from "./ui";
import { GO_TO, ShortcutsModal } from "./Shortcuts";
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
  { to: "/board", label: "Board", icon: SquareKanban, alsoActive: ["/list"] },
  { to: "/radar", label: "Radar", icon: RadarIcon },
  { to: "/learning", label: "Learning", icon: BookOpen },
  { to: "/reports", label: "Weekly report", icon: FileBarChart },
  { to: "/weekend", label: "Weekend", icon: CalendarHeart, weekendOnly: true },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111111" : "#ffffff");
    try {
      localStorage.setItem("arc-theme", theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

// Arc mark: a geometric lowercase "a", a ring and a straight stem. On load the ring grows in,
// then the stem rises; on hover an accent shimmer runs from ring to stem. (Earlier marks are in
// git: the Smriti "S" at tag smriti-final, the stepped "A" at arc-v1, the rising bars at 968b20d.)
function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="logo-mark flex items-center gap-2.5">
      <svg viewBox="1 4 28 28" className="size-7 shrink-0 overflow-visible" aria-hidden>
        <g className="logo-block logo-ring" style={{ "--i": 0 } as CSSProperties}>
          <circle cx="14" cy="18" r="8" fill="none" stroke="var(--fg)" strokeWidth="4" />
        </g>
        <g className="logo-block" style={{ "--i": 1 } as CSSProperties}>
          <rect x="22" y="9" width="4" height="17" rx="2" fill="var(--fg)" />
        </g>
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

/**
 * The one place to create anything. Keyboard shortcuts still work everywhere:
 * C new task, N capture to Radar, R add to Revisit.
 */
function NewMenu({ trigger }: { trigger: ReactNode }) {
  const { newItem, quickNote, addRevision } = useActions();
  const navigate = useNavigate();
  const row = (label: string, kbd?: string) => (
    <span className="flex w-full items-center justify-between gap-3">
      {label}
      {kbd && <Kbd>{kbd}</Kbd>}
    </span>
  );
  return (
    <UiMenu
      trigger={trigger}
      items={[
        { label: row("Task", "C"), icon: <CheckSquare size={14} className="text-task" />, onClick: () => newItem({ type: "task" }) },
        { label: row("Topic to learn"), icon: <GraduationCap size={14} className="text-learning" />, onClick: () => navigate("/learning/topics?new=1") },
        { label: row("Blog post"), icon: <Newspaper size={14} className="text-accent" />, onClick: () => navigate("/learning/articles?new=1") },
        { label: row("Book"), icon: <Book size={14} className="text-book" />, onClick: () => navigate("/learning/books?new=1") },
        { label: row("Add to Revisit", "R"), icon: <BookMarked size={14} className="text-fg-2" />, onClick: addRevision },
        { label: row("Capture to Radar", "N"), icon: <RadarIcon size={14} className="text-accent" />, onClick: quickNote },
      ]}
    />
  );
}

function Sidebar({ compact, onToggle, onNavigate }: { compact: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const { data: projects } = useProjects();
  const { data: settings } = useSettings();
  const { data: trash } = useTrash();
  const { data: quotes } = useQuery({ queryKey: ["quotes"], queryFn: () => api.get<Quote[]>("/quotes") });
  const quoteCount = quotes?.length ?? 0;
  const trashCount = (trash?.items.filter((i) => !i.deleted_with_project).length ?? 0) + (trash?.projects.length ?? 0);
  const { openSearch } = useActions();
  const { data: jots } = useJots();
  const inboxCount = jots?.filter((j) => j.status === "open").length ?? 0;
  const counts: Record<string, number> = {
    "/radar": inboxCount,
  };
  const [theme, toggleTheme] = useTheme();
  const [groupOpen, setGroupOpen] = useLocalState("arc-nav-open", true);
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
            <NewMenu
              trigger={
                <IconButton title="New" className="w-full">
                  <Plus size={16} />
                </IconButton>
              }
            />
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
            <NewMenu
              trigger={
                <button className="flex h-8 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg hover:bg-surface-2">
                  <Plus size={14} />
                  <span className="flex-1 text-left">New</span>
                  <ChevronDown size={14} className="text-fg-3" />
                </button>
              }
            />
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
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => linkCls({ isActive: isActive || !!n.alsoActive?.includes(loc.pathname) })}
                onClick={onNavigate}
                title={n.label}
              >
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

/** Phone only: the main places one tap away, with New in the middle. */
function MobileTabs() {
  const { data: jots } = useJots();
  const radar = jots?.filter((j) => j.status === "open").length ?? 0;
  const tab = ({ isActive }: { isActive: boolean }) =>
    clsx("flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]", isActive ? "text-fg" : "text-fg-3");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-line bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <NavLink to="/" end className={tab}>
        <LayoutDashboard size={19} strokeWidth={1.75} /> Dashboard
      </NavLink>
      <NavLink to="/board" className={({ isActive }) => tab({ isActive: isActive || location.pathname === "/list" })}>
        <SquareKanban size={19} strokeWidth={1.75} /> Board
      </NavLink>
      <div className="flex flex-1 items-center justify-center">
        <NewMenu
          trigger={
            <button aria-label="New" className="flex size-10 items-center justify-center rounded-full bg-fg text-bg shadow-[var(--shadow)]">
              <Plus size={20} />
            </button>
          }
        />
      </div>
      <NavLink to="/learning" className={tab}>
        <BookOpen size={19} strokeWidth={1.75} /> Learning
      </NavLink>
      <NavLink to="/radar" className={tab}>
        <span className="relative">
          <RadarIcon size={19} strokeWidth={1.75} />
          {radar > 0 && (
            <span className="absolute -right-2.5 -top-1.5 rounded-full bg-accent px-1 font-mono text-[9px] leading-[14px] text-accent-fg">{radar}</span>
          )}
        </span>
        Radar
      </NavLink>
    </nav>
  );
}

export function Layout() {
  const location = useLocation();
  const [compact, setCompact] = useLocalState("arc-sidebar-compact", false);
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

  const navigate = useNavigate();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    let gAt = 0; // when G was pressed; the next key within a second picks a page
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      const plain = !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      const key = e.key.toLowerCase();
      if (plain && Date.now() - gAt < 1000 && GO_TO[key]) {
        e.preventDefault();
        gAt = 0;
        navigate(GO_TO[key].to);
        return;
      }
      if (plain && key === "g") {
        gAt = Date.now();
        return;
      }
      if (plain && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
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
  }, [navigate]);

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
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
            <div key={location.pathname} className="anim-page h-full">
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      <MobileTabs />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
