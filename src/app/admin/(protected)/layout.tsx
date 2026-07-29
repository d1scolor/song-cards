import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { LocalPlaybackProvider } from "@/components/local-playback";
import { isAdminPage } from "@/lib/auth";

export default async function ProtectedAdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAdminPage())) redirect("/admin/login");

  return (
    <LocalPlaybackProvider>
      <div className="admin-app">
        <AdminHeader />
        {children}
      </div>
    </LocalPlaybackProvider>
  );
}
