/** Board / List switch in the header of both views (the list used to be the All items page). */
import clsx from "clsx";
import { List, SquareKanban } from "lucide-react";
import { NavLink } from "react-router-dom";

export function BoardViewSwitch() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
      isActive ? "border border-line bg-surface text-fg shadow-sm" : "border border-transparent text-fg-3 hover:text-fg",
    );
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-base font-normal tracking-normal">
      <NavLink to="/board" className={cls} title="Board view">
        <SquareKanban size={14} /> Board
      </NavLink>
      <NavLink to="/list" className={cls} title="List view: every item in a sortable table">
        <List size={14} /> List
      </NavLink>
    </div>
  );
}
