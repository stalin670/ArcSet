import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DataDashboard } from "@/components/data-dashboard";

export const metadata: Metadata = {
  title: "Protocol health",
  description: "Live Arc, Base, and Graph status for ArcSet.",
};

export default function DataPage() {
  return <AppShell><DataDashboard /></AppShell>;
}
