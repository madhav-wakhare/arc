import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Priority, type Revision } from "../lib/api";
import { PRIORITIES, PriorityIcon } from "../lib/meta";
import { useRefreshItems } from "../lib/hooks";
import { Button, Input, Kbd, Modal, Select, Textarea, useToast } from "./ui";

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
      toast(`Added “${r.title}” to Revise`);
      onClose();
      onAdded?.(r);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add topic"
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
      </div>
    </Modal>
  );
}
