import { OtpLoginForm } from "@/components/ui/OtpLoginForm";
import { redirectIfSignedIn } from "@/lib/supabase/session";

export const metadata = { title: "כניסת מנהלים — Handy" };

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  // Where the proxy bounced them from. Handed straight back to the
  // server on submit, which re-checks it against the role that
  // actually signed in — see `postLoginPath` in lib/routes.ts.
  const { next } = await searchParams;
  const nextPath = Array.isArray(next) ? next[0] : next;

  await redirectIfSignedIn(nextPath);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center p-6">
      {/*
        role="customer" is not a typo. Admin is not self-assignable — the
        database whitelist in handle_new_user only honours customer and pro, so
        an unknown number signing in here becomes a customer and gets sent to
        the customer area. This screen is a convenience for existing admins,
        not a way to become one.
      */}
      <OtpLoginForm
        next={nextPath}
        role="customer"
        askForName={false}
        title="כניסת מנהלים"
        subtitle="אזור הניהול פתוח רק למשתמשים שהוגדרו כמנהלים במסד הנתונים."
      />
    </main>
  );
}
