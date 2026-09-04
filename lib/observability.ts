import "server-only";

/**
 * One place where a server-side failure becomes a line somebody can read.
 *
 * The problem this solves is specific to how this app is built. CLAUDE.md
 * section 3 puts every rule that matters in the database: `select_bid()`
 * refuses a lapsed offer, `complete_job()` refuses a job that is not yours,
 * `request_price_update()` refuses a blocked pro. So when a write fails, the
 * database has already said *precisely* why — a Postgres error code, a message,
 * a constraint name — and the server action's job is to turn that into one
 * sentence of Hebrew. For nine phases it turned it into a sentence of Hebrew
 * and threw the rest away, which meant a pro reporting "לא הצלחתי לסגור עבודה"
 * left nothing behind to look at.
 *
 * The Hebrew is still what the person sees. This is the other half.
 *
 * **Never put a person in here.** The `context` argument takes identifiers —
 * a job id, a pro id, a category id — and never a phone number, a name, an
 * address, a bank detail or the body of a message. Those are the columns the
 * whole RLS design exists to protect, and a log file is outside every policy
 * that protects them. Identifiers are enough to find the row.
 *
 * The `cause` is passed through as the database wrote it, `details` included.
 * A Postgres message can quote the values that violated a constraint, so it
 * can carry an id or a price — that is the point of keeping it, and it is why
 * these lines belong in a server log and nowhere else.
 *
 * Output is one line of JSON on stderr. Vercel captures that already, at no
 * cost and with no vendor. When a monitoring vendor is chosen (TECHNICAL_DEBT
 * #41, and CLAUDE.md section 8 keeps that decision with the user), this
 * function and `onRequestError` in instrumentation.ts are the two places it
 * has to be wired into — not thirty call sites.
 */

/** Identifiers and flags only. See the note above about what may not go here. */
export type ErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>;

type NormalizedCause = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  status?: number;
};

/**
 * Supabase hands back two unrelated error shapes — `PostgrestError`
 * (`code`/`message`/`details`/`hint`) from a table or an RPC, and `AuthError`
 * (`code`/`status`/`message`) from the OTP flow — and a thrown exception is a
 * third. Reading them into one shape here is what lets every call site pass
 * whatever it has without thinking about which kind it is.
 */
function normalize(cause: unknown): NormalizedCause {
  if (cause instanceof Error) {
    return { message: cause.message, code: cause.name };
  }

  if (typeof cause === "object" && cause !== null) {
    const record = cause as Record<string, unknown>;
    const text = (key: string) =>
      typeof record[key] === "string" ? (record[key] as string) : undefined;

    return {
      code: text("code"),
      message: text("message") ?? "(no message)",
      details: text("details"),
      hint: text("hint"),
      status: typeof record.status === "number" ? record.status : undefined,
    };
  }

  return { message: String(cause) };
}

function emit(
  level: "error" | "warn",
  operation: string,
  cause: unknown,
  context: ErrorContext,
): void {
  const line = JSON.stringify({
    level,
    operation,
    at: new Date().toISOString(),
    ...normalize(cause),
    ...context,
  });

  if (level === "error") console.error(line);
  else console.warn(line);
}

/**
 * A write that was supposed to work and did not.
 *
 * `operation` names the call site rather than the symptom — `"bids.submitBid"`,
 * `"completion.completeJob"` — so a spike is greppable and two failures of the
 * same write are one string.
 */
export function logServerError(
  operation: string,
  cause: unknown,
  context: ErrorContext = {},
): void {
  emit("error", operation, cause, context);
}

/**
 * A refusal the product expects and has a sentence for: a second offer on the
 * same call, a slug already taken, a mistyped OTP.
 *
 * Separated from `logServerError` so that the errors worth waking up for are
 * not buried under the ones that are the system working. Recorded at all
 * because the *rate* of them is a real signal — a sudden wall of "slug taken"
 * is a broken form, not a busy day.
 */
export function logExpectedRefusal(
  operation: string,
  cause: unknown,
  context: ErrorContext = {},
): void {
  emit("warn", operation, cause, context);
}
