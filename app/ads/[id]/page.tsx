import { redirect } from "next/navigation";

export default function AdDetailPage({ params }: { params: { id: string } }) {
  // Redirect direct /ads/:id visits to /ads (panel opens client-side)
  redirect("/ads");
}
