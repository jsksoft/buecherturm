import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface Context {
  user: { id: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !serviceKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let user: { id: string } | null = null;
  if (token) {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data.user) {
      user = { id: data.user.id };
    }
  }

  return { user, supabaseAdmin };
}
