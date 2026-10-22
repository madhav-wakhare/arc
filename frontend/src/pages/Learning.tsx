import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Check, GraduationCap, Clock, Link2, LoaderCircle, Newspaper, Play, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cover, PendingBadge, Thumb } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { LearningShell } from "../components/LearningNav";
import { ObsidianIcon } from "../components/ObsidianIcon";
import { LearningToolbar } from "../components/LearningToolbar";
import { SimilarWarning } from "../components/SimilarWarning";
import { Button, Card, Empty, IconButton, Input, Modal, useToast } from "../components/ui";
import { api, type Item, type LinkPreview, type Status } from "../lib/api";
import { useLinkPreview, useLocalState, useProjects, useRefreshItems, useUpdateItem, useOpenOnNew, useNonEmptyTab } from "../lib/hooks";
import { StatusIcon, fmtMinutes, hostOf, statusMeta, youtubeId, isUrl } from "../lib/meta";

type Tab = "queue" | "in_progress" | "done" | "all";


function LearningCard({ item }: { item: Item }) {
  const { openItem } = useActions();
  const update = useUpdateItem();
  const refresh = useRefreshItems();
  const toast = useToast();
  const exportNote = useMutation({
    mutationFn: () => api.post<Item>(`/items/${item.id}/export`),
    onSuccess: (i) => {
      refresh();
      toast(`Saved to Obsidian: ${i.obsidian_path}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const start = useMutation({ mutationFn: () => api.post(`/items/${item.id}/timer/start`), onSuccess: refresh });
  const done = item.status === "done";

  const firstLine = item.description.split("\n").find((l) => l.trim())?.trim();

  return (
    // The whole card opens the topic; the buttons at the bottom do their own thing.
    <div
      role="button"
      tabIndex={0}
      onClick={() => openItem(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openItem(item.id);
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-line bg-surface outline-none transition-colors hover:border-line-strong focus-visible:border-accent"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
        {item.url ? <Thumb itemId={item.id} url={item.url} className="size-full" /> : <Cover url={null} className="size-full" />}
        {/* Solid backing so the tinted badge stays readable on any picture. */}
        <span className="absolute left-2 top-2 rounded bg-bg/85 backdrop-blur-sm">
          <PendingBadge item={item} />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div>
          <p className={clsx("line-clamp-2 text-[13px] font-medium leading-snug", done && "text-fg-3")}>{item.title}</p>
        </div>
        {!item.url && firstLine && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-3">{firstLine}</p>}
        <div className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-fg-3">
          <span className="shrink-0 whitespace-nowrap font-mono">{item.key}</span>
          {item.url && <span className="min-w-0 truncate">· {hostOf(item.url)}</span>}
          {item.logged_minutes > 0 && (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              · <Clock size={11} /> {fmtMinutes(item.logged_minutes)}
            </span>
          )}
        </div>
        {!item.url && item.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.labels.slice(0, 3).map((l) => (
              <span key={l} className="rounded border border-line px-1.5 py-px text-[11px] text-fg-2">
                {l}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-1 pt-3" onClick={(e) => (e.target as HTMLElement).closest("button") && e.stopPropagation()}>
          <span className="flex flex-1 items-center gap-1.5 text-xs text-fg-2">
            <StatusIcon status={item.status} /> {statusMeta(item.status).label}
          </span>
          {item.url && (
            <IconButton
              className="size-7"
              title={item.obsidian_path ? "Re-export to Obsidian" : "Export to Obsidian"}
              onClick={() => exportNote.mutate()}
            >
              <ObsidianIcon size={14} className={item.obsidian_path ? "text-accent" : ""} />
            </IconButton>
          )}
          {!done && (
            <IconButton className="size-7" title="Start timer" onClick={() => start.mutate()}>
              <Play size={13} />
            </IconButton>
          )}
          <IconButton
            className="size-7"
            title={done ? "Mark as not done" : "Mark as done"}
            onClick={() => update.mutate({ id: item.id, status: (done ? "backlog" : "done") as Status })}
          >
            <Check size={14} className={done ? "text-good" : ""} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export default function Learning() {
  const { data: all = [], isFetched } = useQuery({
    queryKey: ["items", "learning"],
    queryFn: () => api.get<Item[]>("/items?type=learning"),
  });
  // Tickets made from books and blog posts live under Books and Engineering Blogs, not Topics.
  const items = all.filter((i) => !i.book_id && !i.article_id);
  const [tab, setTab] = useLocalState<Tab>("arc-topics-tab", "queue");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  useOpenOnNew(() => setAdding(true));

  const inTab = (i: Item, t: Tab) => (t === "all" ? true : t === "queue" ? i.status === "backlog" || i.status === "today" : i.status === t);
  const needle = q.trim().toLowerCase();
  const filtered = items.filter(
    (i) => inTab(i, tab) && (!needle || `${i.key} ${i.title} ${i.description} ${i.labels.join(" ")}`.toLowerCase().includes(needle)),
  );
  const count = (t: Tab) => items.filter((i) => inTab(i, t)).length;
  useNonEmptyTab(tab, setTab, ["queue", "in_progress", "done"], count, isFetched);

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <LearningShell
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add topic
          </Button>
        }
      >
      <div className="space-y-5">
        <LearningToolbar
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "queue", label: `To learn · ${count("queue")}` },
            { value: "in_progress", label: `In progress · ${count("in_progress")}` },
            { value: "done", label: `Done · ${count("done")}` },
            { value: "all", label: `All · ${count("all")}` },
          ]}
          search={q}
          onSearch={setQ}
          placeholder="Search topics, notes, labels"
        />

        {filtered.length === 0 ? (
          <Card>
            <Empty
              icon={<GraduationCap size={28} />}
              title={items.length ? "Nothing here" : "No topics yet"}
              hint={
                items.length
                  ? "Try another filter or search."
                  : "Add a topic you want to learn. Paste a video or course link if you have one; topics from Radar land here too."
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {filtered.map((i) => (
              <LearningCard key={i.id} item={i} />
            ))}
          </div>
        )}
      </div>
      </LearningShell>
      <AddTopicDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/** Add a topic: a name, or a video or course link whose title fills in. Blog links are offered to Engineering Blogs. */
function AddTopicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const { newItem } = useActions();
  const refresh = useRefreshItems();
  const toast = useToast();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const titleTyped = useRef(false);
  const looking = useLinkPreview(url, (p) => {
    if (!titleTyped.current && p.title) setTitle(p.title);
  }, open);
  // Blog posts belong in Engineering Blogs; offer to send a link that is not a video or course site there.
  const articleLike =
    /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S+/i.test(url.trim()) &&
    !youtubeId(url) &&
    !/youtube|vimeo|loom\.com|course|learn|academy|udemy|coursera|kodekloud|pluralsight|egghead|frontendmasters/i.test(url);

  const close = () => {
    setUrl("");
    setTitle("");
    titleTyped.current = false;
    onClose();
  };
  const add = useMutation({
    mutationFn: async () => {
      // Saved before the title arrived: look it up now instead of using the link as the title.
      let name = title.trim();
      if (!name) name = (await api.post<LinkPreview>("/preview", { url: url.trim() }).catch(() => null))?.title || url.trim();
      return api.post<Item>("/items", {
        project_id: (projects.find((p) => p.key === "LRN") ?? projects[0])?.id,
        type: "learning",
        title: name,
        url: url.trim() || null,
      });
    },
    onSuccess: (i) => {
      refresh();
      toast(`${i.key} added to Topics`);
      close();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const ready = !!(title.trim() || url.trim()) && !add.isPending;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add topic"
      width="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              close();
              newItem({ type: "learning" });
            }}
            className="mr-auto text-xs text-fg-3 hover:text-fg"
          >
            More options
          </button>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!ready} onClick={() => add.mutate()}>
            Add topic
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) add.mutate();
        }}
      >
        <Input
          autoFocus
          icon={looking ? <LoaderCircle size={14} className="animate-spin" /> : <GraduationCap size={15} />}
          placeholder={looking ? "Getting the title…" : "What do you want to learn? e.g. KV cache"}
          value={title}
          onChange={(e) => {
            const v = e.target.value;
            // A link pasted here goes to the link field; its title fills this one.
            if (isUrl(v, true) && !url.trim()) {
              setUrl(v.trim());
              setTitle("");
              titleTyped.current = false;
              return;
            }
            titleTyped.current = v !== "";
            setTitle(v);
          }}
        />
        <Input icon={<Link2 size={15} />} placeholder="Video or course link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <SimilarWarning title={title} url={url} onOpen={close} />
        {articleLike && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
            <Newspaper size={14} className="shrink-0 text-fg-3" />
            <span className="flex-1">This looks like a blog post. Engineering Blogs have collections, notes and their own Obsidian folder.</span>
            <button
              type="button"
              onClick={() => {
                const u = url.trim();
                close();
                navigate(`/learning/articles?add=${encodeURIComponent(u)}`);
              }}
              className="flex items-center gap-1 font-medium text-accent hover:underline"
            >
              Save to Engineering Blogs <ArrowRight size={13} />
            </button>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
