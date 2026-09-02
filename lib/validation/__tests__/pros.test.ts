import { describe, expect, it } from "vitest";
import {
  availabilitySchema,
  commissionBreakdown,
  formatWorkDays,
  payoutSchema,
  practiceBidSchema,
  proDocumentsSchema,
  proProfileSchema,
  trimSeconds,
  verificationDocPathSchema,
} from "../pros";

const PRO = "a0000000-0000-4000-8000-000000000003";
const OTHER_PRO = "a0000000-0000-4000-8000-000000000004";

const validProfile = {
  fullName: "דוד מזרחי",
  bio: "אינסטלטור מוסמך, 12 שנות ניסיון.",
  categoryIds: ["c0000000-0000-4000-8000-000000000001"],
  radiusKm: "5",
  addressText: "רחוב ברודצקי 18, תל אביב",
};

describe("proProfileSchema", () => {
  it("accepts a complete profile and coerces the radius to a number", () => {
    const result = proProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
    expect(result.data?.radiusKm).toBe(5);
  });

  it("rejects a profile with no trade — it would have nothing to match jobs on", () => {
    const result = proProfileSchema.safeParse({
      ...validProfile,
      categoryIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a radius that is not one of the offered options", () => {
    const result = proProfileSchema.safeParse({
      ...validProfile,
      radiusKm: "500",
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside Israel — a swapped lat/lng pair, typically", () => {
    const result = proProfileSchema.safeParse({
      ...validProfile,
      lat: 34.7818,
      lng: 32.0853,
    });
    expect(result.success).toBe(false);
  });
});

describe("verificationDocPathSchema", () => {
  it("accepts a path inside the pro's own folder", () => {
    const result = verificationDocPathSchema(PRO).safeParse(
      `${PRO}/id_card-1756800000000-ab12cd.jpg`,
    );
    expect(result.success).toBe(true);
  });

  it("rejects a path inside another pro's folder", () => {
    const result = verificationDocPathSchema(PRO).safeParse(
      `${OTHER_PRO}/id_card-1756800000000-ab12cd.jpg`,
    );
    expect(result.success).toBe(false);
  });

  it("rejects a traversal out of the folder", () => {
    const result = verificationDocPathSchema(PRO).safeParse(
      `${PRO}/../${OTHER_PRO}/id.jpg`,
    );
    expect(result.success).toBe(false);
  });

  it("rejects the job-media three-segment shape — wrong bucket, wrong layout", () => {
    const result = verificationDocPathSchema(PRO).safeParse(
      `${PRO}/11111111-2222-4333-8444-555555555555/id.jpg`,
    );
    expect(result.success).toBe(false);
  });
});

describe("proDocumentsSchema", () => {
  it("accepts a submission with nothing attached — every document is optional here", () => {
    const result = proDocumentsSchema(PRO).safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a document that points at somebody else's folder", () => {
    const result = proDocumentsSchema(PRO).safeParse({
      idCardPath: `${OTHER_PRO}/id.jpg`,
    });
    expect(result.success).toBe(false);
  });
});

describe("practiceBidSchema", () => {
  it("accepts a plausible practice bid", () => {
    const result = practiceBidSchema.safeParse({
      price: "380",
      etaMinutes: "45",
      note: "",
    });
    expect(result.success).toBe(true);
    expect(result.data?.price).toBe(380);
    expect(result.data?.note).toBeUndefined();
  });

  it("rejects a zero or negative price", () => {
    expect(
      practiceBidSchema.safeParse({ price: "0", etaMinutes: "45" }).success,
    ).toBe(false);
    expect(
      practiceBidSchema.safeParse({ price: "-10", etaMinutes: "45" }).success,
    ).toBe(false);
  });

  it("rejects a non-numeric price rather than storing NaN", () => {
    const result = practiceBidSchema.safeParse({
      price: "בערך 400",
      etaMinutes: "45",
    });
    expect(result.success).toBe(false);
  });
});

describe("payoutSchema", () => {
  const valid = {
    paymentMethods: ["cash", "bit"],
    bankName: "בנק לאומי",
    bankBranch: "800",
    accountLast4: "4417",
  };

  it("accepts bank, branch and the last four digits", () => {
    expect(payoutSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a full account number in the last-four field", () => {
    const result = payoutSchema.safeParse({
      ...valid,
      accountLast4: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown collection method", () => {
    const result = payoutSchema.safeParse({
      ...valid,
      paymentMethods: ["crypto"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pro who takes no payment at all", () => {
    const result = payoutSchema.safeParse({ ...valid, paymentMethods: [] });
    expect(result.success).toBe(false);
  });
});

describe("availabilitySchema", () => {
  const valid = {
    acceptingJobs: true,
    workDays: ["0", "1", "2"],
    workStartTime: "07:00",
    workEndTime: "19:00",
    radiusKm: "5",
    categoryIds: ["c0000000-0000-4000-8000-000000000001"],
  };

  it("accepts a week of work and coerces the day numbers", () => {
    const result = availabilitySchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.workDays).toEqual([0, 1, 2]);
  });

  it("rejects a day number outside 0–6", () => {
    const result = availabilitySchema.safeParse({ ...valid, workDays: ["7"] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed time", () => {
    const result = availabilitySchema.safeParse({
      ...valid,
      workStartTime: "25:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a pro who works no days", () => {
    const result = availabilitySchema.safeParse({ ...valid, workDays: [] });
    expect(result.success).toBe(false);
  });
});

describe("commissionBreakdown", () => {
  it("takes 12% from the pro and leaves the rest", () => {
    expect(commissionBreakdown(500)).toEqual({ commission: 60, net: 440 });
  });

  it("always adds back up to the price the pro typed", () => {
    for (const price of [1, 37, 380, 1234.55, 99999]) {
      const { commission, net } = commissionBreakdown(price);
      expect(commission + net).toBeCloseTo(price, 2);
    }
  });
});

describe("formatWorkDays", () => {
  it("names the days that were chosen", () => {
    expect(formatWorkDays([0, 1])).toBe("ראשון, שני");
  });

  it("collapses a full week rather than listing all seven", () => {
    expect(formatWorkDays([6, 5, 4, 3, 2, 1, 0])).toBe("כל ימות השבוע");
  });

  it("says so when no day was chosen, instead of returning an empty string", () => {
    expect(formatWorkDays([])).toBe("לא נבחרו ימים");
  });
});

describe("trimSeconds", () => {
  it("turns a Postgres time into what an <input type=time> expects", () => {
    expect(trimSeconds("07:00:00")).toBe("07:00");
  });

  it("survives a null column", () => {
    expect(trimSeconds(null)).toBe("");
  });
});
