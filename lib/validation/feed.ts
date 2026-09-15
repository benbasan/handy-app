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

/** How many of a pro's own past notes the bid form offers as one-tap chips. */
export const RECENT_NOTES_LIMIT = 4;

/**
 * "הערות שמורות" (Phase 18): the notes this pro actually wrote on their latest
 * offers, newest first, each once. Derived from `my_bids` rather than kept in a
 * table of templates — the notes a pro reuses are the ones they already wrote,
 * and a second place to maintain them would drift from the first.
 *
 * Whitespace-only notes are skipped, and two notes that differ only in spacing
 * count as one.
 */
export function recentNotes(
  offers: readonly { note: string | null; createdAt: string }[],
  limit = RECENT_NOTES_LIMIT,
): string[] {
  const seen = new Set<string>();
  const notes: string[] = [];
  const newestFirst = [...offers].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  for (const offer of newestFirst) {
    const note = offer.note?.trim().replace(/\s+/g, " ");
    if (!note || seen.has(note)) continue;
    seen.add(note);
    notes.push(note);
    if (notes.length === limit) break;
  }
  return notes;
}

/** The fewest lost offers a trade needs before the coach says anything about it. */
export const COACH_MIN_SAMPLE = 3;

type DecidedOffer = {
  categoryName: string;
  price: number;
  status: string;
  /** The price that won — set only on an offer this pro lost. */
  winningPrice: number | null;
};

/**
 * "מאמן תמחור" (Phase 16): in each trade, how far this pro's lost offers sat
 * from the offer the customer chose instead. Measured only on calls the pro
 * lost, against the price that actually won on that same call — so it compares
 * like with like, and never guesses at a market price nobody offered.
 *
 * Silent below `COACH_MIN_SAMPLE` lost offers in a trade: one lost job is one
 * customer's choice, not a pattern worth a percentage.
 */
export function pricingCoach(
  offers: readonly DecidedOffer[],
): { categoryName: string; samples: number; pctAboveWinner: number }[] {
  const byTrade = new Map<string, number[]>();
  for (const offer of offers) {
    if (offer.status !== "rejected" || !offer.winningPrice) continue;
    const gaps = byTrade.get(offer.categoryName) ?? [];
    gaps.push((offer.price - offer.winningPrice) / offer.winningPrice);
    byTrade.set(offer.categoryName, gaps);
  }

  return [...byTrade]
    .filter(([, gaps]) => gaps.length >= COACH_MIN_SAMPLE)
    .map(([categoryName, gaps]) => ({
      categoryName,
      samples: gaps.length,
      pctAboveWinner: Math.round(
        (gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 100,
      ),
    }))
    .sort((a, b) => Math.abs(b.pctAboveWinner) - Math.abs(a.pctAboveWinner));
}
