import { cosineDistance, desc, gt, ilike, or, eq, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getDb, books } from '@buecherturm/database';
import { getEmbeddingProvider } from '@buecherturm/ai';
import { protectedProcedure, router } from '../trpc';
import { semanticRateLimit } from '../ratelimit';

// ─── Shared result shape ───────────────────────────────────────────────────────

export interface BookSearchResult {
  isbn: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  description: string | null;
  language: string | null;
  source: 'local' | 'dnb' | 'openlibrary' | 'google';
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeIsbn(s: string): string {
  return s.replace(/[-\s]/g, '');
}

const LANG_MAP: Record<string, string> = { ger: 'de', eng: 'en', fre: 'fr', spa: 'es' };

// ─── 1. Local DB ───────────────────────────────────────────────────────────────

async function searchLocal(query: string): Promise<BookSearchResult[]> {
  const db = getDb();
  const like = `%${query}%`;
  const cleanedIsbn = normalizeIsbn(query);

  const conditions = [
    ilike(books.title, like),
    sql`array_to_string(${books.authors}, ' ') ilike ${like}`,
  ];
  if (cleanedIsbn.length >= 10) {
    conditions.push(eq(books.isbn, cleanedIsbn));
  }

  const rows = await db
    .select()
    .from(books)
    .where(or(...conditions))
    .limit(10);

  return rows.map((r) => ({
    isbn: r.isbn,
    title: r.title,
    authors: r.authors,
    publisher: r.publisher ?? null,
    publishedYear: r.publishedYear ?? null,
    coverUrl: r.coverUrl ?? null,
    description: r.description ?? null,
    language: r.language ?? null,
    source: 'local' as const,
  }));
}

// ─── 2. DNB SRU (Deutsche Nationalbibliothek) ──────────────────────────────────
// Free SRU endpoint, no API key. oai_dc schema for simple XML parsing.

async function searchDnb(query: string): Promise<BookSearchResult[]> {
  const escaped = query.replace(/"/g, '\\"');
  const cql = `tit="${escaped}" or per="${escaped}"`;
  const url = new URL('https://services.dnb.de/sru/dnb');
  url.searchParams.set('version', '1.1');
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('query', cql);
  url.searchParams.set('recordSchema', 'oai_dc');
  url.searchParams.set('maximumRecords', '8');

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/xml, text/xml' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseDnbXml(xml);
  } catch {
    return [];
  }
}

function dcFields(xml: string, field: string): string[] {
  // Strip CDATA wrappers first, then extract tag content
  const cleaned = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const re = new RegExp(`<dc:${field}[^>]*>([^<]*)<\\/dc:${field}>`, 'g');
  return [...cleaned.matchAll(re)].map((m) => m[1]?.trim() ?? '').filter(Boolean);
}

function extractIsbn(identifiers: string[]): string | null {
  let isbn13: string | null = null;
  let isbn10: string | null = null;
  for (const id of identifiers) {
    const n = normalizeIsbn(id.replace(/^urn:isbn:/i, ''));
    if (/^\d{13}$/.test(n)) isbn13 = n;
    else if (/^\d{9}[\dX]$/.test(n)) isbn10 = n;
  }
  return isbn13 ?? isbn10;
}

function parseDnbXml(xml: string): BookSearchResult[] {
  const results: BookSearchResult[] = [];
  const blocks = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/g)];

  for (const block of blocks) {
    const inner = block[1] ?? '';
    const title = dcFields(inner, 'title')[0];
    if (!title) continue;

    const identifiers = dcFields(inner, 'identifier');
    const dates = dcFields(inner, 'date');
    const langs = dcFields(inner, 'language');
    const isbn = extractIsbn(identifiers);
    const yearMatch = dates[0]?.match(/\d{4}/);
    const publishedYear = yearMatch ? parseInt(yearMatch[0]) : null;

    results.push({
      isbn,
      title: title.replace(/\s+\/\s+.*$/, '').trim(),
      authors: dcFields(inner, 'creator'),
      publisher: dcFields(inner, 'publisher')[0] ?? null,
      publishedYear,
      coverUrl: null, // DNB doesn't expose public cover URLs
      description: null,
      language: LANG_MAP[langs[0]?.toLowerCase() ?? 'ger'] ?? 'de',
      source: 'dnb',
    });
  }

  return results;
}

// ─── 3. OpenLibrary ────────────────────────────────────────────────────────────

async function searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', 'title,author_name,isbn,cover_i,first_publish_year,publisher,language');
  url.searchParams.set('limit', '8');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { docs?: unknown[] };

    return (json.docs ?? [])
      .map((doc) => {
        const d = doc as Record<string, unknown>;
        const isbns = (d.isbn as string[] | undefined) ?? [];
        const isbn13 = isbns.find((i) => normalizeIsbn(i).length === 13);
        const isbn = isbn13
          ? normalizeIsbn(isbn13)
          : isbns[0]
            ? normalizeIsbn(isbns[0])
            : null;
        const coverId = d.cover_i as number | undefined;
        const pubs = (d.publisher as string[] | undefined) ?? [];
        const langs = (d.language as string[] | undefined) ?? [];

        return {
          isbn,
          title: (d.title as string) ?? '',
          authors: (d.author_name as string[]) ?? [],
          publisher: pubs[0] ?? null,
          publishedYear: (d.first_publish_year as number | undefined) ?? null,
          coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
          description: null,
          language: langs[0] ?? null,
          source: 'openlibrary' as const,
        };
      })
      .filter((b) => b.title.length > 0);
  } catch {
    return [];
  }
}

// ─── 4. Google Books ───────────────────────────────────────────────────────────

async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '8');
  url.searchParams.set('langRestrict', 'de');
  url.searchParams.set('printType', 'books');

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: unknown[] };

    return (json.items ?? [])
      .map((item) => {
        const vi = ((item as Record<string, unknown>).volumeInfo ?? {}) as Record<string, unknown>;
        const ids = (vi.industryIdentifiers as Array<{ type: string; identifier: string }>) ?? [];
        const isbn13 = ids.find((x) => x.type === 'ISBN_13')?.identifier ?? null;
        const isbn10 = ids.find((x) => x.type === 'ISBN_10')?.identifier ?? null;
        const isbn = isbn13 ? normalizeIsbn(isbn13) : isbn10 ? normalizeIsbn(isbn10) : null;

        const thumbRaw = (vi.imageLinks as Record<string, string> | undefined)?.thumbnail ?? null;
        const coverUrl = thumbRaw ? thumbRaw.replace('http://', 'https://') : null;
        const dateStr = (vi.publishedDate as string | undefined) ?? '';
        const publishedYear = dateStr ? parseInt(dateStr.slice(0, 4)) || null : null;

        return {
          isbn,
          title: (vi.title as string) ?? '',
          authors: (vi.authors as string[]) ?? [],
          publisher: (vi.publisher as string | undefined) ?? null,
          publishedYear,
          coverUrl,
          description: (vi.description as string | undefined) ?? null,
          language: (vi.language as string | undefined) ?? null,
          source: 'google' as const,
        };
      })
      .filter((b) => b.title.length > 0);
  } catch {
    return [];
  }
}

// ─── Merge & deduplicate ───────────────────────────────────────────────────────

function dedup(all: BookSearchResult[]): BookSearchResult[] {
  const seen = new Map<string, BookSearchResult>();
  for (const r of all) {
    const key = r.isbn ?? r.title.toLowerCase().slice(0, 60);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...r });
    } else {
      if (!existing.coverUrl && r.coverUrl) existing.coverUrl = r.coverUrl;
      if (!existing.description && r.description) existing.description = r.description;
      if (!existing.publisher && r.publisher) existing.publisher = r.publisher;
    }
  }
  return [...seen.values()];
}

// ─── Cache to local DB (fire-and-forget) ──────────────────────────────────────

async function cacheExternalResults(results: BookSearchResult[]): Promise<void> {
  const db = getDb();
  const toCache = results.filter((r) => r.isbn && r.source !== 'local');
  if (toCache.length === 0) return;

  await db
    .insert(books)
    .values(
      toCache.map((r) => ({
        isbn: r.isbn!,
        title: r.title,
        authors: r.authors,
        ...(r.publisher ? { publisher: r.publisher } : {}),
        ...(r.publishedYear ? { publishedYear: r.publishedYear } : {}),
        ...(r.coverUrl ? { coverUrl: r.coverUrl } : {}),
        ...(r.description ? { description: r.description } : {}),
        language: r.language ?? 'de',
      })),
    )
    .onConflictDoNothing();
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const searchRouter = router({
  searchBooks: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(100).trim() }))
    .query(async ({ input }) => {
      // Privacy: query string is NOT stored with any user identifier — CLAUDE.md rule #4, PRD F-03
      const { query } = input;

      // Run local DB + DNB in parallel — DNB is primary external source per PRD F-03
      const [localResults, dnbResults] = await Promise.all([
        searchLocal(query),
        searchDnb(query),
      ]);

      // Only hit fallbacks when local + DNB is thin
      let olResults: BookSearchResult[] = [];
      let gbResults: BookSearchResult[] = [];
      if (localResults.length + dnbResults.length < 5) {
        [olResults, gbResults] = await Promise.all([
          searchOpenLibrary(query),
          searchGoogleBooks(query),
        ]);
      }

      const results = dedup([...localResults, ...dnbResults, ...olResults, ...gbResults]).slice(
        0,
        15,
      );

      // Cache external results without blocking the response
      cacheExternalResults(results).catch(() => {});

      return { results };
    }),

  // Semantic vector search using pgvector cosine similarity.
  // Embeds the query via OpenAI text-embedding-3-small, then finds the nearest book vectors.
  // Rate-limited to 5 req/min per user (embedding API call is expensive).
  semanticSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(500).trim(),
        limit: z.number().int().min(1).max(20).default(10),
        minSimilarity: z.number().min(0).max(1).default(0.3),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { success } = await semanticRateLimit.limit(ctx.user.id);
      if (!success) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many semantic searches. Please wait a moment.',
        });
      }

      const embedder = getEmbeddingProvider();
      const [[queryVector]] = [await embedder.embed([input.query])];

      if (!queryVector || queryVector.length === 0) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Embedding generation failed.' });
      }

      const db = getDb();
      const similarity = sql<number>`1 - (${cosineDistance(books.embedding, queryVector)})`;

      const rows = await db
        .select({
          id: books.id,
          isbn: books.isbn,
          title: books.title,
          authors: books.authors,
          coverUrl: books.coverUrl,
          description: books.description,
          publishedYear: books.publishedYear,
          language: books.language,
          similarity,
        })
        .from(books)
        .where(gt(similarity, input.minSimilarity))
        .orderBy(desc(similarity))
        .limit(input.limit);

      return { results: rows };
    }),
});
