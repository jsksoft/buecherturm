'use client';

import {
  startTransition,
  useOptimistic,
  useActionState,
  useRef,
  useState,
  useEffect,
} from 'react';
import { useParams } from 'next/navigation';
import { trpc } from '../../../../lib/trpc/client';
import { READING_STATUS_LABELS, type ReadingStatus } from '@buecherturm/shared';

const STATUSES: ReadingStatus[] = ['reading', 'want_to_read', 'read', 'abandoned'];

const STATUS_ICONS: Record<ReadingStatus, string> = {
  reading: '📖',
  want_to_read: '🔖',
  read: '✅',
  abandoned: '💨',
};

type NoteState = { savedAt: Date | null; error: string | null };

export default function BookDetailPage() {
  const params = useParams();
  const isbn = params.isbn as string;

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.books.byIsbn.useQuery({ isbn });

  const setStatusMutation = trpc.books.setStatus.useMutation({
    onSuccess: () => utils.books.byIsbn.invalidate({ isbn }),
  });
  const setRatingMutation = trpc.books.setRating.useMutation({
    onSuccess: () => utils.books.byIsbn.invalidate({ isbn }),
  });
  const saveNoteMutation = trpc.books.saveNote.useMutation();

  const serverStatus = (data?.userBook?.status ?? null) as ReadingStatus | null;
  const serverRating = data?.userBook?.rating ?? null;

  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    serverStatus,
    (_: ReadingStatus | null, next: ReadingStatus | null) => next,
  );

  const [optimisticRating, setOptimisticRating] = useOptimistic(
    serverRating,
    (_: number | null, next: number | null) => next,
  );

  // Private note — local state + debounced autosave via useActionState
  const [noteText, setNoteText] = useState('');
  const noteInitialized = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (data?.userBook?.privateNote !== undefined && !noteInitialized.current) {
      setNoteText(data.userBook.privateNote ?? '');
      noteInitialized.current = true;
    }
  }, [data?.userBook?.privateNote]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const [noteState, dispatchSaveNote, isSaving] = useActionState(
    async (_prev: NoteState, note: string): Promise<NoteState> => {
      try {
        await saveNoteMutation.mutateAsync({ isbn, note });
        return { savedAt: new Date(), error: null };
      } catch {
        return { savedAt: _prev.savedAt, error: 'Speichern fehlgeschlagen.' };
      }
    },
    { savedAt: null, error: null },
  );

  const handleNoteChange = (value: string) => {
    setNoteText(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => dispatchSaveNote(value), 1000);
  };

  const handleStatusChange = (newStatus: ReadingStatus) => {
    startTransition(async () => {
      setOptimisticStatus(newStatus);
      await setStatusMutation.mutateAsync({ isbn, status: newStatus });
    });
  };

  const handleRatingChange = (star: number) => {
    const next = star === optimisticRating ? null : star;
    startTransition(async () => {
      setOptimisticRating(next);
      await setRatingMutation.mutateAsync({ isbn, rating: next });
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="card h-72 lg:h-96 bg-surface-100" />
        <div className="card h-40 bg-surface-100" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-error font-medium">Buch nicht gefunden.</p>
        <p className="mt-1 text-sm text-[oklch(50%_0.02_75)]">ISBN: {isbn}</p>
      </div>
    );
  }

  const { book } = data;

  return (
    <div>
      {/* Desktop: 2-col grid (cover left, controls right). Mobile: stacked. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
        {/* ── Left column — Cover + meta ─────────────────────────────────── */}
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {book.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.coverUrl}
                alt={`Cover von „${book.title}"`}
                className="w-full object-cover max-h-105 lg:max-h-135"
              />
            ) : (
              <div className="flex items-center justify-center bg-surface-100 h-64 lg:h-96">
                <span className="text-7xl" aria-hidden="true">📚</span>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-2">
            <h1 className="text-xl font-semibold leading-snug">{book.title}</h1>
            {book.authors.length > 0 && (
              <p className="text-[oklch(50%_0.02_75)]">{book.authors.join(', ')}</p>
            )}
            {book.publishedYear && (
              <p className="text-sm text-[oklch(60%_0.02_75)]">{book.publishedYear}</p>
            )}
            {book.description && (
              <p className="mt-2 text-sm text-[oklch(35%_0.02_75)] leading-relaxed line-clamp-5">
                {book.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Right column — Tracking controls ───────────────────────────── */}
        <div className="mt-6 lg:mt-0 space-y-5">
          {/* Status buttons — huge touch targets, 2×2 grid */}
          <section className="card p-5" aria-label="Lesestatus">
            <h2 className="text-xs font-semibold text-[oklch(50%_0.02_75)] uppercase tracking-widest mb-4">
              Status
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {STATUSES.map((s) => {
                const isActive = optimisticStatus === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    aria-pressed={isActive}
                    className={[
                      'flex flex-col items-center justify-center gap-1.5 rounded-(--radius-button)',
                      'py-5 px-3 text-sm font-semibold transition-all duration-(--duration-normal)',
                      'min-h-18', // 72px — well above 44px minimum, reachable in thumb zone
                      isActive
                        ? 'bg-brand-500 text-surface-0 shadow-md scale-[1.02]'
                        : 'bg-surface-100 text-[oklch(30%_0.02_75)] hover:bg-surface-200',
                    ].join(' ')}
                  >
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {STATUS_ICONS[s]}
                    </span>
                    <span className="text-center leading-tight">{READING_STATUS_LABELS[s]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Star rating */}
          <section className="card p-5" aria-label="Bewertung">
            <h2 className="text-xs font-semibold text-[oklch(50%_0.02_75)] uppercase tracking-widest mb-4">
              Bewertung
            </h2>
            <div
              className="flex gap-1"
              role="group"
              aria-label="Sternebewertung von 1 bis 5"
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = optimisticRating !== null && star <= optimisticRating;
                return (
                  <button
                    key={star}
                    onClick={() => handleRatingChange(star)}
                    aria-label={`${star} Stern${star > 1 ? 'e' : ''}`}
                    aria-pressed={filled}
                    className={[
                      'text-4xl leading-none transition-all duration-(--duration-fast)',
                      'min-h-12 min-w-12 flex items-center justify-center',
                      'hover:scale-110 active:scale-95',
                      filled
                        ? 'text-brand-500'
                        : 'text-[oklch(82%_0.02_75)] hover:text-brand-300',
                    ].join(' ')}
                  >
                    {filled ? '★' : '☆'}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 h-5 text-sm text-[oklch(50%_0.02_75)]">
              {optimisticRating
                ? `${optimisticRating} von 5 Sternen`
                : 'Noch nicht bewertet'}
            </p>
          </section>

          {/* Private note with encrypted autosave */}
          <section className="card p-5" aria-label="Private Notiz">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xs font-semibold text-[oklch(50%_0.02_75)] uppercase tracking-widest">
                Private Notiz
              </h2>
              <span className="text-[10px] text-[oklch(65%_0.02_75)] flex items-center gap-1">
                <span aria-hidden="true">🔒</span> AES-256-GCM
              </span>
            </div>
            <p className="text-xs text-[oklch(60%_0.02_75)] mb-3">
              Wird verschlüsselt gespeichert. Nur du kannst diese Notiz lesen.
            </p>
            <textarea
              value={noteText}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Deine persönlichen Gedanken zu diesem Buch…"
              rows={5}
              className="auth-input resize-none"
              aria-label="Private Notiz"
            />
            <div className="mt-2 h-4 text-xs text-[oklch(60%_0.02_75)]" aria-live="polite">
              {isSaving && 'Speichern…'}
              {!isSaving && noteState.savedAt && (
                <>
                  Gespeichert{' '}
                  {noteState.savedAt.toLocaleTimeString('de-DE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </>
              )}
              {!isSaving && noteState.error && (
                <span className="text-error">{noteState.error}</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
