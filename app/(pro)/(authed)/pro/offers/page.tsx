import Link from "next/link";
import { MyBidRow } from "@/components/pro/MyBidRow";
import { BUTTON_PRO, Card } from "@/components/ui/primitives";
import { RealtimeRefresh } from "@/components/ui/RealtimeRefresh";
import { PRO_ROUTES } from "@/lib/routes";
import {
  getMyBidStats,
  listMyBids,
  sweepExpiredBids,
} from "@/lib/supabase/bids";
import { signJobMedia } from "@/lib/supabase/jobs";
import { requireRole } from "@/lib/supabase/session";

export const metadata = { title: "ההצעות שלי — Handy" };

export const dynamic = "force-dynamic";

/** The two tabs above the list, exactly as the design splits them. */
const TABS = {
  pending: "ממתינות",
  settled: "נדחו / פגו",
} as const;

type Tab = keyof typeof TABS;

/**
 * design/screens/pro-2.4-my-bids.png — ההצעות שלי.
 *
 * The subtitle's two numbers are computed, not decorative: acceptance rate out
 * of the offers a customer actually decided on (counting lapsed offers as
 * losses would report a rate for offers nobody read), and median-ish response
 * time measured from when the customer posted — the number the 10-minute tip
 * in product-spec.md 4.3 is about.
 *
 * Realtime on `bids` because the pro is not the only one who changes these
 * rows: the moment a customer picks somebody, every rival offer on that job
 * flips to rejected, and this list has to say so without a reload.
 */
export default async function ProOffersPage({
  searchParams,
}: PageProps<"/pro/offers">) {
  const user = await requireRole("pro");

  // Housekeeping before reading, so a lapsed offer is never listed as live on
  // a stack with no scheduler. The read reports it as expired regardless.
  await sweepExpiredBids();

  const [bids, stats, params] = await Promise.all([
    listMyBids(),
    getMyBidStats(),
    searchParams,
  ]);

  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: Tab = requestedTab === "settled" ? "settled" : "pending";

  const justSent = params.sent === "1";
  const expandBidId = Array.isArray(params.bid) ? params.bid[0] : params.bid;

  const shown = bids.filter((bid) =>
    tab === "pending"
      ? bid.status === "pending" || bid.status === "selected"
      : bid.status === "rejected" || bid.status === "expired",
  );

  const firstPhotos = shown
    .map((bid) => bid.photoPaths[0])
    .filter((path): path is string => Boolean(path));
  const signed = await signJobMedia(firstPhotos);

  return (
    <div className="space-y-6">
      <RealtimeRefresh
        table="bids"
        filter={`pro_id=eq.${user.id}`}
        label="המסך מתעדכן מעצמו כשלקוח מחליט"
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            ההצעות שלי
          </h1>
          <p className="mt-2 text-muted">
            {stats.acceptancePct !== null ? (
              <>
                שיעור קבלה{" "}
                <span className="ltr-nums">{stats.acceptancePct}%</span>
              </>
            ) : (
              "עוד לא הוכרעה אף הצעה"
            )}
            {stats.avgResponseMinutes !== null && (
              <>
                {" · "}זמן תגובה ממוצע{" "}
                <span className="ltr-nums">{stats.avgResponseMinutes}</span>{" "}
                דקות
              </>
            )}
          </p>
        </div>

        <nav aria-label="סינון הצעות" className="flex flex-wrap gap-2">
          {(Object.keys(TABS) as Tab[]).map((option) => (
            <Link
              key={option}
              href={`${PRO_ROUTES.offers}?tab=${option}`}
              aria-current={option === tab ? "true" : undefined}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                option === tab
                  ? "border-pro bg-pro text-white"
                  : "border-line bg-surface text-ink hover:border-pro/40"
              }`}
            >
              {TABS[option]}
            </Link>
          ))}
        </nav>
      </header>

      {justSent && (
        <p
          role="status"
          className="rounded-2xl border border-cta bg-cta/10 p-4 text-sm font-semibold text-cta-strong"
        >
          ✓ ההצעה נשלחה ללקוח. היא תקפה 45 דקות — נעדכן כאן ברגע שתהיה החלטה.
        </p>
      )}

      {shown.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-lg font-bold text-ink">
            {tab === "pending"
              ? "אין לך כרגע הצעות פתוחות"
              : "אין הצעות שנדחו או שפג תוקפן"}
          </p>
          <p className="mt-2 text-muted">
            {tab === "pending"
              ? "הצעה שנשלחת תוך 10 דקות מפרסום הקריאה נבחרת ב-64% מהמקרים."
              : "כל ההצעות שלך עדיין פתוחות או שנבחרו."}
          </p>
          <Link
            href={PRO_ROUTES.jobs}
            className={`${BUTTON_PRO} mt-5 inline-flex`}
          >
            לפיד הקריאות
          </Link>
        </Card>
      ) : (
        <ul className="space-y-4">
          {shown.map((bid) => (
            <MyBidRow
              key={bid.id}
              bid={bid}
              photoUrl={
                bid.photoPaths[0]
                  ? (signed.get(bid.photoPaths[0]) ?? null)
                  : null
              }
              expandedByDefault={bid.id === expandBidId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
