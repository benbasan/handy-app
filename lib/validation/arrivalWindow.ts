import type { PreferredTime } from "@/lib/validation/jobs";

/**
 * The hours a pro commits to arriving within (Phase 13.7).
 *
 * Until this existed, an offer carried `eta_minutes` and nothing else — which
 * is an answer to "how soon", and a call for tomorrow is not asking that. The
 * customer chose a pro and still did not know when to be home.
 *
 * The database is the authority on the rules that are rules
 * (`bids_check_arrival_window`): required for today and tomorrow, at most four
 * hours wide, never in the past. This module is the rest — which days a form
 * offers, which two-hour slots are still open, and how a window is said in
 * Hebrew. Everything is in Israel time, computed with `Intl` rather than the
 * server's own zone, because Vercel runs in UTC and a pro in Haifa does not.
 */

export const ISRAEL_TZ = "Asia/Jerusalem";

/** The start hours of the two-hour slots the form offers. */
export const ARRIVAL_SLOT_HOURS = [8, 10, 12, 14, 16, 18] as const;
export const ARRIVAL_SLOT_WIDTH_HOURS = 2;

/** Decided with the user on 14.9.2026. Mirrors the trigger. */
export const WINDOW_REQUIRED_FOR: readonly PreferredTime[] = [
  "today",
  "tomorrow",
];

export function windowRequired(preferredTime: string | null): boolean {
  return (WINDOW_REQUIRED_FOR as readonly string[]).includes(
    preferredTime ?? "",
  );
}

/** Whether the form should offer a window at all. `asap` keeps its ETA chips. */
export function windowOffered(preferredTime: string | null): boolean {
  return preferredTime !== null && preferredTime !== "asap";
}

type Parts = { year: number; month: number; day: number; hour: number };

function israelParts(instant: Date): Parts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

/** "2026-09-15" — the calendar day in Israel that this instant falls on. */
export function israelDayKey(instant: Date = new Date()): string {
  const { year, month, day } = israelParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Calendar arithmetic on a day key, which has no time zone to trip over. */
export function addDays(dayKey: string, days: number): string {
  const [, y, m, d] = DAY_KEY.exec(dayKey)!.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Minutes Israel is ahead of UTC at this instant: 120 in winter, 180 in summer. */
function israelOffsetMinutes(instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * The instant that is `hour`:00 on `dayKey` in Israel.
 *
 * Guess as if the wall clock were UTC, then correct by the offset at the
 * guess — twice, because a guess on the wrong side of a daylight-saving change
 * reads the wrong offset the first time.
 */
export function israelInstant(dayKey: string, hour: number): Date {
  const [, y, m, d] = DAY_KEY.exec(dayKey)!.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(y, m - 1, d, hour);
  let instant = wall - israelOffsetMinutes(new Date(wall)) * 60_000;
  instant = wall - israelOffsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant);
}

/** The window a (day, slot) pair from the form stands for. */
export function slotWindow(
  dayKey: string,
  hour: number,
): { start: Date; end: Date } {
  const start = israelInstant(dayKey, hour);
  const end = new Date(start.getTime() + ARRIVAL_SLOT_WIDTH_HOURS * 3_600_000);
  return { start, end };
}

/**
 * The days a pro may offer for this call. A call for today also takes
 * tomorrow, because a call posted at nine in the evening has no slot left
 * today and must still be answerable.
 */
export function windowDayOptions(
  preferredTime: string | null,
  now: Date = new Date(),
): string[] {
  const today = israelDayKey(now);
  switch (preferredTime) {
    case "today":
      return [today, addDays(today, 1)];
    case "tomorrow":
      return [addDays(today, 1)];
    case "this_week":
    case "flexible":
      return Array.from({ length: 7 }, (_, index) => addDays(today, index));
    default:
      return [];
  }
}

/** The slots on this day whose end has not already passed. */
export function openSlots(dayKey: string, now: Date = new Date()): number[] {
  return ARRIVAL_SLOT_HOURS.filter(
    (hour) => slotWindow(dayKey, hour).end.getTime() > now.getTime(),
  );
}

const WEEKDAY = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "היום", "מחר", or "יום שלישי 16.9". */
export function dayLabel(dayKey: string, now: Date = new Date()): string {
  const today = israelDayKey(now);
  if (dayKey === today) return "היום";
  if (dayKey === addDays(today, 1)) return "מחר";
  const [, , m, d] = DAY_KEY.exec(dayKey)!.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return `יום ${WEEKDAY[weekday]} ${d}.${m}`;
}

function clock(instant: Date): string {
  const { hour } = israelParts(instant);
  const minutes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ISRAEL_TZ,
    minute: "2-digit",
  }).format(instant);
  return `${String(hour).padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

/** "16:00–18:00" — the hours alone, always in Israel time. */
export function windowHours(start: string | Date, end: string | Date): string {
  return `${clock(new Date(start))}–${clock(new Date(end))}`;
}

/**
 * The two halves of a window as separate strings, so a screen can put the day
 * (Hebrew) and the hours (digits) in their own runs — CLAUDE.md section 3 on
 * keeping a bidi line to one fact.
 */
export function describeWindow(
  start: string,
  end: string,
  now: Date = new Date(),
): { day: string; hours: string } {
  return {
    day: dayLabel(israelDayKey(new Date(start)), now),
    hours: windowHours(start, end),
  };
}

/** A calendar file for one window, so "הוסף ליומן" needs no route. */
export function arrivalWindowIcs(input: {
  uid: string;
  start: string;
  end: string;
  title: string;
  location: string;
  now?: Date;
}): string {
  const stamp = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  // RFC 5545: backslash, semicolon and comma are escaped; a newline is \n.
  const text = (value: string) =>
    value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Handy//Arrival window//HE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@handy`,
    `DTSTAMP:${stamp(input.now ?? new Date())}`,
    `DTSTART:${stamp(new Date(input.start))}`,
    `DTEND:${stamp(new Date(input.end))}`,
    `SUMMARY:${text(input.title)}`,
    `LOCATION:${text(input.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
