import { getSupabaseEnv } from "@/lib/supabase/env";

// The Supabase check must run per request, not be frozen into the build
// output — otherwise the deployed page reports the build machine's config.
export const dynamic = "force-dynamic";

type ConnectionState =
  | { kind: "unconfigured" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

/**
 * Phase 0 smoke check: does this deployment actually reach its Supabase
 * project? Hits the PostgREST root directly — a real network round trip,
 * and it needs no tables, which is the point since the schema is Phase 1.
 *
 * Deliberately not using the supabase-js client here: its session helpers
 * read cookies without contacting the server, so a green light from them
 * would prove nothing about connectivity.
 */
async function checkSupabase(): Promise<ConnectionState> {
  const env = getSupabaseEnv();
  if (!env) return { kind: "unconfigured" };

  try {
    const response = await fetch(`${env.url}/rest/v1/`, {
      headers: { apikey: env.anonKey },
      cache: "no-store",
    });

    if (!response.ok) {
      return { kind: "error", message: `HTTP ${response.status}` };
    }

    return { kind: "ok" };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "שגיאה לא ידועה",
    };
  }
}

const STATUS_TEXT: Record<ConnectionState["kind"], string> = {
  ok: "✅ מחובר ל-Supabase",
  unconfigured: "⚠️ Supabase לא מוגדר — העתיקו את .env.example ל-.env.local",
  error: "❌ החיבור ל-Supabase נכשל",
};

export default async function HomePage() {
  const connection = await checkSupabase();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-4xl font-bold">Handy</h1>
        <p className="mt-2 text-lg text-neutral-600">
          בעל מקצוע אמין ליד הבית, היום.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 p-4">
        <h2 className="font-semibold">מצב התשתית</h2>
        <ul className="mt-2 space-y-1 text-sm text-neutral-700">
          <li>✅ Next.js עולה, Tailwind מרונדר</li>
          <li>✅ עברית ו-RTL — הטקסט הזה מיושר לימין</li>
          <li>{STATUS_TEXT[connection.kind]}</li>
        </ul>
        {connection.kind === "error" && (
          <p className="mt-2 text-sm text-red-700">{connection.message}</p>
        )}
      </div>

      <p className="text-sm text-neutral-500">
        דף זמני של Phase 0. הפיצ&apos;רים המוצריים מתחילים ב-Phase 1 — ראו{" "}
        <code className="rounded bg-neutral-100 px-1">docs/roadmap.md</code>.
      </p>
    </main>
  );
}
