import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sign-in while real OTP delivery is stood down — lib/auth/bypass.ts.
 *
 * The bypass is the widest thing in this codebase: with the flag on, anybody
 * can sign in as any phone number. So what is worth testing is not the happy
 * path but the edges of that hole — that it is shut when the flag is off, that
 * it cannot reach a seeded account, that it refuses when its credential is
 * missing, and that it never mints an admin.
 *
 * The Supabase client is mocked because GoTrue is not under test here: whether
 * `signUp` really returns a session with `enable_confirmations = false` is a
 * question for the running stack, and it was answered against the real one
 * before this was written.
 */

/*
 * `lib/auth/bypass.ts` imports "server-only", which throws outside a Server
 * Component. The neighbouring action tests never hit this because they mock
 * every server-only module they touch; this one imports the bypass for real,
 * because its two env reads are part of what is under test.
 */
vi.mock("server-only", () => ({}));

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp, verifyOtp, signInWithPassword, signUp },
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

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const PHONE = "050-1234567";
const E164 = "+972501234567";

function verifyForm(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function runVerify(
  fields: Record<string, string>,
): Promise<{ redirect?: string; error?: string }> {
  const { verifyOtp: action } = await import("../auth");
  try {
    return { error: (await action({}, verifyForm(fields))).error };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    if (message.startsWith("REDIRECT:")) {
      return { redirect: message.slice("REDIRECT:".length) };
    }
    throw thrown;
  }
}

async function runRequest(role = "customer") {
  const { requestOtp } = await import("../auth");
  return requestOtp({}, verifyForm({ phone: PHONE, role }));
}

const ok = { data: {}, error: null };
/** GoTrue's answer for "no such user, or wrong password". */
const noSuchLogin = {
  data: {},
  error: { code: "invalid_credentials", message: "x" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_BYPASS_OTP", "1");
  vi.stubEnv("AUTH_BYPASS_PASSWORD", "a-shared-password");
  signInWithOtp.mockResolvedValue(ok);
  verifyOtp.mockResolvedValue(ok);
  signInWithPassword.mockResolvedValue(ok);
  signUp.mockResolvedValue(ok);
  getCurrentUser.mockResolvedValue({ id: "u1", role: "customer" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("with the bypass off", () => {
  beforeEach(() => vi.stubEnv("AUTH_BYPASS_OTP", "0"));

  it("checks the code with GoTrue and never reaches for a password", async () => {
    await runVerify({ phone: PHONE, token: "123456" });

    expect(verifyOtp).toHaveBeenCalledWith({
      phone: E164,
      token: "123456",
      type: "sms",
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("still lets step 1 create the account", async () => {
    await runRequest();

    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(true);
  });

  it("still reports a failure to send as an error", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "sms_send_failed", message: "no provider" },
    });

    const state = await runRequest();

    expect(state.error).toBeTruthy();
    expect(state.bypass).toBeUndefined();
    expect(logServerError).toHaveBeenCalled();
  });
});

describe("with the bypass on", () => {
  it("signs in a returning number with the shared password", async () => {
    const { redirect } = await runVerify({ phone: PHONE, token: "123456" });

    expect(signInWithPassword).toHaveBeenCalledWith({
      phone: E164,
      password: "a-shared-password",
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(redirect).toBe("/account");
  });

  it("creates an unknown number, tagged so it can be purged later", async () => {
    signInWithPassword.mockResolvedValue(noSuchLogin);

    await runVerify({
      phone: PHONE,
      token: "123456",
      role: "pro",
      fullName: "דוד",
    });

    expect(signUp).toHaveBeenCalledWith({
      phone: E164,
      password: "a-shared-password",
      options: {
        data: {
          role: "pro",
          created_via: "otp_bypass",
          full_name: "דוד",
        },
      },
    });
  });

  it("hands a seeded number back to the ordinary OTP path", async () => {
    // A seeded user has a test_otp code and no password, so it fails the
    // password path and is already registered. This is what keeps the admin
    // and the demo panel working — and what stops the bypass reaching them.
    signInWithPassword.mockResolvedValue(noSuchLogin);
    signUp.mockResolvedValue({
      data: {},
      error: {
        code: "user_already_exists",
        message: "User already registered",
      },
    });

    const { redirect } = await runVerify({ phone: PHONE, token: "123456" });

    expect(verifyOtp).toHaveBeenCalledWith({
      phone: E164,
      token: "123456",
      type: "sms",
    });
    expect(redirect).toBe("/account");
  });

  it("refuses a code that is not the fixed one, touching no credential", async () => {
    const { error } = await runVerify({ phone: PHONE, token: "999999" });

    expect(error).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses loudly when the flag is on but the password is missing", async () => {
    vi.stubEnv("AUTH_BYPASS_PASSWORD", "");

    const { error } = await runVerify({ phone: PHONE, token: "123456" });

    expect(error).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalled();
  });

  it("defaults to customer when no role is posted, so nothing can ask for more", async () => {
    signInWithPassword.mockResolvedValue(noSuchLogin);

    await runVerify({ phone: PHONE, token: "123456" });

    expect(signUp.mock.calls[0][0].options.data.role).toBe("customer");
  });

  it("cannot ask for an admin: the role is rejected before Supabase is called", async () => {
    // The database whitelists the role too (handle_new_user), so this is the
    // outer of two gates. Both exist because either alone would be enough to
    // regret losing.
    signInWithPassword.mockResolvedValue(noSuchLogin);

    const { error } = await runVerify({
      phone: PHONE,
      token: "123456",
      role: "admin",
    });

    expect(error).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("does not let step 1 create the account", async () => {
    /*
     * A regression test for a bug found by driving the screens rather than by
     * reading the code. With `shouldCreateUser: true` GoTrue makes the user as
     * soon as a code is *asked for* — so a stranger who typed a number and
     * walked away left an account behind, a wrong code created one too, and
     * every one of them arrived with no password and no `created_via` tag:
     * unable to sign in through the bypass, and invisible to the purge script.
     */
    await runRequest();

    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });

  it("prefills the code and says a message was not sent", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "sms_send_failed", message: "no provider" },
    });

    const state = await runRequest();

    expect(state.bypass).toBe(true);
    expect(state.code).toBe("123456");
    expect(state.sentTo).toBe(E164);
    expect(state.error).toBeUndefined();
    // A refusal, not an error: the product has an answer for it.
    expect(logExpectedRefusal).toHaveBeenCalled();
    expect(logServerError).not.toHaveBeenCalled();
  });

  it("logs no phone number when it logs at all", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "sms_send_failed", message: "no provider" },
    });

    await runRequest("pro");

    const context = logExpectedRefusal.mock.calls[0][2];
    expect(JSON.stringify(context)).not.toContain("972");
    expect(context).toEqual({ role: "pro" });
  });
});
