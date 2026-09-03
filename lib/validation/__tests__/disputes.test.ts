import { describe, expect, it } from "vitest";
import {
  DISPUTE_REASON_MIN,
  disputeReference,
  isDisputeOpen,
  isDisputeStatus,
  openDisputeSchema,
  resolveDisputeSchema,
} from "@/lib/validation/disputes";

const DISPUTE = "e0000000-0000-4000-8000-000000000118";
const JOB = "d0000000-0000-4000-8000-000000000001";

/**
 * What these tests protect is the asymmetry that makes a dispute a dispute:
 * either side may state a complaint, and neither side may put a number on it.
 *
 * The database enforces it twice over — the INSERT grant covers three columns
 * and `resolve_dispute()` checks `is_admin()`, both proven in
 * supabase/tests/rls_test.sql. These are about the third copy, the one an
 * operator actually touches: a credit typed beside "דחה את התלונה" has to come
 * back as a Hebrew sentence under the field, not as a Postgres error code.
 */
describe("opening a dispute", () => {
  it("accepts a complaint from either side", () => {
    const parsed = openDisputeSchema.safeParse({
      jobId: JOB,
      reason: "נרשם שהתשלום נגבה במזומן, אבל שילמתי בביט.",
    });

    expect(parsed.success).toBe(true);
  });

  it("has nowhere to put a status or a credit", () => {
    const parsed = openDisputeSchema.parse({
      jobId: JOB,
      reason: "העבודה לא הושלמה במלואה, נשארה נזילה.",
      status: "resolved",
      creditAmount: 5000,
    });

    // Zod strips what the schema does not name, so the two fields cannot
    // reach the insert even if a hand-built request carries them.
    expect(parsed).toStrictEqual({
      jobId: JOB,
      reason: "העבודה לא הושלמה במלואה, נשארה נזילה.",
    });
  });

  it("refuses a complaint too short to act on", () => {
    const parsed = openDisputeSchema.safeParse({ jobId: JOB, reason: "רע" });
    expect(parsed.success).toBe(false);
  });

  it("wants a real job", () => {
    expect(
      openDisputeSchema.safeParse({
        jobId: "H-24817",
        reason: "x".repeat(DISPUTE_REASON_MIN),
      }).success,
    ).toBe(false);
  });
});

describe("deciding a dispute", () => {
  it("takes a credit beside the decision that grants it", () => {
    const parsed = resolveDisputeSchema.parse({
      disputeId: DISPUTE,
      decision: "resolved",
      note: "נבדק מול תיעוד הקריאה.",
      creditAmount: "140",
    });

    expect(parsed.creditAmount).toBe(140);
  });

  it("refuses a credit attached to a refusal", () => {
    const parsed = resolveDisputeSchema.safeParse({
      disputeId: DISPUTE,
      decision: "rejected",
      creditAmount: "140",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toStrictEqual(["creditAmount"]);
    }
  });

  it("treats an empty credit field as no credit at all, not as zero", () => {
    const parsed = resolveDisputeSchema.parse({
      disputeId: DISPUTE,
      decision: "resolved",
      creditAmount: "",
    });

    expect(parsed.creditAmount).toBeUndefined();
  });

  it("refuses a negative credit", () => {
    expect(
      resolveDisputeSchema.safeParse({
        disputeId: DISPUTE,
        decision: "resolved",
        creditAmount: "-50",
      }).success,
    ).toBe(false);
  });

  it("has no way to reopen a case", () => {
    // 'open' is where a dispute starts, not something an admin can choose.
    expect(
      resolveDisputeSchema.safeParse({ disputeId: DISPUTE, decision: "open" })
        .success,
    ).toBe(false);
  });
});

describe("the D-118 reference", () => {
  it("is the last three digits of the id, as the design prints it", () => {
    expect(disputeReference(DISPUTE)).toBe("D-118");
  });

  it("pads a short one rather than producing a ragged label", () => {
    expect(disputeReference("e0000000-0000-4000-8000-00000000000a")).toBe(
      "D-000",
    );
  });
});

describe("status vocabulary", () => {
  it("matches the check constraint on the column", () => {
    expect(isDisputeStatus("in_review")).toBe(true);
    expect(isDisputeStatus("escalated")).toBe(false);
  });

  it("counts the two states somebody still has to answer", () => {
    expect(isDisputeOpen("open")).toBe(true);
    expect(isDisputeOpen("in_review")).toBe(true);
    expect(isDisputeOpen("resolved")).toBe(false);
    expect(isDisputeOpen("rejected")).toBe(false);
  });
});
