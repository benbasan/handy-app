import { getBrowserMapsKey } from "@/lib/maps/config";
import { haversineKm } from "@/lib/maps/geocode";
import type { JobLocation } from "@/lib/supabase/tracking";
import { isLocationFresh, sinceLabel } from "@/lib/validation/tracking";

/**
 * The big hatched panel at the top of both tracking screens —
 * design/screens/customer-3.1-tracking-chat.png ("live map · handyman en
 * route") and pro-3.1-manage-job-price-update.png ("route map · 1.2 km").
 *
 * With a Maps key it is a real embedded map centred on the pro's last reported
 * position. With none it keeps the design's hatched placeholder and says so —
 * and, importantly, still prints the two things that carry the meaning: how
 * far away the pro is and how long ago they were last heard from. Both are
 * computed from real data either way, which is the same stance the offers
 * screen took on its "N בעלי מקצוע ברדיוס X" count in Phase 4.
 *
 * A position nobody has refreshed for five minutes is drawn as stale rather
 * than as current: it is a place somebody was, and the customer has no way to
 * tell the difference from the screen.
 */
export function LiveMap({
  location,
  destination,
  caption,
}: {
  location: JobLocation | null;
  /** The job's address — the far end of the journey. */
  destination: { lat: number; lng: number } | null;
  caption: string;
}) {
  const mapsKey = getBrowserMapsKey();
  const fresh = location ? isLocationFresh(location.updatedAt) : false;

  const distanceKm =
    location && destination
      ? haversineKm(
          { lat: location.latitude, lng: location.longitude },
          destination,
        )
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {mapsKey && location ? (
        <iframe
          title={caption}
          loading="lazy"
          className="h-72 w-full border-0 sm:h-96"
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${location.latitude},${location.longitude}&zoom=14&language=he&region=IL`}
        />
      ) : (
        <div
          className="flex h-72 flex-col items-center justify-center gap-3 p-6 text-center sm:h-96"
          style={{
            // The design's hatched placeholder, kept rather than replaced by a
            // grey box: this panel is a map-shaped hole, and it should look
            // like one.
            backgroundImage:
              "repeating-linear-gradient(45deg, #eef2f7 0 10px, #f7f9fc 10px 20px)",
          }}
        >
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white"
          >
            H
          </span>
          <p className="font-semibold text-ink">{caption}</p>
          <p className="max-w-sm text-xs text-muted">
            {location
              ? "המפה תוצג כשיוגדר מפתח Google Maps. המרחק והזמן שמתחת מחושבים מהמיקום שדווח בפועל."
              : "בעל המקצוע עוד לא שידר מיקום. ברגע שיצא לדרך, המיקום יופיע כאן מעצמו."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm">
        {location ? (
          <>
            <p className={fresh ? "text-ink" : "text-muted"}>
              <span
                aria-hidden
                className={`me-2 inline-block size-2 rounded-full align-middle ${
                  fresh ? "bg-cta" : "bg-muted"
                }`}
              />
              {fresh ? "מיקום חי" : "המיקום אינו עדכני"} · עודכן{" "}
              {sinceLabel(location.updatedAt)}
            </p>

            <p className="text-muted">
              {distanceKm !== null && (
                <>
                  מרחק{" "}
                  <span className="ltr-nums font-semibold text-ink">
                    {distanceKm < 1
                      ? `${Math.round(distanceKm * 1000)} מ׳`
                      : `${distanceKm.toFixed(1)} ק״מ`}
                  </span>
                </>
              )}
              {location.etaMinutes !== null && (
                <>
                  {distanceKm !== null ? " · " : ""}הגעה משוערת{" "}
                  <span className="ltr-nums font-semibold text-ink">
                    {location.etaMinutes}
                  </span>{" "}
                  דק׳
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-muted">אין עדיין מיקום מדווח לקריאה הזו.</p>
        )}
      </div>
    </div>
  );
}
