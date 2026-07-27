import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLogin } from "@/components/admin-login";
import { isAdminPage } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Caregiver sign in"
};

export default async function LoginPage() {
  if (await isAdminPage()) redirect("/admin");
  return <AdminLogin />;
}
