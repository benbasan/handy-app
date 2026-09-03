import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import {
  DRAFT_NOTICE,
  LEGAL_DOCUMENTS,
  type LegalDocument,
} from "@/lib/content/legal";
import type { CurrentUser } from "@/lib/supabase/session";

/**
 * design/screens/content-6.5-terms-privacy.png — the document on the leading
 * side, the three-item switcher on the trailing one.
 *
 * The design puts all three behind one `/terms` URL with a client-side
 * switcher. They are three routes here instead: each is a document somebody
 * links to on its own, and a privacy policy that has no address of its own is
 * a privacy policy nobody can cite.
 */
export function LegalPage({
  user,
  document,
}: {
  user: CurrentUser | null;
  document: LegalDocument;
}) {
  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="space-y-4 lg:order-2">
          <nav className="space-y-2">
            {LEGAL_DOCUMENTS.map((candidate) => {
              const active = candidate.slug === document.slug;
              return (
                <Link
                  key={candidate.slug}
                  href={candidate.path}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-xl px-5 py-3.5 text-base font-bold transition-colors ${
                    active
                      ? "bg-ink text-white"
                      : "border border-line bg-surface text-ink hover:border-brand hover:text-brand"
                  }`}
                >
                  {candidate.title}
                </Link>
              );
            })}
          </nav>

          <p className="px-1 text-sm text-muted">
            עודכן לאחרונה:{" "}
            <span className="ltr-nums">{document.updatedAt}</span>
          </p>

          <p className="rounded-xl border border-alert bg-alert-soft p-4 text-xs leading-relaxed text-ink/80">
            {DRAFT_NOTICE}
          </p>
        </aside>

        <article className="rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:order-1">
          <h1 className="text-3xl font-bold text-ink">{document.title}</h1>

          <div className="mt-6 space-y-6">
            {document.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-bold text-ink">
                  {section.heading}
                </h2>
                {section.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-2 leading-relaxed text-muted"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
