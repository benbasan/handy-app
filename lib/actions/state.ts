import type { SavedPlace } from "@/lib/validation/places";

/**
 * The shapes `useActionState` passes back and forth, and their initial values.
 *
 * They live here rather than beside the actions themselves because a
 * `"use server"` module may only export async functions — a plain constant in
 * one is a build error, since every export becomes a callable server
 * reference. Types alone would have been fine (they are erased), but the empty
 * initial value is a real export and has to sit outside.
 */

export type ProFormState = {
  error?: string;
  /** Keyed by the schema's field name, so a form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
  /** Set by the actions that stay on the page instead of redirecting. */
  saved?: boolean;
};

export const EMPTY_PRO_FORM_STATE: ProFormState = {};

/**
 * What every pro-facing form says when Zod refuses it, before the per-field
 * messages are laid over the top. Here rather than in either action module
 * because the onboarding wizard and the availability screen both use it, and
 * they now live in separate files.
 */
export const INVALID_PRO_FORM: ProFormState = {
  error: "יש למלא את כל השדות המסומנים לפני ההמשך.",
};

export type AdminDecisionState = {
  error?: string;
  /** The pro whose row just changed, so the list can confirm which one. */
  decidedProId?: string;
  decidedStatus?: string;
};

export const EMPTY_ADMIN_DECISION_STATE: AdminDecisionState = {};

export type BidFormState = {
  error?: string;
  /** Keyed by the schema's field name, so a form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
  /** Set by "עדכן הצעה", which stays on the list instead of redirecting. */
  saved?: boolean;
};

export const EMPTY_BID_FORM_STATE: BidFormState = {};

export type SelectBidState = {
  error?: string;
  /** The offer that just won, so the list can confirm which one. */
  selectedBidId?: string;
};

export const EMPTY_SELECT_BID_STATE: SelectBidState = {};

/**
 * The pro's answer to an offer — "אשר וקח את העבודה" or "ויתור".
 *
 * `accepted` rather than a redirect state, because taking a job is the one
 * moment in the product where money is charged: the screen says so before it
 * navigates anywhere.
 */
export type AnswerOfferState = {
  error?: string;
  accepted?: boolean;
  declined?: boolean;
};

export const EMPTY_ANSWER_OFFER_STATE: AnswerOfferState = {};

/** "בטל בחירה" — the customer takes an unanswered offer back. */
export type WithdrawSelectionState = {
  error?: string;
  withdrawn?: boolean;
};

export const EMPTY_WITHDRAW_SELECTION_STATE: WithdrawSelectionState = {};

export type SendMessageState = {
  error?: string;
  sent?: boolean;
};

export const EMPTY_SEND_MESSAGE_STATE: SendMessageState = {};

export type PriceUpdateFormState = {
  error?: string;
  /** Keyed by the schema's field name, so a form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
  /** Set once the request is with the customer — the form collapses on it. */
  sent?: boolean;
};

export const EMPTY_PRICE_UPDATE_FORM_STATE: PriceUpdateFormState = {};

export type PriceDecisionState = {
  error?: string;
  /** 'approved' | 'rejected', so the card can confirm what the customer chose. */
  decision?: string;
};

export const EMPTY_PRICE_DECISION_STATE: PriceDecisionState = {};

export type JobProgressState = {
  error?: string;
  status?: string;
};

export const EMPTY_JOB_PROGRESS_STATE: JobProgressState = {};

export type CompleteJobState = {
  error?: string;
};

export const EMPTY_COMPLETE_JOB_STATE: CompleteJobState = {};

export type ReviewFormState = {
  error?: string;
  /** The stars that were saved, so the form can confirm without a reload. */
  rating?: number;
};

export const EMPTY_REVIEW_FORM_STATE: ReviewFormState = {};

export type SaveProState = {
  error?: string;
  saved?: boolean;
};

export const EMPTY_SAVE_PRO_STATE: SaveProState = {};

export type ResolveDisputeState = {
  error?: string;
  /** Keyed by the schema's field name, so a form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
  /** What the admin decided, so the card can confirm without a reload. */
  decision?: string;
};

export const EMPTY_RESOLVE_DISPUTE_STATE: ResolveDisputeState = {};

export type ProEnforcementActionState = {
  error?: string;
  /** The action that was applied, so the panel can say which. */
  applied?: string;
};

export const EMPTY_PRO_ENFORCEMENT_STATE: ProEnforcementActionState = {};

export type OpenDisputeState = {
  error?: string;
  opened?: boolean;
};

export const EMPTY_OPEN_DISPUTE_STATE: OpenDisputeState = {};

export type SupportTicketState = {
  error?: string;
  /** Keyed by the schema's field name, so a form can sit the message under the right control. */
  fieldErrors?: Record<string, string>;
  sent?: boolean;
};

export const EMPTY_SUPPORT_TICKET_STATE: SupportTicketState = {};

export type ReviewReplyState = {
  error?: string;
  /** The review that was just answered, so the card can confirm without a reload. */
  repliedTo?: string;
};

export const EMPTY_REVIEW_REPLY_STATE: ReviewReplyState = {};

/**
 * כתובות שמורות — the customer's own addresses.
 *
 * `savedPlace` is the whole row the action just wrote, not just its id, because
 * the caller cannot reconstruct it: the address that was stored went through
 * `addressToStore()` and may carry a town the customer did not type, and the
 * point was resolved on the server. A form that guessed at either would put a
 * chip on screen that does not match the row behind it.
 */
export type SavedPlaceState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  savedPlace?: SavedPlace;
  savedPlaceId?: string;
  removed?: boolean;
};

export const EMPTY_SAVED_PLACE_STATE: SavedPlaceState = {};
