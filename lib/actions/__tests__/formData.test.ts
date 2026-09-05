import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsOf, optional } from "../formData";

/**
 * These two were three identical copies each until they were pulled into one
 * module, and they are worth pinning now precisely because they are shared:
 * four server actions read a form through them, so a change of mind about what
 * `""` means or which message wins is a change of behaviour in all four at
 * once.
 */

describe("optional", () => {
  it("turns an untouched input into absent, not into an empty string", () => {
    // The distinction the whole helper exists for: `.optional()` in a Zod
    // schema accepts undefined and rejects "", and an untouched text input
    // posts "". Without this, every optional field in the app would have to
    // allow an empty string, which would also allow one where it is wrong.
    expect(optional("")).toBeUndefined();
    expect(optional(null)).toBeUndefined();
  });

  it("counts a field holding only whitespace as untouched", () => {
    expect(optional("   ")).toBeUndefined();
    expect(optional("\n\t ")).toBeUndefined();
  });

  it("trims what it keeps", () => {
    expect(optional("  הערה  ")).toBe("הערה");
  });

  it("passes a real value through unchanged", () => {
    expect(optional("דירה 4, קומה 2")).toBe("דירה 4, קומה 2");
  });

  it("treats an uploaded file as no text at all", () => {
    // FormData.get() returns a File for a file input. Reading one as a string
    // would put "[object File]" into a schema.
    expect(optional(new File([], "photo.jpg"))).toBeUndefined();
  });
});

describe("fieldErrorsOf", () => {
  const schema = z.object({
    price: z.number().min(50, "המחיר נמוך מדי"),
    note: z.string().max(3, "ארוך מדי"),
  });

  it("keys each message by the field it belongs to", () => {
    const result = schema.safeParse({ price: 10, note: "ארוך מאוד" });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(fieldErrorsOf(result.error)).toEqual({
      price: "המחיר נמוך מדי",
      note: "ארוך מדי",
    });
  });

  it("keeps the first message for a field, not the last", () => {
    // A control has room for one line, and the first failing rule is the one
    // closest to what the person actually did.
    const twice = z.object({
      slug: z
        .string()
        .min(3, "קצר מדי")
        .regex(/^[a-z]+$/, "אותיות בלבד"),
    });
    const result = twice.safeParse({ slug: "A" });
    if (result.success) throw new Error("expected a failure to inspect");

    expect(fieldErrorsOf(result.error).slug).toBe("קצר מדי");
  });

  it("files a whole-form refinement under `form`", () => {
    // A rule across two fields has no single path, and the form-level message
    // is where it is rendered.
    const refined = z
      .object({ from: z.number(), to: z.number() })
      .refine((v) => v.to > v.from, { message: "הטווח הפוך" });
    const result = refined.safeParse({ from: 10, to: 1 });
    if (result.success) throw new Error("expected a failure to inspect");

    expect(fieldErrorsOf(result.error)).toEqual({ form: "הטווח הפוך" });
  });

  it("returns an empty object rather than undefined for no issues", () => {
    // The callers spread this into a state object; undefined would erase the
    // field errors already there.
    expect(fieldErrorsOf(new z.ZodError([]))).toEqual({});
  });
});
