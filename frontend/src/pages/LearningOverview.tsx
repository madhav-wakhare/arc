import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Book as BookIcon, BookMarked, BookOpen, GraduationCap, Newspaper, Radar as RadarIcon, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Panel, Stat, StatRow } from "../components/dash";
import { useActions } from "../components/Layout";
import { LearningShell } from "../components/LearningNav";
import { RevisePreview } from "../components/RevisePreview";
import { Card, Input, PageHeader } from "../components/ui";
import { api, type Article, type Book, type Item } from "../lib/api";
import { useRevisions } from "../lib/hooks";
import { KIND_LABEL, useLearningIndex, type LearningEntry, type LearningKind } from "../lib/learningIndex";
import { fmtMinutes, hostOf } from "../lib/meta";

function More({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
      {children} <ArrowRight size={12} />
    </Link>
  );
}

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

const topicIcon = <GraduationCap size={14} className="text-learning" />;
const blogIcon = <Newspaper size={14} className="text-fg-3" />;
const bookIcon = <BookIcon size={14} className="text-book" />;

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
      <PageHeader
        icon={<BookOpen size={18} />}
        title="Learning"
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
      />
      <LearningShell>
      {q.trim() ? (
        <div>
          <SearchResults q={q.trim()} index={index} onOpen={(e) => (e.itemId ? openItem(e.itemId) : e.to && navigate(e.to))} />
        </div>
      ) : (
      <div className="space-y-5">
        <StatRow>
          <Stat label="Topics to learn" value={topicsNext.length} sub={`${topicsNow.length} in progress`} to="/learning/topics" />
          <Stat label="Blogs to read" value={blogsNext.length} sub={`${blogsNow.length} reading`} to="/learning/articles" />
          <Stat label="Books to read" value={booksNext.length} sub={`${booksNow.length} reading`} to="/learning/books" />
          <Stat label="To revisit" value={toRevisit} to="/learning/revisit" />
          <Stat
            label="Time on topics"
            value={fmtMinutes(topics.reduce((m, i) => m + i.logged_minutes, 0))}
            sub="logged, all time"
          />
        </StatRow>

        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel title="Continue learning">
              {nothingNow ? (
                <p className="py-6 text-center text-[13px] text-fg-3">Nothing in progress. Pick something from Up next.</p>
              ) : (
                <div className="space-y-0.5">
                  {topicsNow.map((i) => (
                    <Line
                      key={`t${i.id}`}
                      icon={topicIcon}
                      title={i.title}
                      detail={[i.url && hostOf(i.url), i.logged_minutes > 0 && fmtMinutes(i.logged_minutes)].filter(Boolean).join(" · ")}
                      onClick={() => openItem(i.id)}
                    />
                  ))}
                  {booksNow.map((b) => (
                    <Line
                      key={`b${b.id}`}
                      icon={bookIcon}
                      title={b.title}
                      progress={b.pages ? Math.min(100, Math.round((b.current_page / b.pages) * 100)) : undefined}
                      detail={b.pages ? `p. ${b.current_page} of ${b.pages}` : b.author}
                      onClick={() => navigate(`/learning/books?book=${b.id}`)}
                    />
                  ))}
                  {blogsNow.map((a) => (
                    <Line key={`a${a.id}`} icon={blogIcon} title={a.title} detail={a.site} onClick={() => window.open(a.url, "_blank", "noreferrer")} />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Up next">
              <div className="grid gap-5 md:grid-cols-3">
                {[
                  { title: "Topics", to: "/learning/topics", rows: topicsNext.slice(0, 4).map((i) => ({ key: `t${i.id}`, icon: topicIcon, title: i.title, open: () => openItem(i.id) })) },
                  { title: "Engineering Blogs", to: "/learning/articles", rows: blogsNext.slice(0, 4).map((a) => ({ key: `a${a.id}`, icon: blogIcon, title: a.title, open: () => window.open(a.url, "_blank", "noreferrer") })) },
                  { title: "Books", to: "/learning/books", rows: booksNext.slice(0, 4).map((b) => ({ key: `b${b.id}`, icon: bookIcon, title: b.title, open: () => navigate(`/learning/books?book=${b.id}`) })) },
                ].map((col) => (
                  <div key={col.title} className="min-w-0">
                    <div className="mb-1 flex items-center justify-between px-2">
                      <span className="text-xs font-medium text-fg-3">{col.title}</span>
                      <More to={col.to}>All</More>
                    </div>
                    {col.rows.length ? (
                      col.rows.map((r) => <Line key={r.key} icon={r.icon} title={r.title} onClick={r.open} />)
                    ) : (
                      <p className="px-2 py-2 text-[13px] text-fg-3">Nothing queued</p>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title={`Revisit next · ${toRevisit}`} action={<More to="/learning/revisit">Revisit</More>}>
            <RevisePreview limit={6} />
          </Panel>
        </div>
      </div>
      )}
      </LearningShell>
    </div>
  );
}

