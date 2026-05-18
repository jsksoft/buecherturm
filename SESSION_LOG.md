# SESSION_LOG.md
## Status
- [x] Phase 1: Infrastructure & Scaffolding
- [x] Phase 2: Database Schema & Security (RLS)
- [x] Phase 3: Auth & Responsive Shell
- [x] Phase 4: Core Tracking & Search
- [x] Phase 5: AI Features & Admin
- [x] Phase 6: GDPR & Final Audit

---

## Phase 1 Log

### Step 1: Monorepo Scaffolding (2026-05-18)
**Status:** Completed ✓

**What was built:**
- pnpm workspace + Turborepo 2.9.14 (`turbo.json` tasks: build, dev, lint, db:generate, db:push)
- `apps/web`: Next.js 16.2.6, React 19, Tailwind v4 CSS-first config, tRPC v11 route handler, `proxy.ts`
- `packages/database`: Drizzle ORM 0.45.2, postgres.js, PgBouncer-safe client singleton
- `packages/api`: tRPC v11 root router with `/health` procedure
- `packages/shared`: Branded types (UserId, BookId), AES-256-GCM crypto utils, `sanitizeForLLM()`
- `packages/ai`: `LLMProvider` interface + `AnthropicProvider` (claude-sonnet-4-6)
- Design system in `globals.css`: OKLCH color palette, thumb-zone tokens (44px min), desktop layout vars (max-w-5xl, 256px sidebar)

**Build result:** `next build` — ✓ Compiled, ✓ TypeScript, 3 routes (/, /_not-found, /api/trpc/[trpc]), Proxy (Middleware) registered

---

## Phase 2 Log

### Step 2: Database Schema & RLS (2026-05-18)
**Status:** Completed ✓

**Schema — 9 Tables (`packages/database/src/schema.ts`):**
| Table | Purpose | Key Constraints |
|---|---|---|
| `users` | Supabase Auth mirror | email_encrypted (AES-256-GCM) |
| `books` | Shared catalog | isbn UNIQUE, GIN(ai_tags), vector(1536) |
| `user_books` | Core tracking | UNIQUE(user_id, book_id), CHECK status IN (...), CHECK rating IS NULL OR 1–5 |
| `user_reading_profiles` | AI taste profile | UNIQUE(user_id), vector(1536) profile_embedding |
| `bookclubs` | Reading clubs | invite_code UNIQUE |
| `bookclub_members` | Club membership | UNIQUE(bookclub_id, user_id), CHECK role IN ('admin','member') |
| `ai_usage_log` | Token audit trail | Append-only, service_role writes |
| `import_jobs` | CSV/ISBN ingestion | CHECK status IN ('pending','processing','completed','failed') |
| `admin_config` | LLM runtime config | key UNIQUE, admin-only access |

**Migration:** `packages/database/migrations/0000_opposite_blink.sql` — generated via `pnpm db:generate` ✓

**Security (`supabase_setup.sql`):**
- `handle_new_user()` trigger: creates `public.users` row on Supabase Auth signup
- `is_current_user_admin()`: SECURITY DEFINER helper for admin policies
- RLS enabled on all 9 tables
- 21 RLS policies covering: own-row access, club membership, admin-only config, service_role-only inserts for ai_usage_log

**Deployment checklist:**
- [ ] Run STEP 1 of `supabase_setup.sql` in Supabase SQL Editor (extensions + trigger)
- [ ] Run `pnpm db:push` to apply Drizzle schema to Supabase
- [ ] Run STEP 2 of `supabase_setup.sql` (RLS policies)
- [ ] Run seed: `cd packages/database && node_modules/.bin/dotenv -e ../../apps/web/.env.local -- npx tsx src/seed.ts`
- [ ] STEP 3 (ivfflat index) — deferred until books table has >1000 rows

---

---

## Phase 3 Log

### Step 4: Auth & Responsive Shell (2026-05-18)
**Status:** Completed ✓

**tRPC 11 Layer (`packages/api`):**
| File | Purpose |
|---|---|
| `src/context.ts` | `createContext({ req })` — validates `Authorization: Bearer` JWT via Supabase admin; exposes `{ user, supabaseAdmin }` |
| `src/trpc.ts` | `publicProcedure`, `protectedProcedure` (UNAUTHORIZED guard) |
| `src/routers/auth.ts` | `auth.register`, `auth.login`, `auth.me` |
| `src/_app.ts` | Root router — `health` + `auth` namespace |

**Auth flow (register):**
1. `auth.register` mutation receives `{ email, password, displayName? }`
2. `supabaseAdmin.auth.admin.createUser()` creates the Supabase Auth user with `email_confirm: true`
3. `encrypt(email, ENCRYPTION_SECRET)` wraps email with AES-256-GCM (GDPR rule #1)
4. Drizzle `UPDATE users SET email_encrypted = ...` stores ciphertext
5. `supabaseAdmin.auth.signInWithPassword()` returns a session — client stores `{ accessToken, refreshToken, expiresAt }` in localStorage

**Client-side session (`apps/web`):**
| File | Purpose |
|---|---|
| `src/lib/session.ts` | Module-level localStorage cache (`getSession`, `setSession`, `clearSession`) |
| `src/providers/session-provider.tsx` | React context — hydrates from localStorage post-mount (no SSR mismatch) |
| `src/providers/trpc-provider.tsx` | `TRPCProvider` — `httpBatchLink` with dynamic `Authorization` header |

**Responsive shell:**
| File | Purpose |
|---|---|
| `src/components/shell/sidebar.tsx` | Desktop: fixed left, 256px, hidden on mobile (`hidden lg:flex`) |
| `src/components/shell/bottom-nav.tsx` | Mobile: fixed bottom, 64px, hidden on desktop (`lg:hidden`) |
| `src/components/auth/auth-guard.tsx` | Redirects unauthenticated users to `/login`; shows spinner during hydration |
| `src/app/(app)/layout.tsx` | App shell — `AuthGuard` + Sidebar + BottomNav + content area |
| `src/app/(auth)/layout.tsx` | Auth layout — centered card, `max-w-md` |
| `src/app/(auth)/login/page.tsx` | Login form — tRPC mutation, field validation, error display |
| `src/app/(auth)/register/page.tsx` | Register form — display name optional, encrypted email on submit |

**Build result:** `next build` ✓ — 6 routes (`/`, `/login`, `/register`, `/app`, `/_not-found`, `/api/trpc/[trpc]`), TypeScript clean

**Design tokens used:**
- Auth card: `card` utility (white, `shadow-card`, `radius-card`)
- Auth inputs: `.auth-input` component (`border`, focus `ring-brand-500`)
- Auth button: `.auth-btn-primary` (`bg-brand-500`, `hover:bg-brand-600`)
- Colors: OKLCH palette — brand amber for active nav, surface-50 background

---

## Phase 2 — Step 3: AES-256-GCM Crypto Module (2026-05-18)
**Status:** Completed ✓

**Implementation (`packages/shared/src/crypto.ts`):**

Wire format: `[version: 1 byte][IV: 12 bytes][ciphertext + auth-tag: N + 16 bytes]` — base64 encoded.

| Property | Value | Rationale |
|---|---|---|
| Cipher | AES-256-GCM | NIST-approved AEAD — provides confidentiality + integrity in one pass |
| IV | 12 bytes, `getRandomValues` | 96-bit IV is NIST recommended for GCM; fresh per call |
| Auth tag | 128 bits (16 bytes) | Maximum GCM tag length; appended to ciphertext by Web Crypto automatically |
| KDF | PBKDF2-SHA256 | OWASP 2023 recommendation |
| KDF iterations | 210,000 | OWASP 2023 recommendation (was 100k) |
| Key caching | Module-level `Map<secret, CryptoKey>` | Amortises 210k PBKDF2 iterations across requests |
| Version byte | `0x01` | Forward compat — allows KDF/cipher migration without silent breakage |
| Base64 helpers | Loop-based (not spread) | `String.fromCharCode(...array)` overflows call stack > ~65K bytes |

**Verification (`packages/shared/verify-crypto.ts`) — all 7 tests passed:**
```
✓  Email: encrypt/decrypt roundtrip
✓  Private note: unicode & special characters roundtrip
✓  Empty string: valid encryption target
✓  IV randomness: same plaintext → different ciphertext each time
✓  Auth tag: single-bit tamper in ciphertext throws CryptoError
✓  Wrong key: decrypt with wrong secret throws CryptoError
✓  sanitizeForLLM: redacts email, IPv4, and phone patterns
─────────────────────────────────────────
7 tests — 7 passed, 0 failed
```

Run again: `pnpm --filter @buecherturm/shared verify:crypto`

---

---

## Phase 4 Log

### Step 6: Multi-Source Search with Auto-Caching (2026-05-18)
**Status:** Completed ✓

**tRPC `searchRouter` (`packages/api/src/routers/search.ts`):**
| Source | Protocol | Notes |
|---|---|---|
| **Local DB** | Drizzle `ilike` on title + `array_to_string(authors)` | Instant; ISBN-exact match if input ≥ 10 chars |
| **DNB** (Deutsche Nationalbibliothek) | SRU / `oai_dc` XML | Primary external source per PRD F-03; 5s timeout |
| **OpenLibrary** | JSON REST | Fallback; provides cover URLs |
| **Google Books** | JSON REST, `langRestrict=de` | Final fallback; provides descriptions |

**Fetch strategy:**
- Local DB + DNB run in **parallel** for minimum latency
- OpenLibrary + Google Books only triggered if combined local + DNB < 5 results
- Results deduplicated by ISBN (or title prefix) — later sources fill in missing `coverUrl`/`description`
- Cache: `onConflictDoNothing()` insert into `books` table, fire-and-forget

**Privacy:** Search query is NOT written to any table linked to a user ID (CLAUDE.md rule #4, PRD F-03). `protectedProcedure` enforces auth without logging the query term.

**Search UI (`apps/web/src/app/(app)/app/search/page.tsx`):**
- Results appear after **2 characters** (`enabled: trimmed.length >= 2`)
- `keepPreviousData` from TanStack Query v5 — previous results stay visible while refetching (no flicker)
- Spinner in input right-side during `isFetching`
- Color-coded source badge per result (Katalog / DNB / OpenLibrary / Google Books)
- `aria-live="polite"` on result list for screen-reader announcements
- Cover thumbnail (44×64px) with 📚 fallback
- Chevron affordance — taps through to `/book/[isbn]`

**Build result:** `next build` ✓ — 8 routes, TypeScript clean

---

### Step 5: Optimistic Tracking UI & Encrypted Notes (2026-05-18)
**Status:** Completed ✓

**What was built:**

**tRPC `booksRouter` (`packages/api/src/routers/books.ts`):**
| Procedure | Type | Description |
|---|---|---|
| `books.byIsbn` | `query` (protected) | Fetch book + user tracking entry by ISBN; decrypt `privateNoteEncrypted` server-side |
| `books.setStatus` | `mutation` (protected) | Upsert `user_books.status`; auto-sets `startedAt`/`finishedAt` timestamps |
| `books.setRating` | `mutation` (protected) | Upsert `user_books.rating` (1–5, nullable); clicking active star clears it |
| `books.saveNote` | `mutation` (protected) | AES-256-GCM encrypt note server-side → upsert `private_note_encrypted` |

**Book Detail Page (`apps/web/src/app/(app)/book/[isbn]/page.tsx`):**
- Client component with React 19 `useOptimistic` for status and rating (< 100ms feedback via `startTransition`)
- `useActionState` for private note autosave with 1s debounce (`dispatchSaveNote` called from `setTimeout`)
- **Mobile layout:** stacked — cover card + meta, then status grid, stars, notes
- **Desktop layout:** `lg:grid lg:grid-cols-2` — cover/meta left, controls right
- Status buttons: `min-h-[4.5rem]` (72px) 2×2 grid, thumb-zone safe, `aria-pressed`
- Star buttons: `min-h-[3rem] min-w-[3rem]` (48px), click-to-toggle-off pattern
- Note save indicator: `aria-live="polite"` region showing "Speichern…" / timestamp / error
- Cover fallback: 📚 placeholder when `coverUrl` is null

**React 19 patterns used:**
- `useOptimistic(serverValue, reducer)` — instant optimistic update, auto-reverts on error
- `useActionState(async fn, initialState)` — pending/state tracking for note autosave
- `startTransition(async () => { setOptimistic(...); await mutation... })` — wraps all optimistic ops

**Build result:** `next build` ✓ — 7 routes, TypeScript clean

---

---

## Phase 5 Log

### Step 7: AI Provider Abstraction, Vector Search, Rate-Limiting & Admin Dashboard (2026-05-18)
**Status:** Completed ✓

#### packages/ai — Multi-provider abstraction

| File | Purpose |
|---|---|
| `src/openai.ts` | `OpenAIProvider` — GPT-4o mini completions + `text-embedding-3-small` embeddings |
| `src/gemini.ts` | `GeminiProvider` — Gemini 2.0 Flash Lite via `@google/genai` SDK |
| `src/registry.ts` | `buildProvider()`, `getProvider()`, `getEmbeddingProvider()`, `invalidateProviderCache()` — factory + module-level instance cache |

**Design decisions:**
- Embeddings always use OpenAI `text-embedding-3-small` (1536 dims) regardless of active completion provider — ensures pgvector cosine distances remain comparable across provider switches.
- Provider cache is invalidated by `admin.setActiveProvider` so the next completion request immediately picks up the new provider without a server restart.
- All content passes through `sanitizeForLLM()` before leaving the app boundary (CLAUDE.md rule #4).

#### packages/api — Rate-Limiting, adminProcedure, new routers

**Rate-Limiting (`src/ratelimit.ts`):**
- `searchRateLimit`: 20 req/min per user ID (text search — cheap)
- `semanticRateLimit`: 5 req/min per user ID (vector search — expensive, hits OpenAI embeddings API)
- Both use `@upstash/ratelimit` sliding-window algorithm over Upstash Redis (env already configured)

**`src/trpc.ts` — `adminProcedure`:**
- Extends standard procedure with a DB lookup on `users.is_admin`
- Returns `FORBIDDEN` for non-admin users, `UNAUTHORIZED` for unauthenticated

**`src/routers/admin.ts`:**
| Procedure | Description |
|---|---|
| `admin.getActiveProvider` | Reads `active_llm_provider` from `admin_config` (defaults to `anthropic`) |
| `admin.setActiveProvider` | Upserts `admin_config`, then calls `invalidateProviderCache()` |
| `admin.getConfig` | Returns all `admin_config` rows |
| `admin.setConfig` | Generic key-value upsert |
| `admin.deleteConfig` | Deletes a config key |
| `admin.getUsageStats` | Aggregated token usage per provider/model/feature, last 30 days |
| `admin.getUsageLog` | Raw `ai_usage_log` entries (last N) |

**`src/routers/books.ts` — `books.moodMatch` (F-10):**
- Input: `moods: string[]` (1–8 tags), `limit: number`
- Uses `EXISTS (SELECT 1 FROM jsonb_array_elements_text(ai_tags) AS t WHERE t = ANY(ARRAY[...]))` — pure DB, no external AI call
- Each mood value is a parameterized SQL argument (injection-safe)

**`src/routers/search.ts` — `search.semanticSearch`:**
- Calls `getEmbeddingProvider().embed([query])` to produce a 1536-dim vector
- Uses Drizzle `cosineDistance(books.embedding, queryVector)` + `gt(similarity, minSimilarity)` with `orderBy(desc(similarity))`
- Rate-limited at the procedure level via `semanticRateLimit`
- Returns ranked results with similarity score

#### apps/web — /admin Dashboard (`src/app/(app)/admin/page.tsx`)

**Design:**
- Gradient header: violet → indigo → sky with a subtle radial dot mesh overlay
- Provider selector: 3 cards in a CSS grid, AI-themed icons (inline SVG), animated active indicator (pinging dot)
- Usage table: tabular-nums, 30-day aggregated stats
- Desktop-only: mobile breakpoint renders a centered empty-state message
- Admin link added to Sidebar (`IconAdmin` = shield icon)

**Build result:** `next build` ✓ — 9 routes, TypeScript clean

---

---

## Phase 6 Log

### Step 8: GDPR Self-Service & Final Security Audit (2026-05-18)
**Status:** Completed ✓

#### Schema change (`packages/database/src/schema.ts`)
| Field | Type | Purpose |
|---|---|---|
| `users.deletion_scheduled_at` | `timestamp(tz)` nullable | Set to now()+30d on deletion request; cleared on cancel; read by hard-delete cron |

**Migration:** Add `deletion_scheduled_at TIMESTAMPTZ` column via `pnpm db:push` or `ALTER TABLE public.users ADD COLUMN deletion_scheduled_at TIMESTAMPTZ`.

#### tRPC `gdprRouter` (`packages/api/src/routers/gdpr.ts`)
| Procedure | Type | GDPR Article | Description |
|---|---|---|---|
| `gdpr.exportData` | `mutation` (protected) | Art. 20 — Portability | Queries all 5 user-linked tables, decrypts `email_encrypted` + all `private_note_encrypted`, returns structured JSON. Client triggers file download. |
| `gdpr.requestDeletion` | `mutation` (protected) | Art. 17 — Erasure | Anonymises PII immediately (`email_encrypted`, `display_name`, `avatar_url` → null); sets `deletion_scheduled_at = now()+30d`. |
| `gdpr.cancelDeletion` | `mutation` (protected) | Art. 17 — Grace period | Clears `deletion_scheduled_at` if still in future; returns `{ cancelled: true }`. |
| `gdpr.getDeletionStatus` | `query` (protected) | — | Returns `{ isPending, scheduledFor }` for the settings UI countdown. |

**IDOR security note:** All four procedures use only `ctx.user.id` — no user ID is accepted as input, making spoofing impossible.

#### Frontend (`apps/web/src/app/(app)/settings/privacy/page.tsx`)
- **Export section:** "Daten herunterladen" button → tRPC `gdpr.exportData` mutation → `Blob` + `URL.createObjectURL()` → auto-download `buecherturm-export-YYYY-MM-DD.json`.
- **Deletion section — normal state:** Warning list + "Konto löschen" button → confirmation modal requiring user to type `LÖSCHEN` → `gdpr.requestDeletion`.
- **Deletion section — pending state:** Amber card with `scheduledFor` date, day countdown, "Löschung widerrufen" button → `gdpr.cancelDeletion`.
- Both sections use React 19 `useTransition` for non-blocking UI updates.

#### Navigation
- Settings (⚙ gear icon) added to both `Sidebar` (desktop) and `BottomNav` (mobile) pointing to `/settings/privacy`.

#### Supabase hard-delete (`supabase_setup.sql` — STEP 4)
- `public.gdpr_hard_delete_expired_accounts()`: SECURITY DEFINER function, loops over `users WHERE deletion_scheduled_at <= NOW()`, calls `DELETE FROM auth.users` (cascade to all FK children). Returns deleted count.
- GRANT EXECUTE to `service_role` only.
- Optional pg_cron schedule commented in — run daily at 03:00 UTC.

#### Security Audit — IDOR & RLS Review (all tRPC procedures)
| Router | Procedure | User-scoped? | Verdict |
|---|---|---|---|
| `auth` | `register`, `login` | n/a (no user data read) | ✓ No IDOR risk |
| `auth` | `me` | Returns only `ctx.user.id` | ✓ No IDOR risk |
| `books` | `byIsbn` | `WHERE user_id = ctx.user.id` | ✓ No IDOR risk |
| `books` | `setStatus`, `setRating`, `saveNote` | `userId: ctx.user.id` in insert/upsert | ✓ No IDOR risk |
| `books` | `moodMatch` | Reads shared catalog only | ✓ No user data |
| `search` | `searchBooks`, `semanticSearch` | Reads shared catalog; rate-limit uses `ctx.user.id` | ✓ No IDOR risk |
| `admin` | all procedures | `adminProcedure` checks DB `is_admin` — no raw userId param | ✓ No IDOR risk |
| `gdpr` | all procedures | All use `ctx.user.id` — no userId input param | ✓ No IDOR risk |

**RLS coverage:** All 9 tables have RLS enabled with own-row or admin-only policies. The `gdprRouter` runs via `service_role`-backed Supabase admin client (context.ts), which bypasses RLS intentionally — correct for server-side mutations that must act on behalf of the authenticated user.

**Build result:** `next build` ✓ — 10 routes, TypeScript clean, 5.73s.
```
/ /admin /api/trpc/[trpc] /app /app/search /book/[isbn] /login /register /settings/privacy /_not-found
```

---

## Error Log & Lessons Learned
| ID | Error Description | Resolution | Lesson Learned |
|---|---|---|---|
| E-001 | Turborepo 2.x: `Could not resolve workspaces. Missing packageManager field` | Added `"packageManager": "pnpm@10.9.0"` to root `package.json` | Turborepo 2.x requires `packageManager` in root `package.json`; Turborepo 1.x did not |
| E-002 | pnpm v10: esbuild/sharp build scripts blocked by default | Run `pnpm rebuild esbuild` to activate binary; or use `node_modules/.bin/drizzle-kit` directly from package dir | pnpm v10 blocks all build scripts by default; drizzle-kit still resolves from local `.bin/` |
| E-003 | tsx top-level await fails under CJS (no `"type":"module"` in package.json) | Wrap all top-level awaits in an async IIFE `(async () => { ... })()` | tsx defaults to CJS without `"type":"module"` — top-level await requires ESM mode |
| E-004 | GDPR hard-delete requires `auth.users` deletion, not just `public.users` | `public.gdpr_hard_delete_expired_accounts()` deletes from `auth.users` — cascade propagates to `public.users` and all FK children | Supabase cascade deletes flow FROM `auth.users` downward; deleting only from `public.users` leaves a dangling auth account that can still log in |
| E-005 | ZIP export not feasible without adding a new dependency | Implemented JSON export using `Blob` + `URL.createObjectURL()` — fully GDPR-compliant (Art. 20 requires machine-readable format, not ZIP) | A structured JSON file satisfies GDPR Art. 20 portability; ZIP is a UX nicety, not a legal requirement — defer to a future enhancement |
