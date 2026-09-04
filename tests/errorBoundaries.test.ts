import { describe, expect, it } from "vitest";
import { read, repoFiles, sourceFiles } from "./repo";

/**
 * The rules that stop a failure from becoming invisible again.
 *
 * All three were true of this repository for nine phases and cost nothing
 * until something broke, which is exactly the shape of rule that belongs here
 * rather than in a document: stated once, obeyed while somebody remembers, and
 * quietly dropped by the next person adding a server action.
 */

/** The Hebrew message a server action returns is the user's half of a failure. */
const ERROR_BRANCH =
  /\bif \((?:!?[A-Za-z]*[eE]rror\b|[A-Za-z]*[eE]rror\.code\b)/;

/*
 * No trailing `(`: where a branch picks between the two loggers, it names one
 * without calling it — `const record = expected ? logExpectedRefusal :
 * logServerError` — and requiring the parenthesis reported both of those as
 * silent when they are not. The import block is far above any branch window,
 * so a bare name cannot match by accident.
 */
const LOG_CALL = /\blog(?:ServerError|ExpectedRefusal)\b/;

describe("every server action reports the cause of a failed write", () => {
  const actionModules = sourceFiles(["lib/actions"], [".ts"]);

  it("finds the action modules at all", () => {
    // A rename that empties the list would otherwise make every assertion
    // below pass by describing nothing.
    expect(actionModules.length).toBeGreaterThan(10);
  });

  it.each(actionModules)("%s", (file) => {
    const lines = read(file).split("\n");
    const unlogged: string[] = [];

    lines.forEach((line, index) => {
      if (!ERROR_BRANCH.test(line)) return;
      // `parsed.error` is Zod's — the client sent something malformed, which
      // the field messages already explain and no log needs to repeat.
      if (line.includes("parsed.error")) return;

      // The branch body, generously bounded: a window rather than a brace
      // parser, sized so that a long comment between the `if` and the call
      // does not read as a missing call.
      const body = lines.slice(index, index + 14).join("\n");
      if (!LOG_CALL.test(body)) {
        unlogged.push(`  ${file}:${index + 1}  ${line.trim()}`);
      }
    });

    expect(
      unlogged,
      `A failed write here returns Hebrew and records nothing. Every rule in
this product is enforced in the database (CLAUDE.md section 3), so the refusal
arrives with a Postgres code saying exactly what happened — and discarding it
leaves a user's report with nothing behind it. Call logServerError, or
logExpectedRefusal where the refusal is the product working:\n${unlogged.join("\n")}`,
    ).toEqual([]);
  });
});

describe("uncaught errors reach a person and a log", () => {
  it("has a boundary above every route group", () => {
    // `app/error.tsx` does not wrap the layout beside it, only the segments
    // below — so a boundary inside `(pro)/(authed)` would miss the very
    // `requireRole()` layout most likely to throw. The root is the only
    // placement that covers all four groups' gates.
    expect(repoFiles()).toContain("app/error.tsx");
    expect(repoFiles()).toContain("app/global-error.tsx");
  });

  it("uses the prop Next 16 actually passes", () => {
    // Renamed from `reset` in Next 16. The old name still typechecks as an
    // unused prop, and the retry button simply does nothing — a dead control
    // on the page somebody reached because something was already wrong.
    for (const file of ["app/error.tsx", "app/global-error.tsx"]) {
      const source = read(file);
      expect(source, `${file} must be a Client Component`).toMatch(
        /^"use client";/,
      );
      expect(source, `${file} must take Next 16's retry prop`).toMatch(
        /\bretry: \(\) => void/,
      );
      expect(source, `${file} must not use Next 15's reset prop`).not.toMatch(
        /\breset: \(\) => void/,
      );
    }
  });

  it("shows the digest, which is the only thing both halves share", () => {
    // In production Next replaces a server error's message before it reaches
    // the browser. The digest is what lets a person read a number off the
    // screen and somebody else find the line instrumentation.ts wrote.
    for (const file of ["app/error.tsx", "app/global-error.tsx"]) {
      expect(read(file), `${file} must surface error.digest`).toMatch(
        /error\.digest/,
      );
    }
    expect(read("instrumentation.ts")).toMatch(/digest/);
    expect(read("instrumentation.ts")).toMatch(/onRequestError/);
  });
});
