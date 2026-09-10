import Link from "next/link";
import { AuthSplitLayout } from "@/components/ui/AuthSplitLayout";
import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסת בעלי מקצוע — Handy" };

/** design/screens/pro-1.2-login.png. */
export default async function ProLoginPage({
  searchParams,
}: PageProps<"/pro/login">) {
  // Where the proxy bounced them from. Handed straight back to the
  // server on submit, which re-checks it against the role that
  // actually signed in — see `postLoginPath` in lib/routes.ts.
  const { next } = await searchParams;
  const nextPath = Array.isArray(next) ? next[0] : next;

  await redirectIfSignedIn(nextPath);

  return (
    <AuthSplitLayout
      headline="עבודות אמיתיות, בסביבה שלך"
      points={[
        "35 ₪ לעבודה — רק על עבודה שאישרתם",
        "ללא דמי הרשמה וללא תשלום על הצעות שלא נבחרו",
        "קריאות מהאזור שהגדרתם, ברדיוס שלכם",
      ]}
    >
      <OtpLoginForm
        next={nextPath}
        role="pro"
        title="כניסה לבעלי מקצוע"
        subtitle="נשלח קוד חד-פעמי ב-SMS. אין סיסמאות ואין צורך להירשם מראש."
      />
      <p className="mt-8 text-sm text-muted">
        לקוח?{" "}
        <Link href="/login" className="font-semibold text-brand">
          כניסה לאזור הלקוחות
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
