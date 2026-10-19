import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Book as BookIcon, BookOpen, LoaderCircle, Plus, Search, SquareKanban, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useActions } from "../components/Layout";
import { LearningNav } from "../components/LearningNav";
import { Button, Card, Drawer, Empty, Field, IconButton, Input, Modal, PageHeader, Tabs, Textarea, useToast } from "../components/ui";
import { api, type Book, type BookHit, type BookStatus } from "../lib/api";
import { useLocalState, useRefreshItems } from "../lib/hooks";
import { fmtDate, urlHash } from "../lib/meta";

type Tab = BookStatus | "all";

export const BOOK_STATUSES: { value: BookStatus; label: string }[] = [
  { value: "want", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "finished", label: "Finished" },
];

const useBooks = () => useQuery({ queryKey: ["books"], queryFn: () => api.get<Book[]>("/books") });

function useBookMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const refreshItems = useRefreshItems();
  const refresh = () => qc.invalidateQueries({ queryKey: ["books"] });
  const onError = (e: Error) => toast(e.message, "error");
  return {
    update: useMutation({
      mutationFn: ({ id, ...patch }: { id: number } & Partial<Pick<Book, "title" | "author" | "pages" | "current_page" | "notes" | "status">>) =>
        api.patch<Book>(`/books/${id}`, patch),
      onSuccess: (b) => qc.setQueryData<Book[]>(["books"], (old) => old?.map((x) => (x.id === b.id ? b : x))),
      onError,
    }),
    toBoard: useMutation({
      mutationFn: (id: number) => api.post<Book>(`/books/${id}/ticket`),
      onSuccess: (b) => {
        refresh();
        refreshItems();
        toast(`On the board as ${b.item_key}`);
      },
      onError,
    }),
    remove: useMutation({ mutationFn: (id: number) => api.del(`/books/${id}`), onSuccess: () => (refresh(), refreshItems()), onError }),
  };
}

/** Book cover from Arc's cache, or a quiet placeholder with the title. */
function Cover({ book, className, small }: { book: Pick<Book, "id" | "cover" | "title"> & { id?: number }; className?: string; small?: boolean }) {
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

function Progress({ book }: { book: Book }) {
  if (!book.pages) return null;
  const pct = Math.min(100, Math.round((book.current_page / book.pages) * 100));
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-book transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const status = BOOK_STATUSES.find((s) => s.value === book.status)!.label;
  return (
    <button onClick={onOpen} className="group flex flex-col text-left">
      <div className="relative">
        <Cover book={book} className="aspect-[2/3] w-full rounded-md border border-line shadow-sm transition-transform group-hover:-translate-y-0.5" />
        {book.item_key && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-bg/85 px-1.5 py-px font-mono text-[10px] text-fg-2 backdrop-blur-sm">
            <SquareKanban size={10} /> {book.item_key}
          </span>
        )}
      </div>
      <p className="mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug">{book.title}</p>
      {book.author && <p className="mt-0.5 truncate text-xs text-fg-3">{book.author}</p>}
      <div className="mt-2 space-y-1.5">
        <Progress book={book} />
        <p className="text-[11px] text-fg-3">
          {book.status === "reading" && book.pages ? `Page ${book.current_page} of ${book.pages}` : status}
          {book.status === "finished" && book.finished_at && ` · ${fmtDate(book.finished_at)}`}
        </p>
      </div>
    </button>
  );
}

/** Search Open Library, or add by hand. */
function AddBookModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["book-search", debounced],
    queryFn: () => api.get<BookHit[]>(`/books/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2 && !manual,
    staleTime: 60_000,
  });
  const add = useMutation({
    mutationFn: (body: Partial<BookHit>) => api.post<Book>("/books", body),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["books"] });
      toast(`Added ${b.title}`);
      close();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });
  const close = () => {
    setQ("");
    setManual(false);
    setTitle("");
    setAuthor("");
    setPages("");
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Add a book" width="max-w-lg">
      {manual ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) add.mutate({ title, author, pages: Number(pages) || null });
          }}
        >
          <Field label="Title">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Author">
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label="Pages">
              <Input inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setManual(false)} className="text-xs text-fg-3 hover:text-fg">
              Search instead
            </button>
            <Button type="submit" variant="primary" disabled={!title.trim() || add.isPending}>
              Add book
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <Input
            autoFocus
            icon={results.isFetching ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or author"
          />
          <div className="max-h-[420px] overflow-y-auto">
            {results.data?.map((b, i) => (
              <button
                key={`${b.olid}-${i}`}
                onClick={() => add.mutate(b)}
                disabled={add.isPending}
                className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-2"
              >
                <Cover book={{ ...b, id: 0 }} small className="h-16 w-11 shrink-0 rounded-sm border border-line" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{b.title}</p>
                  <p className="truncate text-xs text-fg-3">
                    {[b.author, b.year, b.pages && `${b.pages} pages`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Plus size={15} className="shrink-0 text-fg-3" />
              </button>
            ))}
            {results.isError && <p className="py-6 text-center text-[13px] text-fg-3">{(results.error as Error).message}</p>}
            {results.data?.length === 0 && <p className="py-6 text-center text-[13px] text-fg-3">No books found.</p>}
            {debounced.length < 2 && <p className="py-6 text-center text-[13px] text-fg-3">Covers and details come from Open Library.</p>}
          </div>
          <button
            onClick={() => {
              setManual(true);
              setTitle(q);
            }}
            className="text-xs text-fg-3 hover:text-fg"
          >
            Add by hand instead
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Side panel for one book: status, progress, notes and the board ticket. */
function BookPanel({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { update, toBoard, remove } = useBookMutations();
  const { openItem } = useActions();
  const [page, setPage] = useState("");
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!book) return;
    setPage(String(book.current_page || ""));
    setNotes(book.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, book?.current_page]);

  if (!book) return null;
  const b = book;
  const savePage = () => {
    const n = Math.max(0, Math.min(Number(page) || 0, b.pages ?? 20000));
    if (n !== b.current_page) update.mutate({ id: b.id, current_page: n });
  };
  const close = () => {
    if (notes !== b.notes) update.mutate({ id: b.id, notes });
    onClose();
  };

  return (
    <Drawer open onClose={close}>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-book">
          <BookIcon size={15} /> Book
        </span>
        <div className="flex-1" />
        <IconButton title="Delete" className="hover:text-critical" onClick={() => setConfirm(true)}>
          <Trash2 size={15} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconButton title="Close" onClick={close}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] space-y-6 px-6 py-6">
          <div className="flex gap-5">
            <Cover book={b} className="aspect-[2/3] w-28 shrink-0 rounded-md border border-line shadow-sm" />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold leading-snug tracking-tight">{b.title}</h2>
              {b.author && <p className="mt-1 text-[13px] text-fg-2">{b.author}</p>}
              <p className="mt-1 text-xs text-fg-3">{[b.year, b.pages && `${b.pages} pages`].filter(Boolean).join(" · ")}</p>
              <div className="mt-4">
                {b.item_key ? (
                  <Button
                    size="sm"
                    icon={<SquareKanban size={13} />}
                    onClick={() => {
                      close();
                      setTimeout(() => openItem(b.item_id!), 0);
                    }}
                  >
                    On the board · {b.item_key}
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" icon={<SquareKanban size={13} />} disabled={toBoard.isPending} onClick={() => toBoard.mutate(b.id)}>
                    Add to board
                  </Button>
                )}
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-4 text-[13px]">
            <dt className="text-fg-3">Status</dt>
            <dd>
              <Tabs value={b.status} onChange={(s) => update.mutate({ id: b.id, status: s })} tabs={BOOK_STATUSES} />
            </dd>
            <dt className="text-fg-3">Progress</dt>
            <dd className="flex items-center gap-3">
              <div className="w-20 shrink-0">
              <Input
                inputMode="numeric"
                value={page}
                onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
                onBlur={savePage}
                onKeyDown={(e) => e.key === "Enter" && savePage()}
                aria-label="Current page"
              />
              </div>
              <span className="shrink-0 text-fg-3">{b.pages ? `of ${b.pages}` : "pages read"}</span>
              <div className="flex-1">
                <Progress book={b} />
              </div>
            </dd>
            {b.started_at && (
              <>
                <dt className="text-fg-3">Started</dt>
                <dd>{fmtDate(b.started_at, { month: "short", day: "numeric", year: "numeric" })}</dd>
              </>
            )}
            {b.finished_at && (
              <>
                <dt className="text-fg-3">Finished</dt>
                <dd>{fmtDate(b.finished_at, { month: "short", day: "numeric", year: "numeric" })}</dd>
              </>
            )}
          </dl>

          <section>
            <h3 className="mb-2 text-[14px] font-semibold">Notes</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== b.notes && update.mutate({ id: b.id, notes })}
              placeholder="Ideas, quotes, chapters worth rereading"
              className="field-sizing-content min-h-40 leading-relaxed"
            />
          </section>
        </div>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete book?"
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => remove.mutate(b.id, { onSuccess: () => (setConfirm(false), onClose()) })}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">This removes it from Books.{b.item_key && ` Its ticket ${b.item_key} stays on the board.`}</p>
      </Modal>
    </Drawer>
  );
}

/** Learning → Books: books to read, with progress, notes and an optional ticket on the board. */
export default function Books() {
  const { data: books = [], isLoading } = useBooks();
  const [tab, setTab] = useLocalState<Tab>("arc-books-tab", "reading");
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get("book")) || null;
  const setOpen = (id: number | null) =>
    setParams((p) => {
      if (id) p.set("book", String(id));
      else p.delete("book");
      return p;
    });

  const count = (t: Tab) => books.filter((b) => t === "all" || b.status === t).length;
  // Opening a book from elsewhere (its ticket) shows it even if it is not in the current tab.
  const list = books.filter((b) => tab === "all" || b.status === tab);
  const open = books.find((b) => b.id === openId) ?? null;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-10">
      <PageHeader
        icon={<BookOpen size={18} />}
        title="Learning"
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add book
          </Button>
        }
      />
      <LearningNav />
      <div className="space-y-5 px-4 md:px-6 lg:px-8">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "reading", label: `Reading · ${count("reading")}` },
            { value: "want", label: `Want to read · ${count("want")}` },
            { value: "finished", label: `Finished · ${count("finished")}` },
            { value: "all", label: `All · ${count("all")}` },
          ]}
        />
        {list.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(150px,180px))]">
            {list.map((b) => (
              <BookCard key={b.id} book={b} onOpen={() => setOpen(b.id)} />
            ))}
          </div>
        ) : (
          !isLoading && (
            <Card>
              <Empty
                icon={<BookIcon size={28} />}
                title={books.length ? "Nothing here" : "No books yet"}
                hint={books.length ? "Try another tab." : "Search for a book and add it. Put the one you are reading on the board to track time on it."}
              />
              {!books.length && (
                <div className="-mt-6 flex justify-center pb-10">
                  <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
                    Add your first book
                  </Button>
                </div>
              )}
            </Card>
          )
        )}
      </div>
      <AddBookModal open={adding} onClose={() => setAdding(false)} />
      <BookPanel book={open} onClose={() => setOpen(null)} />
    </div>
  );
}
