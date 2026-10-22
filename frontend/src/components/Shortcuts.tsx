/** Keyboard shortcuts: one list for the ? dialog and Settings, and the G-then-key page jumps. */
import { Fragment } from "react";
import { Kbd, Modal } from "./ui";

/** Press G, then one of these keys, to jump to a page. */
export const GO_TO: Record<string, { to: string; label: string }> = {
  d: { to: "/", label: "Dashboard" },
  b: { to: "/board", label: "Board" },
  r: { to: "/radar", label: "Radar" },
  l: { to: "/learning", label: "Learning" },
  t: { to: "/learning/topics", label: "Topics" },
  w: { to: "/reports", label: "Weekly report" },
  e: { to: "/weekend", label: "Weekend" },
  s: { to: "/settings", label: "Settings" },
};

const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

export const SHORTCUTS: { group: string; items: [string, string[]][] }[] = [
  {
    group: "General",
    items: [
      ["Search and commands", [isMac ? "⌘" : "Ctrl", "K"]],
      ["Show shortcuts", ["?"]],
      ["Close panel or dialog", ["Esc"]],
      ["Post a comment", [isMac ? "⌘" : "Ctrl", "Enter"]],
    ],
  },
  {
    group: "Create",
    items: [
      ["New task", ["C"]],
      ["Capture to Radar", ["N"]],
      ["Add to Revisit", ["R"]],
    ],
  },
  { group: "Go to", items: Object.entries(GO_TO).map(([k, v]) => [v.label, ["G", k.toUpperCase()]]) },
];

export function ShortcutList() {
  return (
    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {SHORTCUTS.map((g) => (
        <div key={g.group}>
          <p className="mb-2 text-xs font-medium text-fg-3">{g.group}</p>
          <div className="space-y-1.5">
            {g.items.map(([label, keys]) => (
              <div key={label} className="flex items-center justify-between text-[13px]">
                <span className="text-fg-2">{label}</span>
                <span className="flex items-center gap-1">
                  {keys.map((k, i) => (
                    <Fragment key={i}>
                      {g.group === "Go to" && i === 1 && <span className="text-[11px] text-fg-3">then</span>}
                      <Kbd>{k}</Kbd>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-xl">
      <ShortcutList />
    </Modal>
  );
}
