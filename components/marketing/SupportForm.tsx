"use client";

import { useActionState, useState } from "react";
import { submitSupportTicket } from "@/lib/actions/support";
import {
  EMPTY_SUPPORT_TICKET_STATE,
  type SupportTicketState,
} from "@/lib/actions/state";
import { BUTTON_CTA, ErrorText, INPUT_CLASS } from "@/components/ui/primitives";
import {
  SUPPORT_TOPICS,
  SUPPORT_TOPIC_LABEL,
  type SupportTopic,
} from "@/lib/validation/support";

/**
 * "פנייה לתמיכה" — design/screens/content-6.4-support-contact.png.
 *
 * The one form in this product that does not need a session. It is also the
 * one that carries no attachments: the mock has a "צרף תמונות או קבלה" drop
 * zone, but product-spec.md 3.8 asks only for a contact form, and an
 * attachment from an unauthenticated stranger is a fourth Storage bucket with
 * an anonymous write policy on it. The job reference field is what actually
 * connects a ticket to a call, and it is already in the design.
 */
export function SupportForm({
  defaultName,
  defaultPhone,
}: {
  defaultName?: string;
  defaultPhone?: string;
}) {
  const [state, action, pending] = useActionState<SupportTicketState, FormData>(
    submitSupportTicket,
    EMPTY_SUPPORT_TICKET_STATE,
  );

  const [topic, setTopic] = useState<SupportTopic>("active_job");
  const fieldErrors = state.fieldErrors ?? {};

  if (state.sent) {
    return (
      <div className="rounded-2xl border border-cta bg-cta/10 p-6 text-center sm:p-8">
        <h2 className="text-xl font-bold text-ink">הפנייה נשלחה</h2>
        <p className="mt-2 text-muted">
          קיבלנו אותה ונחזור אליכם לטלפון שהשארתם. בשעות הפעילות זמן המענה הוא
          כשעה.
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
    >
      <input type="hidden" name="topic" value={topic} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="fullName" className="sr-only">
            שם מלא
          </label>
          <input
            id="fullName"
            name="fullName"
            defaultValue={defaultName}
            placeholder="שם מלא"
            autoComplete="name"
            required
            className={INPUT_CLASS}
          />
          {fieldErrors.fullName && (
            <ErrorText>{fieldErrors.fullName}</ErrorText>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="sr-only">
            טלפון
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            defaultValue={defaultPhone}
            placeholder="טלפון"
            autoComplete="tel"
            required
            className={`${INPUT_CLASS} ltr-nums text-end`}
          />
          {fieldErrors.phone && <ErrorText>{fieldErrors.phone}</ErrorText>}
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">נושא הפנייה</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_TOPICS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={topic === value}
              onClick={() => setTopic(value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                topic === value
                  ? "bg-brand text-white"
                  : "border border-line bg-surface text-ink hover:border-brand hover:text-brand"
              }`}
            >
              {SUPPORT_TOPIC_LABEL[value]}
            </button>
          ))}
        </div>
        {fieldErrors.topic && <ErrorText>{fieldErrors.topic}</ErrorText>}
      </fieldset>

      <div className="mt-3">
        <label htmlFor="jobReference" className="sr-only">
          מספר קריאה
        </label>
        <input
          id="jobReference"
          name="jobReference"
          placeholder="מספר קריאה (אם יש) — למשל H-24817"
          className={INPUT_CLASS}
        />
        {fieldErrors.jobReference && (
          <ErrorText>{fieldErrors.jobReference}</ErrorText>
        )}
      </div>

      <div className="mt-3">
        <label htmlFor="body" className="sr-only">
          מה קרה
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          required
          placeholder="ספר לנו מה קרה"
          className={INPUT_CLASS}
        />
        {fieldErrors.body && <ErrorText>{fieldErrors.body}</ErrorText>}
      </div>

      {state.error && (
        <div className="mt-3">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${BUTTON_CTA} mt-4 w-full`}
      >
        {pending ? "שולח…" : "שלח פנייה"}
      </button>
    </form>
  );
}
