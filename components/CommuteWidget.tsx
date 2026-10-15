"use client";

import { CarFront, PauseCircle, PlayCircle, Radio, RefreshCw, Route } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CommuteData = {
  configured: boolean;
  source: string;
  updatedAt: string;
  origin: string;
  destination: string;
  durationMinutes?: number;
  staticDurationMinutes?: number;
  trafficDelayMinutes?: number;
  distanceMiles?: number;
  description?: string;
  arrivalTime?: string;
  warnings: string[];
  error?: string;
};

const emptyData: CommuteData = {
  configured: false,
  source: "setup",
  updatedAt: new Date(0).toISOString(),
  origin: "Weehawken, NJ",
  destination: "Hackensack University Medical Center",
  warnings: [],
};

function isScheduledWindow(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
  return hour >= 5 && hour < 7;
}

export function CommuteWidget() {
  const [data, setData] = useState<CommuteData>(emptyData);
  const [paused, setPaused] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [manualUntil, setManualUntil] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/commute", { cache: "no-store" });
      const next = await response.json() as CommuteData;
      if (!response.ok) throw new Error(next.error || "Live commute unavailable");
      setData(next);
      setUnavailable(false);
      return true;
    } catch {
      setUnavailable(true);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setPaused(window.localStorage.getItem("homeframe-commute-paused") === "true");
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
    refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [paused, preferenceLoaded, refresh, scheduleActive, scheduleReady]);

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
    window.localStorage.setItem("homeframe-commute-paused", String(next));
    return next;
  });

  const refreshNow = async () => {
    const succeeded = await refresh();
    if (succeeded && !scheduleActive) setManualUntil(Date.now() + 5 * 60_000);
  };

  const manualActive = manualUntil !== null && manualUntil > Date.now();
  const showingData = scheduleActive || manualActive;
  const duration = showingData ? data.durationMinutes : undefined;
  const durationTone = duration === undefined ? "idle" : duration < 25 ? "fast" : "slow";
  const statusLabel = paused ? "Paused" : refreshing ? "Updating" : "Scheduled live";

  return <section className="widget commute-card commute-card-expanded">
    <div className="card-title-row">
      <div className="card-kicker"><CarFront size={15} strokeWidth={2.35} />Morning commute</div>
      <div className="commute-actions">
        {scheduleActive ? <button type="button" className={`card-detail commute-toggle ${paused ? "paused" : data.configured ? "connected" : ""}`} onClick={togglePaused} aria-pressed={paused} aria-label={paused ? "Resume scheduled Google traffic updates" : "Pause scheduled Google traffic updates"}>
          {paused ? <PlayCircle size={10} /> : refreshing ? <Radio size={9} /> : <PauseCircle size={10} />}{statusLabel}
        </button> : null}
        <button type="button" className="commute-refresh commute-refresh-label" onClick={refreshNow} disabled={refreshing} aria-label="Refresh morning commute now" title="Refresh morning commute now">
          <RefreshCw size={13} className={refreshing ? "spin" : ""} /><span>Refresh</span>
        </button>
      </div>
    </div>
    <div className="commute-summary commute-summary-expanded">
      <div className={`commute-time ${durationTone}`}>
        <span>FASTEST DRIVE</span>
        {duration !== undefined ? <div><strong>{duration}</strong><b>min</b></div> : <strong className="commute-idle-label">Idle</strong>}
        <small>{unavailable ? "Live traffic is temporarily unavailable" : duration !== undefined && data.staticDurationMinutes ? `Normal: about ${data.staticDurationMinutes} min` : "Automatic checks run 5–7 AM"}</small>
      </div>
      <div className="commute-route commute-route-expanded">
        <span className="route-badge"><Route size={13} /> {showingData ? "Best route now" : "Scheduled traffic check"}</span>
        <strong>Weehawken → Hackensack</strong>
        {showingData && data.durationMinutes !== undefined ? <>
          <div className="commute-route-details"><span>{data.description || "Traffic-aware route"}</span>{data.distanceMiles ? <b>{data.distanceMiles} miles</b> : null}</div>
          <div className="commute-timing"><span>Leave now</span><b>{data.arrivalTime ? `Arrive ${data.arrivalTime}` : "Calculating arrival"}</b></div>
        </> : <>
          <div className="commute-route-details idle-copy"><span>No traffic requests outside the morning window</span></div>
        </>}
      </div>
    </div>
  </section>;
}
