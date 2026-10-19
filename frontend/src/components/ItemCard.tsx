import clsx from "clsx";
import { BookOpen, CalendarDays, CheckSquare, Clock, Hourglass, Link2, MessageSquare, Repeat, Youtube } from "lucide-react";
import { useState } from "react";
import type { Item } from "../lib/api";
import { ObsidianIcon } from "./ObsidianIcon";
import { PriorityIcon, TypeIcon, dueTone, fmtDate, fmtMinutes, pendingDays, pendingTone, youtubeId } from "../lib/meta";

/** "Pending N days" chip. Neutral, then amber (10d), orange (15d) and red (30d). */
export function PendingBadge({ item, long }: { item: Item; long?: boolean }) {
  const d = pendingDays(item);
  if (d === null) return null;
  const tone = pendingTone(d);
  return (
    <span
      title={`Pending for ${d} ${d === 1 ? "day" : "days"} since created${tone.label ? ` · ${tone.label}` : ""}`}
      className={clsx(
        "inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[11px] font-medium transition-colors",
        tone.badge,
      )}
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

/** Short stable hash, so a changed link gets a fresh (browser-cached) thumbnail URL. */
export function urlHash(s: string) {
  // Bump the prefix when thumbnails are rendered differently, so browsers drop old copies.
  s = `v2:${s}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Link thumbnail served by Arc: fetched once, shrunk to a small WebP and cached on disk and in
 * the browser. Falls back to an icon when the link has no preview image.
 */
export function Thumb({ itemId, url, className }: { itemId: number; url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const yt = youtubeId(url);
  if (url && !failed)
    return (
      <img
        src={`/api/items/${itemId}/thumb?v=${urlHash(url)}`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={clsx("bg-surface-2 object-cover", className)}
      />
    );
  return (
    <div className={clsx("flex items-center justify-center bg-surface-2", className)}>
      {yt ? <Youtube size={22} className="text-fg-3" /> : url ? <Link2 size={20} className="text-fg-3" /> : <BookOpen size={22} className="text-fg-3" />}
    </div>
  );
}
