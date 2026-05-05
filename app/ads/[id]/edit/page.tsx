"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdForm from "@/components/AdForm";
import type { AdRecord } from "@/lib/normalise";

export default function EditAdPage() {
  const params = useParams();
  const id = params?.id as string;

  const [ad, setAd] = useState<AdRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/ads/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setAd(data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="empty-state">
        <p>Loading…</p>
      </div>
    );
  }

  if (notFound || !ad) {
    return (
      <div className="empty-state">
        <p style={{ fontSize: 14 }}>Ad not found.</p>
      </div>
    );
  }

  return <AdForm mode="edit" adId={id} initialAd={ad} />;
}
