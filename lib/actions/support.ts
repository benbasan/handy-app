"use server";

import type { SupportTicketState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/session";
import { supportTicketSchema } from "@/lib/validation/support";

/**
 * "שלח פנייה" — design/screens/content-6.4-support-contact.png.
 *
 * The one write path in this product that does not require a session, which is
 * the whole point of the screen it sits on: somebody whose call went wrong may
 * not be able to sign in, and a support form behind a login is not support.
 *
 * `created_by` is set from the session and never from the form. That is not
 * belt-and-braces — it is the only thing separating an attributed ticket from
 * an impersonated one, and the INSERT policy on `support_tickets` re-checks it
 * in the database for both roles (`created_by = auth.uid()` for a signed-in
 * caller, `created_by is null` for `anon`).
 */
export async function submitSupportTicket(
  _prevState: SupportTicketState,
  formData: FormData,
): Promise<SupportTicketState> {
  const parsed = supportTicketSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    topic: formData.get("topic"),
    jobReference: formData.get("jobReference"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, error: "יש למלא את השדות המסומנים." };
  }

  const user = await getCurrentUser();
  const supabase = await createClient();

  const { error } = await supabase.from("support_tickets").insert({
    created_by: user?.id ?? null,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    topic: parsed.data.topic,
    job_reference: parsed.data.jobReference ?? null,
    body: parsed.data.body,
  });

  if (error) {
    return { error: "שליחת הפנייה נכשלה. נסו שוב, או פנו אלינו בוואטסאפ." };
  }

  return { sent: true };
}
