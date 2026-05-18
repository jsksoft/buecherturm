import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL']!,
  },
  tablesFilter: [
    'users',
    'books',
    'user_books',
    'user_reading_profiles',
    'bookclubs',
    'bookclub_members',
    'ai_usage_log',
    'import_jobs',
    'admin_config',
  ],
} satisfies Config;
