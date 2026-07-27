import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminClient } from "@/components/admin-client";
import { isAdminPage } from "@/lib/auth";
import { listSongCards, nextMarkerId } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage cards"
};

export default async function AdminPage() {
  if (!(await isAdminPage())) redirect("/admin/login");
  return (
    <AdminClient
      initialCards={listSongCards()}
      initialNextMarker={nextMarkerId()}
    />
  );
}
