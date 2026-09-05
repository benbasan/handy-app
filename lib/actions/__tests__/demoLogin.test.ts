import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The demo sign-in action.
 *
 * Two of these are security tests rather than behaviour tests, and they are
 * the reason this file exists. A server action is callable by anyone holding
 * its id, whether or not the button that calls it was rendered — so "the panel
 * is hidden" proves nothing, and what has to be proved is that the flag and
 * the key are checked on the server before any credential is touched.
 *
 * What is mocked is the Supabase client, which is not under test: whether
 * GoTrue accepts `123456` is a question for the running stack, and
 * `tests/demoUsers.test.ts` covers the other half by proving the number the
 * action reaches for is the one the stack was told about.
 */

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp, verifyOtp, signOut },
  }),
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/supabase/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}));

const logServerError = vi.fn();
const logExpectedRefusal = vi.fn();
vi.mock("@/lib/observability", () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
  logExpectedRefusal: (...args: unknown[]) => logExpectedRefusal(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

function form(user?: string): FormData {
  const data = new FormData();
  if (user !== undefined) data.set("user", user);
  return data;
}

/** Run the action and report where it redirected, or what it returned. */
async function run(
  user?: string,
): Promise<{ redirect?: string; error?: string }> {
  const { signInAsDemoUser } = await import("../demo");
  try {
    const state = await signInAsDemoUser({}, form(user));
    return { error: state.error };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    if (message.startsWith("REDIRECT:")) {
      return { redirect: message.slice("REDIRECT:".length) };
    }
    throw thrown;
  }
}

const ok = { data: {}, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_DEMO_LOGINS", "1");
  signOut.mockResolvedValue(ok);
  signInWithOtp.mockResolvedValue(ok);
  verifyOtp.mockResolvedValue(ok);
  getCurrentUser.mockResolvedValue({
    id: "a1",
    role: "customer",
    fullName: "דנה לוי",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the flag is the gate, not the hidden button", () => {
  it("refuses with the flag unset, and touches no credential", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOGINS", "");

    const result = await run("admin");

    expect(result.error).toBe("כניסת הדמו מושבתת בשרת.");
    // The assertion that matters: not merely that it returned an error, but
    // that nothing was asked of the auth stack on the way to it.
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("is not satisfied by any old truthy value", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOGINS", "true");

    expect((await run("customer")).error).toBe("כניסת הדמו מושבתת בשרת.");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("the key is the whole input", () => {
  it.each([
    ["a phone number", "+972500000005"],
    ["an unknown key", "superuser"],
    ["nothing at all", undefined],
  ])("refuses %s", async (_label, value) => {
    const result = await run(value);

    expect(result.error).toBeTruthy();
    expect(result.redirect).toBeUndefined();
    // There is no path from request data to a phone string, which is the
    // point: a phone-taking action would also be a public SMS trigger the
    // moment Twilio is configured.
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("the happy path", () => {
  it("asks for the seeded number and never creates an account", async () => {
    await run("proVerified");

    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: "+972500000003",
      options: { shouldCreateUser: false },
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      phone: "+972500000003",
      token: "123456",
      type: "sms",
    });
  });

  it("clears any existing session first, so switching is deterministic", async () => {
    await run("customer");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("lands where the profile says, never where the button said", async () => {
    // The panel labels this key "מנהלת Handy". If the seed ever drifts and the
    // row comes back a customer, the person must land on /account — trusting
    // the label would send them to /admin and requireRole() would bounce them
    // straight off it, which looks like a broken product on a live stage.
    getCurrentUser.mockResolvedValue({
      id: "a5",
      role: "customer",
      fullName: "מנהלת Handy",
    });

    expect((await run("admin")).redirect).toBe("/account");
  });

  it("routes each role to its own home", async () => {
    for (const [role, home] of [
      ["customer", "/account"],
      ["pro", "/pro/dashboard"],
      ["admin", "/admin"],
    ] as const) {
      getCurrentUser.mockResolvedValue({ id: "x", role, fullName: "x" });
      expect((await run("customer")).redirect).toBe(home);
    }
  });
});

describe("what it records when it fails", () => {
  it("logs a send failure without putting a phone number in the line", async () => {
    signInWithOtp.mockResolvedValue({
      data: null,
      error: {
        code: null,
        message: "you can only request this after 41 seconds",
      },
    });

    const result = await run("customer");

    // The Hebrew names the wait rather than echoing GoTrue's English.
    expect(result.error).toContain("41");
    expect(result.error).not.toMatch(/[a-z]{4}/);

    expect(logServerError).toHaveBeenCalledTimes(1);
    const [operation, , context] = logServerError.mock.calls[0];
    expect(operation).toBe("demo.signInAsDemoUser.send");
    expect(context).toEqual({ demoUser: "customer" });
    // CLAUDE.md section 3: identifiers only. A demo number is still a number.
    expect(JSON.stringify(context)).not.toMatch(/972|050/);
  });

  it("files a wrong code as a refusal and an unknown failure as a fault", async () => {
    verifyOtp.mockResolvedValue({
      data: null,
      error: {
        code: "otp_expired",
        message: "Token has expired or is invalid",
      },
    });
    await run("customer");
    expect(logExpectedRefusal).toHaveBeenCalledTimes(1);
    expect(logServerError).not.toHaveBeenCalled();

    vi.clearAllMocks();

    verifyOtp.mockResolvedValue({
      data: null,
      error: {
        code: "unexpected_failure",
        message: "Database error finding user",
      },
    });
    await run("customer");
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logExpectedRefusal).not.toHaveBeenCalled();
  });

  it("says so plainly when the session exists but the profile does not", async () => {
    getCurrentUser.mockResolvedValue(null);

    const result = await run("customer");

    expect(result.error).toContain("לא נמצא פרופיל");
    expect(result.redirect).toBeUndefined();
  });
});
