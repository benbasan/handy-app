import { describe, expect, it } from "vitest";
import { supportTicketSchema } from "../support";

/**
 * The support form is the only write path in this product that an anonymous
 * visitor can reach, so its schema is the only one whose failures nobody is
 * signed in to explain. Every bound here is also a check constraint on
 * `support_tickets` — these tests are about the Hebrew sentence that appears
 * under the field, not about whether the database would have caught it.
 */
const valid = {
  fullName: "דנה לוי",
  phone: "050-0000001",
  topic: "active_job",
  jobReference: "H-24817",
  body: "הקריאה שלי עדיין ללא הצעות אחרי שעתיים.",
};

describe("supportTicketSchema", () => {
  it("accepts a complete ticket", () => {
    const parsed = supportTicketSchema.parse(valid);
    expect(parsed.topic).toBe("active_job");
    expect(parsed.jobReference).toBe("H-24817");
  });

  it("treats a blank job reference as absent, not as an empty string", () => {
    const parsed = supportTicketSchema.parse({ ...valid, jobReference: "" });
    expect(parsed.jobReference).toBeUndefined();
  });

  it("trims the free text before measuring it", () => {
    const parsed = supportTicketSchema.parse({ ...valid, fullName: "  דנה  " });
    expect(parsed.fullName).toBe("דנה");
  });

  it("refuses a body too short to act on", () => {
    const result = supportTicketSchema.safeParse({ ...valid, body: "שלום" });
    expect(result.success).toBe(false);
  });

  it("refuses a topic outside the four chips", () => {
    const result = supportTicketSchema.safeParse({
      ...valid,
      topic: "billing",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a missing phone — it is how support answers", () => {
    const result = supportTicketSchema.safeParse({ ...valid, phone: "" });
    expect(result.success).toBe(false);
  });

  it("refuses a body beyond the column's own limit", () => {
    const result = supportTicketSchema.safeParse({
      ...valid,
      body: "א".repeat(4001),
    });
    expect(result.success).toBe(false);
  });
});
