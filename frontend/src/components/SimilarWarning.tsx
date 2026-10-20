/** "Already in Arc" notice for add dialogs, so the same topic, blog post or book is not added twice. */
import { CircleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KIND_LABEL, findSimilar, useLearningIndex, type LearningEntry } from "../lib/learningIndex";
import { useActions } from "./Layout";

export function SimilarWarning({
  title,
  url,
  onOpen,
  ignore,
}: {
  title: string;
  url?: string | null;
  /** Called before opening a match, usually to close the dialog. */
  onOpen?: () => void;
  /** Leave out matches that are not a real duplicate, such as the item being edited. */
  ignore?: (e: LearningEntry) => boolean;
}) {
  const index = useLearningIndex();
  const { openItem } = useActions();
  const navigate = useNavigate();
  const matches = findSimilar(ignore ? index.filter((e) => !ignore(e)) : index, title, url);
  if (!matches.length) return null;
  const open = (e: LearningEntry) => {
    onOpen?.();
    if (e.itemId) setTimeout(() => openItem(e.itemId!), 0);
    else if (e.to) navigate(e.to);
  };
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
      <p className="flex items-center gap-2 font-medium text-fg">
        <CircleAlert size={14} className="shrink-0 text-warning" /> Already in Arc
      </p>
      <ul className="mt-1.5 space-y-1">
        {matches.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="flex items-center gap-2">
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[11px] text-fg-2">{KIND_LABEL[e.kind]}</span>
            <span className="min-w-0 flex-1 truncate text-fg-2" title={e.title}>
              {e.title}
            </span>
            <button type="button" onClick={() => open(e)} className="shrink-0 text-xs font-medium text-accent hover:underline">
              Open
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-fg-3">You can still add it if it is something different.</p>
    </div>
  );
}
