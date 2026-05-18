CREATE TABLE "admin_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"feature" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookclub_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bookclub_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookclub_members_unique" UNIQUE("bookclub_id","user_id"),
	CONSTRAINT "bookclub_members_role_check" CHECK ("bookclub_members"."role" IN ('admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "bookclubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_id" uuid NOT NULL,
	"is_private" boolean DEFAULT true NOT NULL,
	"invite_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookclubs_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"authors" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"publisher" text,
	"published_year" integer,
	"cover_url" text,
	"description" text,
	"page_count" integer,
	"language" text DEFAULT 'de',
	"genres" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"ai_tags" jsonb DEFAULT '[]'::jsonb,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_isbn_unique" UNIQUE("isbn")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_books" integer DEFAULT 0,
	"processed_books" integer DEFAULT 0,
	"error_log" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "user_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"status" text NOT NULL,
	"rating" integer,
	"private_note_encrypted" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_books_user_book_unique" UNIQUE("user_id","book_id"),
	CONSTRAINT "user_books_status_check" CHECK ("user_books"."status" IN ('reading', 'read', 'want_to_read', 'abandoned')),
	CONSTRAINT "user_books_rating_check" CHECK ("user_books"."rating" IS NULL OR "user_books"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "user_reading_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"preferred_genres" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"preferred_languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"reading_goal_per_year" integer,
	"profile_embedding" vector(1536),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_reading_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_encrypted" text,
	"display_name" text,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookclub_members" ADD CONSTRAINT "bookclub_members_bookclub_id_bookclubs_id_fk" FOREIGN KEY ("bookclub_id") REFERENCES "public"."bookclubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookclub_members" ADD CONSTRAINT "bookclub_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookclubs" ADD CONSTRAINT "bookclubs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reading_profiles" ADD CONSTRAINT "user_reading_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_user_id" ON "ai_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created_at" ON "ai_usage_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_bookclub_members_user_id" ON "bookclub_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_books_isbn" ON "books" USING btree ("isbn");--> statement-breakpoint
CREATE INDEX "idx_books_ai_tags" ON "books" USING gin ("ai_tags");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_user_id" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_books_user_id" ON "user_books" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_books_status" ON "user_books" USING btree ("user_id","status");