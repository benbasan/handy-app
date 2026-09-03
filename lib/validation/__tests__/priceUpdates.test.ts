import { describe, expect, it } from "vitest";
import {
  decidePriceUpdateSchema,
  MIN_PRICE_UPDATE_PRICE,
  priceDelta,
  priceUpdatePhotoPathSchema,
  requestPriceUpdateSchema,
} from "@/lib/validation/priceUpdates";

/**
 * The schemas in front of the product's central rule.
 *
 * What is being tested is mostly what these refuse. The photo path is the
 * interesting one: it is the only thing standing between "a pro sent a price
 * change with a photo of *this* fault" and "a pro sent a price change with a
 * photo", and the same shape is re-checked by the bucket's insert policy and
 * by `request_price_update()` in supabase/migrations. This is the first of the
 * three, not the only one.
 */

const PRO = "a0000000-0000-4000-8000-000000000003";
const OTHER_PRO = "a0000000-0000-4000-8000-000000000006";
const JOB = "d0000000-0000-4000-8000-000000000001";
const OTHER_JOB = "d0000000-0000-4000-8000-000000000002";

describe("priceUpdatePhotoPathSchema", () => {
  const schema = priceUpdatePhotoPathSchema(PRO, JOB);

  it("accepts a photo in this pro's folder for this job", () => {
    expect(schema.safeParse(`${PRO}/${JOB}/fault-1.jpg`).success).toBe(true);
  });

  it("rejects a photo in another pro's folder", () => {
    expect(schema.safeParse(`${OTHER_PRO}/${JOB}/fault-1.jpg`).success).toBe(
      false,
    );
  });

  it("rejects a photo uploaded against a different job", () => {
    // The one that matters most: without this, a single photo of a cracked
    // pipe justifies a price rise on every call the pro ever takes.
    expect(schema.safeParse(`${PRO}/${OTHER_JOB}/fault-1.jpg`).success).toBe(
      false,
    );
  });

  it("rejects a path that climbs out of the folder", () => {
    expect(schema.safeParse(`${PRO}/${JOB}/../../secret.jpg`).success).toBe(
      false,
    );
  });

  it("rejects a bare filename with no folders at all", () => {
    expect(schema.safeParse("fault-1.jpg").success).toBe(false);
  });
});

describe("requestPriceUpdateSchema", () => {
  const schema = requestPriceUpdateSchema(PRO, JOB);

  const valid = {
    jobId: JOB,
    newPrice: "440",
    photoPath: `${PRO}/${JOB}/fault-1.jpg`,
    note: "צינור סדוק בקיר",
  };

  it("coerces the price out of the form's string", () => {
    const parsed = schema.safeParse(valid);
    expect(parsed.success && parsed.data.newPrice).toBe(440);
  });

  it("refuses a job id other than the one the form is bound to", () => {
    expect(schema.safeParse({ ...valid, jobId: OTHER_JOB }).success).toBe(
      false,
    );
  });

  it("refuses a price below the floor", () => {
    expect(
      schema.safeParse({ ...valid, newPrice: `${MIN_PRICE_UPDATE_PRICE - 1}` })
        .success,
    ).toBe(false);
  });

  it("refuses a fractional price — the product quotes whole shekels", () => {
    expect(schema.safeParse({ ...valid, newPrice: "440.5" }).success).toBe(
      false,
    );
  });

  it("refuses a request with no photo at all", () => {
    expect(schema.safeParse({ ...valid, photoPath: "" }).success).toBe(false);
  });

  it("drops an empty note rather than storing a blank string", () => {
    const parsed = schema.safeParse({ ...valid, note: "   " });
    expect(parsed.success && parsed.data.note).toBeUndefined();
  });

  it("has no field for the original price — the database reads it", () => {
    const parsed = schema.safeParse({ ...valid, originalPrice: "1" });
    // Zod object schemas strip unknown keys, so a browser that invents one
    // gets it dropped rather than honoured.
    expect(parsed.success && "originalPrice" in parsed.data).toBe(false);
  });
});

describe("decidePriceUpdateSchema", () => {
  it("takes exactly two decisions", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      decidePriceUpdateSchema.safeParse({
        priceUpdateId: id,
        decision: "approve",
      }).success,
    ).toBe(true);
    expect(
      decidePriceUpdateSchema.safeParse({
        priceUpdateId: id,
        decision: "reject",
      }).success,
    ).toBe(true);
    // Not a status. "pending" would be a request to un-decide.
    expect(
      decidePriceUpdateSchema.safeParse({
        priceUpdateId: id,
        decision: "pending",
      }).success,
    ).toBe(false);
  });
});

describe("priceDelta", () => {
  it("is what the customer is actually being asked about", () => {
    expect(priceDelta(320, 440)).toBe(120);
  });

  it("can be negative — a price update is not always a rise", () => {
    expect(priceDelta(440, 320)).toBe(-120);
  });

  it("does not leak floating point noise into a shekel amount", () => {
    expect(priceDelta(320.1, 440.2)).toBe(120.1);
  });
});
