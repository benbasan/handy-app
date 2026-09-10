import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registry is what makes "turn on a paid channel" a flag rather than an
 * edit. These assertions are the flag's only proof — nothing else in the repo
 * would notice if `costsMoney` stopped being consulted, because no paid
 * provider is implemented yet.
 */

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ENV };
});

async function providers() {
  const { activeProviders } = await import("../provider");
  return activeProviders();
}

describe("activeProviders", () => {
  it("is empty when web push has no keys", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    // In-app is not in the registry at all: the row is already written by the
    // time anything reaches it, so "delivering" it would be a no-op with a
    // name, and keeping it out keeps the registry honest about what costs a
    // network call.
    expect(await providers()).toEqual([]);
  });

  it("includes web push once all three keys are set", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";

    const active = await providers();
    expect(active.map((p) => p.channel)).toEqual(["web_push"]);
  });

  it("leaves web push in the free tier, so no flag is needed to use it", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    delete process.env.NOTIFICATIONS_ALLOW_PAID;

    const active = await providers();
    expect(active).toHaveLength(1);
    expect(active[0]!.costsMoney).toBe(false);
  });

  it("would filter a paid provider out unless the flag is set", async () => {
    const { paidChannelsEnabled } = await import("../provider");

    delete process.env.NOTIFICATIONS_ALLOW_PAID;
    expect(paidChannelsEnabled()).toBe(false);

    process.env.NOTIFICATIONS_ALLOW_PAID = "1";
    expect(paidChannelsEnabled()).toBe(true);
  });

  it("does not treat any other value as consent to spend", async () => {
    const { paidChannelsEnabled } = await import("../provider");

    for (const value of ["", "0", "true", "yes"]) {
      process.env.NOTIFICATIONS_ALLOW_PAID = value;
      expect(paidChannelsEnabled(), value).toBe(false);
    }
  });
});
