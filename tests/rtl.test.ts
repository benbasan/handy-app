import { describe, expect, it } from "vitest";
import { classTokens, read, sourceFiles } from "./repo";

/**
 * The RTL rule from CLAUDE.md section 3, enforced instead of remembered.
 *
 * The whole UI is Hebrew and renders `dir="rtl"`. A physical utility —
 * `ml-4`, `pr-2`, `left-0`, `text-left` — looks perfectly correct in a
 * Latin-language preview and puts the margin on the wrong side of a Hebrew
 * page. Nothing about that is visible in a review of the diff alone, which is
 * exactly why it belongs in a test.
 *
 * `lib/pdf/` is the one exception, and a real one: react-pdf's stylesheet has
 * no logical properties and a PDF page has no `dir`, so the receipt uses
 * symmetric physical values and an explicit `textAlign: "right"`. That
 * document is always Hebrew — there is nothing for a logical property to
 * resolve differently.
 */

const UI_DIRS = ["app", "components", "lib"] as const;
const UI_EXTENSIONS = [".ts", ".tsx"] as const;

const EXEMPT = ["lib/pdf/"];

function uiSources(): string[] {
  return sourceFiles(UI_DIRS, UI_EXTENSIONS).filter(
    (file) => !EXEMPT.some((prefix) => file.startsWith(prefix)),
  );
}

/**
 * The physical utilities this codebase may not use, each with the logical one
 * that replaces it.
 *
 * Anchored at both ends of a whole class token, so `ms-4` never matches `ml-`
 * and a URL containing `/right-now` is not a layout bug. `-?` catches negative
 * margins; `scroll-` catches the scroll-margin family, which has the same
 * problem and is easy to forget.
 */
const FORBIDDEN: ReadonlyArray<{
  label: string;
  test: RegExp;
  instead: string;
}> = [
  { label: "ml-*", test: /^-?(scroll-)?ml-/, instead: "ms-" },
  { label: "mr-*", test: /^-?(scroll-)?mr-/, instead: "me-" },
  { label: "pl-*", test: /^-?(scroll-)?pl-/, instead: "ps-" },
  { label: "pr-*", test: /^-?(scroll-)?pr-/, instead: "pe-" },
  { label: "left-*", test: /^-?left-/, instead: "start-" },
  { label: "right-*", test: /^-?right-/, instead: "end-" },
  { label: "text-left", test: /^text-left$/, instead: "text-start" },
  { label: "text-right", test: /^text-right$/, instead: "text-end" },
  { label: "border-l*", test: /^border-l(-|$)/, instead: "border-s" },
  { label: "border-r*", test: /^border-r(-|$)/, instead: "border-e" },
  { label: "rounded-l*", test: /^rounded-l(-|$)/, instead: "rounded-s" },
  { label: "rounded-r*", test: /^rounded-r(-|$)/, instead: "rounded-e" },
  { label: "rounded-tl*", test: /^rounded-tl(-|$)/, instead: "rounded-ss" },
  { label: "rounded-tr*", test: /^rounded-tr(-|$)/, instead: "rounded-se" },
  { label: "rounded-bl*", test: /^rounded-bl(-|$)/, instead: "rounded-es" },
  { label: "rounded-br*", test: /^rounded-br(-|$)/, instead: "rounded-ee" },
  { label: "float-left", test: /^float-left$/, instead: "float-start" },
  { label: "float-right", test: /^float-right$/, instead: "float-end" },
];

describe("RTL: logical Tailwind utilities only", () => {
  const files = uiSources();

  it("scans a plausible number of files, so a broken glob cannot pass silently", () => {
    // A guard on the guard: were `sourceFiles` ever to return nothing, every
    // assertion below would pass and prove nothing at all.
    expect(files.length).toBeGreaterThan(80);
  });

  for (const { label, test, instead } of FORBIDDEN) {
    it(`no ${label} — use ${instead}`, () => {
      const hits: string[] = [];

      for (const file of files) {
        for (const { token, raw } of classTokens(file)) {
          if (test.test(token)) hits.push(`${file}  ${raw}`);
        }
      }

      expect(hits, `physical utility on an RTL page — use ${instead}`).toEqual(
        [],
      );
    });
  }

  it("the PDF exemption still covers exactly one directory", () => {
    // Widening this list is a decision, not a fix. CLAUDE.md section 3 names
    // lib/pdf/ and only lib/pdf/.
    expect(EXEMPT).toEqual(["lib/pdf/"]);
  });

  it("and lib/pdf/ really is a PDF, not a page that slipped through", () => {
    const receipt = read("lib/pdf/receipt.tsx");
    expect(receipt).toMatch(/@react-pdf\/renderer/);
    expect(receipt).toMatch(/textAlign: "right"/);
  });
});

describe("RTL: the document declares its direction", () => {
  it("the root layout renders dir=rtl and lang=he", () => {
    // Every logical utility above resolves against this one attribute. Without
    // it they would all silently mean their physical counterparts.
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/dir="rtl"/);
    expect(layout).toMatch(/lang="he"/);
  });
});
