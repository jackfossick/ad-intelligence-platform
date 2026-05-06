import { redirect } from "next/navigation";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect("/ads");
}
