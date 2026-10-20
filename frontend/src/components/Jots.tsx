import { useMutation } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ItemType, type Jot, type Project } from "../lib/api";
import { useRefreshItems } from "../lib/hooks";
import { splitTopic } from "../lib/meta";
import { Button, Checkbox, Field, Input, Kbd, Modal, Textarea, useToast } from "./ui";
import { SimilarWarning } from "./SimilarWarning";

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
  const [keepOne, setKeepOne] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const refresh = useRefreshItems();
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setBody("");
      setDetails("");
      setUrl("");
      setKeepOne(false);
    }
  }, [open]);

  // "wireguard, openvpn" becomes two topics unless you choose to keep it as one.
  const parts = splitTopic(body);
  const bodies = parts.length > 1 && !keepOne ? parts : [body];

  const save = useMutation({
    mutationFn: async () => {
      const added: Jot[] = [];
      for (const b of bodies) added.push(await api.post<Jot>("/jots", { body: b, details, url: url.trim() || null }));
      return added;
    },
    onSuccess: (added) => {
      refresh();
      toast(added.length > 1 ? `Added ${added.length} topics to Radar` : `Added “${added[0].body}” to Radar`);
      onClose();
      onAdded?.(added[0]);
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
              {bodies.length > 1 ? `Add ${bodies.length} topics` : "Add topic"}
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
        <Field label="Topic" hint={parts.length < 2 ? "Separate several topics with commas." : undefined}>
          <Input ref={ref} autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. vLLM" />
        </Field>
        {parts.length > 1 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2/50 px-3 py-2">
            <p className="min-w-0 truncate text-[13px] text-fg-2">
              {keepOne ? "Adds one topic" : `Adds ${parts.length} topics: ${parts.join(" · ")}`}
            </p>
            <Checkbox checked={keepOne} onChange={setKeepOne} label={<span className="whitespace-nowrap text-xs text-fg-3">Keep as one</span>} />
          </div>
        )}
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
        {bodies.map((b, i) => (
          <SimilarWarning key={i} title={b} url={bodies.length === 1 ? url : null} onOpen={onClose} />
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
