import { LegalPage } from "@/components/marketing/LegalPage";
import { TERMS } from "@/lib/content/legal";
import { pageMetadata } from "@/lib/seo";
import { getCurrentUser } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: TERMS.title,
  description: TERMS.description,
  path: TERMS.path,
});

/** design/screens/content-6.5-terms-privacy.png. */
export default async function TERMSPage() {
  const user = await getCurrentUser();
  return <LegalPage user={user} document={TERMS} />;
}
