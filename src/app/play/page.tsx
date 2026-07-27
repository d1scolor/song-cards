import type { Metadata } from "next";
import { Scanner } from "@/components/scanner";

export const metadata: Metadata = {
  title: "Play"
};

export default function PlayPage() {
  return <Scanner />;
}
