import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANCEL_REASONS,
  CANCEL_REASON_LABEL,
  cancelJobSchema,
  rateCustomerSchema,
} from "../cancellation";

const JOB = "d0000000-0000-4000-8000-000000000001";

function reasonsInMigration(): string[] {
  const file = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) =>
      readFileSync(`supabase/migrations/${name}`, "utf8").includes(
        "jobs_cancel_reason_check",
      ),
    );
  expect(file, "no migration defines jobs_cancel_reason_check").toBeDefined();
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  const start = sql.indexOf("jobs_cancel_reason_check");
  const block = sql.slice(start, sql.indexOf(")", sql.indexOf("in (", start)));
  return [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

describe("cancel reasons", () => {
  it("match the check constraint in the migration, word for word", () => {
    expect(new Set(reasonsInMigration())).toEqual(new Set(CANCEL_REASONS));
  });

  it("each has a Hebrew label", () => {
    for (const reason of CANCEL_REASONS) {
      expect(CANCEL_REASON_LABEL[reason], reason).toBeTruthy();
    }
  });
});

describe("cancelJobSchema", () => {
  it("accepts a customer's reason", () => {
    expect(
      cancelJobSchema.safeParse({ jobId: JOB, reason: "not_needed" }).success,
    ).toBe(true);
  });

  it("refuses the pro's reason from the customer's form", () => {
    expect(
      cancelJobSchema.safeParse({ jobId: JOB, reason: "customer_cancelled" })
        .success,
    ).toBe(false);
  });
});

describe("rateCustomerSchema", () => {
  it("takes a rating of 1 to 5 and an optional comment", () => {
    const parsed = rateCustomerSchema.parse({
      jobId: JOB,
      rating: "4",
      comment: "  ",
    });
    expect(parsed).toEqual({ jobId: JOB, rating: 4, comment: undefined });
  });

  it("refuses a rating outside 1 to 5", () => {
    expect(
      rateCustomerSchema.safeParse({ jobId: JOB, rating: 6 }).success,
    ).toBe(false);
    expect(
      rateCustomerSchema.safeParse({ jobId: JOB, rating: 0 }).success,
    ).toBe(false);
  });
});
