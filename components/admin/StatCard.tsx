import type { ReactNode } from "react";

/**
 * One of the four cards across the top of
 * design/screens/admin-7.1-overview.png: a quiet label, a large figure, and a
 * one-line footnote that is the whole point of the card — "+12% מאתמול",
 * "יעד: 80%", "דורש טיפול".
 *
 * The footnote carries the tone rather than the figure. A number is not good
 * or bad on its own; what makes 2 calls without offers red is that somebody
 * has to go and do something about it.
 */
const FOOT_TONE = {
  good: "text-cta-strong",
  bad: "text-danger",
  neutral: "text-muted",
} as const;

export function StatCard({
  label,
  value,
  suffix,
  foot,
  tone = "neutral",
}: {
  label: string;
  /** Already formatted — the caller knows whether it is ₪, a percentage or minutes. */
  value: ReactNode;
  suffix?: string;
  foot?: string;
  tone?: keyof typeof FOOT_TONE;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">
        <span className="ltr-nums">{value}</span>
        {suffix ? ` ${suffix}` : ""}
      </p>
      {foot && (
        <p className={`mt-3 text-sm font-semibold ${FOOT_TONE[tone]}`}>
          {foot}
        </p>
      )}
    </div>
  );
}
