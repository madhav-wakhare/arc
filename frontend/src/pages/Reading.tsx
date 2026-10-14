import clsx from "clsx";
import { Check, ExternalLink, MoreHorizontal, Newspaper, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ObsidianIcon } from "../components/ObsidianIcon";
import {
  ARTICLE_STATUSES,
  AddArticleModal,
  ArticleDrawer,
  ArticleThumb,
  ObsidianFolderModal,
  useArticleMutations,
  useArticles,
} from "../components/Reading";
import { Button, Card, Empty, IconButton, Input, Menu, PageHeader, Tabs } from "../components/ui";
import type { Article } from "../lib/api";
import { useLocalState, useSettings } from "../lib/hooks";
import { fmtDate } from "../lib/meta";

type Tab = "unread" | "reading" | "read" | "favorites" | "all";

const STATUS_DOT: Record<Article["status"], string> = {
  unread: "bg-fg-3",
  reading: "bg-accent",
  read: "bg-good",
};

function ArticleRow({ a, onOpen, onNeedFolder, onTag }: { a: Article; onOpen: () => void; onNeedFolder: () => void; onTag: (t: string) => void }) {
  const { update, exportNote, remove } = useArticleMutations();
  const { data: settings } = useSettings();
  const saveToObsidian = () => (settings?.obsidian.articles_folder ? exportNote.mutate(a.id) : onNeedFolder());
  const read = a.status === "read";
  return (
    <div className="group flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/50">
      <button onClick={onOpen} className="shrink-0" tabIndex={-1}>
        <ArticleThumb src={a.image} className="h-[60px] w-24 rounded-md border border-line" />
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={onOpen} className="block max-w-full text-left">
          <p className={clsx("line-clamp-1 text-[14px] font-medium leading-snug", read && "text-fg-2")}>{a.title}</p>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className={clsx("size-1.5 rounded-full", STATUS_DOT[a.status])} />
            {ARTICLE_STATUSES.find((s) => s.value === a.status)!.label}
          </span>
          <span>·</span>
          <span className="max-w-48 truncate">{a.site}</span>
          {a.author && a.author !== a.site && <span className="hidden max-w-40 truncate sm:inline">· {a.author}</span>}
          <span>· {fmtDate(read && a.read_at ? a.read_at : a.created_at)}</span>
          {a.tags.map((t) => (
            <button
              key={t}
              onClick={() => onTag(t)}
              className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2 hover:border-line-strong hover:text-fg"
            >
              {t}
            </button>
          ))}
        </div>
        {a.description && <p className="mt-1 line-clamp-1 text-xs text-fg-3">{a.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {a.obsidian_path && (
          <span title={`In Obsidian: ${a.obsidian_path}`} className="mr-1 text-accent">
            <ObsidianIcon size={14} />
          </span>
        )}
        <IconButton
          className={clsx("size-7", !a.favorite && "opacity-0 group-hover:opacity-100 max-md:opacity-100")}
          title={a.favorite ? "Remove from favourites" : "Add to favourites"}
          onClick={() => update.mutate({ id: a.id, favorite: !a.favorite })}
        >
          <Star size={14} className={a.favorite ? "fill-warning text-warning" : ""} />
        </IconButton>
        <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <Menu
            trigger={
              <IconButton className="size-7" title="More">
                <MoreHorizontal size={15} />
              </IconButton>
            }
            items={[
              { label: "Open article", icon: <ExternalLink size={13} />, onClick: () => window.open(a.url, "_blank", "noreferrer") },
              read
                ? { label: "Mark as to read", icon: <RotateCcw size={13} />, onClick: () => update.mutate({ id: a.id, status: "unread" }) }
                : { label: "Mark as read", icon: <Check size={13} />, onClick: () => update.mutate({ id: a.id, status: "read" }) },
              { label: a.obsidian_path ? "Save to Obsidian again" : "Save to Obsidian", icon: <ObsidianIcon size={13} />, onClick: saveToObsidian },
              { label: "Delete", icon: <Trash2 size={13} />, danger: true, onClick: () => remove.mutate(a.id) },
            ]}
          />
        </span>
      </div>
    </div>
  );
}

/** Reading list: articles and blog posts worth keeping, with notes, saved to Obsidian. */
export default function Reading() {
  const { data: articles = [], isLoading } = useArticles();
  const { data: settings } = useSettings();
  const [tab, setTab] = useLocalState<Tab>("smriti-reading-tab", "unread");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);

  const inTab = (a: Article, t: Tab) => (t === "all" ? true : t === "favorites" ? !!a.favorite : a.status === t);
  const count = (t: Tab) => articles.filter((a) => inTab(a, t)).length;
  const tags = useMemo(() => [...new Set(articles.flatMap((a) => a.tags))].sort(), [articles]);
  const needle = q.trim().toLowerCase();
  const list = articles.filter(
    (a) =>
      inTab(a, tab) &&
      (!tag || a.tags.includes(tag)) &&
      (!needle || `${a.title} ${a.site} ${a.author} ${a.tags.join(" ")} ${a.notes}`.toLowerCase().includes(needle)),
  );
  const open = articles.find((a) => a.id === openId) ?? null;
  const folder = settings?.obsidian.articles_folder;

  return (
    <div className="mx-auto w-full max-w-[1100px] pb-10">
      <PageHeader
        icon={<Newspaper size={18} />}
        title="Reading"
        actions={
          <>
            <Button
              icon={<ObsidianIcon size={14} className={folder ? "text-accent" : ""} />}
              onClick={() => setFolderOpen(true)}
              title="Obsidian folder for articles"
              className="max-w-56"
            >
              <span className="truncate">{folder ?? "Set Obsidian folder"}</span>
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add article
            </Button>
          </>
        }
      />
      <div className="space-y-4 px-4 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "unread", label: `To read · ${count("unread")}` },
              { value: "reading", label: `Reading · ${count("reading")}` },
              { value: "read", label: `Read · ${count("read")}` },
              { value: "favorites", label: `Favourites · ${count("favorites")}` },
              { value: "all", label: `All · ${count("all")}` },
            ]}
          />
          <div className="flex-1" />
          <Input icon={<Search size={14} />} placeholder="Search title, site, tags, notes" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64" />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={clsx(
                  "h-6 rounded-md border px-2 text-xs transition-colors",
                  tag === t ? "border-fg bg-fg text-bg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {t}
              </button>
            ))}
            {tag && (
              <button onClick={() => setTag(null)} className="ml-1 text-xs text-fg-3 hover:text-fg">
                Clear
              </button>
            )}
          </div>
        )}

        {list.length ? (
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((a) => (
              <ArticleRow key={a.id} a={a} onOpen={() => setOpenId(a.id)} onNeedFolder={() => setFolderOpen(true)} onTag={setTag} />
            ))}
          </Card>
        ) : (
          !isLoading && (
            <Card>
              <Empty
                icon={<Newspaper size={28} />}
                title={articles.length ? "Nothing here" : "Your reading list is empty"}
                hint={
                  articles.length
                    ? "Try another tab, tag or search."
                    : "Save good articles and blog posts. Paste a link and Smriti fills in the title, site and summary, then keeps a note in Obsidian."
                }
              />
              {!articles.length && (
                <div className="-mt-6 flex justify-center pb-10">
                  <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
                    Add your first article
                  </Button>
                </div>
              )}
            </Card>
          )
        )}
      </div>

      <AddArticleModal open={adding} onClose={() => setAdding(false)} />
      <ArticleDrawer article={open} onClose={() => setOpenId(null)} onNeedFolder={() => setFolderOpen(true)} />
      <ObsidianFolderModal open={folderOpen} onClose={() => setFolderOpen(false)} />
    </div>
  );
}
