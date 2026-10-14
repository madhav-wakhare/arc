import { DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import clsx from "clsx";
import {
  BookOpen,
  Check,
  ExternalLink,
  Folder,
  FolderOpen,
  Inbox,
  Library,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { LearningNav } from "../components/LearningNav";
import { ObsidianIcon } from "../components/ObsidianIcon";
import {
  ARTICLE_STATUSES,
  AddArticleModal,
  ArticleDrawer,
  ArticleThumb,
  ObsidianFolderModal,
  useArticleMutations,
  useArticles,
  useCollectionMutations,
  useCollections,
} from "../components/Reading";
import { Button, Card, Empty, IconButton, Input, Menu, Modal, PageHeader, Select, Tabs } from "../components/ui";
import type { Article, Collection } from "../lib/api";
import { useLocalState, useSettings } from "../lib/hooks";
import { fmtDate } from "../lib/meta";

type Tab = "unread" | "reading" | "read" | "favorites" | "all";
/** Which folder is open: every article, the ones in no collection, or one collection. */
type Scope = "all" | "unfiled" | number;

const STATUS_DOT: Record<Article["status"], string> = {
  unread: "bg-fg-3",
  reading: "bg-accent",
  read: "bg-good",
};

function ArticleRow({
  a,
  onOpen,
  onNeedFolder,
  onTag,
  onCollection,
}: {
  a: Article;
  onOpen: () => void;
  onNeedFolder: () => void;
  onTag: (t: string) => void;
  onCollection: (id: number) => void;
}) {
  const { update, exportNote, remove } = useArticleMutations();
  const { data: settings } = useSettings();
  const drag = useDraggable({ id: `article-${a.id}`, data: { article: a } });
  const saveToObsidian = () => (settings?.obsidian.articles_folder ? exportNote.mutate(a.id) : onNeedFolder());
  const read = a.status === "read";
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      className={clsx(
        "group flex items-start gap-4 px-4 py-3.5 outline-none transition-colors hover:bg-surface-2/50",
        drag.isDragging && "opacity-40",
      )}
    >
      <button onClick={onOpen} className="shrink-0" tabIndex={-1}>
        <ArticleThumb src={a.image} articleId={a.id} className="h-[60px] w-24 rounded-md border border-line" />
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
          {a.collections.map((c) => (
            <button
              key={c.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCollection(c.id)}
              className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-px text-[11px] text-fg-2 hover:text-fg"
            >
              <Folder size={10} /> {c.name}
            </button>
          ))}
          {a.tags.map((t) => (
            <button
              key={t}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onTag(t)}
              className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2 hover:border-line-strong hover:text-fg"
            >
              {t}
            </button>
          ))}
        </div>
        {a.description && <p className="mt-1 line-clamp-1 text-xs text-fg-3">{a.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
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
              { label: "Open blog post", icon: <ExternalLink size={13} />, onClick: () => window.open(a.url, "_blank", "noreferrer") },
              read
                ? { label: "Mark as to read", icon: <RotateCcw size={13} />, onClick: () => update.mutate({ id: a.id, status: "unread" }) }
                : { label: "Mark as read", icon: <Check size={13} />, onClick: () => update.mutate({ id: a.id, status: "read" }) },
              { label: "Collections…", icon: <Folder size={13} />, onClick: onOpen },
              { label: a.obsidian_path ? "Save to Obsidian again" : "Save to Obsidian", icon: <ObsidianIcon size={13} />, onClick: saveToObsidian },
              { label: "Delete", icon: <Trash2 size={13} />, danger: true, onClick: () => remove.mutate(a.id) },
            ]}
          />
        </span>
      </div>
    </div>
  );
}

/** One row in the folder panel. Collections accept articles dropped on them. */
function FolderRow({
  icon,
  label,
  count,
  active,
  onClick,
  dropId,
  actions,
}: {
  icon: ReactNode;
  label: ReactNode;
  count: number;
  active: boolean;
  onClick: () => void;
  dropId?: number;
  actions?: ReactNode;
}) {
  const drop = useDroppable({ id: `collection-${dropId ?? label}`, data: { collectionId: dropId }, disabled: dropId === undefined });
  return (
    <div
      ref={drop.setNodeRef}
      className={clsx(
        "group flex h-8 items-center rounded-md text-[13px] transition-colors",
        drop.isOver ? "bg-accent-soft text-fg ring-1 ring-accent/60" : active ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <button onClick={onClick} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2.5">
        <span className={clsx("shrink-0", active ? "text-fg" : "text-fg-3")}>{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      <span className={clsx("pr-2.5 font-mono text-[11px] text-fg-3", actions && "group-hover:hidden")}>{count || ""}</span>
      {actions && <span className="hidden pr-1 group-hover:block">{actions}</span>}
    </div>
  );
}

function CollectionsPanel({
  scope,
  setScope,
  counts,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  counts: { all: number; unfiled: number };
}) {
  const { data: collections = [] } = useCollections();
  const { create, rename, remove } = useCollectionMutations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);

  const submitNew = () => {
    if (!name.trim()) return setAdding(false);
    create.mutate(name, {
      onSuccess: (c) => {
        setName("");
        setAdding(false);
        setScope(c.id);
      },
    });
  };

  return (
    <nav className="space-y-0.5">
      <FolderRow icon={<Library size={15} />} label="All blogs" count={counts.all} active={scope === "all"} onClick={() => setScope("all")} />
      <FolderRow icon={<Inbox size={15} />} label="Unfiled" count={counts.unfiled} active={scope === "unfiled"} onClick={() => setScope("unfiled")} />

      <div className="flex items-center justify-between pb-1 pl-2.5 pr-1 pt-5">
        <span className="text-xs font-medium text-fg-3">Collections</span>
        <IconButton className="size-6" title="New collection" onClick={() => setAdding(true)}>
          <Plus size={14} />
        </IconButton>
      </div>
      {collections.map((c) =>
        editing?.id === c.id ? (
          <form
            key={c.id}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name !== c.name) rename.mutate({ id: c.id, name });
              setEditing(null);
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== c.name) rename.mutate({ id: c.id, name });
                setEditing(null);
              }}
              onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
              className="h-8 w-full rounded-md border border-accent/60 bg-surface px-2.5 text-[13px] outline-none"
            />
          </form>
        ) : (
          <FolderRow
            key={c.id}
            icon={scope === c.id ? <FolderOpen size={15} /> : <Folder size={15} />}
            label={c.name}
            count={c.count}
            active={scope === c.id}
            onClick={() => setScope(c.id)}
            dropId={c.id}
            actions={
              <Menu
                trigger={
                  <button className="flex size-6 items-center justify-center rounded text-fg-3 hover:bg-surface-3 hover:text-fg" title="More">
                    <MoreHorizontal size={14} />
                  </button>
                }
                items={[
                  {
                    label: "Rename",
                    icon: <Pencil size={13} />,
                    onClick: () => {
                      setName(c.name);
                      setEditing(c);
                    },
                  },
                  { label: "Delete collection", icon: <Trash2 size={13} />, danger: true, onClick: () => setDeleting(c) },
                ]}
              />
            }
          />
        ),
      )}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNew();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitNew}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            placeholder="AI, SRE, Databases…"
            className="h-8 w-full rounded-md border border-accent/60 bg-surface px-2.5 text-[13px] outline-none"
          />
        </form>
      ) : (
        !collections.length && (
          <button onClick={() => setAdding(true)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-3 hover:bg-surface-2 hover:text-fg">
            <Plus size={15} /> New collection
          </button>
        )
      )}
      {collections.length > 0 && <p className="px-2.5 pt-3 text-[11px] leading-relaxed text-fg-3">Drag a blog post onto a collection to add it.</p>}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id);
                if (scope === deleting.id) setScope("all");
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">
          The blog posts stay in Engineering Blogs. Notes in its Obsidian folder move to another collection of the post, or to the main
          articles folder.
        </p>
      </Modal>
    </nav>
  );
}

/** Reading list: articles and blog posts worth keeping, grouped in collections, saved to Obsidian. */
export default function Reading() {
  const { data: articles = [], isLoading } = useArticles();
  const { data: collections = [] } = useCollections();
  const { data: settings } = useSettings();
  const { update } = useArticleMutations();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useLocalState<Tab>("smriti-reading-tab", "unread");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [dragging, setDragging] = useState<Article | null>(null);

  // Sent here from Topics with a link: open the add dialog with it.
  const addUrl = params.get("add");
  useEffect(() => {
    if (!addUrl) return;
    setAdding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addUrl]);
  const closeAdd = () => {
    setAdding(false);
    if (addUrl)
      setParams((p) => {
        p.delete("add");
        return p;
      });
  };

  const raw = params.get("c");
  const scope: Scope = raw === "unfiled" ? "unfiled" : raw && Number(raw) ? Number(raw) : "all";
  const setScope = (s: Scope) => {
    setTag(null);
    setParams((p) => {
      if (s === "all") p.delete("c");
      else p.set("c", String(s));
      return p;
    });
  };
  const current = typeof scope === "number" ? collections.find((c) => c.id === scope) : undefined;

  const inScope = (a: Article) =>
    scope === "all" ? true : scope === "unfiled" ? a.collections.length === 0 : a.collections.some((c) => c.id === scope);
  const inTab = (a: Article, t: Tab) => (t === "all" ? true : t === "favorites" ? !!a.favorite : a.status === t);
  const scoped = articles.filter(inScope);
  const count = (t: Tab) => scoped.filter((a) => inTab(a, t)).length;
  const tags = useMemo(() => [...new Set(scoped.flatMap((a) => a.tags))].sort(), [scoped]);
  const needle = q.trim().toLowerCase();
  const list = scoped.filter(
    (a) =>
      inTab(a, tab) &&
      (!tag || a.tags.includes(tag)) &&
      (!needle || `${a.title} ${a.site} ${a.author} ${a.tags.join(" ")} ${a.notes}`.toLowerCase().includes(needle)),
  );
  const open = articles.find((a) => a.id === openId) ?? null;
  const folder = settings?.obsidian.articles_folder;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const a = e.active.data.current?.article as Article | undefined;
    const cid = e.over?.data.current?.collectionId as number | undefined;
    if (!a || !cid || a.collections.some((c) => c.id === cid)) return;
    update.mutate({ id: a.id, collection_ids: [...a.collections.map((c) => c.id), cid] });
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<BookOpen size={18} />}
        title={
          scope === "all" ? (
            "Learning"
          ) : (
            <span className="flex items-center gap-2">
              <button onClick={() => setScope("all")} className="text-fg-3 hover:text-fg">
                Learning
              </button>
              <span className="text-fg-3">/</span>
              {current?.name ?? "Unfiled"}
            </span>
          )
        }
        actions={
          <>
            <Button
              icon={<ObsidianIcon size={14} className={folder ? "text-accent" : ""} />}
              onClick={() => setFolderOpen(true)}
              title="Obsidian folder for engineering blogs"
              className="max-w-64"
            >
              <span className="truncate">{folder ? (current ? `${folder}/${current.name}` : folder) : "Set Obsidian folder"}</span>
            </Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add blog post
            </Button>
          </>
        }
      />
      <LearningNav />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setDragging((e.active.data.current?.article as Article) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-6 px-4 md:px-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:px-8">
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <CollectionsPanel
                scope={scope}
                setScope={setScope}
                counts={{ all: articles.length, unfiled: articles.filter((a) => !a.collections.length).length }}
              />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <Select
              className="lg:hidden"
              value={String(scope)}
              onChange={(e) => setScope(e.target.value === "all" || e.target.value === "unfiled" ? e.target.value : Number(e.target.value))}
            >
              <option value="all">All blogs · {articles.length}</option>
              <option value="unfiled">Unfiled</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.count}
                </option>
              ))}
            </Select>

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
              <Input icon={<Search size={14} />} placeholder="Search title, site, tags, notes" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-60" />
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
                  <ArticleRow
                    key={a.id}
                    a={a}
                    onOpen={() => setOpenId(a.id)}
                    onNeedFolder={() => setFolderOpen(true)}
                    onTag={setTag}
                    onCollection={setScope}
                  />
                ))}
              </Card>
            ) : (
              !isLoading && (
                <Card>
                  <Empty
                    icon={current ? <FolderOpen size={28} /> : <Newspaper size={28} />}
                    title={
                      !articles.length
                        ? "No engineering blogs yet"
                        : current && !scoped.length
                          ? `Nothing in ${current.name} yet`
                          : "Nothing here"
                    }
                    hint={
                      !articles.length
                        ? "Save good engineering blog posts and articles. Paste a link and Smriti fills in the title, site and summary, then keeps a note in Obsidian."
                        : current && !scoped.length
                          ? "Add a blog post here, or drag one from All blogs onto this collection."
                          : "Try another tab, tag or search."
                    }
                  />
                  {(!articles.length || (current && !scoped.length)) && (
                    <div className="-mt-6 flex justify-center pb-10">
                      <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
                        {current ? `Add to ${current.name}` : "Add your first blog post"}
                      </Button>
                    </div>
                  )}
                </Card>
              )
            )}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="flex max-w-72 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow)]">
              <Newspaper size={14} className="shrink-0 text-fg-3" />
              <span className="truncate">{dragging.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <AddArticleModal open={adding} onClose={closeAdd} defaultCollection={current?.id ?? null} initialUrl={addUrl ?? undefined} />
      <ArticleDrawer article={open} onClose={() => setOpenId(null)} onNeedFolder={() => setFolderOpen(true)} />
      <ObsidianFolderModal open={folderOpen} onClose={() => setFolderOpen(false)} />
    </div>
  );
}
