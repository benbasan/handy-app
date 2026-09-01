import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסת בעלי מקצוע — Handy" };

export default async function ProLoginPage() {
  await redirectIfSignedIn();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center p-6">
      <OtpLoginForm
        role="pro"
        title="כניסה לבעלי מקצוע"
        subtitle="הזינו מספר טלפון ונשלח אליכם קוד אימות ב-SMS. עמלה של 12% רק על עבודה שנסגרה."
      />
      <p className="mt-8 text-sm text-neutral-600">
        לקוח?{" "}
        <a href="/login" className="underline underline-offset-2">
          כניסה לאזור הלקוחות
        </a>
      </p>
    </main>
  );
}
