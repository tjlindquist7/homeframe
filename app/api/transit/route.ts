import { NextResponse } from "next/server";

const NJT_API = "https://pcsdata.njtransit.com/api/BUSDV2";
const TARGETS = [
  { key: "126", stop: "21853", routes: ["126"] },
  { key: "lincoln", stop: "21831", routes: ["156", "158", "159"] },
] as const;

type Departure = {
  route: string;
  destination: string;
  departureTime: string;
  scheduledTime: string;
  minutes: number | null;
  delayMinutes: number;
  live: boolean;
};

type BusDvTrip = {
  public_route?: string;
  header?: string;
  departuretime?: string;
  remarks?: string;
  sched_dep_time?: string;
  message?: string | null;
  vehicle_id?: string | null;
};

let tokenCache: { value: string; expiresAt: number } | null = null;
let responseCache: { value: Record<string, unknown>; expiresAt: number } | null = null;
let scheduleCache: { value: Record<string, BusDvTrip[]>; expiresAt: number } | null = null;

async function postForm(endpoint: string, fields: Record<string, string>): Promise<any> {
  const body = new FormData();
  Object.entries(fields).forEach(([key, value]) => body.append(key, value));
  const response = await fetch(`${NJT_API}/${endpoint}`, {
    method: "POST",
    headers: { Accept: "text/plain", "User-Agent": "HomeFrame/1.0" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`NJ TRANSIT returned ${response.status}`);
  return response.json();
}

async function authenticate(username: string, password: string, force = false) {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const result = await postForm("authenticateUser", { username, password }) as {
    Authenticated?: string | boolean;
    UserToken?: string;
    authenticated?: string | boolean;
    userToken?: string;
  };
  const authenticated = result.Authenticated ?? result.authenticated;
  const token = result.UserToken ?? result.userToken ?? "";
  if (!token || String(authenticated).toLowerCase() !== "true") throw new Error("NJ TRANSIT authentication failed");
  tokenCache = { value: token, expiresAt: Date.now() + 23 * 60 * 60_000 };
  return token;
}

async function getBusDv(token: string, stop: string, route = "") {
  const result = await postForm("getBusDV", { token, stop, direction: "", route, IP: "" });
  if (result?.errorMessage && /token/i.test(result.errorMessage)) throw new Error("INVALID_TOKEN");
  return result as { message?: { message?: string } | string | null; DVTrip?: BusDvTrip[] };
}

async function getRouteTrips(token: string, location: string, route: string) {
  const result = await postForm("getRouteTrips", { token, location, route });
  if (result?.errorMessage && /token/i.test(result.errorMessage)) throw new Error("INVALID_TOKEN");
  return Array.isArray(result) ? result as BusDvTrip[] : [];
}

function parseScheduledDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function predictedMinutes(value: string, scheduledTime: string) {
  if (/due|arriving|now/i.test(value)) return 0;
  const countdown = value.match(/(?:in\s*)?(\d+)\s*min/i);
  if (countdown) return Number(countdown[1]);
  const scheduled = parseScheduledDate(scheduledTime);
  return scheduled ? Math.max(0, Math.round((scheduled.getTime() - Date.now()) / 60_000)) : null;
}

function parseTrips(trips: BusDvTrip[], allowedRoutes: readonly string[]): Departure[] {
  return trips
    .map((trip) => {
      const route = String(trip.public_route ?? "").match(/\d+/)?.[0] ?? "";
      const scheduledTime = trip.sched_dep_time ?? "";
      const minutes = predictedMinutes(trip.departuretime ?? "", scheduledTime);
      const scheduled = parseScheduledDate(scheduledTime);
      const scheduledMinutes = scheduled ? Math.max(0, Math.round((scheduled.getTime() - Date.now()) / 60_000)) : null;
      return {
        route,
        destination: (trip.header ?? "New York").trim(),
        departureTime: trip.departuretime ?? "",
        scheduledTime,
        minutes,
        delayMinutes: minutes !== null && scheduledMinutes !== null ? Math.max(0, minutes - scheduledMinutes) : 0,
        live: Boolean(trip.vehicle_id || /in\s*\d+\s*min|due|arriving|now/i.test(trip.departuretime ?? "")),
        message: trip.message ?? trip.remarks ?? "",
      };
    })
    .filter((trip) => allowedRoutes.includes(trip.route) && /new york|port authority|pabt/i.test(trip.destination))
    .sort((a, b) => (a.minutes ?? Number.MAX_SAFE_INTEGER) - (b.minutes ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3);
}

function collectMessages(result: { message?: { message?: string } | string | null; DVTrip?: BusDvTrip[] }) {
  const root = typeof result.message === "string" ? result.message : result.message?.message;
  return [root, ...(result.DVTrip ?? []).map((trip) => trip.message)]
    .filter((message): message is string => Boolean(message?.trim()))
    .map((message) => message.trim());
}

function mergeDepartures(liveTrips: Departure[], scheduledTrips: Departure[]) {
  const departures = new Map<string, Departure>();
  [...liveTrips, ...scheduledTrips].forEach((trip) => {
    const scheduled = parseScheduledDate(trip.scheduledTime);
    const key = `${trip.route}-${(scheduled?.getTime() ?? trip.scheduledTime) || trip.departureTime}`;
    if (!departures.has(key)) departures.set(key, trip);
  });
  return [...departures.values()]
    .filter((trip) => trip.minutes !== null && trip.minutes >= 0)
    .sort((a, b) => (a.minutes ?? Number.MAX_SAFE_INTEGER) - (b.minutes ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 3);
}

async function loadSchedules(token: string) {
  if (scheduleCache && scheduleCache.expiresAt > Date.now()) return scheduleCache.value;
  const entries = await Promise.all(TARGETS.map(async (target) => {
    const routeResults = await Promise.all(target.routes.map((route) => getRouteTrips(token, target.stop, route)));
    return [target.key, routeResults.flat()] as const;
  }));
  const value = Object.fromEntries(entries);
  scheduleCache = { value, expiresAt: Date.now() + 10 * 60_000 };
  return value;
}

async function loadTransit(username: string, password: string, forceToken = false) {
  const token = await authenticate(username, password, forceToken);
  const schedules = await loadSchedules(token);
  const results = await Promise.all(TARGETS.map(async (target) => {
    const data = await getBusDv(token, target.stop, target.key === "126" ? "126" : "");
    const liveTrips = parseTrips(data.DVTrip ?? [], target.routes);
    const scheduledTrips = parseTrips(schedules[target.key] ?? [], target.routes);
    return { key: target.key, trips: mergeDepartures(liveTrips, scheduledTrips), messages: collectMessages(data) };
  }));
  return results;
}

export async function GET() {
  const username = process.env.NJT_BUS_USERNAME;
  const password = process.env.NJT_BUS_PASSWORD;

  if (!username || !password) {
    return NextResponse.json({ configured: false, source: "setup", updatedAt: new Date().toISOString(), departures: {}, alerts: [] });
  }
  if (responseCache && responseCache.expiresAt > Date.now()) return NextResponse.json(responseCache.value);

  try {
    let results;
    try {
      results = await loadTransit(username, password);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INVALID_TOKEN") throw error;
      tokenCache = null;
      results = await loadTransit(username, password, true);
    }

    const payload = {
      configured: true,
      source: "NJ TRANSIT BUSDV2",
      updatedAt: new Date().toISOString(),
      departures: Object.fromEntries(results.map((result) => [result.key, result.trips])),
      alerts: [...new Set(results.flatMap((result) => result.messages))].slice(0, 3),
    };
    responseCache = { value: payload, expiresAt: Date.now() + 30_000 };
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      source: "unavailable",
      updatedAt: new Date().toISOString(),
      departures: {},
      alerts: [],
      error: error instanceof Error ? error.message : "Feed unavailable",
    }, { status: 502 });
  }
}
