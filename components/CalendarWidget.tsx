"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  month: string;
  day: string;
  weekday: string;
  startTime: string;
};

type CalendarData = { configured: boolean; updatedAt: string; events: CalendarEvent[]; error?: string };

export function CalendarWidget() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      const next = await response.json() as CalendarData;
      if (!response.ok) throw new Error(next.error || "Calendar unavailable");
      setData(next);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 15 * 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return <section className="widget events-card live-events-card">
    <div className="card-title-row"><div className="card-kicker"><CalendarDays size={15} strokeWidth={2.35} />Upcoming events</div><span className="card-detail">Next 5</span></div>
    {!data ? <div className="calendar-state">{error ? "Calendar unavailable" : "Loading calendar…"}</div>
      : data.events.length === 0 ? <div className="calendar-state">No upcoming events</div>
      : <div className="events-list live-events-list">{data.events.map((event, index) => <article className="event-row live-event-row" key={event.id}>
        <div className={`event-date ${["blue", "amber", "green"][index % 3]}`}><span>{event.month}</span><strong>{event.day}</strong></div>
        <div className="event-copy live-event-copy"><span>{event.weekday}</span><strong>{event.title}</strong></div>
        <time dateTime={event.startsAt}>{event.startTime}</time>
      </article>)}</div>}
  </section>;
}
