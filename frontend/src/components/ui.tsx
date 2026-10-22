import clsx from "clsx";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { QuoteDock } from "./QuoteDock";

// ---------------------------------------------------------------- buttons

type Variant = "default" | "primary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: ReactNode }
>(function Button({ variant = "default", size = "md", icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        variant === "default" && "border border-line bg-surface text-fg hover:bg-surface-2",
        variant === "primary" && "bg-fg text-bg hover:opacity-85",
        variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "border border-line bg-surface text-critical hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({
  className,
  active,
  tone,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: "danger" }) {
  return (
    <button
      className={clsx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
        tone === "danger"
          ? "border border-line bg-surface text-critical hover:bg-surface-2"
          : "text-fg-2 hover:bg-surface-2 hover:text-fg",
        active && "bg-surface-3 text-fg",
        className,
      )}
      {...rest}
    />
  );
}

/** Bifrost-style on/off switch. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-md border p-[3px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-fg bg-fg" : "border-line-strong bg-surface-3",
      )}
    >
      <span
        className={clsx(
          "block size-4 rounded-[4px] shadow-sm transition-transform",
          checked ? "translate-x-5 bg-bg" : "translate-x-0 bg-fg-3",
        )}
      />
    </button>
  );
}

/**
 * Dropdown menu for row actions. Rendered in a portal with fixed position,
 * so cards and tables with overflow hidden cannot clip it.
 */
export function Menu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: { label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean }[];
}) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const WIDTH = 200;

  const openMenu = () => {
    const r = triggerRef.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < items.length * 34 + 16;
    setPos({
      top: r.bottom + 4,
      // Opening upward is anchored by `bottom`, not a transform, so the open animation cannot undo it.
      bottom: window.innerHeight - r.top + 4,
      left: Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8)),
      up,
    });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setPos(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const dismiss = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [pos]);

  return (
    <div ref={triggerRef} className="inline-block" onClick={(e) => {
      e.stopPropagation();
      if (pos) setPos(null);
      else openMenu();
    }}>
      {trigger}
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={pos.up ? { bottom: pos.bottom, left: pos.left, width: WIDTH } : { top: pos.top, left: pos.left, width: WIDTH }}
            className="anim-drop fixed z-[70] rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setPos(null);
                  it.onClick();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2",
                  it.danger ? "text-critical" : "text-fg",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------- form controls

const fieldBase =
  "w-full rounded-md border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-fg-3 " +
  "outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(
  function Input({ className, icon, ...rest }, ref) {
    if (!icon) return <input ref={ref} className={clsx(fieldBase, "h-9", className)} {...rest} />;
    return (
      <div className={clsx("relative", className)}>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3">{icon}</span>
        <input ref={ref} className={clsx(fieldBase, "h-9 pl-9")} {...rest} />
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(fieldBase, "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
  },
);

export function Select({
  className,
  icon,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }) {
  return (
    <div className={clsx("relative", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3">{icon}</span>
      )}
      <select
        className={clsx(fieldBase, "h-9 appearance-none pr-8", icon ? "pl-8" : "pl-3", "cursor-pointer")}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

/**
 * Date field that shows "Oct 12, 2026" (or a grey placeholder) instead of the browser's
 * dd/mm/yyyy text. A transparent native date input on top keeps the system date picker.
 */
export function DateInput({
  value,
  onChange,
  placeholder = "Set date",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const label = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : placeholder;
  return (
    <div className={clsx("relative", className)}>
      <div className={clsx(fieldBase, "flex h-9 items-center gap-2 pr-8")}>
        <CalendarDays size={14} className="shrink-0 text-fg-3" />
        <span className={clsx("truncate", !value && "text-fg-3")}>{label}</span>
      </div>
      <input
        type="date"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* older browsers open the picker on their own */
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {value && (
        <button
          type="button"
          title="Clear date"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-0.5 text-fg-3 hover:bg-surface-2 hover:text-fg"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex cursor-pointer items-center gap-3 select-none", className)}>
      <span
        className={clsx(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          checked ? "border-fg bg-fg text-bg" : "border-line-strong bg-surface",
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.5l2.2 2.2L9.5 3.8" />
          </svg>
        )}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-fg-3">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- layout pieces

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function PageHeader({
  title,
  icon,
  actions,
  quotes,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Show the quote dock (only Dashboard and Board use it). */
  quotes?: "dashboard" | "board";
}) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 md:px-6 lg:flex-nowrap lg:px-8">
      <h1 className="flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight">
        {icon && <span className="text-fg-2">{icon}</span>}
        {title}
      </h1>
      {quotes && (
        // Takes the free space between title and actions; the dock is centred in it,
        // so the gap to the title and to the actions is the same.
        <div className="@container/dock hidden min-w-0 flex-1 justify-center lg:flex">
          <QuoteDock page={quotes} />
        </div>
      )}
      {/* Rendered even when empty next to the dock, so the gap on its right matches the gap on its left. */}
      {(actions || quotes) && <div className="flex shrink-0 items-center gap-2 lg:flex-nowrap">{actions}</div>}
    </div>
  );
}

/** Bifrost-style segmented tabs. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-2 p-1",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "h-7 shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors",
            value === t.value
              ? "border border-line bg-surface text-fg shadow-sm"
              : "border border-transparent text-fg-2 hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] text-fg-3">
      {children}
    </kbd>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-fg-3">{icon}</div>}
      <p className="text-sm text-fg-2">{title}</p>
      {hint && <p className="max-w-sm text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- overlays

function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, open]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
      <div className="anim-fade fixed inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div
        role="dialog"
        className={clsx("anim-pop relative w-full rounded-xl border border-line bg-surface shadow-[var(--shadow)]", width)}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close" className="-mr-2">
            <X size={16} />
          </IconButton>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(onClose, open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="anim-fade absolute inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div className="anim-drawer absolute inset-y-0 right-0 flex w-full max-w-[860px] flex-col border-l border-line bg-bg shadow-[var(--shadow)]">
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- toasts

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: string; tone: "default" | "error"; action?: ToastAction };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"], action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "default", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={clsx(
                "anim-toast pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-[13px] shadow-[var(--shadow)]",
                t.tone === "error" ? "border-critical/50 text-critical" : "border-line text-fg",
              )}
            >
              <span className="flex-1">{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((all) => all.filter((x) => x.id !== t.id));
                  }}
                  className="h-7 shrink-0 rounded-md bg-fg px-2.5 text-xs font-medium text-bg hover:opacity-85"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
