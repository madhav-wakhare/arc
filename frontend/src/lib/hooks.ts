import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type Item, type Jot, type Project, type Revision, type Settings, type Timer, type Trash } from "./api";
import { useToast } from "../components/ui";

export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects") });
export const useJots = () => useQuery({ queryKey: ["jots"], queryFn: () => api.get<Jot[]>("/jots") });
export const useRevisions = () => useQuery({ queryKey: ["revisions"], queryFn: () => api.get<Revision[]>("/revisions") });
export const useTrash = () => useQuery({ queryKey: ["trash"], queryFn: () => api.get<Trash>("/trash") });
export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
export const useTimer = () =>
  useQuery({ queryKey: ["timer"], queryFn: () => api.get<Timer | null>("/timer"), refetchInterval: 30_000 });

/** Invalidate everything that depends on items. */
export function useRefreshItems() {
  const qc = useQueryClient();
  return () => {
    for (const k of ["items", "item", "stats", "weekly", "projects", "timer", "worklogs", "history", "comments", "trash", "jots", "revisions"])
      qc.invalidateQueries({ queryKey: [k] });
  };
}

export function useUpdateItem() {
  const refresh = useRefreshItems();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Item> & { id: number }) => api.patch<Item>(`/items/${id}`, patch),
    onSuccess: (item, patch) => {
      refresh();
      // Finished a learning ticket: offer to keep it in front of you on the Revisit list.
      if (patch.status === "done" && item.type === "learning" && !item.revision_id) {
        toast(`Done: ${item.title}. Keep it on your Revisit list?`, "default", {
          label: "Add to Revisit",
          onClick: () =>
            api.post(`/items/${item.id}/revise`).then(() => {
              refresh();
              toast("Added to Revisit");
            }),
        });
      }
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  }, [key, v]);
  return [v, setV] as const;
}
