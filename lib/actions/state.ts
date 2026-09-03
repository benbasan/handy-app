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
