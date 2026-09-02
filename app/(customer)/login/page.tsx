import Link from "next/link";
import { AuthSplitLayout } from "@/components/ui/AuthSplitLayout";
import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסה לחשבון — Handy" };

/** design/screens/customer-1.2-login-otp.png. */
export default async function CustomerLoginPage() {
  await redirectIfSignedIn();

  return (
    <AuthSplitLayout
      headline="כל הקריאות, ההצעות והקבלות שלך במקום אחד"
      points={[
        "מעקב בזמן אמת על כל קריאה פעילה",
        "קבלות דיגיטליות וארכיון עבודות",
        "בעלי מקצוע שמורים להזמנה חוזרת",
      ]}
    >
      <OtpLoginForm
        role="customer"
        title="כניסה לחשבון"
        subtitle="נשלח קוד חד-פעמי ב-SMS. אין סיסמאות ואין צורך להירשם מראש."
      />
      <p className="mt-8 text-sm text-muted">
        בעל מקצוע?{" "}
        <Link href="/pro/login" className="font-semibold text-brand">
          כניסת בעלי מקצוע
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
