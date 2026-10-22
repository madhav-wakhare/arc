import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Book as BookIcon, BookMarked, ChevronRight, GraduationCap, Newspaper, Radar as RadarIcon, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookCover } from "../components/BookCover";
import { Panel } from "../components/dash";
import { Cover, Thumb } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { LearningShell } from "../components/LearningNav";
import { ArticleThumb } from "../components/Reading";
import { Card, Input } from "../components/ui";
import { api, type Article, type Book, type Item } from "../lib/api";
import { useRevisions } from "../lib/hooks";
import { KIND_LABEL, useLearningIndex, type LearningEntry, type LearningKind } from "../lib/learningIndex";
import { fmtMinutes, hostOf, timeAgo } from "../lib/meta";

/** One line in the overview: an icon for the kind, the title, and a short detail on the right. */
function Line({ icon, title, detail, progress, onClick }: { icon: ReactNode; title: string; detail?: ReactNode; progress?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{title}</span>
        {progress !== undefined && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-book" style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
      {detail && <span className="shrink-0 text-xs text-fg-3">{detail}</span>}
    </button>
  );
}

const KIND_ICON: Record<LearningKind, ReactNode> = {
  topic: <GraduationCap size={14} className="text-learning" />,
  blog: <Newspaper size={14} className="text-fg-3" />,
  book: <BookIcon size={14} className="text-book" />,
  revisit: <BookMarked size={14} className="text-fg-3" />,
  radar: <RadarIcon size={14} className="text-accent" />,
};
const ORDER: LearningKind[] = ["topic", "blog", "book", "revisit", "radar"];

/** Results of the Learning search, grouped by where they live. Every word must match. */
function SearchResults({ q, index, onOpen }: { q: string; index: LearningEntry[]; onOpen: (e: LearningEntry) => void }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = index.filter((e) => words.every((w) => e.text.includes(w)));
  if (!hits.length)
    return (
      <Card>
        <p className="py-12 text-center text-[13px] text-fg-3">Nothing in Learning or Radar matches “{q}”.</p>
      </Card>
    );
  return (
    <div className="space-y-5">
      {ORDER.map((kind) => {
        const list = hits.filter((e) => e.kind === kind);
        if (!list.length) return null;
        return (
          <Panel key={kind} title={`${KIND_LABEL[kind]} · ${list.length}`}>
            <div className="space-y-0.5">
              {list.map((e) => (
                <Line key={`${kind}-${e.id}`} icon={KIND_ICON[kind]} title={e.title} detail={e.detail} onClick={() => onOpen(e)} />
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}


/** A section in the manner of the App Store: a title, "See all", and its content below. */
function Shelf({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
        {to && (
          <Link to={to} className="flex items-center gap-0.5 text-[13px] text-fg-3 transition-colors hover:text-fg">
            See all <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** A row of tiles that scrolls sideways when it does not fit. */
function Row({ children }: { children: ReactNode }) {
  return <div className="-mx-1 flex snap-x gap-5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">{children}</div>;
}

/** A picture tile: wide for videos and posts, tall for book covers. */
function Tile({
  picture,
  title,
  detail,
  progress,
  wide,
  book,
  onClick,
}: {
  picture: ReactNode;
  title: string;
  detail?: ReactNode;
  progress?: number;
  wide?: boolean;
  book?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={clsx("group shrink-0 snap-start text-left", book ? "w-[132px]" : wide && "w-[264px]")}>
      <div
        className={clsx(
          "overflow-hidden bg-surface-2 ring-1 ring-inset ring-white/[0.06] transition duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.7)]",
          book ? "aspect-[2/3] rounded-lg shadow-[0_8px_20px_-10px_rgb(0_0_0/0.7)]" : "aspect-video rounded-2xl",
        )}
      >
        {picture}
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug">{title}</p>
      {detail && <p className="mt-0.5 truncate text-[12px] text-fg-3">{detail}</p>}
      {progress !== undefined && (
        <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full bg-fg/70" style={{ width: `${progress}%` }} />
        </span>
      )}
    </button>
  );
}

/** An inset grouped list, like iOS Settings. */
function Grouped({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/70 bg-surface">{children}</div>;
}

function ListRow({ lead, title, detail, onClick }: { lead: ReactNode; title: string; detail?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60">
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{title}</span>
        {detail && <span className="block truncate text-[12px] text-fg-3">{detail}</span>}
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-3/60" />
    </button>
  );
}

function Figure({ label, value, sub, to }: { label: string; value: ReactNode; sub?: string; to?: string }) {
  const body = (
    <>
      <p className="text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-2 text-[13px] text-fg-2">{label}</p>
      {sub && <p className="text-[12px] text-fg-3">{sub}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-xl transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** Learning → Overview: what you are in the middle of, what is next, and what to revisit. */
export default function LearningOverview() {
  const { openItem } = useActions();
  const navigate = useNavigate();
  const { data: all = [] } = useQuery({ queryKey: ["items", "learning"], queryFn: () => api.get<Item[]>("/items?type=learning") });
  const { data: articles = [] } = useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });
  const { data: books = [] } = useQuery({ queryKey: ["books"], queryFn: () => api.get<Book[]>("/books") });
  const { data: revisions = [] } = useRevisions();
  const index = useLearningIndex();
  const [q, setQ] = useState("");

  const topics = all.filter((i) => !i.book_id && !i.article_id);
  // Same buckets as the Topics tab: "To learn" is backlog and today, "In progress" is in progress.
  const topicsNow = topics.filter((i) => i.status === "in_progress");
  const topicsNext = topics
    .filter((i) => i.status === "backlog" || i.status === "today")
    .sort((a, b) => Number(b.status === "today") - Number(a.status === "today") || a.position - b.position);
  const booksNow = books.filter((b) => b.status === "reading");
  const booksNext = books.filter((b) => b.status === "want");
  const blogsNow = articles.filter((a) => a.status === "reading");
  const blogsNext = articles.filter((a) => a.status === "unread");
  const toRevisit = revisions.filter((r) => r.status === "active").length;
  const nothingNow = !topicsNow.length && !booksNow.length && !blogsNow.length;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <LearningShell
        actions={
          <Input
            icon={<Search size={14} />}
            placeholder="Search all of Learning and Radar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            className="w-full sm:w-80"
          />
        }
      >
      {q.trim() ? (
        <div>
          <SearchResults q={q.trim()} index={index} onOpen={(e) => (e.itemId ? openItem(e.itemId) : e.to && navigate(e.to))} />
        </div>
      ) : (
      <div className="space-y-12 pb-6">
        {/* Quiet numbers, no boxes. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
          <Figure label="Topics to learn" value={topicsNext.length} sub={`${topicsNow.length} in progress`} to="/learning/topics" />
          <Figure label="Blogs to read" value={blogsNext.length} sub={`${blogsNow.length} reading`} to="/learning/articles" />
          <Figure label="Books to read" value={booksNext.length} sub={`${booksNow.length} reading`} to="/learning/books" />
          <Figure label="To revisit" value={toRevisit} to="/learning/revisit" />
          <Figure label="Time on topics" value={fmtMinutes(topics.reduce((m, i) => m + i.logged_minutes, 0))} sub="All time" />
        </div>

        <Shelf title="Continue learning">
          {nothingNow ? (
            <p className="py-2 text-[14px] text-fg-3">Nothing in progress. Pick something from Up next.</p>
          ) : (
            <Row>
              {topicsNow.map((i) => (
                <Tile
                  key={`t${i.id}`}
                  wide
                  picture={i.url ? <Thumb itemId={i.id} url={i.url} className="size-full" /> : <Cover url={null} className="size-full" />}
                  title={i.title}
                  detail={[i.url && hostOf(i.url), i.logged_minutes > 0 && fmtMinutes(i.logged_minutes)].filter(Boolean).join(" · ")}
                  onClick={() => openItem(i.id)}
                />
              ))}
              {booksNow.map((b) => (
                <Tile
                  key={`b${b.id}`}
                  book
                  picture={<BookCover book={b} className="size-full" />}
                  title={b.title}
                  detail={b.pages ? `Page ${b.current_page} of ${b.pages}` : b.author}
                  progress={b.pages ? Math.min(100, Math.round((b.current_page / b.pages) * 100)) : undefined}
                  onClick={() => navigate(`/learning/books?book=${b.id}`)}
                />
              ))}
              {blogsNow.map((a) => (
                <Tile
                  key={`a${a.id}`}
                  wide
                  picture={<ArticleThumb src={a.image} articleId={a.id} className="size-full object-cover" />}
                  title={a.title}
                  detail={a.site}
                  onClick={() => navigate(`/learning/articles?article=${a.id}`)}
                />
              ))}
            </Row>
          )}
        </Shelf>

        {topicsNext.length > 0 && (
          <Shelf title="Up next in Topics" to="/learning/topics">
            <Row>
              {topicsNext.slice(0, 8).map((i) => (
                <Tile
                  key={i.id}
                  wide
                  picture={i.url ? <Thumb itemId={i.id} url={i.url} className="size-full" /> : <Cover url={null} className="size-full" />}
                  title={i.title}
                  detail={i.url ? hostOf(i.url) : i.key}
                  onClick={() => openItem(i.id)}
                />
              ))}
            </Row>
          </Shelf>
        )}

        <div className="grid gap-12 xl:grid-cols-2">
          {blogsNext.length > 0 && (
            <Shelf title="Blogs to read" to="/learning/articles">
              <Grouped>
                {blogsNext.slice(0, 5).map((a) => (
                  <ListRow
                    key={a.id}
                    lead={<ArticleThumb src={a.image} articleId={a.id} className="h-10 w-14 shrink-0 rounded-md object-cover" />}
                    title={a.title}
                    detail={a.site}
                    onClick={() => navigate(`/learning/articles?article=${a.id}`)}
                  />
                ))}
              </Grouped>
            </Shelf>
          )}
          <Shelf title="Revisit next" to="/learning/revisit">
            <Grouped>
              {revisions.filter((r) => r.status === "active").slice(0, 5).map((r) => (
                <ListRow
                  key={r.id}
                  lead={<BookMarked size={16} strokeWidth={1.75} className="mx-1 shrink-0 text-fg-3" />}
                  title={r.title}
                  detail={`Added ${timeAgo(r.created_at)}`}
                  onClick={() => navigate(`/learning/revisit?id=${r.id}`)}
                />
              ))}
              {!toRevisit && <p className="px-4 py-6 text-center text-[13px] text-fg-3">Nothing on your Revisit list</p>}
            </Grouped>
          </Shelf>
        </div>

        {booksNext.length > 0 && (
          <Shelf title="On your shelf" to="/learning/books">
            <Row>
              {booksNext.slice(0, 10).map((b) => (
                <Tile
                  key={b.id}
                  book
                  picture={<BookCover book={b} className="size-full" />}
                  title={b.title}
                  detail={b.author}
                  onClick={() => navigate(`/learning/books?book=${b.id}`)}
                />
              ))}
            </Row>
          </Shelf>
        )}
      </div>
      )}
      </LearningShell>
    </div>
  );
}

