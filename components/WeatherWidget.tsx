"use client";

import { AlertTriangle, Cloud, CloudLightning, CloudMoon, CloudRain, CloudSun, Droplets, Moon, Snowflake, Sun, Sunrise, Sunset, Umbrella, Wind } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type WeatherData = {
  location: string;
  updatedAt: string;
  current: { temperature: number; unit: string; condition: string; rainChance: number; humidity: number | null; wind: string; isDaytime: boolean };
  high: number;
  low: number;
  hourly: { time: string; temperature: number; condition: string; rainChance: number; isDaytime: boolean }[];
  sun: { sunrise: string | null; sunset: string | null };
  alerts: { event: string; headline: string; severity: string }[];
  source: string;
};

function WeatherIcon({ condition, isDaytime, size = 23 }: { condition: string; isDaytime: boolean; size?: number }) {
  const value = condition.toLowerCase();
  const Icon = value.includes("thunder") ? CloudLightning
    : value.includes("snow") || value.includes("sleet") ? Snowflake
    : value.includes("rain") || value.includes("shower") || value.includes("drizzle") ? CloudRain
    : value.includes("partly") || value.includes("mostly cloudy") ? (isDaytime ? CloudSun : CloudMoon)
    : value.includes("cloud") ? (isDaytime ? Cloud : CloudMoon)
    : isDaytime ? Sun : Moon;
  return <Icon size={size} strokeWidth={1.8} />;
}

export function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/weather", { cache: "no-store" });
      if (!response.ok) throw new Error("Weather unavailable");
      setData(await response.json() as WeatherData);
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (!data) return <section className="widget weather-card weather-loading">
    <div className="card-title-row"><div className="card-kicker"><Sun size={15} />Today&apos;s weather</div><span className="card-detail">Weehawken</span></div>
    <div><CloudSun size={46} /><strong>{error ? "Weather unavailable" : "Loading live weather…"}</strong></div>
  </section>;

  const alert = data.alerts[0];
  return <section className="widget weather-card">
    <div className="card-title-row"><div className="card-kicker"><WeatherIcon condition={data.current.condition} isDaytime={data.current.isDaytime} size={15} />Today&apos;s weather</div><span className="card-detail weather-live"><i />Live · Weehawken</span></div>
    <div className="weather-summary live-weather-summary">
      <div className="weather-icon"><WeatherIcon condition={data.current.condition} isDaytime={data.current.isDaytime} size={54} /></div>
      <div className="current-weather">
        <strong>{data.current.temperature}°</strong>
        <span>{data.current.condition}</span>
      </div>
      <div className="weather-metrics">
        <div className="temperature-range"><span>High <b>{data.high}°</b></span><span>Low <b>{data.low}°</b></span></div>
        <div className="sun-times"><span><Sunrise size={12} />{data.sun.sunrise ?? "—"}</span><span><Sunset size={12} />{data.sun.sunset ?? "—"}</span></div>
      </div>
    </div>
    <div className="hourly-strip live-hourly">{data.hourly.map((hour) => <div className="hour" key={hour.time}>
      <span>{hour.time}</span><WeatherIcon condition={hour.condition} isDaytime={hour.isDaytime} /><strong>{hour.temperature}°</strong><small><Umbrella size={10} />{hour.rainChance}%</small>
    </div>)}</div>
    <div className={`weather-alert ${alert ? "active" : "clear"}`}>
      {alert ? <><AlertTriangle size={16} /><div><strong>{alert.event}</strong><span>{alert.headline}</span></div><b>{alert.severity}</b></>
        : <>{data.current.isDaytime ? <Sun size={16} /> : <Moon size={16} />}<div><strong>No active weather alerts</strong><span>For Weehawken during the next 24 hours</span></div></>}
    </div>
    <div className="weather-source"><span>{data.source}</span><span><Droplets size={9} />{data.current.humidity ?? "—"}%</span><span><Wind size={9} />{data.current.wind}</span></div>
  </section>;
}
