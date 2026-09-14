"use client";

import { arrivalWindowIcs } from "@/lib/validation/arrivalWindow";
import { BUTTON_COMPACT, BUTTON_QUIET } from "@/components/ui/primitives";

/**
 * "הוסף ליומן" for an agreed arrival window (Phase 13.7).
 *
 * The file is built in the browser from values already on the screen, so there
 * is no route handler to secure and nothing new for anyone to read. Every
 * phone calendar opens a `.ics`; that is the whole integration.
 */
export function AddToCalendar({
  uid,
  start,
  end,
  title,
  location,
}: {
  uid: string;
  start: string;
  end: string;
  title: string;
  location: string;
}) {
  function download() {
    const ics = arrivalWindowIcs({ uid, start, end, title, location });
    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "handy-visit.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Long enough for the download to start on a slow phone.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <button
      type="button"
      onClick={download}
      className={`${BUTTON_QUIET} ${BUTTON_COMPACT} w-full`}
    >
      הוספה ליומן
    </button>
  );
}
