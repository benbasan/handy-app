import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a server action tells a person when the database refuses the write.
 *
 * These branches were the whole of TECHNICAL_DEBT #40 and they are the part of
 * a server action that is plain logic: a Postgres error code arrives, and the
 * code picks between a sentence that names the real cause and a sentence that
 * guesses. Getting that wrong is invisible — the screen still says something
 * in Hebrew, just the wrong thing — so it is exactly the kind of decision that
 * wants an assertion rather than a reading.
 *
 * The database itself is not under test here and could not be: `can_bid_on_job()`,
 * `select_bid()` and the constraints behind these codes are proved in pgTAP,
 * where they run (`npm run db:test`). What is under test is the translation.
 *
 * Each test also asserts *which* logger was called, because that distinction
 * is load-bearing rather than cosmetic: a duplicate offer is the product
 * working and a policy refusal is not, and if both were errors the second
 * would be buried under the first the day this has real traffic.
 */

const rpc = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const from = vi.fn(() => ({
  insert,
  update: (...args: unknown[]) => {
    update(...args);
    return { eq: () => update.mock.results.at(-1)?.value };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

vi.mock("@/lib/supabase/session", () => ({
  requireRole: async () => ({ id: "pro-1", role: "pro", fullName: "דוד" }),
  getCurrentUser: async () => ({
    id: "cust-1",
    role: "customer",
    fullName: "דנה",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const logServerError = vi.fn();
const logExpectedRefusal = vi.fn();
vi.mock("@/lib/observability", () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
  logExpectedRefusal: (...args: unknown[]) => logExpectedRefusal(...args),
}));

/** A Postgres refusal, in the shape supabase-js hands back. */
const refusal = (code: string, message = "refused") => ({
  data: null,
  error: { code, message, details: "", hint: "" },
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitBid", () => {
  const valid = {
    jobId: "00000000-0000-4000-8000-000000000001",
    price: "400",
    etaMinutes: "45",
    note: "",
  };

  it("tells a pro who already bid to edit the offer they sent", async () => {
    const { submitBid } = await import("../bids");
    insert.mockResolvedValueOnce(refusal("23505"));

    const state = await submitBid({}, form(valid));

    // The honest fix is the one the message names, and it is reachable.
    expect(state.error).toContain("כבר הגשתם הצעה");
    expect(state.error).toContain("ההצעות שלי");
  });

  it("files that duplicate as the product working, not as a fault", async () => {
    const { submitBid } = await import("../bids");
    insert.mockResolvedValueOnce(refusal("23505"));

    await submitBid({}, form(valid));

    expect(logExpectedRefusal).toHaveBeenCalledTimes(1);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it("treats any other refusal as a fault worth an error line", async () => {
    // 42501 is the insert policy — can_bid_on_job() said no, and which of its
    // four tests failed is only in the error.
    const { submitBid } = await import("../bids");
    insert.mockResolvedValueOnce(refusal("42501"));

    const state = await submitBid({}, form(valid));

    expect(state.error).toContain("לא ניתן להגיש הצעה");
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logExpectedRefusal).not.toHaveBeenCalled();
  });

  it("names the job and the pro in the line, and nothing else", async () => {
    const { submitBid } = await import("../bids");
    insert.mockResolvedValueOnce(refusal("42501"));

    await submitBid({}, form(valid));

    const [, , context] = logServerError.mock.calls[0];
    expect(context).toEqual({ jobId: valid.jobId, proId: "pro-1" });
  });

  it("rejects a malformed form before it reaches the database", async () => {
    const { submitBid } = await import("../bids");

    const state = await submitBid({}, form({ ...valid, price: "-5" }));

    expect(state.fieldErrors?.price).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("openDispute", () => {
  const valid = {
    jobId: "00000000-0000-4000-8000-000000000002",
    reason: "החיוב אינו תואם את מה שסוכם בשטח, ואני מבקש בדיקה.",
  };

  it("distinguishes a case already open from a job you are not a side of", async () => {
    const { openDispute } = await import("../disputes");

    insert.mockResolvedValueOnce(refusal("23505"));
    const duplicate = await openDispute({}, form(valid));
    expect(duplicate.error).toContain("כבר קיימת פנייה פתוחה");
    expect(logExpectedRefusal).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    insert.mockResolvedValueOnce(refusal("42501"));
    const refused = await openDispute({}, form(valid));
    expect(refused.error).toContain("לא ניתן לפתוח פנייה");
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

describe("savePublicProfile", () => {
  const valid = {
    publicSlug: "david-levi",
    bio: "אינסטלטור ותיק עם ניסיון של שתים עשרה שנה באזור המרכז.",
    yearsExperience: "12",
    galleryPaths: "",
  };

  it("sends a taken slug back to the field that can fix it", async () => {
    const { savePublicProfile } = await import("../publicProfile");
    update.mockReturnValueOnce(refusal("23505"));

    const state = await savePublicProfile({}, form(valid));

    expect(state.fieldErrors?.publicSlug).toContain("תפוסה");
    expect(logExpectedRefusal).toHaveBeenCalledTimes(1);
  });

  it("calls a check-constraint refusal a fault, because the two rules drifted", async () => {
    // 23514 means the database refused a slug lib/validation/publicProfile
    // accepted. The person is told the same thing either way; the difference
    // is that this one is a bug in the repo, and only the log can say so.
    const { savePublicProfile } = await import("../publicProfile");
    update.mockReturnValueOnce(refusal("23514"));

    const state = await savePublicProfile({}, form(valid));

    expect(state.fieldErrors?.publicSlug).toContain("אינה חוקית");
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logServerError.mock.calls[0][2]).toMatchObject({
      reason: "slug-constraint",
    });
  });
});
