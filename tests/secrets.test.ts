import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, codeStrings, read, repoFiles, sourceFiles } from "./repo";

/**
 * "No secrets in code" and "`.env.example` kept in sync" — CLAUDE.md section 3
 * and the Definition of Done in section 7 — checked rather than promised.
 *
 * A secret leaks into a repository the moment somebody pastes a working value
 * to get past an error, and it stays leaked in the history even after it is
 * deleted. This suite is cheap and runs on every `npm run test`, which is the
 * only property that matters for a check like this.
 */

/** Files that may legitimately mention a key by name. */
const DOC_LIKE = [".md", ".example", ".toml"];

function isDocLike(file: string): boolean {
  return DOC_LIKE.some((ext) => file.endsWith(ext)) || file.startsWith("docs/");
}

describe("no secrets in the repository", () => {
  it("no .env file is tracked except .env.example", () => {
    const tracked = repoFiles().filter((file) =>
      /(^|\/)\.env($|\.)/.test(file),
    );

    expect(tracked).toEqual([".env.example"]);
  });

  it("git ignores every other .env variant", () => {
    // Asked of git rather than parsed out of .gitignore, so a rule that is
    // present but shadowed by a later negation still fails here. check-ignore
    // exits 1 — and therefore throws — for a path that is *not* ignored, which
    // is the failure this is looking for.
    const probes = [".env", ".env.local", ".env.production", ".env.test.local"];

    const unignored = probes.filter((probe) => {
      try {
        execFileSync("git", ["check-ignore", "--no-index", "-q", probe], {
          cwd: REPO_ROOT,
          stdio: "ignore",
        });
        return false;
      } catch {
        return true;
      }
    });

    expect(unignored, "a .env file could be committed by accident").toEqual([]);
  });

  /**
   * Shapes, not values. Each of these is a literal that cannot be anything but
   * a credential: a JWT, a Supabase publishable/secret key, a Google API key,
   * a Twilio SID or auth token, a private key block.
   *
   * The local Supabase demo keys are deliberately included in the sweep. They
   * are not secret, but a repository that tolerates one key-shaped literal is
   * a repository where the next one is not noticed.
   */
  const SECRET_SHAPES: ReadonlyArray<{ label: string; test: RegExp }> = [
    { label: "a JWT", test: /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
    {
      label: "a Supabase publishable key",
      test: /^sb_publishable_[A-Za-z0-9_-]{10,}/,
    },
    { label: "a Supabase secret key", test: /^sb_secret_[A-Za-z0-9_-]{10,}/ },
    { label: "a Google API key", test: /^AIza[A-Za-z0-9_-]{20,}/ },
    { label: "a Twilio account SID", test: /^AC[0-9a-f]{32}$/ },
    { label: "a Twilio auth token", test: /^SK[0-9a-f]{32}$/ },
    { label: "a private key block", test: /BEGIN [A-Z ]*PRIVATE KEY/ },
  ];

  const CODE_DIRS = [
    "app",
    "components",
    "lib",
    "e2e",
    "tests",
    "scripts",
    "supabase",
  ] as const;
  const CODE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".sql"] as const;

  it("no key-shaped literal appears in any source file", () => {
    const files = sourceFiles(CODE_DIRS, CODE_EXTENSIONS).filter(
      (file) => !isDocLike(file),
    );

    expect(files.length).toBeGreaterThan(50);

    const hits: string[] = [];

    for (const file of files) {
      const source = read(file);
      const literals = file.endsWith(".sql")
        ? source.split("\n")
        : codeStrings(source);

      for (const literal of literals) {
        for (const { label, test } of SECRET_SHAPES) {
          if (test.test(literal.trim())) {
            hits.push(`${file}: ${label}`);
          }
        }
      }
    }

    expect(hits, "a credential-shaped literal is committed").toEqual([]);
  });

  it("nothing outside .env.example assigns a value to a secret-named variable", () => {
    // `SUPABASE_SERVICE_ROLE_KEY=<something>` in a committed file is the exact
    // mistake this rule exists for, whatever the file's extension.
    // No leading \b: an underscore is a word character, so \bSERVICE_ROLE_KEY
    // would never match inside SUPABASE_SERVICE_ROLE_KEY — the exact name this
    // is looking for.
    // `[^\S\n]` rather than `\s` after the `=`: a documentation block that
    // lists empty variable names one per line would otherwise match the *next*
    // line's name as this line's value.
    const assignment =
      /(SERVICE_ROLE_KEY|AUTH_TOKEN|API_KEY|SECRET_KEY|ANON_KEY|ACCESS_KEY[A-Z_]*)[^\S\n]*=[^\S\n]*["']?[A-Za-z0-9_\-.]{12,}/;

    const hits = repoFiles()
      .filter(
        (file) =>
          file !== ".env.example" &&
          !file.startsWith("design/") &&
          !file.endsWith(".png") &&
          !file.endsWith(".ttf") &&
          !file.endsWith("package-lock.json"),
      )
      .filter((file) => assignment.test(read(file)))
      .map((file) => file);

    expect(hits, "a secret is assigned a value in a tracked file").toEqual([]);
  });
});

describe(".env.example is in step with the code", () => {
  const example = read(".env.example");

  /** Every `VAR=` line in .env.example. */
  const documented = new Set(
    example
      .split("\n")
      .map((line) => /^([A-Z0-9_]+)=/.exec(line.trim())?.[1])
      .filter((name): name is string => Boolean(name)),
  );

  /**
   * Every environment variable the application actually reads.
   *
   * Excluded here: the ones the runtime sets for itself (NODE_ENV, CI, PORT,
   * VERCEL_URL) and the knobs the test harnesses accept (E2E_PORT, and the
   * PERF_* dials on scripts/postgis-load-check.mjs). `.env.example` answers
   * one question — what does a fresh clone have to be told before it can run —
   * and none of these belong in that answer.
   */
  const RUNTIME_PROVIDED = new Set([
    "NODE_ENV",
    "CI",
    "PORT",
    "VERCEL_URL",
    "E2E_PORT",
    "PERF_JOBS",
    "PERF_PROS",
    "PERF_BUDGET_SCALE",
  ]);

  it("documents every variable the code reads", () => {
    const files = sourceFiles(
      ["app", "components", "lib", "e2e", "tests", "scripts"],
      [".ts", ".tsx", ".mjs"],
    );

    const referenced = new Set<string>();

    for (const file of files) {
      for (const match of read(file).matchAll(
        /process\.env\.([A-Z0-9_]+)|process\.env\[["']([A-Z0-9_]+)["']\]/g,
      )) {
        const name = match[1] ?? match[2];
        if (name && !RUNTIME_PROVIDED.has(name)) referenced.add(name);
      }
    }

    expect(referenced.size).toBeGreaterThan(3);

    const missing = [...referenced]
      .filter((name) => !documented.has(name))
      .sort();

    expect(
      missing,
      "read by the code but absent from .env.example — a fresh clone cannot know to set it",
    ).toEqual([]);
  });

  it("carries no value of its own", () => {
    // The template is a list of names. A value here is a leaked secret with
    // extra steps.
    const withValues = example
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z0-9_]+=.+/.test(line));

    expect(withValues).toEqual([]);
  });
});
