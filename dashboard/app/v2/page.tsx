import type { Metadata } from "next";
import Dashboard from "../Dashboard";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "FyxBot Control Center V2 — Aperçu local",
  description: "Aperçu local de la prochaine interface du panel FyxBot.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardV2Preview() {
  return <Dashboard variant="v2" />;
}
