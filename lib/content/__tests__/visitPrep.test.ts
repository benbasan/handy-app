import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DANGER_LINE,
  UNTIL_THEY_ARRIVE,
  VISIT_PREP,
  untilTheyArrive,
  visitPrep,
} from "../visitPrep";

/** The trades that exist, read from the seed rather than retyped. */
const SEEDED_SLUGS = [
  ...readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8")
    .split("insert into public.categories")[1]!
    .split(";")[0]!
    .matchAll(/'([a-z-]+)'\)/g),
].map((match) => match[1]!);

describe("visit prep", () => {
  it("reads ten trades from the seed", () => {
    expect(SEEDED_SLUGS).toHaveLength(10);
  });

  it("has a checklist for every trade, and none for a trade that does not exist", () => {
    expect(Object.keys(VISIT_PREP).sort()).toEqual([...SEEDED_SLUGS].sort());
    for (const slug of Object.keys(UNTIL_THEY_ARRIVE)) {
      expect(SEEDED_SLUGS).toContain(slug);
    }
  });

  it("falls back to a general list, never to nothing", () => {
    expect(visitPrep(null).items.length).toBeGreaterThan(0);
    expect(visitPrep("no-such-trade").items.length).toBeGreaterThan(0);
  });

  it("gives an urgent card only where waiting can make things worse", () => {
    expect(untilTheyArrive("plumbing")).not.toBeNull();
    expect(untilTheyArrive("painting")).toBeNull();
    expect(untilTheyArrive(null)).toBeNull();
  });

  it("keeps every list short enough to read on a phone", () => {
    for (const list of [
      ...Object.values(VISIT_PREP),
      ...Object.values(UNTIL_THEY_ARRIVE),
    ]) {
      expect(list.items.length).toBeGreaterThanOrEqual(2);
      expect(list.items.length).toBeLessThanOrEqual(4);
    }
  });

  it("names only the national emergency numbers, and only for what they are for", () => {
    const all = [
      DANGER_LINE,
      ...Object.values(UNTIL_THEY_ARRIVE).flatMap((list) => list.items),
      ...Object.values(VISIT_PREP).flatMap((list) => list.items),
    ].join(" ");
    const numbers = new Set(all.match(/\b10\d\b/g));
    expect([...numbers].sort()).toEqual(["101", "102", "103"]);
    // A checklist for a booked visit is not an emergency card.
    expect(
      Object.values(VISIT_PREP)
        .flatMap((list) => list.items)
        .join(" "),
    ).not.toMatch(/\b10\d\b/);
  });
});
