import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrintBuilder } from "@/components/print-builder";
import { isAdminPage } from "@/lib/auth";
import { listSongCards } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print cards"
};

export default async function PrintPage() {
  if (!(await isAdminPage())) redirect("/admin/login");
  return <PrintBuilder cards={listSongCards()} />;
}
