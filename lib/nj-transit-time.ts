const NJ_TRANSIT_TIME_ZONE = "America/New_York";

const zonedPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: NJ_TRANSIT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallClockAsUtc(instant: Date) {
  const parts = Object.fromEntries(
    zonedPartsFormatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function newYorkWallClockToDate(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = targetWallClock;

  // Two passes resolve the Eastern offset at the target instant, including DST.
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = wallClockAsUtc(new Date(instant)) - instant;
    instant = targetWallClock - offset;
  }

  return new Date(instant);
}

function newYorkDateParts(instant: Date) {
  const parts = Object.fromEntries(
    zonedPartsFormatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function parseNjTransitDate(value: string) {
  if (!value) return null;

  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (match) {
    const [, monthValue, dayValue, yearValue, hourValue, minuteValue, secondValue = "0", meridiemValue] = match;
    const meridiem = meridiemValue.toUpperCase();
    const twelveHour = Number(hourValue) % 12;
    const hour = twelveHour + (meridiem === "PM" ? 12 : 0);
    return newYorkWallClockToDate(
      Number(yearValue),
      Number(monthValue),
      Number(dayValue),
      hour,
      Number(minuteValue),
      Number(secondValue),
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseNjTransitClock(value: string, now = new Date()) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match) return null;

  const [, hourValue, minuteValue, secondValue = "0", meridiemValue] = match;
  const meridiem = meridiemValue.toUpperCase();
  const hour = Number(hourValue) % 12 + (meridiem === "PM" ? 12 : 0);
  const { year, month, day } = newYorkDateParts(now);
  let departure = newYorkWallClockToDate(year, month, day, hour, Number(minuteValue), Number(secondValue));

  // Around midnight, a small clock time can describe tomorrow's departure.
  if (departure.getTime() - now.getTime() < -12 * 60 * 60_000) {
    departure = newYorkWallClockToDate(year, month, day + 1, hour, Number(minuteValue), Number(secondValue));
  }

  return departure;
}
