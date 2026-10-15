import { NextResponse } from "next/server";

const ROUTE_URL = "https://www.nywaterway.com/LincolnHarborWeehawkenRoute.aspx";
const TIME_ZONE = "America/New_York";

const FALLBACK = {
  weekday: [
    "6:58 AM", "7:18 AM", "7:38 AM", "7:58 AM", "8:18 AM", "8:38 AM", "8:58 AM",
    "9:18 AM", "9:38 AM", "9:58 AM", "10:18 AM", "10:38 AM", "10:58 AM", "11:18 AM",
    "11:38 AM", "11:58 AM", "12:18 PM", "12:38 PM", "12:58 PM", "1:18 PM", "1:38 PM",
    "1:58 PM", "2:18 PM", "2:38 PM", "2:58 PM", "3:18 PM", "3:43 PM", "4:03 PM",
    "4:23 PM", "4:43 PM", "5:03 PM", "5:23 PM", "5:43 PM", "6:03 PM", "6:23 PM",
    "6:43 PM", "7:03 PM", "7:23 PM", "7:43 PM", "8:03 PM", "8:23 PM", "8:43 PM",
    "9:03 PM", "9:23 PM",
  ],
  weekend: [
    "9:55 AM", "10:15 AM", "10:35 AM", "10:55 AM", "11:15 AM", "11:35 AM", "11:55 AM",
    "12:15 PM", "12:35 PM", "12:55 PM", "1:15 PM", "1:35 PM", "1:55 PM", "2:15 PM",
    "2:35 PM", "2:55 PM", "3:15 PM", "3:35 PM", "3:55 PM", "4:15 PM", "4:35 PM",
    "4:55 PM", "5:15 PM", "5:35 PM", "5:55 PM", "6:15 PM", "6:35 PM", "6:55 PM",
    "7:15 PM", "7:35 PM", "7:55 PM", "8:15 PM", "8:35 PM", "8:55 PM", "9:15 PM",
  ],
};

type ServiceDay = "weekday" | "weekend";

function decodeHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOutbound(section: string) {
  const start = section.search(/Departs Lincoln Harbor\s*\/\s*Weehawken/i);
  if (start < 0) return [];
  const outbound = section.slice(start);
  const end = outbound.search(/Departs Midtown\s*\/\s*W\.?\s*39th St/i);
  const times = (end < 0 ? outbound : outbound.slice(0, end)).match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi) ?? [];
  return [...new Set(times.map((time) => time.toUpperCase().replace(/\s+/g, " ")))];
}

function parseSchedule(html: string) {
  const text = decodeHtml(html);
  const weekdayStart = text.search(/WEEKDAY SCHEDULE/i);
  const weekendStart = text.search(/WEEKEND SCHEDULE/i);
  if (weekdayStart < 0 || weekendStart < 0) return null;
  const weekday = parseOutbound(text.slice(weekdayStart, weekendStart));
  const weekend = parseOutbound(text.slice(weekendStart));
  return weekday.length >= 3 && weekend.length >= 3 ? { weekday, weekend } : null;
}

function minutesOfDay(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function easternNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: value.weekday, minute: Number(value.hour) * 60 + Number(value.minute) };
}

function isWeekend(day: string) {
  return day === "Sat" || day === "Sun";
}

function tomorrow(day: string) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[(days.indexOf(day) + 1) % 7];
}

export async function GET() {
  let schedule = FALLBACK;
  let current = false;

  try {
    const response = await fetch(ROUTE_URL, {
      headers: { "User-Agent": "HomeFrame/1.0" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`NY Waterway returned ${response.status}`);
    const parsed = parseSchedule(await response.text());
    if (parsed) {
      schedule = parsed;
      current = true;
    }
  } catch {
    // The published schedule is retained so the kiosk still works during a brief site outage.
  }

  const now = easternNow();
  const todayService: ServiceDay = isWeekend(now.weekday) ? "weekend" : "weekday";
  const nextDay = tomorrow(now.weekday);
  const tomorrowService: ServiceDay = isWeekend(nextDay) ? "weekend" : "weekday";
  const departures = [
    ...schedule[todayService].map((time) => ({ time, minutes: minutesOfDay(time) - now.minute, dayOffset: 0 })),
    ...schedule[tomorrowService].map((time) => ({ time, minutes: minutesOfDay(time) + 1440 - now.minute, dayOffset: 1 })),
  ].filter((departure) => departure.minutes >= 0).slice(0, 3);

  return NextResponse.json({
    route: "Lincoln Harbor / Weehawken → Midtown / W 39th St",
    service: todayService,
    source: current ? "NY Waterway" : "NY Waterway schedule (cached)",
    scheduleUrl: ROUTE_URL,
    updatedAt: new Date().toISOString(),
    departures,
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=900" } });
}
