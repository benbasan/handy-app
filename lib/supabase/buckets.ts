/**
 * Storage bucket names, in a module that pulls in nothing else.
 *
 * They are needed on both sides — the browser uploads, the server signs — and
 * putting them in a data-access module would drag `next/headers` into the
 * client bundle through a single string constant.
 */
export const JOB_MEDIA_BUCKET = "job-media";

/**
 * Pro verification documents (ת.ז, רישיון, ביטוח) and the profile photo.
 * Private, and unlike job-media it has no shared-visibility path: exactly two
 * readers, the pro who uploaded it and an admin.
 */
export const VERIFICATION_DOCS_BUCKET = "verification-docs";

/**
 * The photo of the fault behind a price change (product-spec.md 3.5). Private,
 * laid out `<pro_id>/<job_id>/<filename>`, and — like verification-docs — with
 * no update and no delete policy: this is the evidence a customer approved a
 * higher price on.
 */
export const PRICE_UPDATE_PHOTOS_BUCKET = "price-update-photos";
