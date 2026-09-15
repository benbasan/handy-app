import { Card, SECTION_TITLE } from "@/components/ui/primitives";
import type { PrepList } from "@/lib/content/visitPrep";

/**
 * A short checklist from `lib/content/visitPrep.ts` (Phase 18) — "עד שמגיעים"
 * on an urgent call's offers screen, "להתכונן לביקור" on the tracking screen.
 *
 * `danger` is the emergency line an urgent card ends with. It sits apart from
 * the list, in the alert colour, because it is the one line on the card that
 * says "this is not a job for Handy".
 */
export function PrepCard({
  list,
  danger,
  id,
}: {
  list: PrepList;
  danger?: string;
  id?: string;
}) {
  return (
    <Card>
      <section aria-labelledby={id}>
        <h2 id={id} className={SECTION_TITLE}>
          {list.title}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-ink">
          {list.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-muted">
                ·
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {danger && (
          <p className="mt-4 rounded-xl bg-alert-soft px-4 py-3 text-sm font-semibold text-alert">
            {danger}
          </p>
        )}
      </section>
    </Card>
  );
}
