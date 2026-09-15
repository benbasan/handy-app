/**
 * Arranging the pro feed (Phase 16) — sort, filter, and the quick bid's price.
 *
 * All of it runs over the rows `open_jobs_for_pro()` already returned, at most
 * a hundred, on purpose: the query and its RLS cost stay exactly what the load
 * check measures (TECHNICAL_DEBT.md #26), and a filter can never widen what a
 * pro is allowed to see — only narrow it.
 */

export const FEED_SORTS = ["new", "near", "few"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const FEED_SORT_LABEL: Record<FeedSort, string> = {
  new: "החדשות",
  near: "הקרובות",
  few: "הכי פחות הצעות",
};

export function isFeedSort(value: string | undefined): value is FeedSort {
  return (
    value !== undefined && (FEED_SORTS as readonly string[]).includes(value)
  );
}

type Arrangeable = {
  id: string;
  categorySlug: string;
  preferredTime: string | null;
  createdAt: string;
  distanceKm: number;
  bidsCount: number;
  requestedForMe: boolean;
};

/**
 * Filter, then sort. A call asked for by name always stays first — it is the
 * one call nobody else can see until this pro answers.
 */
export function arrangeFeed<T extends Arrangeable>(
  jobs: readonly T[],
  options: { sort: FeedSort; category: string | null; urgentOnly: boolean },
): T[] {
  const filtered = jobs.filter(
    (job) =>
      (options.category === null || job.categorySlug === options.category) &&
      (!options.urgentOnly ||
        job.preferredTime === "asap" ||
        job.preferredTime === "today"),
  );

  const byChoice = (a: T, b: T): number => {
    switch (options.sort) {
      case "near":
        return a.distanceKm - b.distanceKm;
      case "few":
        return (
          a.bidsCount - b.bidsCount ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      case "new":
      default:
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
  };

  return [...filtered].sort(
    (a, b) =>
      Number(b.requestedForMe) - Number(a.requestedForMe) || byChoice(a, b),
  );
}

type PastOffer = {
  jobId: string;
  categorySlug: string;
  price: number;
  etaMinutes: number;
  createdAt: string;
};

/**
 * "הצעה מהירה" (Phase 16): this pro's most recent offer in each trade, which
 * is what a quick bid proposes again. Their own number, never a suggested one
 * — a price Handy picked would be a price Handy invented.
 */
export function lastOfferByTrade(
  offers: readonly PastOffer[],
): Map<string, { price: number; etaMinutes: number }> {
  const latest = new Map<string, PastOffer>();
  for (const offer of offers) {
    const current = latest.get(offer.categorySlug);
    if (
      !current ||
      Date.parse(offer.createdAt) > Date.parse(current.createdAt)
    ) {
      latest.set(offer.categorySlug, offer);
    }
  }
  return new Map(
    [...latest].map(([slug, offer]) => [
      slug,
      { price: offer.price, etaMinutes: offer.etaMinutes },
    ]),
  );
}
