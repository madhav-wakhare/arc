import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Item, type ItemType, type Priority, type Revision, type Status } from "../lib/api";
import { PRIORITIES, PriorityIcon, STATUSES, TYPES } from "../lib/meta";
import { useProjects, useRefreshItems } from "../lib/hooks";
import { defaultProject } from "./Jots";
import { Button, Input, Kbd, Modal, Select, Tabs, Textarea, useToast } from "./ui";
import { SimilarWarning } from "./SimilarWarning";

export type RevisionFields = { title: string; question: string; notes: string; url: string; priority: Priority };

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium">
        {label}
        {hint && <span className="ml-1 font-normal text-fg-3">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function RevisionForm({ value, onChange }: { value: RevisionFields; onChange: (v: RevisionFields) => void }) {
  const set = (k: keyof RevisionFields) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Row label="Topic">
        <Input autoFocus value={value.title} onChange={set("title")} placeholder="e.g. KV cache in vLLM" />
      </Row>
      <Row label="Question" hint="(optional)">
        <Input value={value.question} onChange={set("question")} placeholder="A question to test yourself" />
      </Row>
      <Row label="Notes">
        <Textarea value={value.notes} onChange={set("notes")} placeholder="What you want to remember" className="min-h-28" />
      </Row>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <Row label="Link" hint="(optional)">
          <Input value={value.url} onChange={set("url")} placeholder="https://" />
        </Row>
        <Row label="Priority">
          <Select icon={<PriorityIcon priority={value.priority} />} value={value.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Row>
      </div>
    </div>
  );
}

export function AddRevisionModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (r: Revision) => void }) {
  const empty: RevisionFields = { title: "", question: "", notes: "", url: "", priority: "none" };
  const [form, setForm] = useState<RevisionFields>(empty);
  const refresh = useRefreshItems();
  const toast = useToast();

  useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () => api.post<Revision>("/revisions", { ...form, url: form.url.trim() || null }),
    onSuccess: (r) => {
      refresh();
      toast(`Added “${r.title}” to Revisit`);
      onClose();
      onAdded?.(r);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to Revisit"
      width="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="hidden items-center gap-1.5 text-xs text-fg-3 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>Enter</Kbd> to add
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>
              Add
            </Button>
          </div>
        </div>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && form.title.trim()) save.mutate();
        }}
      >
        <RevisionForm value={form} onChange={setForm} />
        {/* Revisit naturally overlaps with Topics you learned; only flag a second Revisit entry. */}
        <div className="mt-3">
          <SimilarWarning title={form.title} url={form.url} onOpen={onClose} ignore={(e) => e.kind !== "revisit"} />
        </div>
      </div>
    </Modal>
  );
}

/** Turn a Revisit topic into a board ticket. The topic stays on Revisit, linked to the ticket. */
export function ConvertRevisionModal({
  rev,
  open,
  onClose,
  onDone,
}: {
  rev: Revision;
  open: boolean;
  onClose: () => void;
  onDone?: (item: Item) => void;
}) {
  const { data: projects = [] } = useProjects();
  const active = projects.filter((p) => !p.archived);
  const refresh = useRefreshItems();
  const toast = useToast();
  const [type, setType] = useState<ItemType>("learning");
  const [projectId, setProjectId] = useState(0);
  const [status, setStatus] = useState<Status>("backlog");
  const [priority, setPriority] = useState<Priority>(rev.priority);

  useEffect(() => {
    if (open) {
      setType("learning");
      setStatus("backlog");
      setPriority(rev.priority);
    }
  }, [open, rev.priority]);
  useEffect(() => setProjectId(defaultProject(projects, type)?.id ?? 0), [type, projects]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ item: Item }>(`/revisions/${rev.id}/convert`, { project_id: projectId, type, status, priority }),
    onSuccess: ({ item }) => {
      refresh();
      toast(`${item.key} created from “${rev.title}”`);
      onClose();
      onDone?.(item);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create ticket"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!projectId || create.isPending} onClick={() => create.mutate()}>
            Create ticket
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="-mt-1 text-[13px] text-fg-3">
          “{rev.title}” goes to the board with its notes and link. It also stays on Revisit.
        </p>
        <Tabs
          value={type}
          onChange={setType}
          tabs={(["learning", "task"] as ItemType[]).map((v) => {
            const t = TYPES.find((x) => x.value === v)!;
            return {
              value: v,
              label: (
                <span className="flex items-center gap-1.5">
                  <t.icon size={13} className={t.tone} /> {t.label}
                </span>
              ),
            };
          })}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Row label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.filter((s) => s.value !== "done").map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Row>
        </div>
      </div>
    </Modal>
  );
}
