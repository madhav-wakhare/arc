import clsx from "clsx";
import { BookOpen, CalendarDays, CheckSquare, Clock, Hourglass, Link2, MessageSquare, Repeat, Youtube } from "lucide-react";
import { useState } from "react";
import type { Item } from "../lib/api";
import { ObsidianIcon } from "./ObsidianIcon";
import { PriorityIcon, TypeIcon, dueTone, fmtDate, fmtMinutes, pendingDays, youtubeId } from "../lib/meta";

/** "Pending N days" chip. Amber after 7 days, red after 14. */
export function PendingBadge({ item, long }: { item: Item; long?: boolean }) {
  const d = pendingDays(item);
  if (d === null) return null;
  const tone =
    d >= 14
      ? "border-critical/40 bg-critical/10 text-critical"
      : d >= 7
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-line bg-surface-2 text-fg-2";
  return (
    <span
      title={`Pending for ${d} ${d === 1 ? "day" : "days"} (since created)`}
      className={clsx("inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[11px] font-medium", tone)}
    >
      <Hourglass size={10} />
      {d}d{long && " pending"}
    </span>
  );
}

export function ItemCard({ item, onOpen, dragging }: { item: Item; onOpen: () => void; dragging?: boolean }) {
  return (
    <div
      onClick={onOpen}
      className={clsx(
        "cursor-pointer rounded-lg border border-line bg-surface p-3 transition-colors hover:border-line-strong",
        dragging && "rotate-1 shadow-[var(--shadow)]",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-3">
        <TypeIcon type={item.type} size={13} />
        <span className="font-mono">{item.key}</span>
        <div className="flex-1" />
        <PendingBadge item={item} />
      </div>
      <p className="text-[13px] leading-snug">{item.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-3">
        {item.priority !== "none" && <PriorityIcon priority={item.priority} size={13} />}
        {item.due_date && (
          <span className={clsx("flex items-center gap-1", dueTone(item))}>
            <CalendarDays size={12} /> {fmtDate(item.due_date)}
          </span>
        )}
        {item.logged_minutes > 0 && (
          <span className="flex items-center gap-1">
            <Clock size={12} /> {fmtMinutes(item.logged_minutes)}
            {item.estimate_minutes ? ` / ${fmtMinutes(item.estimate_minutes)}` : ""}
          </span>
        )}
        {item.subtask_count > 0 && (
          <span className="flex items-center gap-1">
            <CheckSquare size={12} /> {item.subtask_done}/{item.subtask_count}
          </span>
        )}
        {item.comment_count > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={12} /> {item.comment_count}
          </span>
        )}
        {item.url && <Link2 size={12} />}
        {item.obsidian_path && <ObsidianIcon size={12} className="text-accent" />}
        {item.recurrence !== "none" && <Repeat size={12} />}
        {item.labels.slice(0, 2).map((l) => (
          <span key={l} className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** YouTube thumbnail, or a link icon when there is no thumbnail or it fails to load. */
export function Thumb({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const yt = youtubeId(url);
  if (yt && !failed)
    return (
      <img
        src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={clsx("object-cover", className)}
      />
    );
  return (
    <div className={clsx("flex items-center justify-center bg-surface-2", className)}>
      {yt ? <Youtube size={22} className="text-fg-3" /> : url ? <Link2 size={20} className="text-fg-3" /> : <BookOpen size={22} className="text-fg-3" />}
    </div>
  );
}
