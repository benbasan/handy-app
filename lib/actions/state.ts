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
