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
    <div className={clsx("mb-5 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 lg:px-8", className)}>
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

/** The vertical rail: Learning sections stacked, with a sliding highlight and an edge mark for the active one. */
function LearningRail({ sub }: { sub?: ReactNode }) {
  const { tabs, deps } = useLearningTabs();
  const { ref, pill } = useActivePill("y", deps);
  return (
    <div className="sticky top-4 space-y-6">
      <div ref={ref} className="relative flex flex-col gap-0.5">
        {pill && <span aria-hidden className={clsx(PILL, "inset-x-0 transition-[top,height]")} style={{ top: pill.start, height: pill.size }} />}
        {tabs.map((t) => (
          <Fragment key={t.to}>
            {t.divider && <span className="mx-3 my-2 h-px bg-line" aria-hidden />}
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  "group relative z-10 flex h-9 items-center gap-2.5 rounded-lg pl-3 pr-2 text-[13px] font-medium transition-colors",
                  isActive ? "text-fg" : "text-fg-3 hover:bg-surface-2/60 hover:text-fg-2",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={clsx("absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-fg/70 transition-opacity", isActive ? "opacity-100" : "opacity-0")}
                  />
                  <t.icon size={15} className={clsx("shrink-0 transition-colors", isActive && "text-fg")} />
                  <span className="flex-1 truncate">{t.label}</span>
                  <Count n={t.count} active={isActive} />
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

/**
 * Page body for every Learning tab: the section rail on the left (with an optional `sub` panel under it,
 * like Engineering Blogs' collections) and the tab's content on the right. Phones get the horizontal bar.
 */
export function LearningShell({ sub, children }: { sub?: ReactNode; children: ReactNode }) {
  return (
    <>
      <LearningNav className="lg:hidden" />
      <div className="px-4 md:px-6 lg:grid lg:grid-cols-[216px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-1">
        <aside className="hidden lg:block">
          <LearningRail sub={sub} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
