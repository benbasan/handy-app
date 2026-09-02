import { JoinForm } from "@/components/pro/JoinForm";
import { getBrowserMapsKey } from "@/lib/maps/config";
import { listCategories } from "@/lib/supabase/jobs";
import {
  getMyProProfile,
  latestDocByType,
  listMyVerificationDocs,
} from "@/lib/supabase/pros";
import { requireRole } from "@/lib/supabase/session";
import { formatIsraeliMobile } from "@/lib/validation/auth";
import { DEFAULT_SERVICE_RADIUS_KM } from "@/lib/validation/pros";

export const metadata = { title: "פתיחת פרופיל מקצועי — Handy" };

/** design/screens/pro-1.3-signup-verification.png. */
export default async function ProJoinPage() {
  const user = await requireRole("pro");

  const [profile, categories, docs] = await Promise.all([
    getMyProProfile(),
    listCategories(),
    listMyVerificationDocs(),
  ]);

  return (
    <>
      <header className="mb-6 text-center sm:text-start">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          פתיחת פרופיל מקצועי
        </h1>
        <p className="mt-2 text-muted">
          פרופיל מאומת מקבל פי 3 יותר עבודות. האישור נמסר תוך 24 שעות.
        </p>
      </header>

      <JoinForm
        userId={user.id}
        phone={formatIsraeliMobile(user.phone)}
        categories={categories}
        mapsKey={getBrowserMapsKey()}
        defaults={{
          fullName: user.fullName ?? "",
          bio: profile?.bio ?? "",
          categoryIds: profile?.categoryIds ?? [],
          radiusKm: profile?.radiusKm ?? DEFAULT_SERVICE_RADIUS_KM,
          addressText: profile?.serviceAddressText ?? "",
        }}
        existingDocs={new Set(latestDocByType(docs).keys())}
      />
    </>
  );
}
