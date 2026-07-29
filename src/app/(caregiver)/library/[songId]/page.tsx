import { redirect } from "next/navigation";

export default async function SongPage({
  params
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  redirect(`/admin/library/${encodeURIComponent(songId)}`);
}
