"use client";

import { useState } from "react";
import { X, ExternalLink, Edit3, Trash2, FileText } from "lucide-react";
import { getYouTubeEmbedId, formatDate } from "@/lib/utils";
import AdForm from "./AdForm";
import ReplicationBrief from "./ReplicationBrief";
import ConfirmModal from "./ConfirmModal";

type Ad = Record<string, string | number | null>;

export default function AdDetailPanel({
  ad, onClose, onUpdate,
}: {
  ad: Ad;
  onClose: () => void;
  onUpdate: (updated: Ad) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => setConfirmDelete(true);

  const performDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/ads/${ad.id}`, { method: "DELETE" });
      setConfirmDelete(false);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const youtubeId = getYouTubeEmbedId(
    (ad.creative_video_url || ad.ad_url || "") as string
  );

  const watchableUrl = ad.creative_video_url || ad.ad_url || ad.ad_library_url;

  if (editing) {
    return (
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Edit Ad</h2>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <AdForm
          mode="edit"
          adId={ad.id as string}
          initialAd={ad}
        />
      </div>
    );
  }

  if (showBrief) {
    return (
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-50">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Replication Brief</h2>
          <button onClick={() => setShowBrief(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <ReplicationBrief ad={ad} />
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
        <div>
          <h2 className="font-semibold text-gray-900">{(ad.brand as string) || "Unnamed Ad"}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{(ad.platform as string) || "—"} · {(ad.organic_or_paid as string) || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBrief(true)} title="Generate Replication Brief" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><FileText size={16} /></button>
          <button onClick={() => setEditing(true)} title="Edit" className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Edit3 size={16} /></button>
          <button onClick={handleDelete} disabled={deleting} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Video preview */}
        {youtubeId ? (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <iframe
              width="100%"
              height="220"
              src={`https://www.youtube.com/embed/${youtubeId}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : watchableUrl ? (
          <a href={watchableUrl as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-blue-600 hover:bg-blue-50">
            <ExternalLink size={14} />
            Open video / ad link
          </a>
        ) : null}

        {/* Key info */}
        <Section title="Ad Info">
          <Field label="Brand" value={ad.brand} />
          <Field label="Platform" value={ad.platform} />
          <Field label="Category" value={ad.product_category} />
          <Field label="Niche" value={ad.niche} />
          <Field label="Country" value={ad.country} />
          <Field label="Ad status" value={ad.ad_status} />
          <Field label="Paid/Organic" value={ad.organic_or_paid} />
          <Field label="First seen" value={formatDate(ad.first_seen as string)} />
          <Field label="Last seen" value={formatDate(ad.last_seen as string)} />
          <Field label="Performance score" value={ad.performance_score != null ? String(Number(ad.performance_score).toFixed(1)) : null} />
          <Field label="Review status" value={ad.review_status} />
        </Section>

        {/* Creative */}
        <Section title="Creative">
          <Field label="Hook type" value={ad.hook_type} />
          <Field label="Angle" value={ad.angle} />
          <Field label="Creative format" value={ad.creative_format} />
          <Field label="Visual style" value={ad.visual_style} />
          <Field label="Persona" value={ad.persona} />
          <Field label="Pain point" value={ad.pain_point} />
          <Field label="CTA" value={ad.cta} />
          <Field label="Offer" value={ad.offer} />
        </Section>

        {ad.hook && (
          <Section title="Hook">
            <p className="text-sm text-gray-800 italic">"{ad.hook as string}"</p>
          </Section>
        )}

        {ad.ad_copy && (
          <Section title="Ad Copy">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ad.ad_copy as string}</p>
          </Section>
        )}

        {ad.headline && (
          <Section title="Headline">
            <p className="text-sm text-gray-700">{ad.headline as string}</p>
          </Section>
        )}

        {/* URLs */}
        <Section title="Links">
          <UrlField label="Ad URL" value={ad.ad_url} type={ad.url_type as string} />
          <UrlField label="Ad Library" value={ad.ad_library_url} />
          <UrlField label="Snapshot" value={ad.ad_snapshot_url} />
          <UrlField label="Advertiser page" value={ad.advertiser_page_url} />
          <UrlField label="Destination" value={ad.destination_url} />
          <UrlField label="Video" value={ad.creative_video_url} />
        </Section>

        {/* Metrics */}
        <Section title="Metrics">
          <Field label="Views" value={ad.views} />
          <Field label="Likes" value={ad.likes} />
          <Field label="Comments" value={ad.comments} />
          <Field label="Shares" value={ad.shares} />
          <Field label="Impressions" value={ad.impressions} />
          <Field label="Spend" value={ad.spend ? `${ad.spend} ${ad.currency || ""}` : null} />
          <Field label="Engagement proxy" value={ad.engagement_proxy} />
        </Section>

        {/* Analysis */}
        <Section title="Analysis">
          <FullField label="Why it works" value={ad.why_it_works} />
          <FullField label="How to replicate" value={ad.how_to_replicate} />
          <FullField label="AI avatar adaptation" value={ad.ai_avatar_adaptation} />
          <FullField label="Value for our business" value={ad.value_for_our_business} />
          <FullField label="Notes" value={ad.notes} />
        </Section>

        {/* Source */}
        <Section title="Source">
          <Field label="Source actor" value={ad.source_actor} />
          <Field label="Source platform" value={ad.source_platform} />
          <Field label="Scraped at" value={formatDate(ad.scraped_at as string)} />
        </Section>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Delete this ad?"
        description={<>This will permanently delete this ad. This cannot be undone.</>}
        confirmLabel="Delete ad"
        destructive
        loading={deleting}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-gray-800">{String(value)}</span>
    </div>
  );
}

function FullField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="text-sm mb-3">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-md p-2.5">{String(value)}</p>
    </div>
  );
}

function UrlField({ label, value, type }: { label: string; value: string | number | null | undefined; type?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm items-start">
      <span className="text-gray-400 w-32 shrink-0">{label}</span>
      <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 break-all">
        <ExternalLink size={11} className="shrink-0 mt-0.5" />
        {type ? <span className="text-xs text-gray-400 mr-1">[{type}]</span> : null}
        {String(value).length > 50 ? String(value).substring(0, 50) + "…" : String(value)}
      </a>
    </div>
  );
}
