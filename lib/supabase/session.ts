import { cache } from "react";
import { redirect } from "next/navigation";
import { ROLE_HOME, ROLE_LOGIN } from "@/lib/routes";
import { isUserRole, type UserRole } from "@/lib/validation/auth";
import { getSupabaseEnv } from "./env";
import { createClient } from "./server";

/**
 * The data access layer for identity.
 *
 * proxy.ts performs an *optimistic* signed-in check so anonymous visitors are
 * bounced before a page renders, but it never reads a role — Next's own
 * guidance is that proxy runs on prefetches and must not query the database.
 * Role enforcement therefore happens here, close to the data, with RLS as the
 * backstop underneath. See node_modules/next/dist/docs/01-app/02-guides/authentication.md.
 */
export type CurrentUser = {
  id: string;
  phone: string;
  fullName: string | null;
  role: UserRole;
  createdAt: string;
};

/**
 * `cache` deduplicates this within one request, so a layout and the page it
 * wraps can both ask without a second round trip.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // CI builds with no Supabase credentials at all (see .github/workflows), and
  // a public page that merely wants to know whether anyone is signed in should
  // answer "no" rather than crash the render.
  if (!getSupabaseEnv()) return null;

  const supabase = await createClient();

  // getUser, not getSession: this decides access, so the token has to be
  // verified against the auth server rather than trusted from a cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, phone, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // No profile means the sign-up trigger did not complete. Failing closed is
  // the only safe reading: an authenticated user with no role is not a
  // customer by default.
  if (!profile || !isUserRole(profile.role)) return null;

  return {
    id: profile.id,
    phone: profile.phone,
    fullName: profile.full_name,
    role: profile.role,
    createdAt: profile.created_at,
  };
});

/**
 * Gate a route on a role. Anonymous visitors go to that area's login page;
 * a signed-in user in the wrong area is sent to their own home rather than
 * shown a dead end.
 */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect(ROLE_LOGIN[role]);
  if (user.role !== role) redirect(ROLE_HOME[user.role]);

  return user;
}

/** For login pages: someone already signed in has no business seeing a form. */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(ROLE_HOME[user.role]);
}

/**
 * The pro's own verification state, for their account screen. Returns null for
 * anyone who is not a pro — RLS restricts this table to its owner, so a
 * mismatched caller simply sees no row.
 */
export async function getProVerificationStatus(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pro_profiles")
    .select("verification_status")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.verification_status ?? null;
}
