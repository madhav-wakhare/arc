import clsx from "clsx";
import { CalendarDays, GraduationCap, CheckSquare, Clock, CornerDownRight, ListTree, Hourglass, Link2, MessageSquare, Repeat, Youtube } from "lucide-react";
import { useState } from "react";
import type { Item } from "../lib/api";
import { ObsidianIcon } from "./ObsidianIcon";
import { ItemIcon, PriorityIcon, dueTone, fmtDate, fmtMinutes, hostOf, pendingDays, pendingTone, youtubeId, urlHash } from "../lib/meta";

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
        <ItemIcon item={item} size={13} />
        <span className="font-mono">{item.key}</span>
        {item.book_id && <span className="font-medium text-book">Book</span>}
        {item.article_id && <span className="font-medium text-accent">Blog</span>}
        {item.parent_key && (
          <span className="flex min-w-0 items-center gap-0.5 truncate" title={`Child of ${item.parent_key}: ${item.parent_title}`}>
            <CornerDownRight size={11} /> {item.parent_key}
          </span>
        )}
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
        {item.child_count > 0 && (
          <span className="flex items-center gap-1" title="Child tickets done">
            <ListTree size={12} /> {item.child_done}/{item.child_count}
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
        {item.labels.filter((l) => !(item.book_id && l === "book") && !(item.article_id && l === "blog")).slice(0, 2).map((l) => (
          <span key={l} className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Link thumbnail served by Arc: fetched once, shrunk to a small WebP and cached on disk and in
 * the browser. Falls back to an icon when the link has no preview image.
 */
export function Thumb({ itemId, url, className }: { itemId: number; url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
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
  return <Cover url={url} className={className} />;
}

/** Stand-in picture for a link without one, or a topic without a link: a soft tint, an icon and the site. */
export function Cover({ url, className }: { url: string | null; className?: string }) {
  const yt = youtubeId(url);
  const Icon = yt ? Youtube : url ? Link2 : GraduationCap;
  return (
    // Frosted glass: a faint light wash with a bright top edge, neutral icon. No colour.
    <div
      className={clsx(
        "relative flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-white/[0.075] to-white/[0.02] shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-xl",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/[0.08]">
        <Icon size={18} strokeWidth={1.75} className="text-fg-2" />
      </span>
      {url && <span className="max-w-[80%] truncate text-[11px] text-fg-3">{hostOf(url)}</span>}
    </div>
  );
}
