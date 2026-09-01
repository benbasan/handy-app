import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Client Components.
 *
 * Typed against the schema via `npm run db:types`, which regenerates
 * database.types.ts from the live local database. Re-run it after every
 * migration.
 */
export function createClient() {
  const env = getSupabaseEnv();

  if (!env) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
