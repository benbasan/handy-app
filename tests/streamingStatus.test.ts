import { describe, expect, it } from "vitest";
import { read, repoFiles } from "./repo";

/**
 * A screen that can answer "no such record" does not get a streaming skeleton.
 *
 * The two features collide, quietly, and the collision was shipped: adding
 * `loading.tsx` to the heavy screens (TECHNICAL_DEBT #21) turned three
 * access-control assertions red without leaking a single row. A `loading.tsx`
 * is a Suspense boundary, so the response starts streaming before the page's
 * query resolves; once the headers are out, `notFound()` can no longer set the
 * status, and a refusal that used to be a 404 becomes a 200 carrying the
 * not-found page. Next's own documentation names the trade-off
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md,
 * "Status Codes"): "If you need a 404 status … ensure the resource exists
 * before the response body is streamed."
 *
 * Nothing was ever exposed — RLS returns no row and the page renders the 404 —
 * and Next marks the streamed body `noindex`, so search engines are covered.
 * What was lost is the honest status code, and on `/requests/[jobId]/…` that
 * status is how this repo states, out loud and in a test, that one customer
 * cannot reach another's job.
 *
 * So the rule is a rule rather than a memory. A page that calls `notFound()`
 * keeps its true 404; every other heavy screen keeps its skeleton.
 *
 * **The boundary covers the whole subtree, not just the folder it sits in.**
 * The first version of this audit checked siblings only and passed while
 * `/pro/jobs/[jobId]` was still broken by `/pro/jobs/loading.tsx` one level
 * up. That is the mistake worth encoding: a `loading.tsx` wraps its segment
 * *and every segment below it*, so `admin/loading.tsx` was streaming the job
 * dossier three levels down.
 */
describe("loading.tsx and notFound() are never siblings", () => {
  const loadingFiles = repoFiles().filter(
    (file) => file.startsWith("app/") && file.endsWith("/loading.tsx"),
  );

  it("finds the skeletons at all", () => {
    // Guarding the guard: an empty list would pass by describing nothing.
    expect(loadingFiles.length).toBeGreaterThan(4);
  });

  /** Every page.tsx at or below a segment — what its loading.tsx wraps. */
  function pagesUnder(segment: string): string[] {
    return repoFiles().filter(
      (file) => file.startsWith(`${segment}/`) && file.endsWith("/page.tsx"),
    );
  }

  it("none of them streams a page that can 404", () => {
    const collisions: string[] = [];

    for (const file of loadingFiles) {
      const segment = file.replace(/\/loading\.tsx$/, "");
      for (const page of pagesUnder(segment)) {
        if (/\bnotFound\(\)/.test(read(page))) {
          collisions.push(`  ${file}\n      streams: ${page}`);
        }
      }
    }

    expect(
      collisions,
      `These pages call notFound(), so a loading.tsx beside them turns every
refusal into a 200 with the not-found body — including the ones that say a
customer may not read another customer's job. Either drop the skeleton, or
move the existence check somewhere that runs before the response streams:\n${collisions.join("\n")}`,
    ).toEqual([]);
  });
});
