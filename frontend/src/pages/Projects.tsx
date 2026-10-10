import { useMutation } from "@tanstack/react-query";
import { Ellipsis, FolderKanban, Pencil, Plus, SquareKanban, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeleteProjectModal, ProjectModal } from "../components/ProjectModal";
import { Button, Card, Empty, IconButton, Menu, PageHeader, Switch, useToast } from "../components/ui";
import { api, type Project } from "../lib/api";
import { useProjects, useRefreshItems } from "../lib/hooks";
import { ProjectIcon } from "../lib/projectIcons";

export default function Projects() {
  const { data: projects = [] } = useProjects();
  const [editing, setEditing] = useState<Project | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const navigate = useNavigate();
  const refresh = useRefreshItems();
  const toast = useToast();

  const setActive = useMutation({
    mutationFn: ({ p, active }: { p: Project; active: boolean }) => api.patch(`/projects/${p.id}`, { archived: !active }),
    onSuccess: (_d, { p, active }) => {
      refresh();
      toast(active ? `${p.name} is active` : `${p.name} is hidden from the sidebar and pickers`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<FolderKanban size={18} />}
        title="Projects"
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing(null)}>
            Add new project
          </Button>
        }
      />
      <div className="px-4 md:px-6 lg:px-8">
        <Card className="overflow-x-auto">
          {projects.length === 0 ? (
            <Empty icon={<FolderKanban size={28} />} title="No projects" hint="Add a project to group your items." />
          ) : (
            <table className="w-full min-w-[640px] text-[14px]">
              <thead className="border-b border-line bg-surface-2/40 text-left text-[13px] text-fg-2">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Project</th>
                  <th className="w-28 px-3 py-3.5 font-medium">Key</th>
                  <th className="w-32 px-3 py-3.5 font-medium">Items</th>
                  <th className="w-28 px-3 py-3.5 font-medium">Active</th>
                  <th className="w-16 px-3 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/board?project=${p.id}`)}
                    className="cursor-pointer hover:bg-surface-2/60"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
                          <ProjectIcon icon={p.icon} size={16} className="text-fg" />
                        </span>
                        <div className="min-w-0">
                          <p className={p.archived ? "text-fg-3" : ""}>{p.name}</p>
                          {p.description && <p className="truncate text-xs text-fg-3">{p.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[13px] text-fg-2">{p.key}</td>
                    <td className="px-3 py-3.5 text-[13px] text-fg-2">
                      <span className="text-fg">{p.open_count}</span> open · {p.item_count}
                    </td>
                    <td className="px-3 py-3.5">
                      <Switch
                        checked={!p.archived}
                        label={p.archived ? "Inactive" : "Active"}
                        disabled={setActive.isPending}
                        onChange={(active) => setActive.mutate({ p, active })}
                      />
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <Menu
                        trigger={
                          <IconButton title="Actions">
                            <Ellipsis size={18} />
                          </IconButton>
                        }
                        items={[
                          { label: "Open board", icon: <SquareKanban size={14} />, onClick: () => navigate(`/board?project=${p.id}`) },
                          { label: "Edit project", icon: <Pencil size={14} />, onClick: () => setEditing(p) },
                          { label: "Delete project", icon: <Trash2 size={14} />, onClick: () => setDeleting(p), danger: true },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <p className="mt-3 text-xs text-fg-3">
          An inactive project is hidden from the sidebar and from project pickers. Its items stay on the board.
        </p>
      </div>
      <ProjectModal open={editing !== undefined} project={editing} onClose={() => setEditing(undefined)} />
      <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
