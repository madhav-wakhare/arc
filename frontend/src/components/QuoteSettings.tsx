import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Quote as QuoteIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type Quote, type Settings } from "../lib/api";
import { Button, Card, IconButton, Input, Select, Switch, Textarea, useToast } from "./ui";

const INTERVALS = [
  { value: 10, label: "Every 10 seconds" },
  { value: 20, label: "Every 20 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
];

function QuoteRow({ q }: { q: Quote }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [author, setAuthor] = useState(q.author);
  const save = useMutation({
    mutationFn: () => api.patch(`/quotes/${q.id}`, { text, author }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setEditing(false);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/quotes/${q.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  });

  if (editing)
    return (
      <div className="space-y-2 py-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-16" />
        <div className="flex gap-2">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="flex-1" />
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    );
  return (
    <div className="group flex items-start gap-3 py-3">
      <QuoteIcon size={13} className="mt-1 shrink-0 text-fg-3" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed">{q.text}</p>
        {q.author && <p className="mt-0.5 text-xs text-fg-3">— {q.author}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton className="size-7" title="Edit" onClick={() => setEditing(true)}>
          <Pencil size={13} />
        </IconButton>
        <IconButton className="size-7 hover:text-critical" title="Delete" onClick={() => remove.mutate()}>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  );
}

/** Settings → Quotes: the quotes shown in the top bar, on/off, and how often they change. */
export function QuoteSettings({ settings }: { settings?: Settings }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => api.get<Quote[]>("/quotes") });
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");

  const saveSetting = useMutation({
    mutationFn: (body: Partial<Pick<Settings, "quotes_enabled" | "quotes_interval">>) => api.put<Settings>("/settings", body),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
    onError: (e: Error) => toast(e.message, "error"),
  });
  const add = useMutation({
    mutationFn: () => api.post("/quotes", { text, author }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setText("");
      setAuthor("");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-medium">
            <QuoteIcon size={16} /> Quotes
          </h3>
          <p className="mt-1 text-[13px] text-fg-3">Shown one at a time in the top bar. Hover to pause, click for the next one.</p>
        </div>
        <Switch
          checked={settings?.quotes_enabled ?? true}
          onChange={(v) => saveSetting.mutate({ quotes_enabled: v })}
          label="Show quotes"
        />
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5">
        <span className="text-[13px] font-medium">Change quote</span>
        <Select
          value={settings?.quotes_interval ?? 20}
          onChange={(e) => saveSetting.mutate({ quotes_interval: Number(e.target.value) })}
          className="w-48"
        >
          {INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </Select>
      </div>

      {quotes.length > 0 ? (
        <div className="mb-4 divide-y divide-line rounded-md border border-line px-3">
          {quotes.map((q) => (
            <QuoteRow key={q.id} q={q} />
          ))}
        </div>
      ) : (
        <p className="mb-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-[13px] text-fg-3">
          No quotes yet. Add your first one below.
        </p>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a quote" className="min-h-16" />
        <div className="flex gap-2">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" className="flex-1" />
          <Button type="submit" variant="primary" icon={<Plus size={14} />} disabled={!text.trim() || add.isPending}>
            Add quote
          </Button>
        </div>
      </form>
    </Card>
  );
}
