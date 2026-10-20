/** The row under the Learning tabs: status filters on the left, search on the right. Same on every tab. */
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input, Tabs } from "./ui";

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
      <Tabs value={value} onChange={onChange} tabs={tabs} />
      {extra}
      <div className="flex-1" />
      <Input icon={<Search size={14} />} placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} className="w-full sm:w-64" />
    </div>
  );
}
