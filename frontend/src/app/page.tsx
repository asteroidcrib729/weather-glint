import { WeatherDashboard } from "@/components/weather-dashboard";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="site-shell min-h-screen overflow-hidden bg-[#f5faf9] bg-[radial-gradient(circle_at_70%_4%,#e6f6f1_0,transparent_26%)] text-[#203b4d] [&_button]:cursor-pointer dark:bg-[#0c1720] dark:bg-[radial-gradient(circle_at_70%_4%,#153b40_0,transparent_26%)] dark:text-[#e3f1f1]">
      <SiteHeader />
      <WeatherDashboard />
    </div>
  );
}
