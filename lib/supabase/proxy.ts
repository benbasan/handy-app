import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session on the way through, and reports whether the
 * request carries one.
 *
 * The cookie dance is unavoidable: an expired access token is renewed during
 * `getUser()`, and the new cookies have to be written onto both the forwarded
 * request (so the page that renders next sees them) and the outgoing response
 * (so the browser keeps them). Miss either half and the user is silently
 * signed out the moment their hour-long token lapses.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  isSignedIn: boolean;
}> {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();

  // No Supabase configured — a fresh clone, or a build with no secrets. Let
  // the request through; the pages themselves explain what is missing.
  if (!env) return { response, isSignedIn: false };

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, isSignedIn: user !== null };
}
