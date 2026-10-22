import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, CalendarHeart, CheckCircle2, FolderOpen, Settings as SettingsIcon, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ObsidianIcon } from "../components/ObsidianIcon";
import { Button, Card, Field, Input, PageHeader, Switch, useToast } from "../components/ui";
import { api, type Backup, type Settings as SettingsT } from "../lib/api";
import { useSettings } from "../lib/hooks";
import { fmtDateTime } from "../lib/meta";
import { useQueryClient } from "@tanstack/react-query";

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? <CheckCircle2 size={15} className="text-good" /> : <XCircle size={15} className="text-critical" />}
      <span className={clsx(!ok && "text-fg-2")}>{children}</span>
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-xs text-fg-3">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export default function Settings() {
  const { data } = useSettings();
  const { data: backups = [] } = useQuery({ queryKey: ["backups"], queryFn: () => api.get<Backup[]>("/backups") });
  const [folder, setFolder] = useState("");
  const [articlesFolder, setArticlesFolder] = useState("");
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (data) {
      setFolder(data.obsidian.folder);
      setArticlesFolder(data.obsidian.articles_folder ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (body: Partial<{ obsidian_articles_folder: string; obsidian_folder: string; auto_reexport: boolean; monthly_backup: boolean; weekend_mode: boolean }>) =>
      api.put<SettingsT>("/settings", body),
    onSuccess: (s) => {
      qc.setQueryData(["settings"], s);
      toast("Settings saved");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const backupNow = useMutation({
    mutationFn: () => api.post<{ path: string }>("/backups"),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      toast(`Backup written: ${b.path}`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <div className="mx-auto w-full max-w-[960px] pb-10">
      <PageHeader icon={<SettingsIcon size={18} />} title="Settings" />
      <div className="space-y-4 px-4 md:px-6 lg:px-8">
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 text-[15px] font-medium">
            <ObsidianIcon size={16} /> Obsidian
          </h3>
          <p className="mb-4 text-[13px] text-fg-3">
            Exported videos, links and articles each become one note, named after the title. A later change overwrites the note.
          </p>
          {data && (
            <div className="mb-4 space-y-1.5 rounded-md border border-line bg-surface-2/50 p-3">
              <Check ok={data.obsidian.mounted}>Vault folder is mounted in the container</Check>
              <Check ok={data.obsidian.writable}>Vault folder is writable</Check>
              <Check ok={data.obsidian.is_obsidian_vault}>Folder contains a .obsidian directory</Check>
              {!data.obsidian.mounted && (
                <p className="pt-1 text-xs text-fg-3">
                  Set <code className="font-mono">OBSIDIAN_VAULT_PATH</code> in <code className="font-mono">.env</code> and run{" "}
                  <code className="font-mono">docker compose up -d</code>.
                </p>
              )}
            </div>
          )}
          <ToggleRow
            title="Re-export on change"
            hint="When you change the title or link of an exported item, overwrite its note."
            checked={data?.auto_reexport ?? true}
            onChange={(v) => save.mutate({ auto_reexport: v })}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
            <Field label="Videos and links folder">
              <Input icon={<FolderOpen size={14} />} value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Arc/Videos" />
            </Field>
            </div>
            <Button variant="primary" className="h-9" disabled={!folder.trim() || folder === data?.obsidian.folder} onClick={() => save.mutate({ obsidian_folder: folder })}>
              Save
            </Button>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Articles folder" hint="Where the Reading list saves its notes.">
                <Input
                  icon={<FolderOpen size={14} />}
                  value={articlesFolder}
                  onChange={(e) => setArticlesFolder(e.target.value)}
                  placeholder="Arc/Articles"
                />
              </Field>
            </div>
            <Button
              variant="primary"
              className="mb-5 h-9"
              disabled={!articlesFolder.trim() || articlesFolder === (data?.obsidian.articles_folder ?? "")}
              onClick={() => save.mutate({ obsidian_articles_folder: articlesFolder })}
            >
              Save
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-[15px] font-medium">
                <Archive size={16} /> Backups
              </h3>
              <p className="text-[13px] text-fg-3">
                Arc copies the database once each month into <code className="font-mono">backups/YYYY-MM/</code> in the
                project folder.
              </p>
            </div>
            <Button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
              Back up now
            </Button>
          </div>
          <ToggleRow
            title="Monthly backup"
            hint="Copy the database once each month. Manual backups always work."
            checked={data?.monthly_backup ?? true}
            onChange={(v) => save.mutate({ monthly_backup: v })}
          />
          <div className="divide-y divide-line rounded-md border border-line">
            {backups.length === 0 && <p className="p-3 text-center text-[13px] text-fg-3">No backups yet</p>}
            {backups.slice(0, 12).map((b) => (
              <div key={b.path} className="flex items-center justify-between px-3 py-2 text-[13px]">
                <span className="font-mono text-xs">{b.path}</span>
                <span className="text-xs text-fg-3">
                  {(b.size_bytes / 1024).toFixed(0)} KB · {fmtDateTime(b.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 [&>*:last-child]:mb-0">
          <h3 className="mb-1 flex items-center gap-2 text-[15px] font-medium">
            <CalendarHeart size={16} /> Weekend
          </h3>
          <p className="mb-4 text-[13px] text-fg-3">
            Plan Saturday and Sunday in morning, afternoon and evening slots, mixing study and revision with life: travel,
            movies, people, rest.
          </p>
          <ToggleRow
            title="Weekend mode"
            hint="Adds Weekend to the sidebar and shows the day's plan at the top of the Dashboard on Saturday and Sunday."
            checked={data?.weekend_mode ?? false}
            onChange={(v) => save.mutate({ weekend_mode: v })}
          />
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-medium">Keyboard shortcuts</h3>
          <div className="grid gap-2 text-[13px] sm:grid-cols-2">
            {[
              ["Search and commands", "⌘K / Ctrl K"],
              ["New task", "C"],
              ["Capture to Radar", "N"],
              ["Add to Revisit", "R"],
              ["Close panel or dialog", "Esc"],
              ["Post a comment", "⌘ Enter"],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between rounded-md border border-line px-3 py-2">
                <span className="text-fg-2">{a}</span>
                <span className="font-mono text-xs">{b}</span>
              </div>
            ))}
          </div>
          {data && <p className="mt-4 text-xs text-fg-3">Arc v{data.version} · time zone {data.timezone}</p>}
        </Card>
      </div>
    </div>
  );
}
