import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "FyxBot Control Center V2",
  description: "La nouvelle interface de pilotage du panel FyxBot.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function DashboardV2Preview() {
  return <Dashboard variant="v2" />;
}
