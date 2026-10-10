import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Empty, IconButton, Modal, PageHeader, Tabs, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useRefreshItems, useTrash } from "../lib/hooks";
import { TypeIcon, timeAgo } from "../lib/meta";
import { ProjectIcon } from "../lib/projectIcons";

type Confirm = { title: string; body: string; run: () => void } | null;

function DaysLeft({ days }: { days: number }) {
  return (
    <span className={clsx("whitespace-nowrap text-xs", days <= 3 ? "text-critical" : days <= 7 ? "text-warning" : "text-fg-3")}>
      {days === 0 ? "Deletes today" : `${days} ${days === 1 ? "day" : "days"} left`}
    </span>
  );
}

export default function Trash() {
  const { data } = useTrash();
  const [tab, setTab] = useState<"items" | "projects">("items");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const refresh = useRefreshItems();
  const toast = useToast();

  const act = useMutation({
    mutationFn: ({ method, path }: { method: "post" | "del"; path: string; done: string }) =>
      method === "post" ? api.post(path) : api.del(path),
    onSuccess: (_d, v) => {
      refresh();
      toast(v.done);
      setConfirm(null);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Items deleted together with their project are shown under the project, not on their own.
  const items = (data?.items ?? []).filter((i) => !i.deleted_with_project);
  const projects = data?.projects ?? [];
  const total = items.length + projects.length;

  // Open the tab that has something in it.
  useEffect(() => {
    if (data && !items.length && projects.length) setTab("projects");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<Trash2 size={18} />}
        title="Trash"
        actions={
          <IconButton
            tone="danger"
            title="Empty trash"
            disabled={!total}
            onClick={() =>
              setConfirm({
                title: "Empty the trash?",
                body: "Smriti deletes every item and project in Trash for good. You cannot undo this.",
                run: () => act.mutate({ method: "del", path: "/trash", done: "Trash emptied" }),
              })
            }
          >
            <Trash2 size={16} />
          </IconButton>
        }
      />
      <div className="space-y-4 px-4 md:px-6 lg:px-8">
        <p className="text-[13px] text-fg-3">
          Deleted items and projects stay here for {data?.trash_days ?? 30} days. Restore them any time before that. After{" "}
          {data?.trash_days ?? 30} days, Smriti deletes them for good.
        </p>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "items", label: `Items · ${items.length}` },
            { value: "projects", label: `Projects · ${projects.length}` },
          ]}
        />

        <Card className="overflow-x-auto">
          {tab === "items" &&
            (items.length === 0 ? (
              <Empty icon={<Trash2 size={28} />} title="No deleted items" />
            ) : (
              <table className="w-full min-w-[640px] text-[14px]">
                <thead className="border-b border-line bg-surface-2/40 text-left text-[13px] text-fg-2">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Item</th>
                    <th className="w-40 px-3 py-3.5 font-medium">Project</th>
                    <th className="w-28 px-3 py-3.5 font-medium">Deleted</th>
                    <th className="w-28 px-3 py-3.5 font-medium">Remaining</th>
                    <th className="w-36 px-3 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-5 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <TypeIcon type={i.type} />
                          <span className="font-mono text-xs text-fg-3">{i.key}</span>
                          <span className="truncate">{i.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg-2">
                        <span className="flex items-center gap-2">
                          <ProjectIcon icon={i.project_icon} size={14} />
                          {i.project_name}
                          {!!i.project_deleted && <span className="text-xs text-fg-3">(deleted)</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg-3">{timeAgo(i.deleted_at)}</td>
                      <td className="px-3 py-3"><DaysLeft days={i.days_left} /></td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            icon={<RotateCcw size={13} />}
                            title={i.project_deleted ? "Also restores its project" : undefined}
                            onClick={() => act.mutate({ method: "post", path: `/trash/items/${i.id}/restore`, done: `${i.key} restored` })}
                          >
                            Restore
                          </Button>
                          <IconButton
                            tone="danger"
                            className="size-7"
                            title="Delete for good"
                            onClick={() =>
                              setConfirm({
                                title: `Delete ${i.key} for good?`,
                                body: "The item, its checklist, comments and work log are deleted. You cannot undo this.",
                                run: () => act.mutate({ method: "del", path: `/trash/items/${i.id}`, done: `${i.key} deleted for good` }),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === "projects" &&
            (projects.length === 0 ? (
              <Empty icon={<Trash2 size={28} />} title="No deleted projects" />
            ) : (
              <table className="w-full min-w-[640px] text-[14px]">
                <thead className="border-b border-line bg-surface-2/40 text-left text-[13px] text-fg-2">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Project</th>
                    <th className="w-28 px-3 py-3.5 font-medium">Items</th>
                    <th className="w-28 px-3 py-3.5 font-medium">Deleted</th>
                    <th className="w-28 px-3 py-3.5 font-medium">Remaining</th>
                    <th className="w-36 px-3 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-3">
                          <ProjectIcon icon={p.icon} size={16} />
                          {p.name}
                          <span className="font-mono text-xs text-fg-3">{p.key}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-fg-2">{p.item_count}</td>
                      <td className="px-3 py-3 text-[13px] text-fg-3">{timeAgo(p.deleted_at)}</td>
                      <td className="px-3 py-3"><DaysLeft days={p.days_left} /></td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            icon={<RotateCcw size={13} />}
                            onClick={() =>
                              act.mutate({ method: "post", path: `/trash/projects/${p.id}/restore`, done: `${p.name} restored with its items` })
                            }
                          >
                            Restore
                          </Button>
                          <IconButton
                            tone="danger"
                            className="size-7"
                            title="Delete for good"
                            onClick={() =>
                              setConfirm({
                                title: `Delete ${p.name} for good?`,
                                body: `The project and all ${p.item_count} of its items are deleted. You cannot undo this.`,
                                run: () => act.mutate({ method: "del", path: `/trash/projects/${p.id}`, done: `${p.name} deleted for good` }),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </Card>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" disabled={act.isPending} onClick={() => confirm?.run()}>
              Delete for good
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">{confirm?.body}</p>
      </Modal>
    </div>
  );
}
