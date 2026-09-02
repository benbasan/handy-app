import { ProShell } from "@/components/pro/ProShell";
import { getMyProProfile } from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";

/**
 * Signed-in pros only. `/pro/login` and the public landing page at `/pro` both
 * sit outside this group, so the gate cannot lock people out of the door they
 * came in through.
 *
 * The profile is read here for the header's availability switch, and `cache`
 * on `getMyProProfile` means the pages below get it without a second round
 * trip.
 */
export default async function ProAuthedLayout({ children }: LayoutProps<"/">) {
  await requireRole("pro");
  const profile = await getMyProProfile();

  return <ProShell profile={profile}>{children}</ProShell>;
}
