import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסה — Handy" };

export default async function CustomerLoginPage() {
  await redirectIfSignedIn();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center p-6">
      <OtpLoginForm
        role="customer"
        title="כניסה ל-Handy"
        subtitle="הזינו מספר טלפון ונשלח אליכם קוד אימות ב-SMS. אין צורך בסיסמה."
      />
      <p className="mt-8 text-sm text-neutral-600">
        בעל מקצוע?{" "}
        <a href="/pro/login" className="underline underline-offset-2">
          כניסה לאזור בעלי המקצוע
        </a>
      </p>
    </main>
  );
}
