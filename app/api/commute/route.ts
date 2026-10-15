import { NextResponse } from "next/server";

const GOOGLE_ROUTES_API = "https://routes.googleapis.com/directions/v2:computeRoutes";
const DEFAULT_ORIGIN = "Weehawken, NJ";
const DEFAULT_DESTINATION = "Hackensack University Medical Center, 30 Prospect Avenue, Hackensack, NJ 07601";

type GoogleRoute = {
  duration?: string;
  staticDuration?: string;
  distanceMeters?: number;
  description?: string;
  warnings?: string[];
};

let responseCache: { value: Record<string, unknown>; expiresAt: number } | null = null;

function durationSeconds(value?: string) {
  const seconds = Number.parseFloat(value?.replace(/s$/, "") ?? "");
  return Number.isFinite(seconds) ? seconds : 0;
}

function formatArrival(seconds: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + seconds * 1000));
}

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const origin = process.env.COMMUTE_ORIGIN || DEFAULT_ORIGIN;
  const destination = process.env.COMMUTE_DESTINATION || DEFAULT_DESTINATION;

  if (!apiKey) {
    return NextResponse.json({
      configured: false,
      source: "setup",
      updatedAt: new Date().toISOString(),
      origin,
      destination,
      warnings: [],
    });
  }

  if (responseCache && responseCache.expiresAt > Date.now()) {
    return NextResponse.json(responseCache.value, { headers: { "Cache-Control": "private, max-age=120" } });
  }

  try {
    const response = await fetch(GOOGLE_ROUTES_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.warnings",
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        trafficModel: "BEST_GUESS",
        computeAlternativeRoutes: true,
        languageCode: "en-US",
        units: "IMPERIAL",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.json() as { routes?: GoogleRoute[]; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || `Google Routes returned ${response.status}`);

    const routes = result.routes ?? [];
    const route = routes
      .filter((candidate) => durationSeconds(candidate.duration) > 0)
      .sort((a, b) => durationSeconds(a.duration) - durationSeconds(b.duration))[0];
    if (!route) throw new Error("Google Routes did not return a driving route");

    const liveSeconds = durationSeconds(route.duration);
    const staticSeconds = durationSeconds(route.staticDuration) || liveSeconds;
    const payload = {
      configured: true,
      source: "Google Maps Routes API",
      updatedAt: new Date().toISOString(),
      origin,
      destination,
      durationMinutes: Math.max(1, Math.ceil(liveSeconds / 60)),
      staticDurationMinutes: Math.max(1, Math.ceil(staticSeconds / 60)),
      trafficDelayMinutes: Math.max(0, Math.round((liveSeconds - staticSeconds) / 60)),
      distanceMiles: Number(((route.distanceMeters ?? 0) * 0.000621371).toFixed(1)),
      description: route.description?.trim() || "Traffic-aware fastest route",
      arrivalTime: formatArrival(liveSeconds),
      warnings: (route.warnings ?? []).filter(Boolean).slice(0, 2),
    };

    responseCache = { value: payload, expiresAt: Date.now() + 2 * 60_000 };
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      source: "Google Maps Routes API",
      updatedAt: new Date().toISOString(),
      origin,
      destination,
      warnings: [],
      error: error instanceof Error ? error.message : "Live commute unavailable",
    }, { status: 502 });
  }
}
