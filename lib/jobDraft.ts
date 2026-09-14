/**
 * The half-written call, kept in this browser (Phase 13.7).
 *
 * Opening the posting form to visitors who have not signed in moved the phone
 * number to the very end — which is exactly where a refresh, a closed tab or a
 * detour to find the building's entrance code used to cost somebody a whole
 * description. So the four typed answers are kept in `localStorage`. Media is
 * not: a `File` cannot be serialised, and a photo is one tap to retake.
 *
 * Per-browser and best-effort by design. Every read and write is wrapped,
 * because storage can be blocked, full, or absent in a private window, and the
 * form has to work identically without it.
 */

import { PREFERRED_TIMES, type PreferredTime } from "@/lib/validation/jobs";

const KEY = "handy:job-draft:v1";

export type JobDraft = {
  categoryId: string | null;
  description: string;
  preferredTime: PreferredTime | null;
  address: { text: string; lat: number | null; lng: number | null };
};

/**
 * Read once per mount and held, so `useSyncExternalStore` sees a stable value
 * while somebody types — re-reading storage on every render would change the
 * snapshot on the first keystroke and remount the form under them.
 */
let cached: string | null | undefined;

export function readJobDraftRaw(): string | null {
  if (cached === undefined) {
    try {
      cached = window.localStorage.getItem(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Forget the held value, so the next mount reads storage afresh. */
export function releaseJobDraftCache(): void {
  cached = undefined;
}

export function parseJobDraft(raw: string | null): JobDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<JobDraft>;
    if (typeof value !== "object" || value === null) return null;
    return {
      categoryId:
        typeof value.categoryId === "string" ? value.categoryId : null,
      description:
        typeof value.description === "string" ? value.description : "",
      // A stored value is a string somebody else's build may have written.
      preferredTime:
        PREFERRED_TIMES.find((t) => t === value.preferredTime) ?? null,
      address: {
        text: typeof value.address?.text === "string" ? value.address.text : "",
        lat: typeof value.address?.lat === "number" ? value.address.lat : null,
        lng: typeof value.address?.lng === "number" ? value.address.lng : null,
      },
    };
  } catch {
    return null;
  }
}

export function saveJobDraft(draft: JobDraft): void {
  try {
    const empty =
      !draft.categoryId &&
      !draft.description.trim() &&
      !draft.preferredTime &&
      !draft.address.text.trim();
    if (empty) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked or full. The form carries on; only a refresh would lose.
  }
}

export function clearJobDraft(): void {
  cached = undefined;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage was never reachable.
  }
}
