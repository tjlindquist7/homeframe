import { NextResponse } from "next/server";
import ical from "node-ical";

const DISPLAY_TIME_ZONE = "America/New_York";
const LOOKAHEAD_DAYS = 370;

type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  month: string;
  day: string;
  weekday: string;
  startTime: string;
};

let responseCache: { value: { configured: boolean; updatedAt: string; events: CalendarEvent[] }; expiresAt: number } | null = null;

function formatEvent(title: string, start: Date, allDay: boolean, id: string): CalendarEvent {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(start);
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? "";

  return {
    id,
    title: title.trim() || "Untitled event",
    startsAt: start.toISOString(),
    month: part("month").toUpperCase(),
    day: part("day"),
    weekday: part("weekday"),
    startTime: allDay ? "All day" : new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(start),
  };
}

export async function GET() {
  const calendarUrl = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!calendarUrl) return NextResponse.json({ configured: false, updatedAt: new Date().toISOString(), events: [] });

  if (responseCache && responseCache.expiresAt > Date.now()) {
    return NextResponse.json(responseCache.value, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  try {
    const response = await fetch(calendarUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`);

    const parsed = ical.sync.parseICS(await response.text());
    const now = new Date();
    const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const candidates: CalendarEvent[] = [];

    for (const entry of Object.values(parsed)) {
      if (entry.type !== "VEVENT" || !entry.start) continue;
      const instances = ical.expandRecurringEvent(entry, { from: now, to: horizon });
      for (const [index, instance] of instances.entries()) {
        if (!instance.start || instance.start < now) continue;
        const start = instance.start;
        const dateOnly = Boolean((start as Date & { dateOnly?: boolean }).dateOnly);
        candidates.push(formatEvent(String(instance.summary ?? entry.summary ?? "Untitled event"), start, Boolean(instance.isFullDay) || dateOnly, `${entry.uid ?? "event"}-${start.toISOString()}-${index}`));
      }
    }

    const seen = new Set<string>();
    const events = candidates
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .filter((event) => {
        const key = `${event.title}|${event.startsAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);

    const payload = { configured: true, updatedAt: new Date().toISOString(), events };
    responseCache = { value: payload, expiresAt: Date.now() + 10 * 60_000 };
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      updatedAt: new Date().toISOString(),
      events: [],
      error: error instanceof Error ? error.message : "Calendar unavailable",
    }, { status: 502 });
  }
}
