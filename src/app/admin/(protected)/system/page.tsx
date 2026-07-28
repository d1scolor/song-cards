import type { Metadata } from "next";
import { SystemDashboard } from "@/components/system-dashboard";

export const metadata: Metadata = {
  title: "System"
};

export default function SystemPage() {
  return <SystemDashboard />;
}
