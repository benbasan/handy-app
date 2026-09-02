import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX,
  sendMessageSchema,
  threadKeySchema,
  threadStamp,
} from "@/lib/validation/messages";

/**
 * The chat schemas. The rule they encode is that a thread is keyed (job, pro)
 * and never by job alone — both ids are required on every write, so the
 * database can re-check that the pro named actually bid on the job.
 *
 * Who may write where is proven in supabase/tests/rls_test.sql, not here: it
 * is an RLS policy, and a JS mock of it would prove nothing.
 */

const JOB = "d0000000-0000-4000-8000-000000000001";
const PRO = "a0000000-0000-4000-8000-000000000003";

describe("sendMessageSchema", () => {
  it("requires both halves of the thread key", () => {
    expect(
      sendMessageSchema.safeParse({ jobId: JOB, body: "שלום" }).success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({ proId: PRO, body: "שלום" }).success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({ jobId: JOB, proId: PRO, body: "שלום" })
        .success,
    ).toBe(true);
  });

  it("refuses an empty message, including one made only of whitespace", () => {
    for (const body of ["", "   ", "\n\n"]) {
      expect(
        sendMessageSchema.safeParse({ jobId: JOB, proId: PRO, body }).success,
      ).toBe(false);
    }
  });

  it("trims what it stores", () => {
    const parsed = sendMessageSchema.parse({
      jobId: JOB,
      proId: PRO,
      body: "  מגיע ב-9:20  ",
    });

    expect(parsed.body).toBe("מגיע ב-9:20");
  });

  it("caps the length", () => {
    expect(
      sendMessageSchema.safeParse({
        jobId: JOB,
        proId: PRO,
        body: "א".repeat(MESSAGE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("has no field for the sender — that comes from the session, never the form", () => {
    const parsed = sendMessageSchema.parse({
      jobId: JOB,
      proId: PRO,
      body: "שלום",
      senderId: "a0000000-0000-4000-8000-00000000ffff",
    });

    expect(parsed).not.toHaveProperty("senderId");
  });
});

describe("threadKeySchema", () => {
  it("rejects a key that is not a pair of uuids", () => {
    expect(
      threadKeySchema.safeParse({ jobId: "H-24817", proId: PRO }).success,
    ).toBe(false);
  });
});

describe("threadStamp", () => {
  const now = new Date("2026-09-04T18:00:00+03:00");

  it("shows a time for today, אתמול for yesterday, and a date for older", () => {
    expect(threadStamp("2026-09-04T14:12:00+03:00", now)).toBe("14:12");
    expect(threadStamp("2026-09-03T20:00:00+03:00", now)).toBe("אתמול");
    expect(threadStamp("2026-08-20T09:00:00+03:00", now)).toMatch(/20/);
  });
});
