"use client";

import { useMemo, useState } from "react";
import { INPUT_CLASS } from "@/components/ui/primitives";
import type { FaqTopic } from "@/lib/content/help";

/**
 * "במה נעזור?" — the search field, the topic chips and the accordion on
 * design/screens/content-6.3-faq.png.
 *
 * Two decisions worth writing down, both about the fact that this page is
 * indexed:
 *
 *  * Every topic is rendered, always. The design highlights one chip and shows
 *    one section, which reads as a filter; here the chips are anchors that
 *    scroll to their section instead. The same entries are published as
 *    FAQPage structured data beside this component, and a page whose visible
 *    text is a quarter of its structured data is a page arguing with itself.
 *  * Searching hides non-matching entries with `hidden` rather than dropping
 *    them from the tree, so what a crawler receives never depends on state.
 */
export function HelpBrowser({ topics }: { topics: readonly FaqTopic[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim();

  const matches = useMemo(() => {
    if (needle === "") return null;

    const found = new Set<string>();
    for (const topic of topics) {
      for (const entry of topic.entries) {
        if (entry.question.includes(needle) || entry.answer.includes(needle)) {
          found.add(`${topic.id}:${entry.question}`);
        }
      }
    }
    return found;
  }, [needle, topics]);

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <label htmlFor="help-search" className="sr-only">
          חיפוש בשאלות הנפוצות
        </label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חפש שאלה, למשל: ביטול קריאה"
          className={INPUT_CLASS}
        />
      </div>

      <nav className="mt-5 flex flex-wrap justify-center gap-2">
        {topics.map((topic) => (
          <a
            key={topic.id}
            href={`#${topic.id}`}
            className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
          >
            {topic.label}
          </a>
        ))}
      </nav>

      {matches !== null && (
        <p className="mt-5 text-center text-sm text-muted" role="status">
          {matches.size === 0
            ? "לא נמצאה שאלה מתאימה. אפשר לפנות לתמיכה ונענה אישית."
            : `${matches.size} תוצאות מתוך השאלות הנפוצות`}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {topics.map((topic) => {
          const hiddenTopic =
            matches !== null &&
            !topic.entries.some((entry) =>
              matches.has(`${topic.id}:${entry.question}`),
            );

          return (
            <section
              key={topic.id}
              id={topic.id}
              hidden={hiddenTopic}
              className="scroll-mt-24 rounded-2xl border border-line bg-surface"
            >
              <h2 className="border-b border-line px-5 py-4 text-lg font-bold text-ink sm:px-6">
                {topic.label}
              </h2>

              <div>
                {topic.entries.map((entry) => (
                  <details
                    key={entry.question}
                    open={matches !== null}
                    hidden={
                      matches !== null &&
                      !matches.has(`${topic.id}:${entry.question}`)
                    }
                    className="group border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6"
                  >
                    <summary className="cursor-pointer list-none font-bold text-ink group-open:text-brand">
                      {entry.question}
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {entry.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
