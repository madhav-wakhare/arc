/** The row under the Learning tabs: status filters on the left, search on the right. Same on every tab. */
import { Search } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Input } from "./ui";

export function LearningToolbar<T extends string>({
  value,
  onChange,
  tabs,
  search,
  onSearch,
  placeholder = "Search",
  extra,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode }[];
  search: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Light chips, so they read as filters under the main Learning tabs rather than a second tab bar. */}
      <div className="flex max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={clsx(
              "h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors",
              value === t.value ? "bg-surface-3 font-medium text-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {extra}
      <div className="flex-1" />
      <Input icon={<Search size={14} />} placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} className="w-full sm:w-64" />
    </div>
  );
}
