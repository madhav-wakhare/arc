/**
 * One searchable list of everything in Learning (topics, blogs, books, revisit) plus open Radar topics.
 * Used by the Learning search and to warn before adding something that is already there.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type Article, type Book, type Item } from "./api";
import { useJots, useRevisions } from "./hooks";
import { youtubeId } from "./meta";

export type LearningKind = "topic" | "blog" | "book" | "revisit" | "radar";

export const KIND_LABEL: Record<LearningKind, string> = {
  topic: "Topics",
  blog: "Engineering Blogs",
  book: "Books",
  revisit: "Revisit",
  radar: "Radar",
};

export interface LearningEntry {
  kind: LearningKind;
  id: number;
  title: string;
  url: string | null;
  /** Short line under the title: site, author, status. */
  detail: string;
  /** Everything searchable, lower-cased. */
  text: string;
  /** Where to open it: an item opens in the item panel, the rest by route. */
  itemId?: number;
  to?: string;
}

/** Same link however it is written: no protocol, www, trailing slash or tracking; one id per YouTube video. */
export function normUrl(url: string | null | undefined): string {
  if (!url) return "";
  const yt = youtubeId(url);
  if (yt) return `yt:${yt}`;
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

const STOP = new Set(["a", "an", "the", "of", "and", "or", "to", "in", "on", "for", "with", "how", "what", "is", "are", "by", "vs"]);

/** Lower-case words without punctuation or filler words. */
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

/** Titles count as the same when they match after normalising, one contains the other, or most words overlap. */
function similarTitle(a: string, b: string): boolean {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 6 && long.includes(short) && short.length / long.length >= 0.5) return true;
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  if (xs.size < 2 || ys.size < 2) return false;
  const shared = [...xs].filter((w) => ys.has(w)).length;
  return shared / new Set([...xs, ...ys]).size >= 0.75;
}

/** Entries that look like the same thing as a new title and/or link (same link first). */
export function findSimilar(entries: LearningEntry[], title: string, url?: string | null): LearningEntry[] {
  const u = normUrl(url);
  const sameLink = u ? entries.filter((e) => normUrl(e.url) === u) : [];
  const sameTitle = title.trim().length >= 3 ? entries.filter((e) => !sameLink.includes(e) && similarTitle(e.title, title)) : [];
  return [...sameLink, ...sameTitle].slice(0, 5);
}

export function useLearningIndex(): LearningEntry[] {
  const { data: items = [] } = useQuery({ queryKey: ["items", "learning"], queryFn: () => api.get<Item[]>("/items?type=learning") });
  const { data: articles = [] } = useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });
  const { data: books = [] } = useQuery({ queryKey: ["books"], queryFn: () => api.get<Book[]>("/books") });
  const { data: revisions = [] } = useRevisions();
  const { data: jots = [] } = useJots();

  const topicStatus: Record<string, string> = { backlog: "to learn", today: "to learn", in_progress: "in progress", done: "done" };
  return [
    // Tickets made from books or blog posts are listed once, as the book or the blog post.
    ...items
      .filter((i) => !i.book_id && !i.article_id)
      .map<LearningEntry>((i) => ({
        kind: "topic",
        id: i.id,
        title: i.title,
        url: i.url,
        detail: `${i.key} · ${topicStatus[i.status]}`,
        text: `${i.key} ${i.title} ${i.description} ${i.labels.join(" ")} ${i.url ?? ""}`.toLowerCase(),
        itemId: i.id,
      })),
    ...articles.map<LearningEntry>((a) => ({
      kind: "blog",
      id: a.id,
      title: a.title,
      url: a.url,
      detail: [a.site, a.status === "unread" ? "to read" : a.status].filter(Boolean).join(" · "),
      text: `${a.title} ${a.site} ${a.author} ${a.description} ${a.notes} ${a.tags.join(" ")} ${a.url}`.toLowerCase(),
      to: `/learning/articles?article=${a.id}`,
    })),
    ...books.map<LearningEntry>((b) => ({
      kind: "book",
      id: b.id,
      title: b.title,
      url: null,
      detail: [b.author, b.status === "want" ? "to read" : b.status].filter(Boolean).join(" · "),
      text: `${b.title} ${b.author} ${b.notes}`.toLowerCase(),
      to: `/learning/books?book=${b.id}`,
    })),
    ...revisions.map<LearningEntry>((r) => ({
      kind: "revisit",
      id: r.id,
      title: r.title,
      url: r.url,
      detail: r.status === "active" ? "to revisit" : "revisited",
      text: `${r.title} ${r.notes} ${r.question} ${r.url ?? ""}`.toLowerCase(),
      to: `/learning/revisit?id=${r.id}`,
    })),
    ...jots
      .filter((j) => j.status === "open")
      .map<LearningEntry>((j) => ({
        kind: "radar",
        id: j.id,
        title: j.body,
        url: j.url,
        detail: "to review",
        text: `${j.body} ${j.details} ${j.tags.join(" ")} ${j.url ?? ""}`.toLowerCase(),
        to: `/radar?topic=${j.id}`,
      })),
  ];
}
