import clsx from "clsx";
import { Book as BookIcon } from "lucide-react";
import { useState } from "react";
import type { Book } from "../lib/api";
import { urlHash } from "../lib/meta";

/** Book cover from Arc's cache, or a quiet placeholder with the title. */
export function BookCover({ book, className, small }: { book: Pick<Book, "id" | "cover" | "title"> & { id?: number }; className?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = book.cover ? (book.id ? `/api/books/${book.id}/cover?v=${urlHash(book.cover)}` : book.cover.replace("-L.jpg", "-M.jpg")) : null;
  if (src && !failed)
    return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={clsx("bg-surface-2 object-cover", className)} />;
  return (
    <div className={clsx("flex flex-col items-center justify-center gap-2 bg-surface-2 p-3 text-center", className)}>
      <BookIcon size={small ? 15 : 18} className="text-book" />
      {!small && <span className="line-clamp-3 text-[11px] leading-snug text-fg-3">{book.title}</span>}
    </div>
  );
}

