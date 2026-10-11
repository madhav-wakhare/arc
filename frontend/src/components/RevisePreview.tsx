import { ArrowRight, BookMarked, CircleHelp, NotebookText } from "lucide-react";
import { Link } from "react-router-dom";
import { useRevisions } from "../lib/hooks";
import { daysBetween } from "../lib/meta";

/** Short list of topics on the Revisit list, oldest first. Links to the Revise page. */
export function RevisePreview({ limit = 5 }: { limit?: number }) {
  const { data = [] } = useRevisions();
  const active = data.filter((r) => r.status === "active");
  if (!active.length)
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-fg-3">
        <BookMarked size={14} /> Nothing on your Revisit list
      </p>
    );
  return (
    <div className="-mx-2 -my-1">
      {active.slice(0, limit).map((r) => {
        const d = daysBetween(r.created_at);
        return (
          <Link
            key={r.id}
            to={`/revisit?id=${r.id}`}
            className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] hover:bg-surface-2"
          >
            {r.question ? <CircleHelp size={14} className="text-fg-3" /> : <NotebookText size={14} className="text-fg-3" />}
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span className="text-xs text-fg-3">{d === 0 ? "today" : `${d}d`}</span>
          </Link>
        );
      })}
      {active.length > limit && (
        <Link to="/revisit" className="mt-1 flex items-center gap-1 px-2 py-1 text-xs text-fg-3 hover:text-fg">
          {active.length - limit} more <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}
