import { requireRole } from "@/lib/supabase/session";

/**
 * Everything under this nested group requires a signed-in customer. The login
 * page sits outside it, in `app/(customer)/login`, so the gate cannot lock
 * people out of the door they came in through.
 */
export default async function CustomerAuthedLayout({
  children,
}: LayoutProps<"/">) {
  await requireRole("customer");

  return <>{children}</>;
}
