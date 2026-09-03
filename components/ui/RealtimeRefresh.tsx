"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase Realtime, as docs/architecture.md section 5 specifies it: Postgres
 * Changes on `bids` filtered to one job, on `messages` filtered to one job,
 * on `jobs` for the pro feed, and — since Phase 5 — on `price_updates` (the
 * customer's screen has to raise the approval card the moment the pro sends
 * it) and `job_locations` (the pin on the live map).
 *
 * The subscription carries no data into the page. It only tells the router the
 * server's answer is stale, and the server re-renders under the caller's own
 * RLS — so what arrives on screen is exactly what a reload would have shown,
 * and a payload delivered by mistake could never widen what is rendered. That
 * is also why this is a plain refresher rather than a store: a bid is money,
 * and the authority on it is the database, not a socket message that has been
 * sitting in a browser tab.
 *
 * **The socket has to be handed the user's token before it joins.** This app
 * restores its session from a cookie rather than by signing in on the client,
 * so no auth event fires to push the token into the realtime client and the
 * join wins the race against the token lookup. An unauthenticated socket does
 * not merely see fewer rows — it is refused the subscription outright, with
 * "invalid column for filter job_id", because `anon` holds no privilege on
 * these tables and so cannot see the column it is being asked to filter on.
 * `setAuth()` first, `subscribe()` second.
 *
 * Realtime then applies the subscriber's own RLS before delivering a row, so
 * publishing these tables widens nothing: a pro subscribed to `bids` is woken
 * only by their own, a customer only by bids on their own jobs.
 */

/** How long a "just updated" flash stays on screen. */
const FLASH_MS = 2500;

export function RealtimeRefresh({
  table,
  filter,
  label,
}: {
  table: "bids" | "messages" | "jobs" | "price_updates" | "job_locations";
  /** PostgREST filter syntax, e.g. `job_id=eq.<uuid>`. Omit to watch the table. */
  filter?: string;
  /**
   * What to say when something arrives. Omitted on screens where the change is
   * self-evident (a new chat bubble); given where it is not (a new offer in a
   * list the customer is reading).
   */
  label?: string;
}) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  // Kept in a ref so the effect below does not re-subscribe on every flash.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // CI and any environment without credentials render the page fine and
    // simply do not subscribe — the same stance getCurrentUser takes.
    if (!getSupabaseEnv()) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        // No `realtime:` prefix in the name: the client adds one of its own,
        // and a hand-written one only doubles it in the topic.
        .channel(`${table}:${filter ?? "all"}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            ...(filter ? { filter } : {}),
          },
          () => {
            router.refresh();
            setFlash(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setFlash(false), FLASH_MS);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, table, filter]);

  if (!label) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      /* Colour alone carries the flash. The idle state used to be dimmed to
         70% opacity, which put the muted grey at 2.6:1 against the canvas —
         a status line nobody with low vision could read. */
      className={`text-sm font-semibold transition-colors ${
        flash ? "text-cta-strong" : "text-muted"
      }`}
    >
      <span
        aria-hidden
        className={`me-2 inline-block size-2 rounded-full align-middle ${
          flash ? "bg-cta" : "bg-cta/40"
        }`}
      />
      {flash ? "התקבל עדכון חדש" : label}
    </p>
  );
}
