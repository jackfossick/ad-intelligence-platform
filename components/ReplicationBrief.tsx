"use client";

import { Copy } from "lucide-react";

type Ad = Record<string, string | number | null>;

function getAvatarStyle(ad: Ad): string {
  const format = (ad.creative_format as string || "").toLowerCase();
  const visual = (ad.visual_style as string || "").toLowerCase();
  if (format.includes("ugc") || visual.includes("ugc")) return "Authentic UGC-style avatar — casual lighting, direct-to-camera, conversational tone";
  if (format.includes("ai avatar") || format.includes("ai")) return "Polished AI avatar — professional setting, clear enunciation, trust-building body language";
  if (format.includes("testimonial")) return "Testimonial-style avatar — relatable, emotional, before/after framing";
  return "Natural talking-head avatar — neutral background, clear and confident delivery";
}

function getSuggestedScript(ad: Ad): string {
  const hook = (ad.hook as string) || (ad.hook_type as string) || "compelling opening";
  const offer = (ad.offer as string) || "our solution";
  const cta = (ad.cta as string) || "Try it today";
  const painPoint = (ad.pain_point as string) || "the problem";

  return `[0–3s] Hook: "${hook}"
[3–10s] Agitate: "If you're struggling with ${painPoint}, you're not alone…"
[10–20s] Solution: "That's why we built ${offer} — [key benefit here]"
[20–28s] Social proof / demonstration
[28–30s] CTA: "${cta}"`;
}

function getRiskNotes(ad: Ad): string[] {
  const notes: string[] = [];
  const platform = (ad.platform as string || "").toLowerCase();
  if (platform === "meta" || platform === "facebook") {
    notes.push("Meta health/wellness ads require compliance — avoid before/after images showing dramatic results");
    notes.push("Claims about weight loss must be truthful and not misleading under Meta ad policies");
  }
  if (platform === "tiktok") {
    notes.push("TikTok restricts weight-loss claims — avoid specific numbers (e.g. 'lose 10lbs in 10 days')");
  }
  if ((ad.creative_format as string || "").toLowerCase().includes("testimonial")) {
    notes.push("Testimonials must reflect typical results — include disclosure if needed");
  }
  if (notes.length === 0) {
    notes.push("Review platform ad policies before publishing");
    notes.push("Ensure all claims are substantiated and compliant");
  }
  return notes;
}

export default function ReplicationBrief({ ad }: { ad: Ad }) {
  const brief = {
    adType: String(ad.creative_format || "Unknown format"),
    platform: String(ad.platform || "Unknown platform"),
    hookType: String(ad.hook_type || "Unknown hook"),
    whyItWorks: (ad.why_it_works as string) || "No analysis recorded. Add this in the Edit view.",
    howWeAdapt: (ad.how_to_replicate as string) || `Replicate the ${ad.creative_format || "format"} and ${ad.hook_type || "hook"} approach. Adapt messaging for our product.`,
    avatarStyle: getAvatarStyle(ad),
    suggestedScript: getSuggestedScript(ad),
    suggestedCta: (ad.cta as string) || "Try it free · Learn more · Get started today",
    riskNotes: getRiskNotes(ad),
  };

  const fullText = `REPLICATION BRIEF: ${ad.brand || "Ad"}
Platform: ${brief.platform}
Format: ${brief.adType}
Hook type: ${brief.hookType}

WHY IT WORKS
${brief.whyItWorks}

HOW WE ADAPT IT
${brief.howWeAdapt}

AI AVATAR STYLE
${brief.avatarStyle}

SUGGESTED SCRIPT (15–30s)
${brief.suggestedScript}

SUGGESTED CTA
${brief.suggestedCta}

RISK NOTES
${brief.riskNotes.map((n) => `• ${n}`).join("\n")}`;

  return (
    <div className="p-5 space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => navigator.clipboard.writeText(fullText)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50"
        >
          <Copy size={12} />
          Copy all
        </button>
      </div>

      <BriefSection title="Ad type" content={brief.adType} />
      <BriefSection title="Platform" content={brief.platform} />
      <BriefSection title="Hook type" content={brief.hookType} />
      <BriefSection title="Why it works" content={brief.whyItWorks} />
      <BriefSection title="How we adapt it to our product" content={brief.howWeAdapt} />
      <BriefSection title="Suggested AI avatar style" content={brief.avatarStyle} />

      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Suggested 15–30s script</h3>
        <pre className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono text-xs leading-relaxed border border-gray-200">
          {brief.suggestedScript}
        </pre>
      </div>

      <BriefSection title="Suggested CTA" content={brief.suggestedCta} />

      <div>
        <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">Risk notes</h3>
        <ul className="space-y-1.5">
          {brief.riskNotes.map((note, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-red-400 shrink-0">•</span>
              {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BriefSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-sm text-gray-800">{content}</p>
    </div>
  );
}
