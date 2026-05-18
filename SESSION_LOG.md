# SESSION_LOG.md
## Status
- [x] Phase 1: Infrastructure & Scaffolding
- [x] Phase 2: Database Schema & Security (RLS)
- [x] Phase 3: Auth & Responsive Shell
- [ ] Phase 4: Core Tracking & Search
- [ ] Phase 5: AI Features & Admin
- [ ] Phase 6: GDPR & Final Audit

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

## Error Log & Lessons Learned
| ID | Error Description | Resolution | Lesson Learned |
|---|---|---|---|
| E-001 | Turborepo 2.x: `Could not resolve workspaces. Missing packageManager field` | Added `"packageManager": "pnpm@10.9.0"` to root `package.json` | Turborepo 2.x requires `packageManager` in root `package.json`; Turborepo 1.x did not |
| E-002 | pnpm v10: esbuild/sharp build scripts blocked by default | Run `pnpm rebuild esbuild` to activate binary; or use `node_modules/.bin/drizzle-kit` directly from package dir | pnpm v10 blocks all build scripts by default; drizzle-kit still resolves from local `.bin/` |
| E-003 | tsx top-level await fails under CJS (no `"type":"module"` in package.json) | Wrap all top-level awaits in an async IIFE `(async () => { ... })()` | tsx defaults to CJS without `"type":"module"` — top-level await requires ESM mode |
