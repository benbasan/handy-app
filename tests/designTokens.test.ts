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
  /*
   * Added in Phase 13.5, and each one is a duplication this audit found rather
   * than a value invented for it:
   *
   *  * `mt-2 text-muted` was written out 43 times — the largest single
   *    duplication in the repo — and it turned out to be doing two jobs. About
   *    half were the sentence under a page title, which is PAGE_LEAD. The other
   *    half were the second line of a hand-drawn empty state, and those are now
   *    `EmptyState` instead, which is why enforcing one string here is safe.
   *  * `text-lg font-bold text-ink` was written out 59 times, thirteen of them
   *    mixed with positioning utilities — so it is enforced as a substring, and
   *    a caller that needs `border-b … ${SECTION_TITLE} … sm:px-6` composes it.
   *  * The `<h1>` had drifted into six spellings across nineteen screens. Two
   *    survive on purpose: PAGE_TITLE inside the app, HERO_TITLE on a page that
   *    is selling rather than doing.
   */
  {
    literal: "mt-2 text-muted",
    constant: "PAGE_LEAD",
    what: "the sentence under a page title",
  },
  {
    literal: "text-lg font-bold text-ink",
    constant: "SECTION_TITLE",
    what: "the heading of a card or a section",
  },
  {
    literal: "text-4xl leading-tight font-bold text-ink sm:text-5xl",
    constant: "HERO_TITLE",
    what: "the <h1> on a marketing page",
  },
  {
    literal: "rounded-2xl border border-line bg-surface shadow-lift",
    constant: "CARD_RAISED",
    what: "the card that is the screen's decision",
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
