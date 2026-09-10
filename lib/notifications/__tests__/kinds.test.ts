import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KIND_AUDIENCE,
  NOTIFICATION_KINDS,
  PUSH_ELIGIBLE_KINDS,
  URGENT_KINDS,
  isNotificationKind,
} from "../kinds";
import { notificationView } from "../messages";

/**
 * The vocabulary exists twice — as a `check` on `notifications.kind` and as a
 * union here — so something has to watch it. This is that something, and the
 * technique is `RESERVED_SLUGS`'s: read the migration, compare the sets.
 *
 * The failure it prevents is specific. A kind added in SQL and forgotten here
 * reaches `listMyNotifications`, fails `isNotificationKind`, and is silently
 * dropped from somebody's list — a notification that exists, is unread, counts
 * towards the badge, and cannot be seen.
 */
function kindsInMigration(): string[] {
  const file = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) =>
      readFileSync(`supabase/migrations/${name}`, "utf8").includes(
        "notifications_kind_check",
      ),
    );

  expect(file, "no migration defines notifications_kind_check").toBeDefined();

  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  const start = sql.indexOf("constraint notifications_kind_check");
  const block = sql.slice(
    start,
    sql.indexOf(")", sql.indexOf("kind in (", start)),
  );

  return [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

describe("the kind vocabulary", () => {
  it("matches the check constraint in the migration, word for word", () => {
    expect(new Set(kindsInMigration())).toEqual(new Set(NOTIFICATION_KINDS));
  });

  it("has no duplicates", () => {
    expect(new Set(NOTIFICATION_KINDS).size).toBe(NOTIFICATION_KINDS.length);
  });

  it("assigns every kind an audience", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(KIND_AUDIENCE[kind], kind).toBeDefined();
    }
  });

  it("draws its subsets from the vocabulary and nowhere else", () => {
    for (const kind of [...URGENT_KINDS, ...PUSH_ELIGIBLE_KINDS]) {
      expect(isNotificationKind(kind), kind).toBe(true);
    }
  });

  it("treats every urgent kind as worth pushing", () => {
    // The reverse is not true — plenty is worth a push and not worth money —
    // but a kind marked urgent and then not delivered would be a contradiction
    // sitting in two lists nobody reads together.
    for (const kind of URGENT_KINDS) {
      expect(PUSH_ELIGIBLE_KINDS, kind).toContain(kind);
    }
  });

  it("keeps the loudest kind out of the push list", () => {
    // One call in a dense city reaches every pro who covers it. A phone that
    // buzzes for each is a phone whose owner turns notifications off, which
    // costs the two urgent kinds as well.
    expect(PUSH_ELIGIBLE_KINDS).not.toContain("job_in_radius");
  });
});

describe("notificationView", () => {
  const JOB = "d0000000-0000-4000-8000-000000000001";

  it("renders every kind, for whichever side receives it", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const audience = KIND_AUDIENCE[kind];
      const role = audience === "pro" ? "pro" : "customer";

      const view = notificationView({
        kind,
        jobId: JOB,
        payload: {},
        role,
      });

      expect(view.title, kind).toBeTruthy();
      expect(view.body, kind).toBeTruthy();
      expect(view.href, kind).toMatch(/^\//);
    }
  });

  it("never prints undefined into a Hebrew sentence when the payload is bare", () => {
    for (const kind of NOTIFICATION_KINDS) {
      const view = notificationView({
        kind,
        jobId: null,
        payload: {},
        role: KIND_AUDIENCE[kind] === "pro" ? "pro" : "customer",
      });

      for (const text of [view.title, view.body, view.href]) {
        expect(text, kind).not.toContain("undefined");
        expect(text, kind).not.toContain("null");
      }
    }
  });

  it("carries no name and no amount — a push body transits a third party", () => {
    // The screen behind the link has both, under RLS. Google's and Apple's
    // push services do not need them, and this is the same line
    // lib/observability.ts draws for logs.
    for (const kind of NOTIFICATION_KINDS) {
      const view = notificationView({
        kind,
        jobId: JOB,
        payload: { price: 480, pro_name: "דוד מזרחי", rating: 5 },
        role: KIND_AUDIENCE[kind] === "pro" ? "pro" : "customer",
      });

      expect(`${view.title} ${view.body}`, kind).not.toContain("480");
      expect(`${view.title} ${view.body}`, kind).not.toContain("דוד");
    }
  });

  it("sends one shared kind to a different screen for each side", () => {
    const job = JOB;
    const pro = notificationView({
      kind: "message_received",
      jobId: job,
      payload: { pro_id: "abc" },
      role: "pro",
    });
    const customer = notificationView({
      kind: "message_received",
      jobId: job,
      payload: { pro_id: "abc" },
      role: "customer",
    });

    expect(pro.href).not.toBe(customer.href);
    expect(pro.href).toContain("/pro/messages");
    expect(customer.href).toContain(`/requests/${job}/chat`);
  });
});
