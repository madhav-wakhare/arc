/** Reading list pieces: the Obsidian folder dialog, the add dialog and the article panel. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ExternalLink, Folder, FolderOpen, Link2, LoaderCircle, Newspaper, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Article, type ArticleStatus, type Collection, type LinkPreview, type Settings } from "../lib/api";
import { useLocalState, useSettings } from "../lib/hooks";
import { fmtDate } from "../lib/meta";
import { ObsidianIcon } from "./ObsidianIcon";
import { Button, Checkbox, Drawer, Field, IconButton, Input, Modal, Tabs, Textarea, useToast } from "./ui";

export const ARTICLE_STATUSES: { value: ArticleStatus; label: string }[] = [
  { value: "unread", label: "To read" },
  { value: "reading", label: "Reading" },
  { value: "read", label: "Read" },
];

export const useArticles = () => useQuery({ queryKey: ["articles"], queryFn: () => api.get<Article[]>("/articles") });

export const useCollections = () => useQuery({ queryKey: ["collections"], queryFn: () => api.get<Collection[]>("/collections") });

export function useCollectionMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["collections"] });
    qc.invalidateQueries({ queryKey: ["articles"] });
  };
  const onError = (e: Error) => toast(e.message, "error");
  return {
    create: useMutation({ mutationFn: (name: string) => api.post<Collection>("/collections", { name }), onSuccess: refresh, onError }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) => api.patch<Collection>(`/collections/${id}`, { name }),
      onSuccess: refresh,
      onError,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/collections/${id}`), onSuccess: refresh, onError }),
  };
}

/**
 * Toggle chips for collections, plus "New". In the article panel, the collection that holds the
 * Obsidian note shows the Obsidian mark; clicking the mark on another chip moves the note there.
 */
export function CollectionPicker({
  value,
  onChange,
  folderId,
  onFolder,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  folderId?: number | null;
  onFolder?: (id: number) => void;
}) {
  const { data: collections = [] } = useCollections();
  const { create } = useCollectionMutations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const submit = () => {
    if (!name.trim()) return setAdding(false);
    create.mutate(name, {
      onSuccess: (c) => {
        onChange([...value, c.id]);
        setName("");
        setAdding(false);
      },
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {collections.map((c) => {
        const on = value.includes(c.id);
        const isFolder = on && onFolder && (folderId ?? value[0]) === c.id;
        return (
          <span
            key={c.id}
            className={clsx(
              "flex h-7 items-center rounded-md border text-xs transition-colors",
              on ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            <button type="button" onClick={() => toggle(c.id)} className="flex h-full items-center gap-1.5 pl-2.5 pr-2.5">
              {on ? <Check size={12} className="text-accent" /> : <Folder size={12} />}
              {c.name}
            </button>
            {on && onFolder && value.length > 1 && (
              <button
                type="button"
                onClick={() => onFolder(c.id)}
                title={isFolder ? "The Obsidian note is in this folder" : "Keep the Obsidian note in this folder"}
                className={clsx("-ml-1 flex h-full items-center pr-2", isFolder ? "text-accent" : "text-fg-3 hover:text-fg")}
              >
                <ObsidianIcon size={12} />
              </button>
            )}
          </span>
        );
      })}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setName("");
                setAdding(false);
              }
            }}
            placeholder="Collection name"
            className="h-7 w-36 rounded-md border border-accent/60 bg-surface px-2 text-xs outline-none"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-7 items-center gap-1 rounded-md border border-dashed border-line px-2.5 text-xs text-fg-3 hover:border-line-strong hover:text-fg"
        >
          <Plus size={12} /> New
        </button>
      )}
    </div>
  );
}

export function useArticleMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: ["articles"] });
  const onError = (e: Error) => toast(e.message, "error");
  return {
    update: useMutation({
      mutationFn: ({
        id,
        ...patch
      }: { id: number } & Partial<Omit<Article, "favorite" | "collections">> & {
        favorite?: boolean;
        collection_ids?: number[];
        folder_collection_id?: number;
      }) => api.patch<Article>(`/articles/${id}`, patch),
      onSuccess: (a, patch) => {
        qc.setQueryData<Article[]>(["articles"], (old) => old?.map((x) => (x.id === a.id ? a : x)));
        if (patch.collection_ids) qc.invalidateQueries({ queryKey: ["collections"] });
      },
      onError,
    }),
    exportNote: useMutation({
      mutationFn: (id: number) => api.post<Article>(`/articles/${id}/export`),
      onSuccess: (a) => {
        refresh();
        toast(`Saved to Obsidian: ${a.obsidian_path}`);
      },
      onError,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/articles/${id}`), onSuccess: refresh, onError }),
  };
}

/** "Smriti/Videos" -> "Smriti/Articles", keeping the user's casing style. */
function suggestFolder(videos: string | undefined) {
  if (!videos) return "Smriti/Articles";
  const parts = videos.split("/");
  const last = parts.pop() ?? "";
  const name = last === last.toLowerCase() ? "articles" : "Articles";
  return [...parts, name].join("/") || "Smriti/Articles";
}

/** Small preview image, or a neutral tile when there is none or it fails to load. */
export function ArticleThumb({ src, className }: { src: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={clsx("object-cover", className)} />;
  return (
    <div className={clsx("flex items-center justify-center bg-surface-2", className)}>
      <Newspaper size={18} className="text-fg-3" />
    </div>
  );
}

/** Ask where article notes go in the vault. Calls onSaved with the folder. */
export function ObsidianFolderModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (folder: string) => void }) {
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [folder, setFolder] = useState("");
  const ob = settings?.obsidian;

  useEffect(() => {
    if (open) setFolder(ob?.articles_folder ?? suggestFolder(ob?.folder));
  }, [open, ob?.articles_folder, ob?.folder]);

  const save = useMutation({
    mutationFn: () => api.put<Settings>("/settings", { obsidian_articles_folder: folder }),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      onClose();
      onSaved?.(s.obsidian.articles_folder!);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const clean = folder.trim().replace(/^\/+|\/+$/g, "");
  const root = ob?.vault_host_path || "your vault";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Obsidian folder for articles"
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!clean || save.isPending} onClick={() => save.mutate()}>
            Save folder
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) save.mutate();
        }}
      >
        <p className="text-[13px] text-fg-2">Each saved article becomes one note, named after its title. Choose a folder inside your vault.</p>
        <Field label="Folder inside the vault" hint={ob ? `Videos go to ${ob.folder}` : undefined}>
          <Input autoFocus icon={<FolderOpen size={14} />} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Smriti/Articles" />
        </Field>
        <div className="rounded-md border border-line bg-surface-2/60 px-3 py-2.5">
          <p className="text-xs text-fg-3">Notes are saved to</p>
          <p className="mt-0.5 break-all font-mono text-xs text-fg-2">
            {root}/{clean || "…"}/<span className="text-fg-3">Article title.md</span>
          </p>
        </div>
        {ob && !ob.writable && (
          <p className="text-xs text-critical">
            The vault is not mounted. Set OBSIDIAN_VAULT_PATH in .env and run make restart.
          </p>
        )}
      </form>
    </Modal>
  );
}

const looksLikeUrl = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s.trim());

/** Paste a link; title, site and summary fill in from the page. */
export function AddArticleModal({ open, onClose, defaultCollection }: { open: boolean; onClose: () => void; defaultCollection?: number | null }) {
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [collectionIds, setCollectionIds] = useState<number[]>([]);
  const [toObsidian, setToObsidian] = useLocalState("smriti-article-obsidian", true);
  const [askFolder, setAskFolder] = useState(false);
  const titleEdited = useRef(false);

  const fetchPreview = useMutation({
    mutationFn: (u: string) => api.post<LinkPreview>("/articles/preview", { url: u }),
    onSuccess: (p) => {
      setPreview(p);
      if (!titleEdited.current && p.title) setTitle(p.title);
    },
  });

  // Adding from inside a collection puts the article there.
  useEffect(() => {
    if (open) setCollectionIds(defaultCollection ? [defaultCollection] : []);
  }, [open, defaultCollection]);

  // Look the page up shortly after the link stops changing.
  useEffect(() => {
    if (!open || !looksLikeUrl(url)) return;
    const t = setTimeout(() => fetchPreview.mutate(url.trim()), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, open]);

  const reset = () => {
    setUrl("");
    setTitle("");
    setTags("");
    setNotes("");
    setPreview(null);
    titleEdited.current = false;
  };
  const close = () => {
    reset();
    onClose();
  };

  const add = useMutation({
    mutationFn: () =>
      api.post<Article>("/articles", {
        url: url.trim(),
        title: title.trim(),
        site: preview?.site ?? "",
        author: preview?.author ?? "",
        description: preview?.description ?? "",
        image: preview?.image ?? null,
        notes,
        tags: tags.split(/[,\s]+/).filter(Boolean),
        collection_ids: collectionIds,
        export: toObsidian,
      }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      toast(a.obsidian_path ? `Saved and added to Obsidian: ${a.obsidian_path}` : "Added to your reading list");
      close();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const submit = () => {
    if (!looksLikeUrl(url) || add.isPending) return;
    if (toObsidian && !settings?.obsidian.articles_folder) setAskFolder(true);
    else add.mutate();
  };

  const loading = fetchPreview.isPending;
  return (
    <>
      <Modal
        open={open && !askFolder}
        onClose={close}
        title="Add article"
        width="max-w-xl"
        footer={
          <>
            <Checkbox
              className="mr-auto text-[13px] text-fg-2"
              checked={toObsidian}
              onChange={setToObsidian}
              label={
                <span className="flex items-center gap-1.5">
                  <ObsidianIcon size={13} /> Save to Obsidian
                </span>
              }
            />
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={!looksLikeUrl(url) || add.isPending} onClick={submit}>
              Add article
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input autoFocus icon={<Link2 size={14} />} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to an article or blog post" />

          {(loading || preview) && (
            <div className="flex gap-3 rounded-lg border border-line p-3">
              <ArticleThumb src={preview?.image ?? null} className="h-16 w-24 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                {loading && !preview ? (
                  <p className="flex items-center gap-2 pt-1 text-[13px] text-fg-3">
                    <LoaderCircle size={14} className="animate-spin" /> Reading the page…
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-xs text-fg-3">
                      {preview?.site}
                      {preview?.author && preview.author !== preview.site && <span>· {preview.author}</span>}
                      {loading && <LoaderCircle size={12} className="animate-spin" />}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[13px] font-medium">{preview?.title || "No title found. Add one below."}</p>
                    {preview?.description && <p className="mt-0.5 line-clamp-2 text-xs text-fg-3">{preview.description}</p>}
                  </>
                )}
              </div>
            </div>
          )}

          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => {
                titleEdited.current = true;
                setTitle(e.target.value);
              }}
              placeholder="Filled in from the page"
            />
          </Field>
          <div className="space-y-1.5">
            <span className="text-[13px] font-medium">Collections</span>
            <CollectionPicker value={collectionIds} onChange={setCollectionIds} />
          </div>
          <Field label="Tags" hint="Separate with commas or spaces.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="distributed-systems, kubernetes" />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why it is worth reading, key points (optional)" className="min-h-20" />
          </Field>
        </form>
      </Modal>
      <ObsidianFolderModal open={askFolder} onClose={() => setAskFolder(false)} onSaved={() => add.mutate()} />
    </>
  );
}

/** Side panel for one article: status, tags, notes and Obsidian. Text fields save when you leave them. */
export function ArticleDrawer({ article, onClose, onNeedFolder }: { article: Article | null; onClose: () => void; onNeedFolder: () => void }) {
  const { update, exportNote, remove } = useArticleMutations();
  const { data: settings } = useSettings();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!article) return;
    setTitle(article.title);
    setTags(article.tags.join(", "));
    setNotes(article.notes);
    // Only when another article opens; edits in progress stay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  if (!article) return null;
  const a = article;
  const save = (patch: Parameters<typeof update.mutate>[0]) => update.mutate(patch);
  const saveToObsidian = () => (settings?.obsidian.articles_folder ? exportNote.mutate(a.id) : onNeedFolder());
  // Esc closes the panel without a blur, so save any edits still in the fields first.
  const close = () => {
    const patch: Record<string, unknown> = {};
    if (title.trim() && title !== a.title) patch.title = title;
    if (notes !== a.notes) patch.notes = notes;
    if (tags !== a.tags.join(", ")) patch.tags = tags.split(/[,\s]+/).filter(Boolean);
    if (Object.keys(patch).length) save({ id: a.id, ...patch });
    onClose();
  };

  return (
    <Drawer open onClose={close}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-fg-3">
          <Newspaper size={15} />
          <span className="truncate">{a.site || "Article"}</span>
        </span>
        <div className="flex-1" />
        <IconButton title={a.favorite ? "Remove from favourites" : "Add to favourites"} onClick={() => save({ id: a.id, favorite: !a.favorite })}>
          <Star size={15} className={a.favorite ? "fill-warning text-warning" : ""} />
        </IconButton>
        <IconButton title={a.obsidian_path ? "Save to Obsidian again" : "Save to Obsidian"} onClick={saveToObsidian}>
          <ObsidianIcon size={15} className={a.obsidian_path ? "text-accent" : ""} />
        </IconButton>
        <a href={a.url} target="_blank" rel="noreferrer" title="Open article" className="inline-flex size-8 items-center justify-center rounded-md text-fg-2 hover:bg-surface-2 hover:text-fg">
          <ExternalLink size={15} />
        </a>
        <IconButton title="Delete" className="hover:text-critical" onClick={() => setConfirm(true)}>
          <Trash2 size={15} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton title="Close" onClick={close}>
          <X size={16} />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] space-y-6 px-6 py-6">
          <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== a.title && save({ id: a.id, title })}
              rows={1}
              className="field-sizing-content w-full resize-none bg-transparent text-xl font-semibold leading-snug tracking-tight outline-none"
            />
            <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[13px] text-accent hover:underline">
              {a.url}
            </a>
            {a.description && <p className="mt-3 text-[13px] leading-relaxed text-fg-2">{a.description}</p>}
          </div>
          {a.image && <ArticleThumb src={a.image} className="mt-1 hidden h-20 w-32 shrink-0 rounded-md border border-line sm:block" />}
          </div>

          <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
            <dt className="text-fg-3">Status</dt>
            <dd>
              <Tabs value={a.status} onChange={(s) => save({ id: a.id, status: s })} tabs={ARTICLE_STATUSES} />
            </dd>
            <dt className="self-start pt-1.5 text-fg-3">Collections</dt>
            <dd>
              <CollectionPicker
                value={a.collections.map((c) => c.id)}
                onChange={(ids) => save({ id: a.id, collection_ids: ids })}
                folderId={a.collection_id}
                onFolder={(id) => save({ id: a.id, folder_collection_id: id })}
              />
            </dd>
            <dt className="text-fg-3">Tags</dt>
            <dd>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                onBlur={() => tags !== a.tags.join(", ") && save({ id: a.id, tags: tags.split(/[,\s]+/).filter(Boolean) })}
                placeholder="Add tags"
              />
            </dd>
            {a.author && (
              <>
                <dt className="text-fg-3">Author</dt>
                <dd>{a.author}</dd>
              </>
            )}
            <dt className="text-fg-3">Saved</dt>
            <dd>{fmtDate(a.created_at, { month: "short", day: "numeric", year: "numeric" })}</dd>
            {a.read_at && (
              <>
                <dt className="text-fg-3">Read</dt>
                <dd>{fmtDate(a.read_at, { month: "short", day: "numeric", year: "numeric" })}</dd>
              </>
            )}
            <dt className="text-fg-3">Obsidian</dt>
            <dd className="min-w-0">
              {a.obsidian_path ? (
                <span className="block truncate font-mono text-xs text-fg-2" title={a.obsidian_path}>
                  {a.obsidian_path}
                </span>
              ) : (
                <button onClick={saveToObsidian} className="text-accent hover:underline">
                  Save to Obsidian
                </button>
              )}
            </dd>
          </dl>

          <section>
            <h3 className="mb-2 text-[14px] font-semibold">Notes</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== a.notes && save({ id: a.id, notes })}
              placeholder="Key points, quotes, what you want to remember"
              className="field-sizing-content min-h-40 leading-relaxed"
            />
            <p className="mt-1.5 text-xs text-fg-3">
              Saved when you click outside.{a.obsidian_path && " The Obsidian note updates too."}
            </p>
          </section>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete article?"
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() =>
                remove.mutate(a.id, {
                  onSuccess: () => {
                    setConfirm(false);
                    onClose();
                  },
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">
          This removes it from your reading list.{a.obsidian_path && " The note in Obsidian stays."}
        </p>
      </Modal>
    </Drawer>
  );
}
