import { CheckIcon } from "@/components/ui/icons";
import { AdminShell } from "@/components/admin/AdminShell";
import { SupportTicketStatusForm } from "@/components/admin/SupportTicketStatusForm";
import {
  Badge,
  Card,
  EmptyState,
  PAGE_LEAD,
  PAGE_TITLE,
  SECTION_TITLE,
} from "@/components/ui/primitives";
import { ADMIN_ROUTES } from "@/lib/routes";
import { listSupportTickets } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/session";
import { formatReceiptDate } from "@/lib/validation/completion";
import {
  SUPPORT_STATUS_LABEL,
  SUPPORT_TOPIC_LABEL,
} from "@/lib/validation/support";

export const metadata = { title: "פניות לתמיכה — Handy Admin" };

export const dynamic = "force-dynamic";

/**
 * The contact form's inbox (Phase 17).
 *
 * `/contact` has written `support_tickets` since Phase 8 and nobody read them:
 * CLAUDE.md section 9 carried "who reads support_tickets" as an open question
 * and the answer was "out of band". The rows come through the admin's own
 * read policy; the one transition is `set_support_ticket_status()`, because no
 * client role holds an UPDATE grant on the table.
 *
 * Answering is by phone — the form collects a number, not an address — so the
 * number is a `tel:` link and the status is the team's note that it was done.
 */
export default async function AdminSupportPage() {
  await requireRole("admin");

  const tickets = await listSupportTickets();
  const open = tickets.filter((ticket) => ticket.status === "open").length;

  return (
    <AdminShell current={ADMIN_ROUTES.support}>
      <div className="space-y-6">
        <header>
          <h1 className={PAGE_TITLE}>פניות לתמיכה</h1>
          <p className={PAGE_LEAD}>
            {open === 0 ? "אין פניות פתוחות" : `${open} פניות פתוחות`} · מטופס
            צור הקשר. חוזרים בטלפון, ומסמנים כאן שטופל.
          </p>
        </header>

        {tickets.length === 0 ? (
          <EmptyState
            icon={CheckIcon}
            title="אין פניות"
            body="פנייה חדשה מטופס צור הקשר תופיע כאן, גם כשנשלחה בלי התחברות."
          />
        ) : (
          <ul className="space-y-4">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className={SECTION_TITLE}>
                        {SUPPORT_TOPIC_LABEL[ticket.topic]}
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        {ticket.fullName} ·{" "}
                        <a
                          href={`tel:${ticket.phone}`}
                          dir="ltr"
                          className="font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          {ticket.phone}
                        </a>
                        {ticket.createdBy ? " · משתמש רשום" : " · לא מחובר"}
                      </p>
                      {ticket.jobReference && (
                        <p className="mt-1 text-sm text-muted">
                          קריאה{" "}
                          <span dir="ltr" className="font-mono">
                            {ticket.jobReference}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        tone={
                          ticket.status === "open"
                            ? "waiting"
                            : ticket.status === "answered"
                              ? "done"
                              : "neutral"
                        }
                      >
                        {SUPPORT_STATUS_LABEL[ticket.status]}
                      </Badge>
                      <span className="text-xs text-muted">
                        {formatReceiptDate(ticket.createdAt)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-line text-ink">
                    {ticket.body}
                  </p>

                  <div className="mt-4 border-t border-line pt-4">
                    <SupportTicketStatusForm
                      ticketId={ticket.id}
                      status={ticket.status}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
