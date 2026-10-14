/** Sub-navigation inside Learning: topics you study (with a video or course link or not), and articles you read and keep. */
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { GraduationCap, Newspaper } from "lucide-react";
import { NavLink } from "react-router-dom";
import { api, type Article, type Item } from "../lib/api";

export function LearningNav() {
  const { data: items } = useQuery({ queryKey: ["items", "learning"], queryFn: () => api.get<Item[]>("/items?type=learning") });
  const { data: articles } = useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });
  const tabs = [
    { to: "/learning", end: true, label: "Topics", icon: GraduationCap, count: items?.filter((i) => i.status !== "done").length },
    { to: "/learning/articles", end: false, label: "Articles", icon: Newspaper, count: articles?.filter((a) => a.status !== "read").length },
  ];
  return (
    <div className="mb-5 flex items-center gap-6 border-b border-line px-4 md:px-6 lg:px-8">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            clsx(
              "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
              isActive ? "border-fg text-fg" : "border-transparent text-fg-3 hover:text-fg-2",
            )
          }
        >
          <t.icon size={15} />
          {t.label}
          {!!t.count && <span className="rounded bg-surface-3 px-1.5 font-mono text-[11px] font-normal text-fg-2">{t.count}</span>}
        </NavLink>
      ))}
    </div>
  );
}
