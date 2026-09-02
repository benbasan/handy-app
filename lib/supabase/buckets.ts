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
