/**
 * Sub-navigation inside Learning, in the order you use it: an Overview, the three kinds of things
 * you learn from (Topics, Engineering Blogs, Books), then Revisit, where what you learned is kept fresh.
 */
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Book as BookIcon, BookMarked, GraduationCap, LayoutGrid, Newspaper } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api, type Article, type Book, type Item } from "../lib/api";
import { useRevisions } from "../lib/hooks";

function useLearningTabs() {
  const { data: items } = useQuery({ queryKey: ["items", "learning"], queryFn: () => api.get<Item[]>("/items?type=learning") });
  const { data: articles } = useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });
  const { data: books } = useQuery({ queryKey: ["books"], queryFn: () => api.get<Book[]>("/books") });
  const { data: revisions } = useRevisions();
  // Counts show what is still open: topics not done, blogs not read, books not finished, topics to revisit.
  const tabs = [
    { to: "/learning", end: true, label: "Overview", icon: LayoutGrid },
    { to: "/learning/topics", label: "Topics", icon: GraduationCap, count: items?.filter((i) => i.status !== "done" && !i.book_id && !i.article_id).length },
    { to: "/learning/articles", label: "Engineering Blogs", icon: Newspaper, count: articles?.filter((a) => a.status !== "read").length },
    { to: "/learning/books", label: "Books", icon: BookIcon, count: books?.filter((b) => b.status !== "finished").length },
    { to: "/learning/revisit", label: "Revisit", icon: BookMarked, count: revisions?.filter((r) => r.status === "active").length, divider: true },
  ];
  return { tabs, deps: [items, articles, books, revisions] };
}

/** Slides a highlight to the active link inside `ref`, along x (horizontal bar) or y (vertical rail). */
function useActivePill(axis: "x" | "y", deps: unknown[]) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ start: number; size: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>("a[aria-current=page]");
      setPill(active ? (axis === "x" ? { start: active.offsetLeft, size: active.offsetWidth } : { start: active.offsetTop, size: active.offsetHeight }) : null);
      // On a narrow screen the horizontal bar scrolls; keep the active tab in view.
      const scroller = el.parentElement;
      if (axis === "x" && active && scroller && scroller.scrollWidth > scroller.clientWidth)
        scroller.scrollLeft = Math.max(0, active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, axis, ...deps]);
  return { ref, pill };
}

const PILL =
  "absolute rounded-lg bg-surface-3 shadow-[0_1px_2px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.05)] ring-1 ring-line-strong/60 duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]";

function Count({ n, active }: { n?: number; active: boolean }) {
  if (!n) return null;
  return (
    <span
      className={clsx(
        "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[18px] tabular-nums transition-colors",
        active ? "bg-fg/10 text-fg" : "bg-surface-2 text-fg-3",
      )}
    >
      {n}
    </span>
  );
}

/** The horizontal bar, used on narrow screens. */
export function LearningNav({ className }: { className?: string }) {
  const { tabs, deps } = useLearningTabs();
  const { ref: bar, pill: p } = useActivePill("x", deps);
  const pill = p && { left: p.start, width: p.size };
  return (
    <div className={clsx("mb-6 overflow-x-auto [scrollbar-width:none]", className)}>
      <div ref={bar} className="relative inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1">
        {pill && (
          <span
            aria-hidden
            className={clsx(PILL, "inset-y-1 transition-[left,width]")}
            style={{ left: pill.left, width: pill.width }}
          />
        )}
        {tabs.map((t) => (
          <Fragment key={t.to}>
            {t.divider && <span className="mx-1.5 h-4 w-px shrink-0 bg-line" aria-hidden />}
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  "relative z-10 flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors",
                  isActive ? "text-fg" : "text-fg-3 hover:text-fg-2",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon size={14} className={clsx("transition-colors", isActive && "text-fg")} />
                  {t.label}
                  <Count n={t.count} active={isActive} />
                </>
              )}
            </NavLink>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** The vertical rail, in the manner of a macOS sidebar: a flat highlight that slides, plain counts. */
function LearningRail({ sub }: { sub?: ReactNode }) {
  const { tabs, deps } = useLearningTabs();
  const { ref, pill } = useActivePill("y", deps);
  return (
    <div className="sticky top-5 space-y-4">
      <p className="px-3 text-[15px] font-semibold">Learning</p>
      <div ref={ref} className="relative flex flex-col gap-px">
        {pill && (
          <span
            aria-hidden
            className="absolute inset-x-0 rounded-lg bg-surface-2 transition-[top,height] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ top: pill.start, height: pill.size }}
          />
        )}
        {tabs.map((t) => (
          <Fragment key={t.to}>
            {t.divider && <span className="mx-3 my-1.5 h-px bg-line/70" aria-hidden />}
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  "relative z-10 flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors",
                  isActive ? "font-medium text-fg" : "text-fg-2 hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon size={15} strokeWidth={1.75} className={clsx("shrink-0", isActive ? "text-fg" : "text-fg-3")} />
                  <span className="flex-1 truncate">{t.label}</span>
                  {!!t.count && <span className="text-[12px] tabular-nums text-fg-3">{t.count}</span>}
                </>
              )}
            </NavLink>
          </Fragment>
        ))}
      </div>
      {sub}
    </div>
  );
}

const SUBTITLES: Record<string, string> = {
  "/learning": "Where you are, and what comes next.",
  "/learning/topics": "Subjects, courses and talks you want to learn.",
  "/learning/articles": "Engineering posts worth reading, kept in Obsidian.",
  "/learning/books": "Your reading shelf.",
  "/learning/revisit": "Keep what you have learned fresh.",
};

/**
 * Page body for every Learning tab: the section rail on the left (with an optional `sub` panel under it,
 * like Engineering Blogs' collections), and on the right a large title, the tab's actions and its content.
 * Phones get the horizontal bar under the title instead of the rail.
 */
export function LearningShell({
  title,
  subtitle,
  actions,
  sub,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { tabs } = useLearningTabs();
  const here = tabs.find((t) => (t.end ? pathname === t.to : pathname.startsWith(t.to)));
  return (
    <div className="px-4 pt-4 md:px-6 lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-5">
      <aside className="hidden lg:block">
        <LearningRail sub={sub} />
      </aside>
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="mb-1 text-[12px] font-medium text-fg-3 lg:hidden">Learning</p>
            <h1 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.01em]">{title ?? here?.label}</h1>
            <p className="mt-0.5 text-[13px] text-fg-3">{subtitle ?? SUBTITLES[here?.to ?? ""]}</p>
          </div>
          {actions && <div className="flex items-center gap-2 max-sm:w-full sm:shrink-0">{actions}</div>}
        </header>
        <LearningNav className="lg:hidden" />
        {children}
      </div>
    </div>
  );
}
