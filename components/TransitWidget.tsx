"use client";

import { AlertTriangle, BusFront, Clock3, PauseCircle, PlayCircle, Radio, Ship } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Departure = { route: string; destination: string; departureTime: string; scheduledTime: string; minutes: number | null; delayMinutes: number; live: boolean };
type TransitData = { configured: boolean; source: string; updatedAt: string; departures: { "126"?: Departure[]; lincoln?: Departure[] }; alerts: string[]; error?: string };
type FerryDeparture = { time: string; minutes: number; dayOffset: number };
type FerryData = { route: string; service: "weekday" | "weekend"; source: string; updatedAt: string; departures: FerryDeparture[] };

const fallback: TransitData = {
  configured: false,
  source: "setup",
  updatedAt: new Date(0).toISOString(),
  departures: {
    "126": [7, 24, 41].map((minutes) => ({ route: "126", destination: "New York", departureTime: "", scheduledTime: "", minutes, delayMinutes: 0, live: false })),
    lincoln: [["158", 12], ["159", 31], ["156", 56]].map(([route, minutes]) => ({ route: String(route), destination: "New York", departureTime: "", scheduledTime: "", minutes: Number(minutes), delayMinutes: 0, live: false })),
  },
  alerts: [],
};

function DepartureChip({ departure, combined = false }: { departure: Departure; combined?: boolean }) {
  const delayed = departure.delayMinutes >= 5;
  return <span className={`departure-chip ${departure.live ? "is-live" : ""} ${delayed ? "is-delayed" : ""}`}>
    {combined && <small>{departure.route}</small>}
    <b>{departure.minutes === null ? "—" : departure.minutes === 0 ? "Due" : `${departure.minutes}m`}</b>
    {departure.live && <i aria-label="Live prediction" />}
  </span>;
}

function formatFerryWait(minutes: number) {
  if (minutes <= 120) return minutes === 0 ? "Due" : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

export function TransitWidget() {
  const [data, setData] = useState<TransitData>(fallback);
  const [ferry, setFerry] = useState<FerryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  const refreshTransit = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/transit", { cache: "no-store" });
      const next = await response.json() as TransitData;
      if (response.ok) {
        const usable = next.configured ? next : fallback;
        setData(usable);
        window.localStorage.setItem("homeframe-transit-data", JSON.stringify(usable));
      }
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    setPaused(window.localStorage.getItem("homeframe-transit-paused") === "true");
    const cached = window.localStorage.getItem("homeframe-transit-data");
    if (cached) {
      try { setData(JSON.parse(cached) as TransitData); } catch { /* Ignore a damaged local cache. */ }
    }
    setPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    const refreshFerry = async () => {
      try {
        const response = await fetch("/api/ferry", { cache: "no-store" });
        if (response.ok) setFerry(await response.json() as FerryData);
      } catch { /* Keep the last published ferry schedule on screen. */ }
    };
    refreshFerry();
    const interval = window.setInterval(refreshFerry, 15 * 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!preferenceLoaded || paused) return;
    refreshTransit();
    const interval = window.setInterval(refreshTransit, 45_000);
    return () => window.clearInterval(interval);
  }, [paused, preferenceLoaded, refreshTransit]);

  const togglePaused = () => setPaused((current) => {
    const next = !current;
    window.localStorage.setItem("homeframe-transit-paused", String(next));
    return next;
  });

  const rows = [
    { key: "126" as const, route: "126", destination: "19th St → Port Authority", trips: data.departures["126"] ?? [] },
    { key: "lincoln" as const, route: "156 · 158 · 159", destination: "Lincoln Harbor → Port Authority", trips: data.departures.lincoln ?? [] },
  ];
  const delayedTrip = [...(data.departures["126"] ?? []), ...(data.departures.lincoln ?? [])].find((trip) => trip.delayMinutes >= 5);
  const alert = data.alerts[0];

  return <section className="widget transit-card">
    <div className="card-title-row">
      <div className="card-kicker"><BusFront size={15} strokeWidth={2.35} />Bus and ferry departures</div>
      <button type="button" className={`card-detail data-state transit-toggle ${paused ? "paused" : data.configured ? "connected" : ""}`} onClick={togglePaused} aria-pressed={paused} aria-label={paused ? "Resume NJ TRANSIT live updates" : "Pause NJ TRANSIT live updates"}>
        {paused ? <PlayCircle size={10} /> : refreshing ? <Radio size={9} /> : <PauseCircle size={10} />}{paused ? "Paused" : refreshing ? "Updating" : data.configured ? "NJ TRANSIT live" : "Awaiting access"}
      </button>
    </div>
    <div className="transit-list live-transit-list">
      {rows.map((row) => <article className="transit-row" key={row.key}>
        <div className="mode-icon bus"><BusFront size={19} strokeWidth={2.2} /></div>
        <div className="route-copy"><div><strong>{row.route}</strong></div><div className="route-destination">{row.destination}</div></div>
        <div className="departure-times live-times">
          {row.trips.length ? row.trips.slice(0, 3).map((trip, index) => <DepartureChip key={`${trip.route}-${trip.departureTime}-${index}`} departure={trip} combined={row.key === "lincoln"} />) : <span className="no-trips">No trips</span>}
        </div>
      </article>)}
      <article className="transit-row ferry-row">
        <div className="mode-icon ferry"><Ship size={19} strokeWidth={2.2} /></div>
        <div className="route-copy"><div><strong>Ferry</strong></div><div className="route-destination">Lincoln Harbor → Midtown · Schedule</div></div>
        <div className="departure-times live-times">
          {ferry?.departures.length ? ferry.departures.slice(0, 3).map((departure, index) => <span className="departure-chip" key={`${departure.time}-${departure.dayOffset}-${index}`}>
            <b>{formatFerryWait(departure.minutes)}</b>
          </span>) : <span className="no-trips">Loading schedule</span>}
        </div>
      </article>
    </div>
    <div className={`transit-footer ${!paused && (alert || delayedTrip) ? "has-alert" : ""}`}>
      {paused ? <><Clock3 size={14} /><span>NJ TRANSIT updates are paused · tap Paused to resume</span></> : alert || delayedTrip ? <><AlertTriangle size={14} /><span>{alert ?? `Route ${delayedTrip?.route} is about ${delayedTrip?.delayMinutes} min late`}</span></> : <><Clock3 size={14} /><span>{data.configured ? "Live predictions refresh every 45 seconds" : "Add NJ TRANSIT developer credentials to activate live predictions"}</span></>}
    </div>
    <p className="transit-attribution">Data obtained from NJ TRANSIT · Predictions may change · Not affiliated with or endorsed by NJ TRANSIT</p>
  </section>;
}
