import { LegalPage } from "@/components/marketing/LegalPage";
import { PRIVACY } from "@/lib/content/legal";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: PRIVACY.title,
  description: PRIVACY.description,
  path: PRIVACY.path,
});

/** design/screens/content-6.5-terms-privacy.png. */
export default async function PRIVACYPage() {
  const user = await getCurrentUser();
  return <LegalPage user={user} document={PRIVACY} />;
}
