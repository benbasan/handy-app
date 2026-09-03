import { getSupabaseEnv } from "./env";

/**
 * Storage bucket names, in a module that pulls in nothing but the environment.
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

/**
 * The pro's published portrait and work gallery (Phase 8). The one **public**
 * bucket in the project: the public profile is read by people with no account,
 * and a signed URL is minted under a reader's RLS — there is no reader to sign
 * for. Everything in here is content a pro chose to publish; their identity
 * documents stay in the private `verification-docs` bucket.
 */
export const PRO_MEDIA_BUCKET = "pro-media";

/**
 * The public URL of an object in `pro-media`. A plain string join, because the
 * bucket is public — the one public bucket in the project. A customer
 * comparing pros before they have an account cannot be handed a signed URL:
 * signing runs under a reader's RLS, and there is no reader.
 *
 * It lives here rather than beside the rest of the public read layer so that a
 * Client Component can call it: lib/supabase/publicProfiles.ts reaches for
 * `next/headers`, and this needs nothing but `NEXT_PUBLIC_SUPABASE_URL`.
 */
export function proMediaUrl(path: string | null): string | null {
  if (!path) return null;
  const env = getSupabaseEnv();
  if (!env) return null;
  return `${env.url}/storage/v1/object/public/${PRO_MEDIA_BUCKET}/${path}`;
}
