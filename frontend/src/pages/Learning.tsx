import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, BookOpen, Check, GraduationCap, Clock, Link2, LoaderCircle, Newspaper, Play, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PendingBadge, Thumb } from "../components/ItemCard";
import { useActions } from "../components/Layout";
import { LearningNav } from "../components/LearningNav";
import { ObsidianIcon } from "../components/ObsidianIcon";
import { Button, Card, Empty, IconButton, Input, PageHeader, Tabs, useToast } from "../components/ui";
import { api, type Item, type LinkPreview, type Status } from "../lib/api";
import { useLinkPreview, useProjects, useRefreshItems, useUpdateItem } from "../lib/hooks";
import { StatusIcon, fmtMinutes, hostOf, statusMeta, youtubeId } from "../lib/meta";

type Tab = "queue" | "in_progress" | "done" | "all";

const isLink = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S*$/i.test(s.trim()) || /^https?:\/\//i.test(s.trim());

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

  const saved = item.obsidian_path && (
    <span className="flex h-5 items-center gap-1 rounded bg-black/60 px-1.5 text-[11px] text-white">
      <ObsidianIcon size={11} /> Saved
    </span>
  );
  const firstLine = item.description.split("\n").find((l) => l.trim())?.trim();

  return (
    <Card className="group flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      {item.url ? (
        <button onClick={() => openItem(item.id)} className="relative block aspect-video w-full overflow-hidden bg-surface-2">
          <Thumb itemId={item.id} url={item.url} className="size-full" />
          <span className="absolute left-2 top-2">
            <PendingBadge item={item} />
          </span>
          {saved && <span className="absolute right-2 top-2">{saved}</span>}
        </button>
      ) : (
        // A topic without a link: no empty picture, just the topic.
        <div className="flex items-center gap-2 px-3 pt-3">
          <PendingBadge item={item} />
          <div className="flex-1" />
          {saved}
        </div>
      )}
      <div className="flex flex-1 flex-col p-3">
        <button onClick={() => openItem(item.id)} className="text-left">
          <p className={clsx("line-clamp-2 font-medium leading-snug", item.url ? "text-[13px]" : "text-[14px]", done && "text-fg-3")}>{item.title}</p>
        </button>
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
        <div className="mt-auto flex items-center gap-1 pt-3">
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
    </Card>
  );
}

export default function Learning() {
  const { data: items = [] } = useQuery({
    queryKey: ["items", "learning"],
    queryFn: () => api.get<Item[]>("/items?type=learning"),
  });
  const { data: projects = [] } = useProjects();
  const [tab, setTab] = useState<Tab>("queue");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const refresh = useRefreshItems();
  const toast = useToast();
  const { newItem } = useActions();
  // Fill the title from the video or page, unless you typed one yourself.
  const titleTyped = useRef(false);
  const navigate = useNavigate();
  const looking = useLinkPreview(url, (p) => {
    if (!titleTyped.current && p.title) setTitle(p.title);
  });
  // Blog posts belong in Articles; offer to send a link that is not a video or course site there.
  const articleLike =
    /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S+/i.test(url.trim()) &&
    !youtubeId(url) &&
    !/youtube|vimeo|loom\.com|course|learn|academy|udemy|coursera|kodekloud|pluralsight|egghead|frontendmasters/i.test(url);

  const quickAdd = useMutation({
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
      setUrl("");
      setTitle("");
      titleTyped.current = false;
      toast(`${i.key} added to Topics`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const filtered = items.filter((i) =>
    tab === "all" ? true : tab === "queue" ? i.status === "backlog" || i.status === "today" : i.status === tab,
  );
  const count = (t: Tab) =>
    items.filter((i) => (t === "all" ? true : t === "queue" ? i.status === "backlog" || i.status === "today" : i.status === t)).length;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<BookOpen size={18} />}
        title="Learning"
        actions={
          <Button icon={<Plus size={14} />} onClick={() => newItem({ type: "learning" })}>
            Detailed add
          </Button>
        }
      />
      <LearningNav />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <Card className="p-4">
          <form
            className="flex flex-col gap-2 md:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() || url.trim()) quickAdd.mutate();
            }}
          >
            <Input
              icon={looking ? <LoaderCircle size={14} className="animate-spin" /> : <GraduationCap size={15} />}
              placeholder={looking ? "Getting the title…" : "What do you want to learn? e.g. KV cache"}
              value={title}
              onChange={(e) => {
                const v = e.target.value;
                // A link pasted here goes to the link field; its title fills this one.
                if (isLink(v) && !url.trim()) {
                  setUrl(v.trim());
                  setTitle("");
                  titleTyped.current = false;
                  return;
                }
                titleTyped.current = v !== "";
                setTitle(v);
              }}
              className="md:flex-[3]"
            />
            <Input
              icon={<Link2 size={15} />}
              placeholder="Video or course link (optional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="md:flex-[2]"
            />
            <Button type="submit" variant="primary" icon={<Plus size={14} />} disabled={!(title.trim() || url.trim()) || quickAdd.isPending} className="h-9">
              Add topic
            </Button>
          </form>
          {articleLike && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
              <Newspaper size={14} className="shrink-0 text-fg-3" />
              <span className="flex-1">This looks like a blog post. Engineering Blogs have collections, notes and their own Obsidian folder.</span>
              <button
                type="button"
                onClick={() => navigate(`/learning/articles?add=${encodeURIComponent(url.trim())}`)}
                className="flex items-center gap-1 font-medium text-accent hover:underline"
              >
                Save to Engineering Blogs <ArrowRight size={13} />
              </button>
            </div>
          )}
        </Card>

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "queue", label: `Queue · ${count("queue")}` },
            { value: "in_progress", label: `In progress · ${count("in_progress")}` },
            { value: "done", label: `Done · ${count("done")}` },
            { value: "all", label: `All · ${count("all")}` },
          ]}
        />

        {filtered.length === 0 ? (
          <Empty
            icon={<GraduationCap size={28} />}
            title="Nothing here yet"
            hint="Add a topic you want to learn above. Paste a video or course link if you have one; topics from Radar land here too."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {filtered.map((i) => (
              <LearningCard key={i.id} item={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
