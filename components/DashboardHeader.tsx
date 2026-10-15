"use client";

import { House, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

export function DashboardHeader() {
  const [now, setNow] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const loadedAt = new Date();
    setNow(loadedAt);
    setLastUpdated(loadedAt);
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return <header className="topbar">
    <div className="brand-group"><div className="brand-mark"><House size={19} strokeWidth={2.5} /></div><div><h1>HomeFrame</h1><p>Home &amp; commute at a glance</p></div></div>
    <div className="topbar-center"><MapPin size={14} /> Weehawken, NJ</div>
    <div className="topbar-right">
      <div className="updated header-status"><span className="live-dot" /><strong>{now ? timeFormatter.format(now) : "—"}</strong><span>Updated {lastUpdated ? timeFormatter.format(lastUpdated) : "—"}</span></div>
      <button className="refresh-button" type="button" aria-label="Refresh dashboard data" onClick={() => window.location.reload()}><RefreshCw size={14} strokeWidth={2.5} /> Refresh</button>
    </div>
  </header>;
}
