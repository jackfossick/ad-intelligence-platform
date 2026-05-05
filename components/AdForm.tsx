"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDb } from "@/lib/db-context";
import type { AdRecord } from "@/lib/normalise";

// ── UI helpers ────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase",
      color: "var(--color-text-tertiary)", marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>{children}</div>;
}

function ThreeCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 20px" }}>{children}</div>;
}

const S: React.CSSProperties = {
  padding: "7px 10px", fontSize: 13,
  borderRadius: "var(--border-radius-md)",
  border: "0.5px solid var(--color-border-tertiary)",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-sans)", width: "100%",
};

const TA: React.CSSProperties = { ...S, resize: "vertical", minHeight: 80, lineHeight: "1.5" };

const PLATFORMS  = ["TikTok", "Instagram", "YouTube", "Facebook", "Meta", "TikTok + Meta", "Pinterest", "Snapchat", "Other"];
const HOOKS      = ["Problem-agitate", "Transformation", "Social proof", "Curiosity gap", "Direct offer", "Fear / urgency", "Story", "Question", "Stat / claim", "Tutorial / how-to", "Other"];
const FORMATS    = ["UGC video", "AI avatar", "Screen record", "Talking head", "Animation", "Static image", "Carousel", "Other"];
const CTA_TYPES  = ["Learn more", "Shop now", "Sign up", "Get started", "Book now", "Download", "Try free", "See results", "Other"];
const FUNNEL     = ["Awareness", "Interest", "Consideration", "Conversion", "Retention"];
const URL_TYPES  = ["youtube", "search", "direct", "none"];
const ASSET_ST   = ["To replicate", "In production", "Done", "Archived"];
const REVIEW_ST  = ["Unreviewed", "Reviewed", "Approved", "Rejected"];
const SOURCES    = ["Organic", "Paid", "Scraped"];

// ── Form data type ─────────────────────────────────────────────

type FormData = {
  databaseId: string;
  primaryCategory: string; subCategory: string; segment: string; niche: string;
  platform: string; contentType: string;
  hookType: string; formatType: string; ctaType: string;
  creativeAngle: string; funnelStage: string; personaTarget: string;
  adLink: string; referenceUrl: string; backupSearchUrl: string;
  urlType: string; urlReviewed: boolean;
  assetStatus: string; reviewStatus: string;
  brandOrCreator: string; sourceType: string;
  strategicTag: string; complianceRisk: string;
  monetisationPath: string; priorityRank: string;
  performanceScore: string;
  hookScore: string; retentionScore: string; trustScore: string;
  conversionIntentScore: string; aiReplicabilityScore: string; nicheTransferScore: string;
  hookExample: string; scriptStructure: string;
  whyItWorks: string; howToReplicate: string;
  valueForUs: string; useCaseForUs: string;
  aiAvatarAdaptation: string; notes: string;
};

function empty(dbId = ""): FormData {
  return {
    databaseId: dbId, primaryCategory: "", subCategory: "", segment: "", niche: "",
    platform: "", contentType: "", hookType: "", formatType: "", ctaType: "",
    creativeAngle: "", funnelStage: "", personaTarget: "",
    adLink: "", referenceUrl: "", backupSearchUrl: "", urlType: "", urlReviewed: false,
    assetStatus: "", reviewStatus: "", brandOrCreator: "", sourceType: "",
    strategicTag: "", complianceRisk: "", monetisationPath: "", priorityRank: "",
    performanceScore: "",
    hookScore: "", retentionScore: "", trustScore: "",
    conversionIntentScore: "", aiReplicabilityScore: "", nicheTransferScore: "",
    hookExample: "", scriptStructure: "",
    whyItWorks: "", howToReplicate: "",
    valueForUs: "", useCaseForUs: "", aiAvatarAdaptation: "", notes: "",
  };
}

function fromAd(ad: AdRecord, dbId: string): FormData {
  const s = (k: string) => (ad[k] != null && ad[k] !== "" ? String(ad[k]) : "");
  return {
    databaseId:          (ad.databaseId as string) || dbId,
    primaryCategory:     s("primaryCategory"),
    subCategory:         s("subCategory"),
    segment:             s("segment"),
    niche:               s("niche"),
    platform:            s("platform"),
    contentType:         s("contentType"),
    hookType:            s("hookType"),
    formatType:          s("formatType"),
    ctaType:             s("ctaType"),
    creativeAngle:       s("creativeAngle"),
    funnelStage:         s("funnelStage"),
    personaTarget:       s("personaTarget"),
    adLink:              s("adLink"),
    referenceUrl:        s("referenceUrl"),
    backupSearchUrl:     s("backupSearchUrl"),
    urlType:             s("urlType"),
    urlReviewed:         !!(ad.urlReviewed),
    assetStatus:         s("assetStatus"),
    reviewStatus:        s("reviewStatus"),
    brandOrCreator:      s("brandOrCreator"),
    sourceType:          s("sourceType"),
    strategicTag:        s("strategicTag"),
    complianceRisk:      s("complianceRisk"),
    monetisationPath:    s("monetisationPath"),
    priorityRank:        s("priorityRank"),
    performanceScore:    s("performanceScore"),
    hookScore:           s("hookScore"),
    retentionScore:      s("retentionScore"),
    trustScore:          s("trustScore"),
    conversionIntentScore: s("conversionIntentScore"),
    aiReplicabilityScore:  s("aiReplicabilityScore"),
    nicheTransferScore:    s("nicheTransferScore"),
    hookExample:         s("hookExample"),
    scriptStructure:     s("scriptStructure"),
    whyItWorks:          s("whyItWorks"),
    howToReplicate:      s("howToReplicate"),
    valueForUs:          s("valueForUs"),
    useCaseForUs:        s("useCaseForUs"),
    aiAvatarAdaptation:  s("aiAvatarAdaptation"),
    notes:               s("notes"),
  };
}

function toPayload(f: FormData): Record<string, unknown> {
  const num = (v: string) => (v.trim() === "" ? null : parseFloat(v));
  return {
    databaseId: f.databaseId,
    primaryCategory:      f.primaryCategory || null,
    subCategory:          f.subCategory || null,
    segment:              f.segment || null,
    niche:                f.niche || null,
    platform:             f.platform || null,
    contentType:          f.contentType || null,
    hookType:             f.hookType || null,
    formatType:           f.formatType || null,
    ctaType:              f.ctaType || null,
    creativeAngle:        f.creativeAngle || null,
    funnelStage:          f.funnelStage || null,
    personaTarget:        f.personaTarget || null,
    adLink:               f.adLink || null,
    referenceUrl:         f.referenceUrl || null,
    backupSearchUrl:      f.backupSearchUrl || null,
    urlType:              f.urlType || null,
    urlReviewed:          f.urlReviewed,
    assetStatus:          f.assetStatus || null,
    reviewStatus:         f.reviewStatus || null,
    brandOrCreator:       f.brandOrCreator || null,
    sourceType:           f.sourceType || null,
    strategicTag:         f.strategicTag || null,
    complianceRisk:       f.complianceRisk || null,
    monetisationPath:     f.monetisationPath || null,
    priorityRank:         num(f.priorityRank),
    performanceScore:     num(f.performanceScore),
    hookScore:            num(f.hookScore),
    retentionScore:       num(f.retentionScore),
    trustScore:           num(f.trustScore),
    conversionIntentScore: num(f.conversionIntentScore),
    aiReplicabilityScore:  num(f.aiReplicabilityScore),
    nicheTransferScore:    num(f.nicheTransferScore),
    hookExample:          f.hookExample || null,
    scriptStructure:      f.scriptStructure || null,
    whyItWorks:           f.whyItWorks || null,
    howToReplicate:       f.howToReplicate || null,
    valueForUs:           f.valueForUs || null,
    useCaseForUs:         f.useCaseForUs || null,
    aiAvatarAdaptation:   f.aiAvatarAdaptation || null,
    notes:                f.notes || null,
  };
}

// ── Main component ─────────────────────────────────────────────

export default function AdForm({
  initialAd,
  adId,
  mode,
}: {
  initialAd?: AdRecord;
  adId?: string;
  mode: "add" | "edit";
}) {
  const router = useRouter();
  const { activeDb, databases } = useDb();

  const [form, setForm] = useState<FormData>(() =>
    initialAd ? fromAd(initialAd, activeDb?.id ?? "") : empty(activeDb?.id ?? "")
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Sync databaseId once activeDb loads (add mode only)
  useEffect(() => {
    if (mode === "add" && activeDb && !form.databaseId) {
      setForm((f) => ({ ...f, databaseId: activeDb.id }));
    }
  }, [activeDb, mode, form.databaseId]);

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const text = (k: keyof FormData) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(k, e.target.value),
    style: S,
  });

  const Sel = ({ k, opts }: { k: keyof FormData; opts: string[] }) => (
    <select value={form[k] as string} onChange={(e) => set(k, e.target.value)} style={S}>
      <option value="">— select —</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.databaseId) { setError("Please select a database."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(form);
      const url    = mode === "edit" && adId ? `/api/ads/${adId}` : "/api/ads";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/ads");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  };

  const saveBtn = (
    <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
      {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Add ad"}
    </button>
  );

  return (
    <form onSubmit={handleSubmit}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>{mode === "edit" ? "Edit ad" : "Add ad"}</h2>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {mode === "edit" ? "Update this ad's details." : "Add a new ad to the library."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => router.push("/ads")}>Cancel</button>
          {saveBtn}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FCEBEB", border: "0.5px solid #A32D2D", borderRadius: "var(--border-radius-md)", color: "#A32D2D", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Database selector (add mode only) ─── */}
      {mode === "add" && (
        <FormSection title="Database">
          <Field label="Save to database">
            <select value={form.databaseId} onChange={(e) => set("databaseId", e.target.value)} style={S}>
              <option value="">— select database —</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>{db.name}</option>
              ))}
            </select>
          </Field>
        </FormSection>
      )}

      {/* ── Classification ─── */}
      <FormSection title="Classification">
        <TwoCol>
          <Field label="Primary category"><input {...text("primaryCategory")} placeholder="e.g. Weight loss" /></Field>
          <Field label="Sub-category"><input {...text("subCategory")} placeholder="e.g. Peptide GLP-1" /></Field>
          <Field label="Segment"><input {...text("segment")} placeholder="e.g. Female 25–45" /></Field>
          <Field label="Niche"><input {...text("niche")} placeholder="e.g. Looksmax" /></Field>
          <Field label="Platform"><Sel k="platform" opts={PLATFORMS} /></Field>
          <Field label="Content type"><input {...text("contentType")} placeholder="e.g. Testimonial" /></Field>
        </TwoCol>
      </FormSection>

      {/* ── Creative ─── */}
      <FormSection title="Creative details">
        <ThreeCol>
          <Field label="Hook type"><Sel k="hookType" opts={HOOKS} /></Field>
          <Field label="Format"><Sel k="formatType" opts={FORMATS} /></Field>
          <Field label="CTA"><Sel k="ctaType" opts={CTA_TYPES} /></Field>
          <Field label="Creative angle"><input {...text("creativeAngle")} placeholder="e.g. Fear of missing out" /></Field>
          <Field label="Funnel stage"><Sel k="funnelStage" opts={FUNNEL} /></Field>
          <Field label="Persona target"><input {...text("personaTarget")} placeholder="e.g. Women 30s–50s" /></Field>
        </ThreeCol>
      </FormSection>

      {/* ── Links & status ─── */}
      <FormSection title="Links & status">
        <Field label="Ad link (YouTube / direct watch URL)">
          <input {...text("adLink")} placeholder="https://youtube.com/watch?v=…" />
        </Field>
        <Field label="Reference URL (Ad Library / Creative Center)">
          <input {...text("referenceUrl")} placeholder="https://facebook.com/ads/library/…" />
        </Field>
        <Field label="Backup search URL">
          <input {...text("backupSearchUrl")} placeholder="https://…" />
        </Field>
        <TwoCol>
          <Field label="URL type"><Sel k="urlType" opts={URL_TYPES} /></Field>
          <Field label="URL reviewed">
            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.urlReviewed}
                onChange={(e) => set("urlReviewed", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span style={{ fontSize: 13 }}>Marked as reviewed</span>
            </label>
          </Field>
          <Field label="Asset status"><Sel k="assetStatus" opts={ASSET_ST} /></Field>
          <Field label="Review status"><Sel k="reviewStatus" opts={REVIEW_ST} /></Field>
          <Field label="Brand / creator"><input {...text("brandOrCreator")} placeholder="e.g. @handle" /></Field>
          <Field label="Source type"><Sel k="sourceType" opts={SOURCES} /></Field>
          <Field label="Strategic tag"><input {...text("strategicTag")} placeholder="e.g. Top performer" /></Field>
          <Field label="Compliance risk"><input {...text("complianceRisk")} placeholder="e.g. Low" /></Field>
          <Field label="Monetisation path"><input {...text("monetisationPath")} placeholder="e.g. Subscription" /></Field>
          <Field label="Priority rank"><input {...text("priorityRank")} type="number" min="1" placeholder="e.g. 1" style={S} /></Field>
        </TwoCol>
      </FormSection>

      {/* ── Scores ─── */}
      <FormSection title="Scores">
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
          Performance score is /100. Sub-scores (hook, retention, etc.) are /25.
        </p>
        <TwoCol>
          <Field label="Performance score (/100)">
            <input {...text("performanceScore")} type="number" min="0" max="100" step="0.1" placeholder="e.g. 87" style={S} />
          </Field>
          <div />
          <Field label="Hook score (/25)">
            <input {...text("hookScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 22" style={S} />
          </Field>
          <Field label="Retention score (/25)">
            <input {...text("retentionScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 20" style={S} />
          </Field>
          <Field label="Trust score (/25)">
            <input {...text("trustScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 18" style={S} />
          </Field>
          <Field label="Conversion intent (/25)">
            <input {...text("conversionIntentScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 21" style={S} />
          </Field>
          <Field label="AI replicability (/25)">
            <input {...text("aiReplicabilityScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 24" style={S} />
          </Field>
          <Field label="Niche transferability (/25)">
            <input {...text("nicheTransferScore")} type="number" min="0" max="25" step="0.5" placeholder="e.g. 19" style={S} />
          </Field>
        </TwoCol>
      </FormSection>

      {/* ── Content ─── */}
      <FormSection title="Content & analysis">
        <Field label="Hook example / first 3 seconds">
          <textarea {...text("hookExample")} placeholder="Exact hook text or opening description…" style={TA} />
        </Field>
        <Field label="Script structure">
          <textarea {...text("scriptStructure")} placeholder="Full script or structural outline…" style={{ ...TA, minHeight: 100 }} />
        </Field>
        <Field label="Why it works">
          <textarea {...text("whyItWorks")} placeholder="Why this ad performs well…" style={TA} />
        </Field>
        <Field label="How to replicate">
          <textarea {...text("howToReplicate")} placeholder="Step-by-step replication instructions…" style={TA} />
        </Field>
        <Field label="Value for us">
          <textarea {...text("valueForUs")} placeholder="What we can take from this ad…" style={TA} />
        </Field>
        <Field label="Use case for us">
          <textarea {...text("useCaseForUs")} placeholder="Specific use case for our campaigns…" style={TA} />
        </Field>
        <Field label="AI avatar adaptation">
          <textarea {...text("aiAvatarAdaptation")} placeholder="How to adapt this with an AI avatar…" style={TA} />
        </Field>
        <Field label="Notes">
          <textarea {...text("notes")} placeholder="Any additional notes…" style={TA} />
        </Field>
      </FormSection>

      {/* Footer save */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, marginBottom: 40 }}>
        <button type="button" className="btn" onClick={() => router.push("/ads")}>Cancel</button>
        {saveBtn}
      </div>
    </form>
  );
}
