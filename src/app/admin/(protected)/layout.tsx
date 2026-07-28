import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { isAdminPage } from "@/lib/auth";

export default async function ProtectedAdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAdminPage())) redirect("/admin/login");

  return (
    <div className="admin-app">
      <AdminHeader />
      {children}
    </div>
  );
}
