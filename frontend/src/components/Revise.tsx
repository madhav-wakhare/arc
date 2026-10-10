import { useMutation } from "@tanstack/react-query";
import { CircleHelp, Flag, Link2, NotebookText, Type } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Priority, type Revision } from "../lib/api";
import { PRIORITIES, PriorityIcon } from "../lib/meta";
import { useRefreshItems } from "../lib/hooks";
import { Button, Input, Kbd, Modal, Select, Textarea, useToast } from "./ui";

export type RevisionFields = { title: string; question: string; notes: string; url: string; priority: Priority };

/** Label with a small icon, used by the Revise forms. */
export function IconLabel({ icon, label, hint, children }: { icon: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <span className="text-fg-3">{icon}</span>
        {label}
        {hint && <span className="font-normal text-fg-3">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function RevisionForm({ value, onChange }: { value: RevisionFields; onChange: (v: RevisionFields) => void }) {
  const set = (k: keyof RevisionFields) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <IconLabel icon={<Type size={14} />} label="Topic">
        <Input autoFocus value={value.title} onChange={set("title")} placeholder="e.g. KV cache in vLLM" />
      </IconLabel>
      <IconLabel icon={<CircleHelp size={14} />} label="Question" hint="optional, to test yourself">
        <Input value={value.question} onChange={set("question")} placeholder="e.g. Why does the KV cache use so much GPU memory?" />
      </IconLabel>
      <IconLabel icon={<NotebookText size={14} />} label="Notes" hint="in your own words">
        <Textarea value={value.notes} onChange={set("notes")} placeholder="The few lines you want to remember" className="min-h-28" />
      </IconLabel>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <IconLabel icon={<Link2 size={14} />} label="Link" hint="optional">
          <Input value={value.url} onChange={set("url")} placeholder="https://" />
        </IconLabel>
        <IconLabel icon={<Flag size={14} />} label="Priority">
          <Select icon={<PriorityIcon priority={value.priority} />} value={value.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </IconLabel>
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
      title="Add to Revise"
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
              Add to Revise
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
        <p className="-mt-1 mb-4 text-[13px] text-fg-3">Something you learned and want to keep in front of you so you don’t forget it.</p>
        <RevisionForm value={form} onChange={setForm} />
      </div>
    </Modal>
  );
}
