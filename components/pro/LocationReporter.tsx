"use client";

import { useEffect, useState } from "react";
import { reportJobLocation } from "@/lib/actions/tracking";
import { LOCATION_REPORT_INTERVAL_MS } from "@/lib/validation/tracking";

/**
 * "שידור מיקום חי" — the pro's half of docs/architecture.md section 5.
 *
 * Off by default and switched on by the pro, never started silently: this
 * reads a phone's GPS and shows a stranger where its owner is, which is not
 * something a page should begin doing because it was opened. The switch is
 * also how the pro turns it off between jobs without closing the tab.
 *
 * The reporting rate is one write every LOCATION_REPORT_INTERVAL_MS (15s),
 * which is what the roadmap's "עדכון תדיר סביר, לא מכביד" asks for: the pin
 * moves visibly while the customer watches, and a 40-minute drive costs about
 * 160 upserts of a single row that has no history to grow.
 *
 * `watchPosition` supplies the readings — it is the API that wakes on movement
 * rather than on a timer — but they are *sent* on the interval, so standing at
 * a traffic light costs nothing and a motorway does not flood the action.
 */
export function LocationReporter({
  jobId,
  /** Whether the job is still one a location may be reported for. */
  live,
}: {
  jobId: string;
  live: boolean;
}) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);

  // Checked where the switch is pressed rather than inside the effect: an
  // effect that immediately sets state back is a cascading render, and this is
  // a fact about the browser that does not change while the page is open.
  function toggle() {
    if (sharing) {
      setSharing(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("הדפדפן הזה לא תומך בשיתוף מיקום.");
      return;
    }

    setError(null);
    setSharing(true);
  }

  useEffect(() => {
    if (!sharing || !live || !navigator.geolocation) return;

    // The newest reading, held here rather than sent on arrival: the browser
    // may fire this many times a second in a moving vehicle.
    let latest: GeolocationPosition | null = null;
    let inFlight = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latest = position;
        setError(null);
      },
      (positionError) => {
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "הגישה למיקום נחסמה. אפשר לאשר אותה בהגדרות הדפדפן."
            : "לא הצלחנו לקרוא את המיקום כרגע.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    const send = async () => {
      if (!latest || inFlight) return;
      inFlight = true;

      const { latitude, longitude, accuracy } = latest.coords;

      try {
        const ok = await reportJobLocation({
          jobId,
          lat: latitude,
          lng: longitude,
          accuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        });

        // A rejected ping is not worth an alarm — the next one is fifteen
        // seconds away — but a coordinate the server keeps refusing is, and
        // the message says which of the two the pro is looking at.
        if (ok) setLastSentAt(new Date());
        else setError("המיקום לא התקבל בשרת. ננסה שוב בעוד רגע.");
      } finally {
        inFlight = false;
      }
    };

    void send();
    const timer = setInterval(() => void send(), LOCATION_REPORT_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [sharing, live, jobId]);

  if (!live) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">שידור מיקום ללקוח</h3>
          <p className="mt-1 text-sm text-muted">
            הלקוח רואה איפה אתה ומתי בערך תגיע. אפשר לכבות בכל רגע.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={sharing}
          onClick={toggle}
          className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors ${
            sharing ? "bg-cta" : "bg-line"
          }`}
        >
          <span className="sr-only">
            {sharing ? "הפסקת שידור מיקום" : "התחלת שידור מיקום"}
          </span>
          {/* Logical insets only, so the offset flips with the writing
              direction: the knob has to sit on the trailing edge of the switch
              in Hebrew too (CLAUDE.md section 3). */}
          <span
            aria-hidden
            className={`absolute size-7 rounded-full bg-surface shadow transition-all ${
              sharing ? "end-1" : "start-1"
            }`}
          />
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-sm font-semibold"
      >
        {error ? (
          <span className="text-alert">{error}</span>
        ) : sharing ? (
          <span className="text-cta-strong">
            משדר · עדכון כל{" "}
            <span className="ltr-nums">
              {Math.round(LOCATION_REPORT_INTERVAL_MS / 1000)}
            </span>{" "}
            שניות
            {lastSentAt && (
              <>
                {" · "}נשלח לאחרונה{" "}
                <span className="ltr-nums">
                  {lastSentAt.toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </>
            )}
          </span>
        ) : (
          <span className="text-muted">כבוי — הלקוח לא רואה את מיקומך.</span>
        )}
      </p>
    </div>
  );
}
