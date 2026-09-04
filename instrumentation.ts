import type { Instrumentation } from "next";
import { logServerError } from "@/lib/observability";

/**
 * Every uncaught server-side error, in one place.
 *
 * `lib/observability.ts` covers the failures a server action *expects* and
 * turns into Hebrew. This covers the ones nobody expected: a Server Component
 * that threw while rendering, an RPC that raised where the code assumed it
 * could not, a route handler that fell over. Next surfaces those to the
 * browser as a generic message plus a `digest` and, without this hook, to
 * nobody at all.
 *
 * `digest` is the whole point of the line. It is the hash Next shows the
 * person on `app/error.tsx`, so the string a user reads off their screen is
 * the string that finds this record. Nothing else in the pair is legible to
 * both sides.
 *
 * `request.path` is logged; `request.headers` deliberately is not — it carries
 * the Supabase session cookie, and a log is outside every policy that protects
 * it (see the note in lib/observability.ts).
 *
 * This is also the seam a monitoring vendor plugs into. Next calls it for
 * `render`, `route`, `action` and `proxy` errors alike, which is why picking a
 * vendor later (TECHNICAL_DEBT #41) is an edit to two files rather than a
 * sweep.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  logServerError("next.onRequestError", error, {
    digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
