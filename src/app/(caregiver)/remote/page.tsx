import { redirect } from "next/navigation";

export default function RemotePage() {
  redirect("/admin/now-playing");
}
