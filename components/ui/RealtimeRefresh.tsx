"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase Realtime, as docs/architecture.md section 5 specifies it: Postgres
 * Changes on `bids` filtered to one job, on `messages` filtered to one job,
 * and on `jobs` for the pro feed.
 *
 * The subscription carries no data into the page. It only tells the router the
 * server's answer is stale, and the server re-renders under the caller's own
 * RLS — so what arrives on screen is exactly what a reload would have shown,
 * and a payload that was delivered by mistake could never widen what is
 * rendered. That is also why this is a plain refresher rather than a store: a
 * bid is money, and the authority on it is the database, not a socket message
 * that has been sitting in a browser tab.
 *
 * Realtime applies each subscriber's RLS before delivering a row, so a pro
 * subscribed to `bids` is woken only by their own, and a customer only by bids
 * on their own jobs.
 */

/** How long a "just updated" flash stays on screen. */
const FLASH_MS = 2500;

export function RealtimeRefresh({
  table,
  filter,
  label,
}: {
  table: "bids" | "messages" | "jobs";
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
    const channel = supabase
      .channel(`realtime:${table}:${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => {
          router.refresh();
          setFlash(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setFlash(false), FLASH_MS);
        },
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, table, filter]);

  if (!label) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm font-semibold transition-opacity ${
        flash ? "text-cta-strong opacity-100" : "text-muted opacity-70"
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
