import { describe, expect, it } from "vitest";
import { describeHits, scan, sourceFiles } from "./repo";

/**
 * The design system is only a design system while it is the one place the
 * values live.
 *
 * `components/ui/primitives.tsx` opens by promising that "a later re-skin is
 * one edit here instead of a sweep through every component". For the buttons
 * and the input that was true. For the card it was not: `CARD_CLASS` was
 * exported and imported by nobody, while the three utilities that make a card
 * look like a card were written out inline fifty-five times across
 * thirty-five files — so the promise held for the parts nobody had re-skinned
 * and would have failed for the part somebody eventually would.
 *
 * This is the audit that stops it happening again. It is deliberately narrow:
 * only values that already have a name in `primitives.tsx`, and only the exact
 * strings — a card at a different inset is a judgement against
 * design/screens/, not a violation.
 */

const NAMED = [
  {
    literal: "rounded-2xl border border-line bg-surface",
    constant: "CARD_BASE",
    what: "the card's radius, border and ground",
  },
  {
    literal: "text-3xl font-bold text-ink sm:text-4xl",
    constant: "PAGE_TITLE",
    what: "a screen's <h1>",
  },
  {
    literal: "mb-1 block text-sm font-medium text-ink",
    constant: "FIELD_LABEL",
    what: "the label above a form control",
  },
] as const;

describe("a value that has a name in primitives.tsx is used by that name", () => {
  // primitives.tsx is where the literals are *defined*, so it is the one file
  // allowed to contain them.
  const files = sourceFiles(["app", "components"], [".tsx", ".ts"]).filter(
    (file) => file !== "components/ui/primitives.tsx",
  );

  it("reads a realistic number of files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(NAMED)("$constant — $what", ({ literal, constant }) => {
    const hits = scan(
      files,
      new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );

    expect(
      hits,
      `Import ${constant} from "@/components/ui/primitives" instead of writing the utilities out. Re-skinning has to be one edit, which is what that module says it is:\n${describeHits(hits)}`,
    ).toEqual([]);
  });
});
