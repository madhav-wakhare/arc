import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { api, type Project } from "../lib/api";
import { useProjects, useRefreshItems } from "../lib/hooks";
import { Button, Field, Input, Modal, Textarea, useToast } from "./ui";

import { PROJECT_ICONS } from "../lib/projectIcons";

function deriveKey(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 4)).toUpperCase().slice(0, 6);
}

/** Create a project, or edit one when `project` is given (the key cannot change). */
export function ProjectModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project | null }) {
  const { data: projects = [] } = useProjects();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>("code");
  const refresh = useRefreshItems();
  const toast = useToast();
  const editing = !!project;

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setKey(project?.key ?? "");
    setKeyTouched(editing);
    setDescription(project?.description ?? "");
    const used = new Set(projects.map((p) => p.icon));
    setIcon(project?.icon ?? Object.keys(PROJECT_ICONS).find((i) => !used.has(i)) ?? "box");
  }, [open, project, editing]);

  const finalKey = keyTouched ? key : deriveKey(name);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/projects/${project!.id}`, { name, description, icon })
        : api.post("/projects", { name, key: finalKey, description, icon }),
    onSuccess: () => {
      refresh();
      toast(editing ? `Project ${name} saved` : `Project ${name} created`);
      onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit project · ${project!.key}` : "New project"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || finalKey.length < 2 || save.isPending} onClick={() => save.mutate()}>
            {editing ? "Save" : "Create project"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Name">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Client X" />
          </Field>
          <Field label="Key" hint={editing ? "Cannot change" : undefined}>
            <Input
              value={finalKey}
              disabled={editing}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10));
              }}
              className="font-mono disabled:opacity-60"
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
        </Field>
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-fg">Icon</span>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(PROJECT_ICONS).map(([name, Icon]) => (
              <button
                key={name}
                type="button"
                title={name}
                onClick={() => setIcon(name)}
                className={clsx(
                  "flex aspect-square items-center justify-center rounded-md border transition-colors",
                  icon === name
                    ? "border-fg bg-surface-3 text-fg"
                    : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <Icon size={16} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Confirm moving a project and its items to the trash. */
export function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const refresh = useRefreshItems();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => api.del(`/projects/${project!.id}`),
    onSuccess: () => {
      refresh();
      toast(`${project!.name} moved to Trash`);
      onClose();
      onDeleted?.();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title={`Delete project ${project?.name ?? ""}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Move to Trash
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-fg-2">
        The project and its <span className="font-medium text-fg">{project?.item_count ?? 0} items</span> go to Trash. You
        can restore them for 30 days. After that, Smriti deletes them for good. Notes in Obsidian stay in your vault.
      </p>
    </Modal>
  );
}
