import { useMutation } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ItemType, type Jot, type Project } from "../lib/api";
import { useRefreshItems } from "../lib/hooks";
import { Button, Field, Input, Kbd, Modal, Textarea, useToast } from "./ui";

/** Default project for a new ticket: LRN for learning, WORK for tasks, else the first active one. */
export function defaultProject(projects: Project[], type: ItemType) {
  const active = projects.filter((p) => !p.archived);
  const key = type === "learning" ? "LRN" : "WORK";
  return active.find((p) => p.key === key) ?? active[0];
}

/** Add a topic to Radar. Enter in the first field saves. */
export function AddTopicModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (j: Jot) => void }) {
  const [body, setBody] = useState("");
  const [details, setDetails] = useState("");
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const refresh = useRefreshItems();
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setBody("");
      setDetails("");
      setUrl("");
    }
  }, [open]);

  const save = useMutation({
    mutationFn: () => api.post<Jot>("/jots", { body, details, url: url.trim() || null }),
    onSuccess: (j) => {
      refresh();
      toast(`Added “${j.body}” to Radar`);
      onClose();
      onAdded?.(j);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const submit = () => body.trim() && !save.isPending && save.mutate();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add topic"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="hidden items-center gap-1.5 text-xs text-fg-3 sm:flex">
            <Kbd>Enter</Kbd> to add
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!body.trim() || save.isPending} onClick={submit}>
              Add topic
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="-mt-1 text-[13px] text-fg-3">A tool, concept or idea you want to look at later.</p>
        <Field label="Topic">
          <Input ref={ref} autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. vLLM" />
        </Field>
        <Field label="Notes (optional)" hint="Use #tags to add labels, for example #gpu.">
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Where you heard about it and why it matters"
            className="min-h-20"
          />
        </Field>
        <Field label="Link (optional)">
          <Input icon={<Link2 size={15} />} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
