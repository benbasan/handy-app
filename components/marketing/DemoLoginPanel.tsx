"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ErrorText } from "@/components/ui/primitives";
import { leaveDemoSession, signInAsDemoUser } from "@/lib/actions/demo";
import { DEMO_USER_KEYS, DEMO_USERS, type DemoUserKey } from "@/lib/demo";
import {
  formatIsraeliMobile,
  normalizeIsraeliMobile,
} from "@/lib/validation/auth";

/**
 * "כניסה מהירה לדמו" — four buttons that sign straight in as the seeded users.
 *
 * Rendered only where `demoLoginsEnabled()` says so, and the server action
 * checks the same flag again before it does anything; see lib/demo.ts for why
 * hiding this is not a gate.
 *
 * It is drawn to be unmistakable. Amber, dashed, and it says on itself that it
 * is not part of the product — because the one thing worse than a demo shortcut
 * on a landing page is a demo shortcut that reads like a feature.
 *
 * The container is not `CARD_BASE`. That constant carries `border border-line`,
 * and a `border-alert` beside it is the same property at the same specificity:
 * which one wins depends on the order Tailwind emits its stylesheet in, not on
 * the order of the class string. This is genuinely not a card in the design
 * system either — nothing in design/screens/ contains it.
 */

const CONTAINER =
  "rounded-2xl border border-dashed border-alert bg-alert/10 p-4 sm:p-5";

/**
 * One demo user's button.
 *
 * Its own component so it can read `useFormStatus()`, which only reports for a
 * form above it in the tree. `data` is the FormData being submitted, so
 * comparing its `user` field to this key is what makes only the pressed button
 * say "מתחבר…" while all four share one action state.
 */
function DemoButton({
  demoKey,
  isCurrent,
}: {
  demoKey: DemoUserKey;
  isCurrent: boolean;
}) {
  const { pending, data } = useFormStatus();
  const demo = DEMO_USERS[demoKey];
  const thisOne = pending && data?.get("user") === demoKey;

  return (
    <button
      type="submit"
      name="user"
      value={demoKey}
      // The account already in use is disabled rather than left to fail: asking
      // for a second code for the same number inside a minute is refused by
      // `[auth.sms] max_frequency`, and it is the likeliest wasted click.
      disabled={pending || isCurrent}
      className="flex flex-col items-start gap-1 rounded-xl border border-line bg-surface p-3 text-start transition-colors hover:border-alert disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="font-bold text-ink">
        {demo.name}
        {isCurrent && (
          <span className="ms-2 text-xs font-semibold text-cta-strong">
            מחובר/ת
          </span>
        )}
        {thisOne && (
          <span className="ms-2 text-xs font-semibold text-alert-strong">
            מתחבר…
          </span>
        )}
      </span>

      <span className="text-xs text-muted">{demo.note}</span>

      {/* Its own line, `dir="ltr"`: a Latin run inside a Hebrew block reorders
          unpredictably when it shares a line with anything (CLAUDE.md 3). */}
      <span dir="ltr" className="font-mono text-xs text-muted">
        {formatIsraeliMobile(normalizeIsraeliMobile(demo.phone) ?? demo.phone)}
      </span>
    </button>
  );
}

export function DemoLoginPanel({
  currentKey,
  currentName,
}: {
  /** Which demo user is signed in now, if any — from `demoKeyForPhone`. */
  currentKey: DemoUserKey | null;
  /** The signed-in person's name, demo user or not. */
  currentName?: string | null;
}) {
  const [state, formAction] = useActionState(signInAsDemoUser, {});

  return (
    <section
      className={`${CONTAINER} mb-10`}
      aria-labelledby="demo-panel-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="demo-panel-title" className="font-bold text-alert-strong">
          מצב דמו — כניסה מהירה
        </h2>

        <span dir="ltr" className="font-mono text-xs text-muted">
          NEXT_PUBLIC_DEMO_LOGINS=1
        </span>
      </div>

      <p className="mt-1 text-sm text-muted">
        כפתורים אלה אינם חלק מהמוצר. הם קיימים כדי להחליף משתמש בזמן הדגמה,
        ומשתמשים בחשבונות הזרועים בלבד.
      </p>

      {currentName && (
        <p className="mt-2 text-sm text-ink">מחובר/ת כעת: {currentName}</p>
      )}

      <form action={formAction}>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_USER_KEYS.map((key) => (
            <li key={key} className="contents">
              <DemoButton demoKey={key} isCurrent={key === currentKey} />
            </li>
          ))}
        </ul>
      </form>

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}

      {currentName && (
        <form action={leaveDemoSession} className="mt-3">
          <button
            type="submit"
            className="text-sm font-semibold text-alert-strong underline underline-offset-4"
          >
            חזרה לתצוגת אורח
          </button>
        </form>
      )}
    </section>
  );
}
