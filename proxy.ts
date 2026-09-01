import { NextResponse, type NextRequest } from "next/server";
import { loginPathFor } from "@/lib/routes";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` (same functionality, and it
 * now defaults to the Node.js runtime). See
 * node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
 *
 * Two jobs, and deliberately no more:
 *
 *  1. Keep the Supabase session cookies fresh on every request.
 *  2. Bounce anonymous visitors off the signed-in areas before a page renders.
 *
 * It does NOT check roles. Roles live in `profiles`, and Next's guidance is
 * explicit that proxy runs on prefetched routes too and must stay off the
 * database. Role enforcement is `requireRole()` in each area's layout, with
 * RLS underneath as the thing that actually protects the data — a redirect is
 * a courtesy, not a security boundary.
 */
export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);

  if (!isSignedIn) {
    const loginPath = loginPathFor(request.nextUrl.pathname);

    if (loginPath) {
      const url = request.nextUrl.clone();
      url.pathname = loginPath;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Everything except static assets. Running the session refresh on image and
  // font requests would triple the auth traffic for no benefit.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
