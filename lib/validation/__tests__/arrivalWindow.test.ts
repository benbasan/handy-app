import { describe, expect, it } from "vitest";
import {
  addDays,
  arrivalWindowIcs,
  dayLabel,
  describeWindow,
  isDayKey,
  israelDayKey,
  israelInstant,
  openSlots,
  slotWindow,
  windowDayOptions,
  windowHours,
  windowOffered,
  windowRequired,
} from "../arrivalWindow";

// 15 September 2026, 21:30 in Israel (summer time, UTC+3).
const EVENING = new Date("2026-09-15T18:30:00Z");

describe("Israel time", () => {
  it("reads the calendar day in Israel, not in UTC", () => {
    // 23:30 UTC on the 15th is already 02:30 on the 16th in Israel.
    expect(israelDayKey(new Date("2026-09-15T23:30:00Z"))).toBe("2026-09-16");
  });

  it("turns a wall-clock hour into the right instant in summer and winter", () => {
    expect(israelInstant("2026-09-16", 16).toISOString()).toBe(
      "2026-09-16T13:00:00.000Z",
    );
    expect(israelInstant("2026-12-16", 16).toISOString()).toBe(
      "2026-12-16T14:00:00.000Z",
    );
  });

  it("gets the day daylight saving ends right", () => {
    // Israel leaves summer time on the last Sunday of October: 25.10.2026.
    expect(israelInstant("2026-10-25", 10).toISOString()).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });

  it("does calendar arithmetic across a month", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("knows a real day from a malformed one", () => {
    expect(isDayKey("2026-09-16")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("16.9.2026")).toBe(false);
  });
});

describe("which windows a form offers", () => {
  it("requires one for today and tomorrow only", () => {
    expect(windowRequired("today")).toBe(true);
    expect(windowRequired("tomorrow")).toBe(true);
    expect(windowRequired("this_week")).toBe(false);
    expect(windowRequired(null)).toBe(false);
  });

  it("offers none for asap, which keeps its ETA", () => {
    expect(windowOffered("asap")).toBe(false);
    expect(windowDayOptions("asap", EVENING)).toEqual([]);
  });

  it("lets a call for today be answered tomorrow, because evenings happen", () => {
    expect(windowDayOptions("today", EVENING)).toEqual([
      "2026-09-15",
      "2026-09-16",
    ]);
    expect(windowDayOptions("tomorrow", EVENING)).toEqual(["2026-09-16"]);
    expect(windowDayOptions("this_week", EVENING)).toHaveLength(7);
  });

  it("drops the slots that have already ended", () => {
    expect(openSlots("2026-09-15", EVENING)).toEqual([]);
    expect(openSlots("2026-09-16", EVENING)).toEqual([8, 10, 12, 14, 16, 18]);
    // 13:30 in Israel: the 12–14 slot is still running, the 10–12 is over.
    expect(openSlots("2026-09-15", new Date("2026-09-15T10:30:00Z"))).toEqual([
      12, 14, 16, 18,
    ]);
  });

  it("makes every slot two hours wide", () => {
    const { start, end } = slotWindow("2026-09-16", 8);
    expect(end.getTime() - start.getTime()).toBe(2 * 3_600_000);
  });
});

describe("how a window is said", () => {
  it("names today, tomorrow, and any other day by weekday and date", () => {
    expect(dayLabel("2026-09-15", EVENING)).toBe("היום");
    expect(dayLabel("2026-09-16", EVENING)).toBe("מחר");
    expect(dayLabel("2026-09-18", EVENING)).toBe("יום שישי 18.9");
  });

  it("gives the hours in Israel time whatever zone the server runs in", () => {
    expect(
      windowHours("2026-09-16T13:00:00.000Z", "2026-09-16T15:00:00.000Z"),
    ).toBe("16:00–18:00");
  });

  it("keeps the day and the hours apart, for two bidi runs", () => {
    expect(
      describeWindow(
        "2026-09-16T13:00:00.000Z",
        "2026-09-16T15:00:00.000Z",
        EVENING,
      ),
    ).toEqual({ day: "מחר", hours: "16:00–18:00" });
  });
});

describe("arrivalWindowIcs", () => {
  it("writes a single event in UTC, with text escaped", () => {
    const ics = arrivalWindowIcs({
      uid: "bid-1",
      start: "2026-09-16T13:00:00.000Z",
      end: "2026-09-16T15:00:00.000Z",
      title: "Handy: אינסטלציה",
      location: "ויצמן 6, תל אביב",
      now: new Date("2026-09-15T18:30:00Z"),
    });
    expect(ics).toContain("DTSTART:20260916T130000Z");
    expect(ics).toContain("DTEND:20260916T150000Z");
    expect(ics).toContain("LOCATION:ויצמן 6\\, תל אביב");
    expect(ics).toContain("UID:bid-1@handy");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
