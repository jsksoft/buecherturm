import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL is not set');
    // prepare: false required for Supabase PgBouncer (transaction pooler)
    const client = postgres(url, { prepare: false });
    db = drizzle(client, { schema });
  }
  return db;
}
