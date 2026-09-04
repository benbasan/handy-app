"use client";

/**
 * The last resort: the root layout itself threw.
 *
 * `app/error.tsx` covers every segment below the root layout, but not the root
 * layout — so when `app/layout.tsx` fails, this replaces it entirely, `<html>`
 * and `<body>` included. That is also why every rule the rest of the app
 * follows is suspended here:
 *
 *  * **Inline styles, not Tailwind.** `globals.css` is imported by the layout
 *    that just failed. A page whose whole purpose is to render when the layout
 *    did not cannot depend on the layout's stylesheet arriving.
 *  * **A plain font stack, not Heebo.** `--font-heebo` is set on the `<html>`
 *    element this component is replacing.
 *  * **Physical CSS properties.** CLAUDE.md section 3 requires logical
 *    utilities, and that rule is about Tailwind classes that mirror under
 *    `dir`. There are no classes here. `dir="rtl"` is set on the element
 *    below, the text is centred, and the values are symmetric.
 *
 * In practice this page should never be seen — the root layout does no data
 * fetching. It exists because the alternative to it is Next's own untranslated
 * white screen, and this one at least carries the fault number.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f7f9fc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 12px" }}>
            משהו השתבש
          </h1>

          <p style={{ color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 }}>
            אירעה תקלה בטעינת האתר. התקלה נרשמה אצלנו. נסו לרענן, ואם זה חוזר
            פנו לתמיכה.
          </p>

          <button
            type="button"
            onClick={() => retry()}
            style={{
              backgroundColor: "#047857",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "12px 24px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            נסו שוב
          </button>

          {error.digest && (
            <p
              style={{ color: "#64748b", fontSize: "0.875rem", marginTop: 32 }}
            >
              <span>מספר התקלה: </span>
              <span
                dir="ltr"
                style={{ fontFamily: "monospace", color: "#0f172a" }}
              >
                {error.digest}
              </span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
