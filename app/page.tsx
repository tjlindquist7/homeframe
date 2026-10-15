import { CalendarWidget } from "@/components/CalendarWidget";
import { CommuteWidget } from "@/components/CommuteWidget";
import { DashboardHeader } from "@/components/DashboardHeader";
import { TransitWidget } from "@/components/TransitWidget";
import { WeatherWidget } from "@/components/WeatherWidget";

export default function Home() {
  return (
    <main className="screen-shell">
      <div className="dashboard">
        <DashboardHeader />

        <div className="widget-grid">
          <TransitWidget />

          <CommuteWidget />

          <WeatherWidget />

          <CalendarWidget />
        </div>
      </div>
    </main>
  );
}
