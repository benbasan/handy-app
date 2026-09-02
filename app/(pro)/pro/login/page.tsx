import Link from "next/link";
import { AuthSplitLayout } from "@/components/ui/AuthSplitLayout";
import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסת בעלי מקצוע — Handy" };

/** design/screens/pro-1.2-login.png. */
export default async function ProLoginPage() {
  await redirectIfSignedIn();

  return (
    <AuthSplitLayout
      headline="עבודות אמיתיות, בסביבה שלך"
      points={[
        "עמלה של 12% — רק על עבודה שנסגרה",
        "ללא דמי הרשמה וללא תשלום על הצעות שלא נבחרו",
        "קריאות מהאזור שהגדרתם, ברדיוס שלכם",
      ]}
    >
      <OtpLoginForm
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
