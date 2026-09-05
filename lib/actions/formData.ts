import type { z } from "zod";

/**
 * The two things every server action does to a `FormData` before Zod sees it.
 *
 * They live in their own module for the same reason `lib/actions/state.ts`
 * does: a `"use server"` module may only export async functions, because every
 * export becomes a callable server reference. A plain helper in one is a build
 * error, so the shared parts of an action have to sit outside it.
 *
 * Both were written three times over — `optional` in bids, jobs and pros,
 * `fieldErrorsOf` in bids, pros and priceUpdates — as identical copies. The
 * cost of that is not the duplication itself but the drift it invites: these
 * decide what an empty field means and which message lands under which input,
 * and three answers to either question is three behaviours a user could meet.
 */

/**
 * An untouched text input arrives as `""`, not as absent, and `""` is not the
 * same thing as "not given" to a Zod schema with an `.optional()` on it. This
 * is what turns the first into the second, trimming on the way so that a field
 * holding only spaces counts as untouched.
 */
export function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

/**
 * Zod's issues, keyed by field name so a form can sit each message under the
 * control it belongs to.
 *
 * First message wins (`??=`): a field with two failing rules gets the one
 * closest to what the person did, and a control has room for one line anyway.
 * An issue with no path — a refinement across several fields — is filed under
 * `form`, which is where the form-level message is rendered.
 */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
