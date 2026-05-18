-- =============================================================================
-- Bücherturm — Supabase Setup SQL
-- Run order:
--   1. Run STEP 1 (Extensions + Auth Trigger) BEFORE pnpm db:push
--   2. Run `pnpm db:push` to deploy the Drizzle schema
--   3. Run STEP 2 (RLS) AFTER the tables exist
--   4. Run STEP 3 (ivfflat index) only after data is loaded and vector
--      extension is confirmed active.
--
-- This file is idempotent — safe to re-run at any time.
-- =============================================================================


-- =============================================================================
-- STEP 1 — EXTENSIONS & AUTH TRIGGER
-- Run this BEFORE pnpm db:push
-- =============================================================================

-- pgvector: required for vector(1536) columns in books and user_reading_profiles
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid-ossp: gen_random_uuid() is built-in in PG 13+, but this adds uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- Auth trigger: creates a public.users row whenever a new user signs up.
-- The app-layer fills email_encrypted on the first authenticated request.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, created_at, updated_at)
  VALUES (NEW.id, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- STEP 2 — ROW LEVEL SECURITY
-- Run this AFTER pnpm db:push (tables must exist first)
-- =============================================================================

-- ── Helper: admin check ───────────────────────────────────────────────────────
-- SECURITY DEFINER so RLS policies can call it without bypassing RLS themselves.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE id = auth.uid()),
    false
  )
$$;


-- ── Enable RLS on all tables ──────────────────────────────────────────────────
ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reading_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookclubs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookclub_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config         ENABLE ROW LEVEL SECURITY;


-- ── users ─────────────────────────────────────────────────────────────────────
-- Users see and update their own row only.
-- INSERT is handled by the auth trigger (service_role bypasses RLS).
-- DELETE is handled by the GDPR delete flow (service_role).

DROP POLICY IF EXISTS "users_select_own"  ON public.users;
DROP POLICY IF EXISTS "users_update_own"  ON public.users;
DROP POLICY IF EXISTS "users_admin_select" ON public.users;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Admins can see all user rows (needed for admin panel)
CREATE POLICY "users_admin_select" ON public.users
  FOR SELECT USING (public.is_current_user_admin());


-- ── books ─────────────────────────────────────────────────────────────────────
-- Books are a shared public catalog.
-- All authenticated users can read. Writes are done only via service_role
-- (import jobs, admin panel) — no direct-write policy needed.

DROP POLICY IF EXISTS "books_select_authenticated" ON public.books;

CREATE POLICY "books_select_authenticated" ON public.books
  FOR SELECT USING (auth.role() = 'authenticated');


-- ── user_books ────────────────────────────────────────────────────────────────
-- Users can fully manage their own tracking entries.

DROP POLICY IF EXISTS "user_books_select_own" ON public.user_books;
DROP POLICY IF EXISTS "user_books_insert_own" ON public.user_books;
DROP POLICY IF EXISTS "user_books_update_own" ON public.user_books;
DROP POLICY IF EXISTS "user_books_delete_own" ON public.user_books;

CREATE POLICY "user_books_select_own" ON public.user_books
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_books_insert_own" ON public.user_books
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_books_update_own" ON public.user_books
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_books_delete_own" ON public.user_books
  FOR DELETE USING (user_id = auth.uid());


-- ── user_reading_profiles ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_own" ON public.user_reading_profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.user_reading_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.user_reading_profiles;

CREATE POLICY "profiles_select_own" ON public.user_reading_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "profiles_insert_own" ON public.user_reading_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.user_reading_profiles
  FOR UPDATE USING (user_id = auth.uid());


-- ── bookclubs ─────────────────────────────────────────────────────────────────
-- Users can create clubs. Owners and members can read. Only owners can modify.

DROP POLICY IF EXISTS "bookclubs_select_member"     ON public.bookclubs;
DROP POLICY IF EXISTS "bookclubs_insert_authenticated" ON public.bookclubs;
DROP POLICY IF EXISTS "bookclubs_update_owner"      ON public.bookclubs;
DROP POLICY IF EXISTS "bookclubs_delete_owner"      ON public.bookclubs;

CREATE POLICY "bookclubs_select_member" ON public.bookclubs
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookclub_members
      WHERE bookclub_id = public.bookclubs.id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "bookclubs_insert_authenticated" ON public.bookclubs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "bookclubs_update_owner" ON public.bookclubs
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "bookclubs_delete_owner" ON public.bookclubs
  FOR DELETE USING (owner_id = auth.uid());


-- ── bookclub_members ──────────────────────────────────────────────────────────
-- All members of a club can see the member list.
-- Club admins can add/remove members; users can remove themselves (leave).

DROP POLICY IF EXISTS "bookclub_members_select_member"     ON public.bookclub_members;
DROP POLICY IF EXISTS "bookclub_members_insert_admin"      ON public.bookclub_members;
DROP POLICY IF EXISTS "bookclub_members_delete_admin_self" ON public.bookclub_members;

CREATE POLICY "bookclub_members_select_member" ON public.bookclub_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookclub_members AS m2
      WHERE m2.bookclub_id = public.bookclub_members.bookclub_id
        AND m2.user_id = auth.uid()
    )
  );

-- Club admin (role = 'admin') can add members; self-join allowed for invite links
CREATE POLICY "bookclub_members_insert_admin" ON public.bookclub_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()  -- self-join
    OR EXISTS (
      SELECT 1 FROM public.bookclub_members AS m2
      WHERE m2.bookclub_id = public.bookclub_members.bookclub_id
        AND m2.user_id = auth.uid()
        AND m2.role = 'admin'
    )
  );

-- Club admin can remove any member; users can leave (remove own row)
CREATE POLICY "bookclub_members_delete_admin_self" ON public.bookclub_members
  FOR DELETE USING (
    user_id = auth.uid()  -- self-removal (leave club)
    OR EXISTS (
      SELECT 1 FROM public.bookclub_members AS m2
      WHERE m2.bookclub_id = public.bookclub_members.bookclub_id
        AND m2.user_id = auth.uid()
        AND m2.role = 'admin'
    )
  );


-- ── ai_usage_log ──────────────────────────────────────────────────────────────
-- Users can read their own log entries.
-- INSERT is done exclusively via service_role (the API backend).

DROP POLICY IF EXISTS "ai_usage_select_own" ON public.ai_usage_log;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage_log
  FOR SELECT USING (user_id = auth.uid());


-- ── import_jobs ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "import_jobs_select_own" ON public.import_jobs;
DROP POLICY IF EXISTS "import_jobs_insert_own" ON public.import_jobs;
DROP POLICY IF EXISTS "import_jobs_update_own" ON public.import_jobs;

CREATE POLICY "import_jobs_select_own" ON public.import_jobs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "import_jobs_insert_own" ON public.import_jobs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Status updates are done by the backend (service_role), but allow user reads
CREATE POLICY "import_jobs_update_own" ON public.import_jobs
  FOR UPDATE USING (user_id = auth.uid());


-- ── admin_config ──────────────────────────────────────────────────────────────
-- Readable and writable only by admin users.

DROP POLICY IF EXISTS "admin_config_select_admin" ON public.admin_config;
DROP POLICY IF EXISTS "admin_config_all_admin"    ON public.admin_config;

CREATE POLICY "admin_config_select_admin" ON public.admin_config
  FOR SELECT USING (public.is_current_user_admin());

CREATE POLICY "admin_config_all_admin" ON public.admin_config
  FOR ALL USING (public.is_current_user_admin());


-- =============================================================================
-- STEP 3 — IVFFLAT VECTOR INDEX
-- Run ONLY after:
--   a) vector extension is active (confirmed above)
--   b) The books table has a meaningful number of rows (>= 1000)
--      IVFFlat indexes built on empty tables are ineffective.
-- =============================================================================

-- CREATE INDEX CONCURRENTLY idx_books_embedding
--   ON public.books USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- CREATE INDEX CONCURRENTLY idx_profiles_embedding
--   ON public.user_reading_profiles USING ivfflat (profile_embedding vector_cosine_ops)
--   WITH (lists = 100);
