import {
  BookOpen,
  CheckSquare,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  StickyNote,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  Equal,
  Minus,
  type LucideIcon,
} from "lucide-react";
import type { Item, ItemType, Priority, Recurrence, Status } from "./api";

export const STATUSES: { value: Status; label: string; icon: LucideIcon; tone: string }[] = [
  { value: "backlog", label: "Backlog", icon: CircleDashed, tone: "text-fg-3" },
  { value: "today", label: "Today", icon: Circle, tone: "text-task" },
  { value: "in_progress", label: "In Progress", icon: CircleDot, tone: "text-warning" },
  { value: "done", label: "Done", icon: CircleCheck, tone: "text-good" },
];

export const TYPES: { value: ItemType; label: string; icon: LucideIcon; tone: string }[] = [
  { value: "task", label: "Task", icon: CheckSquare, tone: "text-task" },
  { value: "learning", label: "Learning", icon: BookOpen, tone: "text-learning" },
  { value: "note", label: "Note", icon: StickyNote, tone: "text-note" },
];

export const PRIORITIES: { value: Priority; label: string; icon: LucideIcon; tone: string }[] = [
  // Jira-style: each level has its own shape and colour so they are easy to tell apart.
  { value: "urgent", label: "Urgent", icon: ChevronsUp, tone: "text-critical" },
  { value: "high", label: "High", icon: ChevronUp, tone: "text-serious" },
  { value: "medium", label: "Medium", icon: Equal, tone: "text-warning" },
  { value: "low", label: "Low", icon: ChevronDown, tone: "text-task" },
  { value: "none", label: "No priority", icon: Minus, tone: "text-fg-3" },
];

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export const statusMeta = (s: Status) => STATUSES.find((x) => x.value === s)!;
export const typeMeta = (t: ItemType) => TYPES.find((x) => x.value === t)!;
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.value === p)!;

export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const m = statusMeta(status);
  return <m.icon size={size} className={m.tone} strokeWidth={2} />;
}
export function TypeIcon({ type, size = 14 }: { type: ItemType; size?: number }) {
  const m = typeMeta(type);
  return <m.icon size={size} className={m.tone} strokeWidth={2} />;
}
export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const m = priorityMeta(priority);
  return (
    <span title={`${m.label} priority`} className="inline-flex shrink-0">
      <m.icon size={size} className={m.tone} strokeWidth={2.5} />
    </span>
  );
}

// ---------------------------------------------------------------- formatting

export function fmtMinutes(min: number | null | undefined): string {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtHours(min: number): string {
  return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)}h`;
}

const parse = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00` : s);

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const a = parse(from);
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Days an open item has been pending since it was created. Null when done. */
export function pendingDays(item: Item): number | null {
  return item.status === "done" ? null : daysBetween(item.created_at);
}

export function fmtDate(s: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  if (!s) return "";
  return parse(s).toLocaleDateString(undefined, opts);
}

export function fmtDateTime(s: string) {
  return parse(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(s: string): string {
  const diff = (Date.now() - parse(s).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  return d < 30 ? `${d}d ago` : fmtDate(s);
}

export function dueTone(item: Item): string {
  if (!item.due_date || item.status === "done") return "text-fg-3";
  const d = daysBetween(item.due_date);
  if (d > 0) return "text-critical";
  if (d === 0) return "text-warning";
  return "text-fg-3";
}

export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}

export function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Jira-style duration: "1w 2d 3h 30m" (1d = 8h, 1w = 5d). Bare number = minutes. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const units: Record<string, number> = { w: 2400, d: 480, h: 60, m: 1 };
  let total = 0;
  const rest = t.replace(/(\d+(?:\.\d+)?)\s*([wdhm])/g, (_, n, u) => {
    total += Number(n) * units[u];
    return "";
  });
  return rest.trim() || total <= 0 ? NaN : Math.round(total);
}

/** "wireguard, openvpn" -> ["wireguard", "openvpn"]. Same rule as split_topic in the backend. */
export function splitTopic(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const part = raw.replace(/^[\s-]+|[\s-]+$/g, "");
    if (part && !seen.has(part.toLowerCase())) {
      seen.add(part.toLowerCase());
      out.push(part);
    }
  }
  return out;
}
