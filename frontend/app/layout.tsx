import type { Metadata } from "next";
import { DashboardProvider } from "../lib/DashboardContext";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Urban Heat Mitigation — AI Dashboard",
  description:
    "AI-powered Urban Heat Mitigation Dashboard for detecting heat hotspots, analyzing drivers, and simulating cooling interventions in Pune, India.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DashboardProvider>{children}</DashboardProvider>
      </body>
    </html>
  );
}
