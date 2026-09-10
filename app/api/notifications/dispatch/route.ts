import { timingSafeEqual } from "node:crypto";
import { dispatch, type DispatchRow } from "@/lib/notifications/dispatch";
import { logExpectedRefusal, logServerError } from "@/lib/observability";

/**
 * Where `dispatch_pending_pushes()` sends a batch.
 *
 * **This route holds no database credential, and that is its whole design.**
 * The body carries everything a channel needs — the kind, the payload, the
 * recipient's role, and their devices' endpoints and keys — so nothing here
 * reads a table. It is what keeps `SUPABASE_SERVICE_ROLE_KEY` unread anywhere
 * in this repo, which `lib/actions/demo.ts` argued for in Phase 8 on the
 * grounds that a forging primitive works for every user id there will ever be.
 *
 * A route handler sits **outside** the `(authed)` layout (docs/architecture.md
 * section 2), so it does its own check — and the caller is a database, not a
 * person, so the check is a shared secret rather than a session.
 */

export const dynamic = "force-dynamic";

function authorised(header: string | null): boolean {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;
  if (!secret || !header) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(secret);

  // Lengths have to match before timingSafeEqual will look at the bytes, and
  // comparing them first leaks only the length — which is not the secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorised(request.headers.get("x-handy-dispatch"))) {
    // A refusal rather than an error: an unauthenticated POST to a public URL
    // is the internet, not a fault. Still recorded, because a stream of them
    // is worth seeing.
    logExpectedRefusal(
      "notifications.dispatch.route",
      new Error("bad or missing dispatch secret"),
      {},
    );
    return new Response("forbidden", { status: 403 });
  }

  let rows: DispatchRow[];

  try {
    const body = (await request.json()) as { notifications?: DispatchRow[] };
    rows = body.notifications ?? [];
  } catch (error) {
    logServerError("notifications.dispatch.route", error, {});
    return new Response("bad request", { status: 400 });
  }

  try {
    const outcome = await dispatch(rows);

    // Dead endpoints are reported rather than deleted, because deleting would
    // need the credential this route deliberately does not hold. The browser
    // is the first authority on its own endpoint (the reconcile in PushSetup,
    // and `pushsubscriptionchange`); `prune_push_subscriptions()` is the
    // backstop for a device that was simply thrown away.
    return Response.json(outcome);
  } catch (error) {
    logServerError("notifications.dispatch.route", error, {
      batch: rows.length,
    });
    return new Response("dispatch failed", { status: 500 });
  }
}
