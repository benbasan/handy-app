import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסת מנהלים — Handy" };

export default async function AdminLoginPage() {
  await redirectIfSignedIn();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center p-6">
      {/*
        role="customer" is not a typo. Admin is not self-assignable — the
        database whitelist in handle_new_user only honours customer and pro, so
        an unknown number signing in here becomes a customer and gets sent to
        the customer area. This screen is a convenience for existing admins,
        not a way to become one.
      */}
      <OtpLoginForm
        role="customer"
        askForName={false}
        title="כניסת מנהלים"
        subtitle="אזור הניהול פתוח רק למשתמשים שהוגדרו כמנהלים במסד הנתונים."
      />
    </main>
  );
}
