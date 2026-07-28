import { redirect } from "next/navigation";

export default async function CardPage({
  params
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  redirect(`/library/${encodeURIComponent(songId)}`);
}
