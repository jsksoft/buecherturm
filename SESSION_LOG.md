# SESSION_LOG.md
## Status
- [x] Phase 1: Infrastructure & Scaffolding
- [x] Phase 2: Database Schema & Security (RLS)
- [ ] Phase 3: Auth & Responsive Shell
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

## Error Log & Lessons Learned
| ID | Error Description | Resolution | Lesson Learned |
|---|---|---|---|
| E-001 | Turborepo 2.x: `Could not resolve workspaces. Missing packageManager field` | Added `"packageManager": "pnpm@10.9.0"` to root `package.json` | Turborepo 2.x requires `packageManager` in root `package.json`; Turborepo 1.x did not |
| E-002 | pnpm v10: esbuild/sharp build scripts blocked by default | Run `pnpm rebuild esbuild` to activate binary; or use `node_modules/.bin/drizzle-kit` directly from package dir | pnpm v10 blocks all build scripts by default; drizzle-kit still resolves from local `.bin/` |
| E-003 | tsx top-level await fails under CJS (no `"type":"module"` in package.json) | Wrap all top-level awaits in an async IIFE `(async () => { ... })()` | tsx defaults to CJS without `"type":"module"` — top-level await requires ESM mode |
