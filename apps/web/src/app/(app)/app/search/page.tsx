'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '../../../../lib/trpc/client';

type Source = 'local' | 'dnb' | 'openlibrary' | 'google';

const SOURCE_LABEL: Record<Source, string> = {
  local: 'Katalog',
  dnb: 'DNB',
  openlibrary: 'OpenLibrary',
  google: 'Google Books',
};

const SOURCE_CLASS: Record<Source, string> = {
  local: 'bg-brand-100 text-brand-700',
  dnb: 'bg-[oklch(94%_0.03_240)] text-[oklch(32%_0.1_240)]',
  openlibrary: 'bg-[oklch(94%_0.03_145)] text-[oklch(32%_0.1_145)]',
  google: 'bg-[oklch(94%_0.03_55)] text-[oklch(32%_0.1_55)]',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const { data, isFetching } = trpc.search.searchBooks.useQuery(
    { query: trimmed },
    {
      enabled: trimmed.length >= 2,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  );

  const results = data?.results ?? [];
  const showResults = trimmed.length >= 2;
  const showEmpty = showResults && !isFetching && results.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Search field */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <IconSearch className="h-5 w-5 text-[oklch(55%_0.02_75)]" />
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Titel, Autor oder ISBN…"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="auth-input pl-11 pr-10 text-base"
          aria-label="Bücher suchen"
          aria-controls="search-results"
          aria-busy={isFetching}
        />
        {isFetching && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
            <IconSpinner className="h-4 w-4 animate-spin text-brand-500" />
          </div>
        )}
      </div>

      {/* Nudge at 1 char */}
      {query.length === 1 && (
        <p className="mt-3 text-center text-sm text-[oklch(58%_0.02_75)]">
          Noch ein Zeichen…
        </p>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="mt-10 text-center">
          <p className="text-[oklch(40%_0.02_75)] font-medium">
            Keine Ergebnisse für „{trimmed}"
          </p>
          <p className="mt-1 text-sm text-[oklch(58%_0.02_75)]">
            Versuche einen anderen Suchbegriff oder die ISBN.
          </p>
        </div>
      )}

      {/* Result list */}
      <ul id="search-results" className="mt-4 space-y-2" role="list" aria-live="polite">
        {results.map((book, i) => (
          <li key={book.isbn ?? `${book.title}-${i}`}>
            <Link
              href={book.isbn ? `/book/${book.isbn}` : '#'}
              className="card flex gap-4 p-4 transition-all hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99]"
            >
              {/* Thumbnail */}
              <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-surface-100">
                {book.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg" aria-hidden="true">
                    📚
                  </div>
                )}
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold leading-snug text-[oklch(15%_0.02_75)]">
                  {book.title}
                </p>
                {book.authors.length > 0 && (
                  <p className="mt-0.5 truncate text-sm text-[oklch(50%_0.02_75)]">
                    {book.authors.join(', ')}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  {book.publishedYear && (
                    <span className="text-xs text-[oklch(60%_0.02_75)]">
                      {book.publishedYear}
                    </span>
                  )}
                  <span
                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_CLASS[book.source as Source] ?? ''}`}
                  >
                    {SOURCE_LABEL[book.source as Source] ?? book.source}
                  </span>
                </div>
              </div>

              {/* Chevron */}
              <div className="flex shrink-0 items-center text-[oklch(70%_0.02_75)]">
                <IconChevron className="h-4 w-4" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconSearch({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconSpinner({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
