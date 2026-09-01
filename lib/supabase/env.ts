/**
 * Supabase connection settings, read from the environment.
 *
 * Returns null instead of throwing when the vars are missing, so that
 * `npm run build` and CI (which have no secrets) still succeed. Callers decide
 * how to degrade — see app/page.tsx.
 */
export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return { url, anonKey };
}
