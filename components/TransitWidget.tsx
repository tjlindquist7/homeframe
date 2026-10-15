"use client";

import { AlertTriangle, BusFront, Clock3, PauseCircle, PlayCircle, Radio, RefreshCw, Ship } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Departure = { route: string; destination: string; departureTime: string; scheduledTime: string; minutes: number | null; delayMinutes: number; live: boolean };
type TransitData = { configured: boolean; source: string; updatedAt: string; departures: { "126"?: Departure[]; lincoln?: Departure[] }; alerts: string[]; error?: string };
type FerryDeparture = { time: string; minutes: number; dayOffset: number };
type FerryData = { route: string; service: "weekday" | "weekend"; source: string; updatedAt: string; departures: FerryDeparture[] };

const emptyTransitData: TransitData = {
  configured: false,
  source: "setup",
  updatedAt: new Date(0).toISOString(),
  departures: {},
  alerts: [],
};

const TRANSIT_CACHE_KEY = "homeframe-transit-data-v2";
const LEGACY_TRANSIT_CACHE_KEY = "homeframe-transit-data";

function isScheduledWindow(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
  return hour >= 6 && hour < 9;
}

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
  const [data, setData] = useState<TransitData>(emptyTransitData);
  const [ferry, setFerry] = useState<FerryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [manualUntil, setManualUntil] = useState<number | null>(null);

  const refreshTransit = useCallback(async () => {
    try {
      const response = await fetch(`/api/transit?fresh=${Date.now()}`, { cache: "no-store" });
      const next = await response.json() as TransitData;
      if (!response.ok) throw new Error(next.error || "NJ TRANSIT unavailable");
      setData(next);
      window.localStorage.setItem(TRANSIT_CACHE_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshFerry = useCallback(async () => {
    try {
      const response = await fetch("/api/ferry", { cache: "no-store" });
      if (!response.ok) throw new Error("Ferry schedule unavailable");
      setFerry(await response.json() as FerryData);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      return await Promise.all([refreshTransit(), refreshFerry()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshFerry, refreshTransit]);

  useEffect(() => {
    setPaused(window.localStorage.getItem("homeframe-transit-paused") === "true");
    window.localStorage.removeItem(LEGACY_TRANSIT_CACHE_KEY);
    const cached = window.localStorage.getItem(TRANSIT_CACHE_KEY);
    if (cached) {
      try { setData(JSON.parse(cached) as TransitData); } catch { /* Ignore a damaged local cache. */ }
    }
    setPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    const updateWindow = () => setScheduleActive(isScheduledWindow());
    updateWindow();
    setScheduleReady(true);
    const interval = window.setInterval(updateWindow, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!preferenceLoaded || !scheduleReady || !scheduleActive || paused) return;
    void refreshAll();
    const transitInterval = window.setInterval(refreshTransit, 45_000);
    const ferryInterval = window.setInterval(refreshFerry, 15 * 60_000);
    return () => {
      window.clearInterval(transitInterval);
      window.clearInterval(ferryInterval);
    };
  }, [paused, preferenceLoaded, refreshAll, refreshFerry, refreshTransit, scheduleActive, scheduleReady]);

  useEffect(() => {
    if (!manualUntil) return;
    const remaining = manualUntil - Date.now();
    if (remaining <= 0) {
      setManualUntil(null);
      return;
    }
    const timeout = window.setTimeout(() => setManualUntil(null), remaining);
    return () => window.clearTimeout(timeout);
  }, [manualUntil]);

  const togglePaused = () => setPaused((current) => {
    const next = !current;
    window.localStorage.setItem("homeframe-transit-paused", String(next));
    return next;
  });

  const refreshNow = async () => {
    window.localStorage.removeItem(TRANSIT_CACHE_KEY);
    setData(emptyTransitData);
    const [transitSucceeded, ferrySucceeded] = await refreshAll();
    if ((transitSucceeded || ferrySucceeded) && !scheduleActive) setManualUntil(Date.now() + 5 * 60_000);
  };

  const manualActive = manualUntil !== null;
  const showingData = scheduleActive || manualActive;
  const rows = [
    { key: "126" as const, route: "126", destination: "19th St → Port Authority", trips: data.departures["126"] ?? [] },
    { key: "lincoln" as const, route: "156 · 158 · 159", destination: "Lincoln Harbor → Port Authority", trips: data.departures.lincoln ?? [] },
  ];
  const delayedTrip = showingData ? [...(data.departures["126"] ?? []), ...(data.departures.lincoln ?? [])].find((trip) => trip.delayMinutes >= 5) : undefined;
  const alert = showingData ? data.alerts[0] : undefined;

  return <section className="widget transit-card">
    <div className="card-title-row">
      <div className="card-kicker"><BusFront size={15} strokeWidth={2.35} />Bus and ferry departures</div>
      <div className="transit-actions">
        {scheduleActive ? <button type="button" className={`card-detail data-state transit-toggle ${paused ? "paused" : data.configured ? "connected" : ""}`} onClick={togglePaused} aria-pressed={paused} aria-label={paused ? "Resume scheduled transit updates" : "Pause scheduled transit updates"}>
          {paused ? <PlayCircle size={10} /> : refreshing ? <Radio size={9} /> : <PauseCircle size={10} />}{paused ? "Paused" : refreshing ? "Updating" : "Scheduled live"}
        </button> : null}
        <button type="button" className="commute-refresh commute-refresh-label transit-refresh" onClick={refreshNow} disabled={refreshing} aria-label="Refresh bus and ferry departures now" title="Refresh bus and ferry departures now">
          <RefreshCw size={13} className={refreshing ? "spin" : ""} /><span>Refresh</span>
        </button>
      </div>
    </div>
    <div className="transit-list live-transit-list">
      {rows.map((row) => <article className="transit-row" key={row.key}>
        <div className="mode-icon bus"><BusFront size={19} strokeWidth={2.2} /></div>
        <div className="route-copy"><div><strong>{row.route}</strong></div><div className="route-destination">{row.destination}</div></div>
        <div className="departure-times live-times">
          {!showingData ? <span className="click-refresh">Click Refresh</span>
            : row.trips.length ? row.trips.slice(0, 3).map((trip, index) => <DepartureChip key={`${trip.route}-${trip.departureTime}-${index}`} departure={trip} combined={row.key === "lincoln"} />)
              : <span className="no-trips">No departures</span>}
        </div>
      </article>)}
      <article className="transit-row ferry-row">
        <div className="mode-icon ferry"><Ship size={19} strokeWidth={2.2} /></div>
        <div className="route-copy"><div><strong>Ferry</strong></div><div className="route-destination">Lincoln Harbor → Midtown · Schedule</div></div>
        <div className="departure-times live-times">
          {!showingData ? <span className="click-refresh">Click Refresh</span>
            : ferry?.departures.length ? ferry.departures.slice(0, 3).map((departure, index) => <span className="departure-chip" key={`${departure.time}-${departure.dayOffset}-${index}`}>
              <b>{formatFerryWait(departure.minutes)}</b>
            </span>) : <span className="no-trips">No departures</span>}
        </div>
      </article>
    </div>
    <div className={`transit-footer ${!paused && (alert || delayedTrip) ? "has-alert" : ""}`}>
      {paused && scheduleActive ? <><Clock3 size={14} /><span>Scheduled updates are paused · tap Paused to resume</span></>
        : alert || delayedTrip ? <><AlertTriangle size={14} /><span>{alert ?? `Route ${delayedTrip?.route} is about ${delayedTrip?.delayMinutes} min late`}</span></>
          : <><Clock3 size={14} /><span>{manualActive ? "On-demand departures remain visible for 5 minutes" : scheduleActive ? "Live transit updates run automatically from 6–9 AM" : "Automatic transit updates run from 6–9 AM"}</span></>}
    </div>
    <p className="transit-attribution">Data obtained from NJ TRANSIT and NY Waterway · Predictions may change · Not affiliated with or endorsed by NJ TRANSIT</p>
  </section>;
}
