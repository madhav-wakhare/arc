/**
 * Sub-navigation inside Learning, in the order you use it: an Overview, the three kinds of things
 * you learn from (Topics, Engineering Blogs, Books), then Revisit, where what you learned is kept fresh.
 */
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Book as BookIcon, BookMarked, GraduationCap, LayoutGrid, Newspaper } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api, type Article, type Book, type Item } from "../lib/api";
import { useRevisions } from "../lib/hooks";

export function LearningNav() {
  const { data: items } = useQuery({ queryKey: ["items", "learning"], queryFn: () => api.get<Item[]>("/items?type=learning") });
  const { data: articles } = useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });
  const { data: books } = useQuery({ queryKey: ["books"], queryFn: () => api.get<Book[]>("/books") });
  const { data: revisions } = useRevisions();
  // Counts show what is still open: topics not done, blogs not read, books not finished, topics to revisit.
  const tabs = [
    { to: "/learning", end: true, label: "Overview", icon: LayoutGrid, tint: "text-fg" },
    { to: "/learning/topics", label: "Topics", icon: GraduationCap, tint: "text-learning", count: items?.filter((i) => i.status !== "done" && !i.book_id && !i.article_id).length },
    { to: "/learning/articles", label: "Engineering Blogs", icon: Newspaper, tint: "text-accent", count: articles?.filter((a) => a.status !== "read").length },
    { to: "/learning/books", label: "Books", icon: BookIcon, tint: "text-book", count: books?.filter((b) => b.status !== "finished").length },
    { to: "/learning/revisit", label: "Revisit", icon: BookMarked, tint: "text-good", count: revisions?.filter((r) => r.status === "active").length, divider: true },
  ];
  const { pathname } = useLocation();
  const bar = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Slide the highlight under the active tab; re-measure when the route, counts or size change.
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>("a[aria-current=page]");
      setPill(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
      // On a narrow screen the bar scrolls; keep the active tab in view.
      const scroller = el.parentElement;
      if (active && scroller && scroller.scrollWidth > scroller.clientWidth)
        scroller.scrollLeft = Math.max(0, active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathname, items, articles, books, revisions]);

  return (
    <div className="mb-5 overflow-x-auto px-4 [scrollbar-width:none] md:px-6 lg:px-8">
      <div ref={bar} className="relative inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1">
        {pill && (
          <span
            aria-hidden
            className="absolute inset-y-1 rounded-lg bg-surface-3 shadow-[0_1px_2px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.05)] ring-1 ring-line-strong/60 transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
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
                  <t.icon size={14} className={clsx("transition-colors", isActive && t.tint)} />
                  {t.label}
                  {!!t.count && (
                    <span
                      className={clsx(
                        "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-[18px] tabular-nums transition-colors",
                        isActive ? "bg-fg/10 text-fg" : "bg-surface-2 text-fg-3",
                      )}
                    >
                      {t.count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
