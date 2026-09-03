import { LegalPage } from "@/components/marketing/LegalPage";
import { CANCELLATION } from "@/lib/content/legal";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: CANCELLATION.title,
  description: CANCELLATION.description,
  path: CANCELLATION.path,
});

/** design/screens/content-6.5-terms-privacy.png. */
export default async function CANCELLATIONPage() {
  const user = await getCurrentUser();
  return <LegalPage user={user} document={CANCELLATION} />;
}
