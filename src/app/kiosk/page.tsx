import type { Metadata } from "next";
import { Scanner } from "@/components/scanner";

export const metadata: Metadata = {
  title: "Kiosk"
};

export default function KioskPage() {
  return <Scanner />;
}
