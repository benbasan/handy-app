"use client";

import { useEffect, useRef } from "react";
import { markThreadRead } from "@/lib/actions/messages";

/**
 * Opening a conversation clears its unread badge.
 *
 * A client component with an effect rather than a call during render: marking
 * read is a write, and a Server Component must not mutate while rendering.
 * It runs once per (job, pro) and only when there is something to clear, so a
 * thread that is already read causes no round trip at all.
 *
 * The update itself can only ever touch messages the caller did *not* send —
 * that is the policy on `messages`, not a filter here.
 */
export function MarkThreadRead({
  jobId,
  proId,
  unreadCount,
}: {
  jobId: string;
  proId: string;
  unreadCount: number;
}) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    const key = `${jobId}:${proId}`;
    if (unreadCount === 0 || done.current === key) return;
    done.current = key;

    const formData = new FormData();
    formData.set("jobId", jobId);
    formData.set("proId", proId);
    void markThreadRead(formData);
  }, [jobId, proId, unreadCount]);

  return null;
}
