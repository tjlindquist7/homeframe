import { NextResponse } from "next/server";

const LATITUDE = 40.7695;
const LONGITUDE = -74.0204;
const POINT = `${LATITUDE},${LONGITUDE}`;
const HEADERS = { "User-Agent": "HomeFrame/1.0 (personal Raspberry Pi weather display)", Accept: "application/geo+json" };

type NwsPeriod = {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
  relativeHumidity?: { value: number | null };
  windSpeed: string;
};

function easternDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function easternTime(value?: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

async function getJson(url: string, revalidate: number): Promise<any> {
  const response = await fetch(url, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  return response.json();
}

export async function GET() {
  try {
    const point = await getJson(`https://api.weather.gov/points/${POINT}`, 86_400);
    const hourlyUrl = point.properties?.forecastHourly;
    if (!hourlyUrl) throw new Error("Hourly forecast is unavailable");

    const [hourlyResponse, alertsResponse, solarResponse] = await Promise.all([
      getJson(hourlyUrl, 300),
      getJson(`https://api.weather.gov/alerts/active?point=${POINT}`, 300),
      getJson(`https://api.sunrise-sunset.org/json?lat=${LATITUDE}&lng=${LONGITUDE}&date=${easternDate()}&formatted=0`, 3_600).catch(() => null),
    ]);
    const periods = (hourlyResponse.properties?.periods ?? []) as NwsPeriod[];
    if (!periods.length) throw new Error("No forecast periods returned");

    const next24 = periods.slice(0, 24);
    const current = next24[0];
    const now = Date.now();
    const cutoff = now + 24 * 60 * 60_000;
    const alerts = (alertsResponse.features ?? [])
      .filter((feature: { properties?: { ends?: string; expires?: string; onset?: string; effective?: string } }) => {
        const properties = feature.properties ?? {};
        const starts = Date.parse(properties.onset ?? properties.effective ?? new Date(now).toISOString());
        const ends = Date.parse(properties.ends ?? properties.expires ?? new Date(cutoff).toISOString());
        return starts <= cutoff && ends >= now;
      })
      .map((feature: { properties?: { event?: string; headline?: string; severity?: string } }) => ({
        event: feature.properties?.event ?? "Weather alert",
        headline: feature.properties?.headline ?? feature.properties?.event ?? "Weather alert in effect",
        severity: feature.properties?.severity ?? "Unknown",
      }))
      .slice(0, 2);

    return NextResponse.json({
      location: "Weehawken, NJ",
      updatedAt: new Date().toISOString(),
      current: {
        temperature: current.temperature,
        unit: current.temperatureUnit,
        condition: current.shortForecast,
        rainChance: current.probabilityOfPrecipitation?.value ?? 0,
        humidity: current.relativeHumidity?.value ?? null,
        wind: current.windSpeed,
        isDaytime: current.isDaytime,
      },
      high: Math.max(...next24.map((period) => period.temperature)),
      low: Math.min(...next24.map((period) => period.temperature)),
      hourly: next24.filter((_, index) => index % 3 === 0).slice(0, 5).map((period, index) => ({
        time: index === 0 ? "Now" : new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric" }).format(new Date(period.startTime)),
        temperature: period.temperature,
        condition: period.shortForecast,
        rainChance: period.probabilityOfPrecipitation?.value ?? 0,
        isDaytime: period.isDaytime,
      })),
      sun: {
        sunrise: easternTime(solarResponse?.results?.sunrise),
        sunset: easternTime(solarResponse?.results?.sunset),
      },
      alerts,
      source: "National Weather Service",
    }, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Weather unavailable" }, { status: 502 });
  }
}
