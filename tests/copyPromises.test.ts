import { describe, expect, it } from "vitest";
import { codeStrings, describeHits, read, sourceFiles, type Hit } from "./repo";

/**
 * The product may not promise, in Hebrew, something no code does.
 *
 * CLAUDE.md section 3 states this twice — "no invented figure on a public
 * page", and enforcement "checked where the thing happens, never by hiding a
 * button" — and for eleven phases it was obeyed where somebody was looking and
 * broken where nobody was. The end-to-end review found five separate promises
 * with nothing behind them, and the two that mattered most were figures:
 *
 *   * "הצעה שנשלחת תוך 10 דקות מפרסום הקריאה נבחרת ב-64% מהמקרים" on four
 *     screens, and "פרופיל מאומת מקבל פי 3 יותר עבודות" on three. Both are
 *     prototype filler, and both are the same thing this repo deliberately
 *     refused to copy when it dropped the design's "+4,200 קריאות",
 *     "₪2,450 הכנסה שבועית" and "97% אחריות".
 *   * An SMS that four pro screens announced and no module in this repo sends.
 *     There is no notifications table, no provider and no send path — that is
 *     Phase 13.
 *   * One-tap rebooking, promised in three places while `saved_pros` was a
 *     list item with no link. That is Phase 14.
 *
 * The audit reads string and template literals only — `codeStrings()` skips
 * comments — so the paragraphs above each removal, which necessarily quote the
 * claim they removed, do not trip it.
 *
 * **When one of these becomes true, delete its entry here in the same commit
 * that makes it true.** An audit nobody is allowed to update is an audit
 * somebody eventually deletes wholesale.
 */

const UI_FILES = sourceFiles(
  ["app", "components", "lib/content"],
  [".ts", ".tsx"],
);

/** Where an SMS may honestly be promised: the OTP flow actually sends one. */
const SENDS_SMS = [
  "app/(customer)/login/page.tsx",
  "app/(pro)/pro/login/page.tsx",
  "app/(admin)/admin/login/page.tsx",
  "components/ui/OtpLoginForm.tsx",
  "lib/content/help.ts",
  "lib/content/legal.ts",
];

type Rule = {
  what: string;
  why: string;
  pattern: RegExp;
  allow?: readonly string[];
};

const RULES: readonly Rule[] = [
  {
    what: "the 64% win rate",
    why: "nothing in this product has ever measured it; BID_SPEED_NOTE says why speed matters without a number",
    pattern: /64\s*%|ב-64/,
  },
  {
    what: '"פי 3 יותר עבודות"',
    why: "unmeasured; VERIFICATION_GATE_NOTE states the gate instead, which is stronger and checkable in pro_serves_job()",
    pattern: /פי\s*3\s*יותר|בממוצע\s*פי\s*3/,
  },
  {
    what: "an SMS this repo does not send",
    why: "no notifications table, no provider, no send path — Phase 13",
    pattern: /SMS/,
    allow: SENDS_SMS,
  },
  {
    what: "one-tap rebooking of a saved pro",
    why: "saved_pros has no route into the posting form — Phase 14",
    pattern: /הזמנה\s*חוזרת|להזמין\s*אותו\s*ישירות/,
  },
];

function offenders(rule: Rule): Hit[] {
  const hits: Hit[] = [];

  for (const file of UI_FILES) {
    if (rule.allow?.includes(file)) continue;

    const source = read(file);
    const lines = source.split("\n");

    for (const literal of codeStrings(source)) {
      if (!rule.pattern.test(literal)) continue;

      // Report where it is, not just that it is: a failure naming the line is
      // the difference between a test that gets fixed and one that gets muted.
      const needle = literal.trim().split("\n")[0]!.slice(0, 30);
      const index = lines.findIndex((line) => line.includes(needle));

      hits.push({
        file,
        line: index >= 0 ? index + 1 : 0,
        text: literal.trim().slice(0, 120),
      });
    }
  }

  return hits;
}

describe("the interface does not promise what the code does not do", () => {
  for (const rule of RULES) {
    it(`does not claim ${rule.what} — ${rule.why}`, () => {
      const hits = offenders(rule);
      expect(hits, describeHits(hits)).toEqual([]);
    });
  }
});
