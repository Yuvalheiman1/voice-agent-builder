import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client (service key bypasses RLS). Lazy singleton so
// importing this module never throws at build time - only actual use does.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing - set them in .env.local (and Vercel)");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
