"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import {
  countProsCovering,
  createJob,
  type CreateJobState,
} from "@/lib/actions/jobs";
import { CategoryIcon } from "@/lib/categories";
import { categoryCopy } from "@/lib/content/categories";
import {
  parseJobDraft,
  readJobDraftRaw,
  releaseJobDraftCache,
  saveJobDraft,
  type JobDraft,
} from "@/lib/jobDraft";
import type { Category } from "@/lib/supabase/jobs";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  PREFERRED_TIMES,
  PREFERRED_TIME_LABEL,
  createJobSchema,
  type PreferredTime,
} from "@/lib/validation/jobs";
import type { UserRole } from "@/lib/validation/auth";
import {
  BUTTON_COMPACT,
  BUTTON_CTA,
  CARD_BASE,
  Card,
  ErrorText,
  INPUT_CLASS,
  SECTION_TITLE,
  SectionCard,
} from "@/components/ui/primitives";
import { AddressField, type AddressValue } from "@/components/ui/AddressField";
import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { CloseIcon } from "@/components/ui/icons";
import type { SavedPlace } from "@/lib/validation/places";
import {
  EMPTY_MEDIA,
  MediaFields,
  uploadPendingMedia,
  type MediaValue,
} from "./MediaFields";

/**
 * Posting a job — design/screens/customer-2.1-post-job.png.
 *
 * The spec (3.2) describes this as a sequence of steps: category → description
 * → media → availability → address → summary → publish. The design lays that
 * same sequence out as one scrolling page with a live summary pinned beside
 * it, which is what is built here: the steps keep their order and their
 * numbers, but nothing is hidden behind a "next" button. On a phone the two
 * columns stack and the summary lands at the end, where the publish button
 * belongs anyway.
 *
 * Everything in this component is a convenience. The authority is
 * `createJob` — it re-validates every field with Zod, resolves the address
 * server-side, and writes `customer_id` from the session.
 *
 * Since Phase 13.7 the form opens for visitors who have not signed in. The
 * phone number is asked for at the one moment it is needed — pressing publish —
 * in a panel over the form, and publishing carries on the moment the code is
 * accepted. Nothing about who may write moved: `createJob` still requires a
 * signed-in customer, and a visitor's photos wait in this tab until they are
 * one (see MediaFields).
 */

const INITIAL: CreateJobState = {};

/**
 * Which numbered step each field belongs to, and the order to look in.
 *
 * The order is the schema's, which is the order the steps are numbered in —
 * so "the first thing wrong" and "the earliest step" are the same answer.
 */
const SECTION_ID = {
  categoryId: "job-step-category",
  description: "job-step-description",
  preferredTime: "job-step-time",
  addressText: "job-step-address",
} as const;

const ERROR_ORDER = Object.keys(SECTION_ID) as (keyof typeof SECTION_ID)[];

/**
 * The same rules `createJob` applies, run in the browser before a visitor is
 * asked for their phone. Asking for a number and then answering "the
 * description is too short" would put the sign-in in front of a form that was
 * never going to publish. Built from the server's schema, so the two cannot
 * disagree about a limit or a message; the id only binds the media rules, which
 * are not part of this check.
 */
const FIELD_CHECK = createJobSchema(
  "00000000-0000-4000-8000-000000000000",
).pick({
  categoryId: true,
  description: true,
  preferredTime: true,
  addressText: true,
});

type Props = {
  /** Null for a visitor who has not signed in yet. */
  userId: string | null;
  categories: Category[];
  mapsKey: string | null;
  /** The customer's own addresses, offered as one tap on the address step. */
  savedPlaces?: readonly SavedPlace[];
  /**
   * The tile the visitor tapped before they got here, already resolved to an
   * id by the page. Seeds step 1 so the same question is not asked twice.
   */
  initialCategoryId?: string | null;
  /** What they typed into the landing page's "מה קרה?" box. */
  initialDescription?: string | null;
  /**
   * The pro whose personal link brought them here (Phase 13.8). The call goes
   * to this pro alone until they pass or the customer opens it to everyone.
   */
  requestedPro?: RequestedPro | null;
  /** Closed-job price ranges by category slug, only where there are enough. */
  priceRanges?: Record<
    string,
    { low: number; high: number; jobsClosed: number }
  >;
  /** The customer's saved pros with a public slug — one tap to send to them. */
  savedPros?: readonly { slug: string; fullName: string | null }[];
};

export type RequestedPro = {
  slug: string;
  fullName: string | null;
  avatarUrl: string | null;
  ratingAvg: number | null;
  jobsCompletedCount: number;
};

/**
 * Restores a draft from this browser before the form mounts.
 *
 * The server has no draft, so it renders the empty form; on the client the
 * snapshot becomes the stored draft and the `key` swaps the form for one
 * seeded from it. That remount happens during hydration, before anybody has
 * typed, which is the only moment it is harmless. A visitor who arrived
 * carrying an intent — a tile or a sentence — gets that intent, not an old
 * draft, because the newer choice is the one they just made.
 */
export function PostJobForm(props: Props) {
  const raw = useSyncExternalStore(subscribeNever, readJobDraftRaw, () => null);
  useEffect(() => releaseJobDraftCache, []);

  const carriesIntent = Boolean(
    props.initialCategoryId || props.initialDescription || props.requestedPro,
  );
  const draft = carriesIntent ? null : parseJobDraft(raw);

  return (
    <PostJobFormBody key={draft ? "draft" : "fresh"} {...props} draft={draft} />
  );
}

function subscribeNever() {
  return () => {};
}

function PostJobFormBody({
  userId: initialUserId,
  categories,
  mapsKey,
  savedPlaces = [],
  initialCategoryId = null,
  initialDescription = null,
  requestedPro = null,
  priceRanges = {},
  savedPros = [],
  draft,
}: Props & { draft: JobDraft | null }) {
  const [state, formAction, pending] = useActionState(createJob, INITIAL);

  /** Becomes a real id the moment a visitor signs in, without a reload. */
  const [userId, setUserId] = useState<string | null>(initialUserId);

  const [categoryId, setCategoryId] = useState<string | null>(
    draft?.categoryId ?? initialCategoryId,
  );
  const [description, setDescription] = useState(
    draft?.description ?? initialDescription?.slice(0, DESCRIPTION_MAX) ?? "",
  );
  const [preferredTime, setPreferredTime] = useState<PreferredTime | null>(
    draft?.preferredTime ?? null,
  );
  const [address, setAddress] = useState<AddressValue>(
    draft?.address ?? { text: "", lat: null, lng: null },
  );
  /**
   * Held locally, and seeded from the server's list, so that an address saved
   * from the field itself becomes a chip immediately. The alternative — waiting
   * for a revalidate — would re-render a half-filled five-step form under
   * somebody who is standing in it.
   */
  const [places, setPlaces] = useState<readonly SavedPlace[]>(savedPlaces);
  const [media, setMedia] = useState<MediaValue>(EMPTY_MEDIA);

  /**
   * How many pros would actually receive this call, at the address currently on
   * screen. `null` while unknown — either nothing has been typed yet or the
   * count could not be taken, and neither is a zero.
   *
   * This used to be answered only on the offers screen, after publishing. On a
   * thin market that is the wrong end: it is most useful while the address is
   * still being typed, which is now the only input that moves it.
   */
  const [prosNearby, setProsNearby] = useState<number | null>(null);

  useEffect(() => {
    const { lat, lng } = address;
    if (lat === null || lng === null) return;

    // The address field resolves a point on every keystroke, so a stale answer
    // can outrun a fresh one. Ignore anything that comes back after the inputs
    // have moved on.
    let current = true;
    void countProsCovering(lat, lng).then((count: number | null) => {
      if (current) setProsNearby(count);
    });

    return () => {
      current = false;
    };
  }, [address]);

  /*
   * Whether there is a point to count around is derived, not stored. Clearing
   * the state from inside the effect would be a synchronous setState in a
   * render pass — and it would also mean the answer to "is this count still
   * about the address on screen?" lived in two places instead of one.
   */
  const hasPoint = address.lat !== null && address.lng !== null;

  // Kept on every change. Only the four typed answers — see lib/jobDraft.ts.
  useEffect(() => {
    saveJobDraft({ categoryId, description, preferredTime, address });
  }, [categoryId, description, preferredTime, address]);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;

  /**
   * Errors found in the browser before asking a visitor for their phone. They
   * sit beside the server's, and the server's win for any field both name —
   * the server is the one that actually refused.
   */
  const [localErrors, setLocalErrors] = useState<
    Record<string, string> | undefined
  >(undefined);
  const fieldErrors = { ...localErrors, ...state.fieldErrors };

  const [signInOpen, setSignInOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  /**
   * Bring somebody back to the step they got wrong.
   *
   * On a phone the two columns stack and the summary card — which is where the
   * generic "יש למלא את כל השדות" lands — sits at the very bottom, below three
   * optional upload tiles. So the form used to answer a failed submit by
   * showing a message at the end of a long page and leaving the red text
   * somewhere above it, unfound. In the schema's own field order, because that
   * is the order the steps are numbered in.
   */
  const formRef = useRef<HTMLFormElement>(null);

  const scrollToFirstError = useCallback(
    (errors: Record<string, string> | undefined) => {
      const firstBadField =
        errors && ERROR_ORDER.find((field) => errors[field]);
      if (!firstBadField) return;

      const section = formRef.current?.querySelector<HTMLElement>(
        `#${SECTION_ID[firstBadField]}`,
      );
      if (!section) return;

      section.scrollIntoView({ behavior: "smooth", block: "center" });

      // Focus what is wrong, not the card around it — but only where there is a
      // real control. Steps 1 and 3 are ARIA radiogroups of buttons, and moving
      // focus onto a button reads as "you pressed this".
      section
        .querySelector<HTMLElement>("textarea, input:not([type=hidden])")
        ?.focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    // `state.fieldErrors` and not the merged `fieldErrors` above: that one is
    // a fresh object on every render, which would make this effect fire on
    // every render and scroll the page out from under somebody who is typing.
    // The state object only changes when the action returns.
    scrollToFirstError(state.fieldErrors);
  }, [state.fieldErrors, scrollToFirstError]);

  /**
   * A visitor pressing publish: check what can be checked here, then ask for
   * the phone. A signed-in customer's submit is never intercepted.
   */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (userId) return;
    event.preventDefault();

    const checked = FIELD_CHECK.safeParse({
      categoryId: categoryId ?? "",
      description,
      preferredTime: preferredTime ?? "",
      addressText: address.text,
    });

    if (!checked.success) {
      const errors: Record<string, string> = {};
      for (const issue of checked.error.issues) {
        errors[String(issue.path[0])] ??= issue.message;
      }
      setLocalErrors(errors);
      scrollToFirstError(errors);
      return;
    }

    setLocalErrors(undefined);
    setPublishError(null);
    setSignInOpen(true);
  }

  /**
   * Signed in from the panel. Upload what was held, then publish on this same
   * screen — `flushSync` so the hidden inputs carry the uploaded paths and the
   * new id before the form is submitted, rather than on the next render.
   */
  const afterSignIn = useCallback(
    async (user: { id: string; role: UserRole }) => {
      if (user.role !== "customer") {
        setSignInOpen(false);
        setPublishError(
          "המספר הזה רשום אצלנו כבעל מקצוע, ולכן אי אפשר לפרסם ממנו קריאה. כדי לפרסם, התחברו עם מספר של לקוח.",
        );
        return;
      }

      let uploaded: MediaValue;
      try {
        uploaded = await uploadPendingMedia(media, user.id);
      } catch {
        setSignInOpen(false);
        setUserId(user.id);
        setPublishError(
          "התחברתם, אבל העלאת הקבצים נכשלה. צרפו אותם שוב ולחצו על פרסום.",
        );
        setMedia((current) => ({ ...current, pending: [] }));
        return;
      }

      flushSync(() => {
        setUserId(user.id);
        setMedia(uploaded);
        setSignInOpen(false);
      });
      formRef.current?.requestSubmit();
    },
    [media],
  );

  const shortBy = DESCRIPTION_MIN - description.trim().length;

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        className="space-y-6"
      >
        <input type="hidden" name="categoryId" value={categoryId ?? ""} />
        <input type="hidden" name="preferredTime" value={preferredTime ?? ""} />
        {requestedPro && (
          <input type="hidden" name="proSlug" value={requestedPro.slug} />
        )}

        {/* Phase 14: a saved pro is one tap from a repeat booking. At the
            top, before anything is typed, because choosing one reloads the
            form around that pro. */}
        {!requestedPro && savedPros.length > 0 && (
          <div className={`${CARD_BASE} p-4`}>
            <p className="text-sm font-semibold text-ink">
              לשלוח ישירות לבעל מקצוע ששמרתם?
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {savedPros.map((pro) => (
                <li key={pro.slug}>
                  <Link
                    href={`/new-request?pro=${encodeURIComponent(pro.slug)}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
                  >
                    {pro.fullName ?? "בעל מקצוע"}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/*
          The pro's personal link (Phase 13.8). Said at the top, because it
          changes what "publish" means: this call goes to one person first.
        */}
        {requestedPro && (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-brand bg-brand-soft p-4">
            {requestedPro.avatarUrl ? (
              // A public-bucket portrait, drawn the way ProCard draws it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={requestedPro.avatarUrl}
                alt=""
                className="size-14 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface font-bold text-brand"
              >
                {(requestedPro.fullName ?? "?").slice(0, 1)}
              </span>
            )}
            <div className="min-w-48 flex-1">
              <p className="font-bold text-ink">
                הקריאה תישלח קודם אל {requestedPro.fullName ?? "בעל המקצוע"}
              </p>
              <p className="mt-1 text-sm text-muted">
                רק בעל המקצוע הזה יראה אותה. אם לא יתאים לו, הקריאה תיפתח לכל
                בעלי המקצוע המאומתים באזור — ואפשר לפתוח אותה בעצמכם בכל רגע.
              </p>
            </div>
            <Link
              href="/new-request"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline underline-offset-2"
            >
              שליחה לכל בעלי המקצוע במקום
            </Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <SectionCard id={SECTION_ID.categoryId} step={1} title="תחום">
              <div
                role="radiogroup"
                aria-label="תחום"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              >
                {categories.map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCategoryId(category.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-bold transition-colors ${
                        selected
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-line bg-surface text-ink hover:border-brand/40"
                      }`}
                    >
                      <CategoryIcon slug={category.slug} className="size-7" />
                      {category.nameHe}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.categoryId && (
                <p className="mt-3">
                  <ErrorText>{fieldErrors.categoryId}</ErrorText>
                </p>
              )}

              {/*
                "מה זה בדרך כלל עולה" (Phase 14) — counted from closed jobs,
                never invented, and silent for a trade without enough of them.
                Most price shock happens before an offer exists; this is the
                cheapest place to take it down.
              */}
              {selectedCategory && priceRanges[selectedCategory.slug] && (
                <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-ink">
                  ב-
                  <span className="ltr-nums">
                    {priceRanges[selectedCategory.slug]!.jobsClosed}
                  </span>{" "}
                  עבודות {selectedCategory.nameHe} שנסגרו ב-Handy, רוב המחירים
                  היו בין{" "}
                  <span className="ltr-nums">
                    {Math.round(priceRanges[selectedCategory.slug]!.low)}
                  </span>{" "}
                  ל-
                  <span className="ltr-nums">
                    {Math.round(priceRanges[selectedCategory.slug]!.high)}
                  </span>{" "}
                  ₪. כל עבודה שונה — ההצעות שתקבלו הן המחיר האמיתי.
                </p>
              )}
            </SectionCard>

            <SectionCard
              id={SECTION_ID.description}
              step={2}
              title="תיאור התקלה"
              hint="ככל שהתיאור מדויק יותר, ההצעות שתקבלו מדויקות יותר."
            >
              <label htmlFor="description" className="sr-only">
                תיאור התקלה
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                required
                maxLength={DESCRIPTION_MAX}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="לדוגמה: נזילה מתחת לכיור במטבח, המים מצטברים על הרצפה מהבוקר"
                minLength={DESCRIPTION_MIN}
                className={INPUT_CLASS}
                aria-describedby="description-length"
              />

              {/*
              The 15-character minimum is enforced by Zod on the server and had
              no hint at all in the browser, so "נזילה בכיור" — eleven
              characters and a perfectly clear sentence — cost a round trip and
              came back as a generic error in a sidebar. Live, and silent once
              it is satisfied: a counter that keeps talking after the rule is
              met is just noise.
            */}
              <p id="description-length" className="mt-2 text-sm text-muted">
                {shortBy > 0
                  ? `עוד ${shortBy} תווים לפחות — כמה מילים על מה קרה ומתי.`
                  : "\u00a0"}
              </p>

              {fieldErrors.description && (
                <p className="mt-2">
                  <ErrorText>{fieldErrors.description}</ErrorText>
                </p>
              )}

              {/*
              The jobs people post most in this trade, as one tap each. They
              were written in Phase 8 for the category pages and never reached
              the one screen where "what do I even write?" is the question.
              A tap puts the words at the start; anything already typed stays.
            */}
              {selectedCategory &&
                categoryCopy(selectedCategory.slug).commonJobs.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-sm text-muted">
                      תקלות נפוצות — לחיצה מוסיפה לתיאור:
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {categoryCopy(selectedCategory.slug).commonJobs.map(
                        (job) => (
                          <li key={job}>
                            <button
                              type="button"
                              onClick={() =>
                                setDescription((current) =>
                                  current.includes(job)
                                    ? current
                                    : current.trim()
                                      ? `${job}. ${current}`.slice(
                                          0,
                                          DESCRIPTION_MAX,
                                        )
                                      : `${job}. `,
                                )
                              }
                              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
                            >
                              {job}
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  צירוף מדיה — לא חובה, אבל משפר את דיוק ההצעות
                </h3>
                <MediaFields
                  userId={userId}
                  value={media}
                  onChange={setMedia}
                />
              </div>
            </SectionCard>

            <div className="grid gap-6 sm:grid-cols-5">
              {/* Two of five columns, matching the design's narrower card. */}
              <div className="sm:col-span-2">
                <SectionCard
                  id={SECTION_ID.preferredTime}
                  step={3}
                  title="מתי נוח לך?"
                >
                  <div
                    role="radiogroup"
                    aria-label="מתי נוח לך"
                    className="space-y-2"
                  >
                    {PREFERRED_TIMES.map((option) => {
                      const selected = option === preferredTime;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setPreferredTime(option)}
                          className={`w-full rounded-xl border px-4 py-3 text-start text-sm font-semibold transition-colors ${
                            selected
                              ? "border-brand bg-brand text-white"
                              : "border-line bg-surface text-ink hover:border-brand/40"
                          }`}
                        >
                          {PREFERRED_TIME_LABEL[option]}
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.preferredTime && (
                    <p className="mt-3">
                      <ErrorText>{fieldErrors.preferredTime}</ErrorText>
                    </p>
                  )}
                </SectionCard>
              </div>

              <div className="sm:col-span-3">
                <SectionCard id={SECTION_ID.addressText} step={4} title="כתובת">
                  <AddressField
                    mapsKey={mapsKey}
                    value={address}
                    onChange={setAddress}
                    error={fieldErrors.addressText}
                    savedPlaces={places}
                    // Saving an address is a write to the customer's own list,
                    // so a visitor with no account is simply not offered it.
                    onSaved={
                      userId
                        ? (place) => setPlaces((current) => [...current, place])
                        : undefined
                    }
                  />

                  {/*
                  The live count, which used to sit under a row of radius chips.
                  The chips went on 11.9.2026: the customer does not know how far
                  a plumber will drive, cannot find out, and a number they
                  guessed was quietly narrowing their own market. Every pro has
                  already answered that question for themselves.

                  The count survived the chips because it answers a question the
                  customer does have — "is anyone even out there?" — and because
                  on launch day, in most towns, the honest answer is none, and
                  finding that out before writing a description is kinder than
                  finding it out after.
                */}
                  {hasPoint && prosNearby !== null && (
                    <p
                      role="status"
                      className={`mt-4 text-sm font-semibold ${
                        prosNearby === 0 ? "text-alert" : "text-muted"
                      }`}
                    >
                      {prosNearby === 0
                        ? "אין כרגע בעל מקצוע מאומת שאזור הפעילות שלו כולל את הכתובת הזו. אפשר לפרסם בכל מקרה — הקריאה תישלח לראשון שיצטרף באזור."
                        : prosNearby === 1
                          ? "בעל מקצוע מאומת אחד מכסה את הכתובת הזו."
                          : `${prosNearby} בעלי מקצוע מאומתים מכסים את הכתובת הזו.`}
                    </p>
                  )}
                </SectionCard>
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <h2 className={SECTION_TITLE}>סיכום הקריאה</h2>

              <dl className="mt-4 divide-y divide-line text-sm">
                <SummaryRow label="תחום" value={selectedCategory?.nameHe} />
                <SummaryRow
                  label="מועד"
                  value={
                    preferredTime ? PREFERRED_TIME_LABEL[preferredTime] : null
                  }
                />
                <SummaryRow label="אזור" value={address.text || null} />
              </dl>

              <p className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted">
                פרסום הקריאה חינם. התשלום מתבצע ישירות לבעל המקצוע בסיום העבודה.
              </p>

              {(state.error || publishError) && (
                <p className="mt-4">
                  <ErrorText>{publishError ?? state.error}</ErrorText>
                </p>
              )}

              {!userId && (
                <p className="mt-4 text-sm text-muted">
                  בלחיצה על פרסום נבקש מספר טלפון — כך בעלי המקצוע יכולים לחזור
                  אליכם. אין סיסמה.
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className={`${BUTTON_CTA} mt-4 w-full`}
              >
                {pending ? "מפרסם…" : "פרסם קריאה"}
              </button>
            </Card>

            <div className="rounded-2xl bg-ink p-5 text-sm text-white/85">
              <h2 className="text-base font-bold text-white">
                מה קורה אחרי הפרסום?
              </h2>
              <ul className="mt-3 space-y-2">
                <li>
                  ·{" "}
                  {requestedPro
                    ? `הקריאה נשלחת רק אל ${requestedPro.fullName ?? "בעל המקצוע שביקשתם"}`
                    : "הקריאה נשלחת לכל בעל מקצוע מאומת שמכסה את הכתובת"}
                </li>
                <li>· ההצעות הראשונות מגיעות תוך דקות</li>
                <li>· אתם בוחרים — ואפשר להתכתב לפני</li>
              </ul>
            </div>
          </aside>
        </div>

        {/*
        The publish button lives in the summary card, which on a phone lands
        after four numbered sections and three upload tiles — the comment at the
        top of this file has admitted that since Phase 2. So below `md` there is
        a second one, pinned, carrying the only two things worth pinning: what is
        being published and the button.

        It appears once a category is chosen rather than immediately, because
        before that there is nothing to publish and a permanently disabled bar is
        just a smaller screen. `pb-24` on the summary card's own container is not
        needed — the bar is `fixed`, and the shell already reserves `pb-28`.
      */}
        {categoryId && (
          <div className="fixed inset-x-0 bottom-16 z-30 animate-enter border-t border-line bg-surface/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">
                  {selectedCategory?.nameHe}
                </p>
                <p className="truncate text-xs text-muted">
                  {address.text || "עוד לא נבחרה כתובת"}
                </p>
              </div>
              <button
                type="submit"
                disabled={pending}
                className={`${BUTTON_CTA} ${BUTTON_COMPACT} shrink-0`}
              >
                {pending ? "מפרסם…" : "פרסם קריאה"}
              </button>
            </div>
          </div>
        )}
      </form>

      {/*
      Outside the <form>, because a sign-in is a form of its own and forms do
      not nest. Over the page rather than instead of it, so everything that
      was just written stays visible behind the question.
    */}
      {signInOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-sign-in-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
        >
          <div className="relative w-full max-w-md animate-enter rounded-t-2xl bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-overlay sm:rounded-2xl">
            <button
              type="button"
              onClick={() => setSignInOpen(false)}
              aria-label="סגירה"
              className="absolute end-3 top-3 inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-canvas"
            >
              <CloseIcon className="size-5" />
            </button>
            <div id="publish-sign-in-title">
              <OtpLoginForm
                role="customer"
                compact
                title="רגע לפני הפרסום"
                subtitle="מספר טלפון וקוד חד-פעמי, והקריאה יוצאת. אין סיסמה ואין טופס הרשמה."
                onSignedIn={afterSignIn}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-end font-bold ${value ? "text-ink" : "text-muted"}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
