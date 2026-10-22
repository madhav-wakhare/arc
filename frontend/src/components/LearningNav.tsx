/**
 * Sub-navigation inside Learning, in the order you use it: an Overview, the three kinds of things
 * you learn from (Topics, Engineering Blogs, Books), then Revisit, where what you learned is kept fresh.
 */
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Book as BookIcon, BookMarked, GraduationCap, LayoutGrid, Newspaper } from "lucide-react";
import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import { api, type Article, type Book, type Item } from "../lib/api";
import { useRevisions } from "../lib/hooks";

export function LearningNav() {
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
  return (
    // The hairline sits inside the page padding, so it lines up with the content below.
    <div className="mb-5 px-4 md:px-6 lg:px-8">
      {/* Pulled left by the tab padding so the first label lines up with the page title. */}
      <nav className="-ml-2.5 flex items-center gap-1 overflow-x-auto border-b border-line pl-0 [mask-image:linear-gradient(to_right,transparent_0,black_10px)]">
        {tabs.map((t) => (
          <Fragment key={t.to}>
            {t.divider && <span className="mx-2 mb-1 h-3.5 w-px shrink-0 bg-line" aria-hidden />}
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                clsx(
                  "group relative -mb-px flex h-10 shrink-0 items-center gap-2 px-2.5 text-[13px] transition-colors",
                  isActive ? "text-fg" : "text-fg-3 hover:text-fg-2",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon size={14} className={isActive ? "text-fg-2" : ""} />
                  <span className={isActive ? "font-medium" : ""}>{t.label}</span>
                  {!!t.count && <span className="text-xs tabular-nums text-fg-3">{t.count}</span>}
                  <span
                    className={clsx(
                      "absolute inset-x-2.5 bottom-0 h-0.5 rounded-full transition-colors",
                      isActive ? "bg-fg" : "bg-transparent group-hover:bg-line-strong",
                    )}
                  />
                </>
              )}
            </NavLink>
          </Fragment>
        ))}
      </nav>
    </div>
  );
}
