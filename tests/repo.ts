import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Helpers for the audits in this folder.
 *
 * Everything here reads the repository as *text*, which is unusual for a unit
 * test and is the point: the rules these suites enforce — logical properties
 * only, no secrets in code, `.env.example` in step with what the code reads —
 * are properties of the source, not of any one module's behaviour. They are
 * the kind of rule that is stated in CLAUDE.md, obeyed for eight phases, and
 * then quietly broken in the ninth.
 *
 * Files come from `git ls-files`, so anything ignored (node_modules, .next,
 * .env.local) is out of scope by construction rather than by an exclude list
 * somebody has to remember to extend.
 */

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

let cache: string[] | null = null;

/**
 * Every file in the working tree that git is not ignoring — what is committed
 * plus what is merely present, as repo-relative paths.
 *
 * `--others` matters: a secret pasted into a brand new file is not in the
 * index yet, and an audit that only reads `git ls-files` would call the tree
 * clean right up until the commit that leaks it.
 */
export function repoFiles(): string[] {
  if (cache) return cache;

  const stdout = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );

  cache = [...new Set(stdout.split("\0").filter(Boolean))].sort();
  return cache;
}

/** Tracked files under any of `dirs` whose extension is in `extensions`. */
export function sourceFiles(
  dirs: readonly string[],
  extensions: readonly string[],
): string[] {
  return repoFiles().filter(
    (file) =>
      dirs.some((dir) => file === dir || file.startsWith(`${dir}/`)) &&
      extensions.some((ext) => file.endsWith(ext)),
  );
}

export function read(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), "utf8");
}

export type Hit = { file: string; line: number; text: string };

/**
 * Every line of every file in `files` that `pattern` matches, as
 * `file:line — the line itself`. Failure output that names the offending line
 * is the difference between a test that gets fixed and one that gets deleted.
 */
export function scan(files: readonly string[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];

  for (const file of files) {
    const lines = read(file).split("\n");

    lines.forEach((text, index) => {
      // Fresh lastIndex per line: a /g/ regex is stateful across calls.
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        hits.push({ file, line: index + 1, text: text.trim() });
      }
    });
  }

  return hits;
}

export function describeHits(hits: readonly Hit[]): string {
  return hits.map((hit) => `\n  ${hit.file}:${hit.line}  ${hit.text}`).join("");
}

/**
 * The contents of every string and template literal in a TypeScript source,
 * with comments skipped.
 *
 * Written as a character scanner rather than a regex because the distinction
 * it draws is the whole point: the RTL audit must see `"ms-4 pe-2"` and must
 * *not* see the sentence "a physical `ml-` reads fine in a Latin preview",
 * which is a comment two files in this repo legitimately contain. A regex over
 * raw source cannot tell those apart; this can.
 *
 * Template literals are returned with their `${…}` holes replaced by a space,
 * so the tokens on either side of an interpolation stay separate tokens.
 */
export function codeStrings(source: string): string[] {
  const found: string[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/"))
        i += 1;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let depth = 0;
      let value = "";
      i += 1;

      while (i < source.length) {
        const c = source[i];

        if (c === "\\") {
          value += " ";
          i += 2;
          continue;
        }
        if (quote === "`" && c === "$" && source[i + 1] === "{") {
          // Skip the hole, and any nested braces inside it.
          depth = 1;
          i += 2;
          while (i < source.length && depth > 0) {
            if (source[i] === "{") depth += 1;
            else if (source[i] === "}") depth -= 1;
            i += 1;
          }
          value += " ";
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        // A plain quote never spans a newline; bail rather than swallow the
        // rest of the file on an apostrophe inside a comment we mis-skipped.
        if (quote !== "`" && c === "\n") break;

        value += c;
        i += 1;
      }

      found.push(value);
      continue;
    }

    i += 1;
  }

  return found;
}

/**
 * Every Tailwind class token in a source file, stripped of its variant chain
 * (`sm:`, `hover:`, `group-focus:`) and of a leading `!`, paired with the line
 * it came from.
 */
export function classTokens(
  file: string,
): Array<{ token: string; raw: string }> {
  const tokens: Array<{ token: string; raw: string }> = [];

  for (const literal of codeStrings(read(file))) {
    for (const raw of literal.split(/\s+/)) {
      if (!raw) continue;
      const bare = raw.replace(/^!/, "").split(":").pop() ?? raw;
      tokens.push({ token: bare, raw });
    }
  }

  return tokens;
}
