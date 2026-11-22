// Who is this player? The browser sends its Supabase access token in the first message; supabase-js asks Supabase
// Auth whether it is valid. SUPABASE_URL and SUPABASE_ANON_KEY come only from the environment.
import { createClient } from '@supabase/supabase-js';

export type TokenVerifier = (token: string) => Promise<{ userId: string } | null>;
// The one supabase-js call we need, so tests can pass a fake.
export interface AuthClient { auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> } }

export function makeVerifier(client: AuthClient | null): TokenVerifier {
  return async (token) => {
    if (!client || !token) return null;
    try {
      const { data, error } = await client.auth.getUser(token);
      return error || !data?.user?.id ? null : { userId: data.user.id };
    } catch {
      return null; // network or Supabase trouble: treat as not signed in rather than crash the connection
    }
  };
}

let shared: TokenVerifier | null = null;
export function verifyToken(token: string, env: NodeJS.ProcessEnv = process.env): Promise<{ userId: string } | null> {
  if (!shared) {
    const url = env.SUPABASE_URL, key = env.SUPABASE_ANON_KEY;
    if (!url || !key) console.error('SUPABASE_URL or SUPABASE_ANON_KEY is not set: every sign-in will be refused');
    shared = makeVerifier(url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null);
  }
  return shared(token);
}
