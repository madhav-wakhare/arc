import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Check, GraduationCap, Link2, LoaderCircle, Newspaper, Play, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cover, PendingBadge, Thumb } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { LearningShell } from "../components/LearningNav";
import { ObsidianIcon } from "../components/ObsidianIcon";
import { LearningToolbar } from "../components/LearningToolbar";
import { SimilarWarning } from "../components/SimilarWarning";
import { Button, Card, Empty, Input, Modal, useToast } from "../components/ui";
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
    // Apple-style tile: the picture carries the card, text sits underneath with no box around it.
    // The whole tile opens the topic; the round buttons on the picture appear on hover and do their own thing.
    <div
      role="button"
      tabIndex={0}
      onClick={() => openItem(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openItem(item.id);
      }}
      className="group cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-inset ring-white/[0.06] transition duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)]">
        {item.url ? (
          <Thumb itemId={item.id} url={item.url} className="size-full transition duration-500 ease-out group-hover:scale-[1.03]" />
        ) : (
          <Cover url={null} className="size-full" />
        )}
        <span className="absolute left-2.5 top-2.5 rounded bg-bg/80 backdrop-blur-md">
          <PendingBadge item={item} />
        </span>
        <div
          className="absolute bottom-2.5 right-2.5 flex gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {item.url && (
            <button className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75" title={item.obsidian_path ? "Re-export to Obsidian" : "Export to Obsidian"} onClick={() => exportNote.mutate()}>
              <ObsidianIcon size={14} />
            </button>
          )}
          {!done && (
            <button className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75" title="Start timer" onClick={() => start.mutate()}>
              <Play size={13} fill="currentColor" />
            </button>
          )}
          <button
            className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/75"
            title={done ? "Mark as not done" : "Mark as done"}
            onClick={() => update.mutate({ id: item.id, status: (done ? "backlog" : "done") as Status })}
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="px-0.5 pt-2">
        <p className={clsx("line-clamp-2 text-[13px] font-medium leading-snug", done && "text-fg-3")}>{item.title}</p>
        {!item.url && firstLine && <p className="mt-1 line-clamp-1 text-[13px] text-fg-3">{firstLine}</p>}
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
          <StatusIcon status={item.status} />
          <span className="shrink-0">{statusMeta(item.status).label}</span>
          {item.url && <span className="min-w-0 truncate">· {hostOf(item.url)}</span>}
          {item.logged_minutes > 0 && <span className="shrink-0 whitespace-nowrap">· {fmtMinutes(item.logged_minutes)}</span>}
          {item.obsidian_path && <ObsidianIcon size={11} className="ml-auto shrink-0 text-accent" />}
        </p>
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
          <Card className="rounded-2xl">
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
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
