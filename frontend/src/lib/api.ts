export type ItemType = "task" | "learning" | "note";
export type Status = "backlog" | "today" | "in_progress" | "done";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";

export interface Project {
  id: number;
  key: string;
  name: string;
  description: string;
  color: string;
  icon: string | null;
  archived: number;
  item_count?: number;
  open_count?: number;
}

export interface Item {
  id: number;
  key: string;
  project_id: number;
  project_key: string;
  project_name: string;
  project_color: string;
  project_icon: string | null;
  type: ItemType;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  url: string | null;
  labels: string[];
  estimate_minutes: number | null;
  position: number;
  recurrence: Recurrence;
  recurrence_next_id: number | null;
  obsidian_path: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  completed_at: string | null;
  logged_minutes: number;
  subtask_count: number;
  subtask_done: number;
  comment_count: number;
  revision_id: number | null;
  /** Set when this ticket was made from a book on Learning → Books. */
  book_id: number | null;
  subtasks?: Subtask[];
}

export interface Subtask {
  id: number;
  item_id: number;
  title: string;
  done: number;
  position: number;
}
export interface Comment {
  id: number;
  item_id: number;
  body: string;
  created_at: string;
  edited_at: string | null;
}
export interface Worklog {
  id: number;
  item_id: number;
  started_at: string;
  minutes: number;
  comment: string;
  created_at: string;
}
export interface HistoryEntry {
  id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
export interface Timer {
  item_id: number;
  started_at: string;
  key: string;
  title: string;
}
export interface Review {
  date: string;
  went_well: string;
  blockers: string;
  tomorrow: string;
  updated_at: string | null;
}
export type DayByType = { date: string; task: number; learning: number; note: number };
export interface RangeStats {
  completed: number;
  created: number;
  minutes: number;
  learning_minutes: number;
}
export interface ProjectMinutes {
  id: number;
  key: string;
  name: string;
  color: string;
  icon: string | null;
  minutes: number;
}
export interface Overview {
  range: { start: string; end: string; days: number };
  current: RangeStats;
  previous: RangeStats;
  open: number;
  inbox_open: number;
  /** Open items waiting 30+ days since they were created. */
  stale_open: number;
  revise_open: number;
  overdue: number;
  by_status: { status: Status; count: number }[];
  oldest_open: Item[];
}
export interface Weekly {
  week_start: string;
  week_end: string;
  current: RangeStats;
  previous: RangeStats;
  minutes_per_day: DayByType[];
  minutes_by_project: ProjectMinutes[];
  completed: Item[];
  unfinished: Item[];
  jots_captured: number;
  jots_converted: number;
  reviews: Review[];
}
export interface SearchHit extends Item {
  match: "key" | "item" | "comment";
  snippet: string;
}
export interface Settings {
  version: string;
  obsidian: {
    vault_dir: string;
    vault_host_path: string;
    folder: string;
    articles_folder: string | null;
    mounted: boolean;
    writable: boolean;
    is_obsidian_vault: boolean;
  };
  backup_dir: string;
  timezone: string;
  auto_reexport: boolean;
  monthly_backup: boolean;
  trash_days: number;
  quotes_on_dashboard: boolean;
  quotes_on_board: boolean;
  quotes_interval: number;
  weekend_mode: boolean;
}
export type WeekendSlot = "morning" | "afternoon" | "evening";
export type WeekendKind = "study" | "revise" | "life";
export type LifeCategory = "travel" | "movie" | "outing" | "social" | "fitness" | "hobby" | "chores" | "rest" | "other";
export interface PlanEntry {
  id: number;
  day: string;
  slot: WeekendSlot;
  kind: WeekendKind;
  title: string;
  category: LifeCategory;
  item_id: number | null;
  item_key: string | null;
  item_type: ItemType | null;
  item_status: Status | null;
  revision_id: number | null;
  idea_id: number | null;
  done: number;
  position: number;
  created_at: string;
}
export interface Weekend {
  saturday: string;
  sunday: string;
  previous: string;
  next: string;
  entries: PlanEntry[];
}
export interface Idea {
  id: number;
  title: string;
  category: LifeCategory;
  note: string;
  url: string | null;
  done_at: string | null;
  planned_day: string | null;
  created_at: string;
}
export interface Quote {
  id: number;
  text: string;
  author: string;
  created_at: string;
}
export type JotStatus = "open" | "converted" | "archived";
export interface Jot {
  id: number;
  body: string;
  details: string;
  status: JotStatus;
  item_id: number | null;
  item_key: string | null;
  item_title: string | null;
  item_type: ItemType | null;
  item_deleted: number | null;
  url: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  converted_at: string | null;
}
export interface Revision {
  id: number;
  title: string;
  notes: string;
  question: string;
  url: string | null;
  item_id: number | null;
  item_key: string | null;
  item_title: string | null;
  item_type: ItemType | null;
  item_deleted: number | null;
  source: "manual" | "ticket" | "radar";
  status: "active" | "revised";
  priority: Priority;
  timer_started_at: string | null;
  total_minutes: number;
  session_count: number;
  last_revised_at: string | null;
  created_at: string;
  updated_at: string;
  revised_at: string | null;
}
export interface RevisionSession {
  id: number;
  revision_id: number;
  minutes: number;
  created_at: string;
}
export interface TrashProject extends Project {
  deleted_at: string;
  days_left: number;
}
export interface TrashItem {
  id: number;
  key: string;
  type: ItemType;
  title: string;
  status: Status;
  url: string | null;
  deleted_at: string;
  days_left: number;
  project_id: number;
  project_name: string;
  project_color: string;
  project_icon: string | null;
  project_deleted: number;
  deleted_with_project: number;
}
export interface Trash {
  projects: TrashProject[];
  items: TrashItem[];
  trash_days: number;
}
export interface Backup {
  path: string;
  size_bytes: number;
  created_at: string;
}

export class ApiError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = typeof data.detail === "string" ? data.detail : data.detail?.[0]?.msg ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: (path: string) => request<void>("DELETE", path),
};

export type ArticleStatus = "unread" | "reading" | "read";
export interface Article {
  id: number;
  url: string;
  title: string;
  site: string;
  author: string;
  description: string;
  image: string | null;
  notes: string;
  tags: string[];
  status: ArticleStatus;
  favorite: number;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  obsidian_path: string | null;
  exported_at: string | null;
  /** The collection whose Obsidian subfolder holds the note. */
  collection_id: number | null;
  collections: { id: number; name: string }[];
  folder_name: string | null;
}
export interface Collection {
  id: number;
  name: string;
  count: number;
  created_at: string;
}
export interface LinkPreview {
  url: string;
  title: string;
  site: string;
  author: string;
  description: string;
  image: string | null;
}

export type BookStatus = "want" | "reading" | "finished";
export interface Book {
  id: number;
  title: string;
  author: string;
  cover: string | null;
  pages: number | null;
  current_page: number;
  year: number | null;
  olid: string | null;
  notes: string;
  status: BookStatus;
  item_id: number | null;
  item_key: string | null;
  item_status: Status | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}
export interface BookHit {
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  cover: string | null;
  olid: string | null;
}
