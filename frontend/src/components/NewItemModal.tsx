import { useMutation } from "@tanstack/react-query";
import { Link2, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Item, type ItemType, type Priority, type Recurrence, type Status } from "../lib/api";
import { useLinkPreview, useProjects, useRefreshItems } from "../lib/hooks";
import { PRIORITIES, RECURRENCES, STATUSES, TYPES, parseDuration } from "../lib/meta";
import type { NewItemDefaults } from "./Layout";
import { Button, Checkbox, DateInput, Field, Input, Modal, Select, Tabs, Textarea, useToast } from "./ui";

const blank = (d: NewItemDefaults, fallbackProject?: number) => ({
  type: d.type ?? ("task" as ItemType),
  title: "",
  url: d.url ?? "",
  description: "",
  project_id: d.project_id ?? fallbackProject ?? 0,
  status: d.status ?? ("backlog" as Status),
  priority: "none" as Priority,
  due_date: "",
  estimate: "",
  recurrence: "none" as Recurrence,
  labels: "",
});

export function NewItemModal({ defaults, onClose }: { defaults: NewItemDefaults | null; onClose: () => void }) {
  const { data: allProjects = [] } = useProjects();
  const projects = allProjects.filter((p) => !p.archived || p.id === defaults?.project_id);
  const [form, setForm] = useState(() => blank({}));
  const [more, setMore] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const refresh = useRefreshItems();
  const toast = useToast();
  // A pasted link fills an empty title with the video or page title.
  const looking = useLinkPreview(
    form.url,
    (p) => p.title && setForm((f) => (f.title.trim() ? f : { ...f, title: p.title })),
    !!defaults,
  );

  const projectFor = (type: ItemType) =>
    (type === "learning" ? projects.find((p) => p.key === "LRN") : projects.find((p) => p.key === "WORK"))?.id ??
    projects[0]?.id;

  useEffect(() => {
    if (defaults) {
      const type = defaults.type ?? "task";
      setForm(blank(defaults, projectFor(type)));
      setTimeout(() => titleRef.current?.focus(), 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const estimate = parseDuration(form.estimate);

  const create = useMutation({
    mutationFn: () =>
      api.post<Item>("/items", {
        project_id: form.project_id,
        type: form.type,
        title: form.title,
        url: form.url || null,
        description: form.description,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        estimate_minutes: estimate,
        recurrence: form.recurrence,
        labels: form.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      }),
    onSuccess: (item) => {
      refresh();
      toast(`${item.key} created`);
      if (more) {
        setForm((f) => ({ ...f, title: "", url: "", description: "" }));
        titleRef.current?.focus();
      } else onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const invalid = !form.title.trim() || !form.project_id || Number.isNaN(estimate);

  return (
    <Modal
      open={!!defaults}
      onClose={onClose}
      title="New item"
      width="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <Checkbox checked={more} onChange={setMore} label={<span className="text-[13px] text-fg-2">Create more</span>} />
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={invalid || create.isPending} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) create.mutate();
        }}
      >
        <Tabs
          value={form.type}
          onChange={(t) => setForm((f) => ({ ...f, type: t, project_id: projectFor(t) ?? f.project_id }))}
          tabs={TYPES.map((t) => ({
            value: t.value,
            label: (
              <span className="flex items-center gap-1.5">
                <t.icon size={13} className={t.tone} /> {t.label}
              </span>
            ),
          }))}
        />
        <Input
          ref={titleRef}
          icon={looking && !form.title ? <LoaderCircle size={15} className="animate-spin" /> : undefined}
          placeholder={looking ? "Getting the title from the link…" : form.type === "learning" ? "Video or article title (or paste the link below)" : "Title"}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          className="h-10 text-[15px]"
        />
        {(form.type === "learning" || form.url) && (
          <Input
            icon={<Link2 size={15} />}
            placeholder="https://youtube.com/watch?v=..."
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
          />
        )}
        <Textarea
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Project">
            <Select value={form.project_id} onChange={(e) => set("project_id", Number(e.target.value))}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
              {PRIORITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <DateInput value={form.due_date} onChange={(v) => set("due_date", v)} placeholder="No due date" />
          </Field>
          <Field label="Original estimate" hint={Number.isNaN(estimate) ? "Use 2h 30m, 45m or 1d" : undefined}>
            <Input placeholder="e.g. 2h 30m" value={form.estimate} onChange={(e) => set("estimate", e.target.value)} />
          </Field>
          <Field label="Repeat">
            <Select value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
              {RECURRENCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Labels" hint="Separate with commas">
          <Input placeholder="kubernetes, client-x" value={form.labels} onChange={(e) => set("labels", e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
