/**
 * Every kind of thing this product tells somebody about.
 *
 * Mirrors the `check` on `notifications.kind` exactly, and
 * `__tests__/kinds.test.ts` reads the migration to keep the two identical —
 * the technique `RESERVED_SLUGS` already uses, and for the same reason: a list
 * that exists twice drifts unless something is watching.
 *
 * No "use server" and no `server-only`: the list screen is a client component
 * and needs these names too.
 */
export const NOTIFICATION_KINDS = [
  // The pro's side.
  "job_in_radius",
  "bid_selected",
  "selection_moved",
  "selection_withdrawn",
  "selection_expiring",
  "selection_lapsed_pro",
  "price_update_approved",
  "price_update_rejected",
  "review_received",
  "pro_verified",
  "pro_rejected",
  // The customer's side.
  "first_bid_received",
  "bid_received",
  "pro_accepted",
  "pro_declined",
  "selection_lapsed_customer",
  "pro_on_the_way",
  "pro_arrived",
  "price_update_requested",
  "job_completed",
  // Both.
  "message_received",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/**
 * Which side of the marketplace a kind is addressed to.
 *
 * Only used to route the "open" link — a pro's screens and a customer's are
 * different paths for the same job — so `message_received`, which both sides
 * receive, is resolved from the reader's own role instead.
 */
export const KIND_AUDIENCE: Record<
  NotificationKind,
  "pro" | "customer" | "both"
> = {
  job_in_radius: "pro",
  bid_selected: "pro",
  selection_moved: "pro",
  selection_withdrawn: "pro",
  selection_expiring: "pro",
  selection_lapsed_pro: "pro",
  price_update_approved: "pro",
  price_update_rejected: "pro",
  review_received: "pro",
  pro_verified: "pro",
  pro_rejected: "pro",
  first_bid_received: "customer",
  bid_received: "customer",
  pro_accepted: "customer",
  pro_declined: "customer",
  selection_lapsed_customer: "customer",
  pro_on_the_way: "customer",
  pro_arrived: "customer",
  price_update_requested: "customer",
  job_completed: "customer",
  message_received: "both",
};

/**
 * The two kinds where money and a clock are both running.
 *
 * They are the answer, prepared in advance, to the question that will be asked
 * the day somebody prices an Israeli SMS gateway: *which of these is worth
 * paying to deliver?* A pro who does not answer inside two hours loses work
 * they were given; a customer who does not answer a price request leaves a job
 * stalled and a pro waiting on site. Everything else can wait for a tab.
 */
export const URGENT_KINDS: readonly NotificationKind[] = [
  "bid_selected",
  "price_update_requested",
];

/**
 * Kinds worth interrupting somebody for with a browser push.
 *
 * `job_in_radius` is deliberately absent. It is the highest-volume kind by far
 * — one call in a dense city reaches every pro who covers it — and a phone
 * that buzzes for every posted job is a phone whose owner turns notifications
 * off, which costs the two above as well. It still appears in the list, where
 * it is what the list is for.
 */
export const PUSH_ELIGIBLE_KINDS: readonly NotificationKind[] = [
  "bid_selected",
  "selection_expiring",
  "selection_moved",
  "selection_withdrawn",
  "price_update_requested",
  "price_update_approved",
  "price_update_rejected",
  "first_bid_received",
  "pro_accepted",
  "pro_declined",
  "pro_arrived",
  "pro_verified",
  "pro_rejected",
  "message_received",
];
