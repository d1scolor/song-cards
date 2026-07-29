import type { Metadata } from "next";
import { Scanner } from "@/components/scanner";
import { isAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Kiosk"
};

export default async function KioskPage() {
  return <Scanner showAdminExit={await isAdminPage()} />;
}
