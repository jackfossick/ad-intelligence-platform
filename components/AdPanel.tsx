"use client";

import { useState, useCallback, useRef } from "react";

// ── Select options ─────────────────────────────────────────────
const HOOK_TYPES = ['audience_callout','shock_statement','curiosity_gap','problem_callout','transformation_claim','controversial_take','myth_busting','question_hook','visual_surprise','pain_point_hook','status_trigger','secret_reveal','mistake_warning','before_after'];
const ANGLES = ['problem_solution','before_after','testimonial','product_demo','founder_story','myth_busting','comparison','educational_breakdown','ugc_recommendation','objection_handling','trend_adaptation','lifestyle_aspiration','social_proof','contrarian_take','personal_confession','mistake_correction'];
const FORMATS = ['talking_head','ugc_selfie','product_demo','screen_recording','skit','montage','before_after','unboxing','tutorial','reaction','customer_footage','meme_format','polished_brand_ad','ai_avatar','text_overlay_only','comment_reply'];
const EMOTIONS = ['curiosity','surprise','relief','desire','humour','trust','urgency','identification','fomo','controversy','inspiration','validation','belonging','fear','status_anxiety','hope','envy','anger'];
const PROOFS = ['before_after','testimonial','expert_authority','numbers_or_results','live_demo','reviews','comments_on_screen','side_by_side_comparison','product_in_use','founder_credibility','scientific_explanation','social_proof'];
const VIRALITY = ['relatable_truth','useful_information','controversial_claim','identity_confirmation','debate_bait','aesthetic_satisfaction','surprising_fact','status_signal','humour','transformation_reveal','social_tagging','fear_or_warning'];
const PLATFORMS = ['TikTok','Instagram','Facebook','Meta','YouTube','Pinterest','Snapchat','Twitter','X'];
const AWARENESS_STAGES = ['unaware','problem_aware','solution_aware','product_aware','most_aware'];
const CREATIVE_BUCKETS = ['copy_this','learn_from_this','watchlist','reject'];
const ORGANIC_OR_PAID = ['organic','paid','unknown'];
const TAGGING_STATUSES = ['untagged','manual_tagged','ai_tagged','human_reviewed'];
const REVIEW_STATUSES = ['new','reviewed','useful','rejected'];

// ── Score helpers ──────────────────────────────────────────────
function sc(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.min(10, Math.max(0, n));
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function computeScores(fields: Record<string, unknown>) {
  const organic = r1(
    sc(fields.hookStrengthScore) * 0.20 +
    sc(fields.platformNativeFitScore) * 0.15 +
    sc(fields.retentionQualityScore) * 0.15 +
    sc(fields.emotionalIntensityScore) * 0.15 +
    sc(fields.shareabilityScore) * 0.15 +
    sc(fields.commentPotentialScore) * 0.10
  );
  const paid = r1(
    sc(fields.hookStrengthScore) * 0.20 +
    sc(fields.audienceSpecificityScore) * 0.15 +
    sc(fields.painClarityScore) * 0.15 +
    sc(fields.proofStrengthScore) * 0.15 +
    sc(fields.messageClarityScore) * 0.15 +
    sc(fields.conversionIntentScore) * 0.10
  );
  const ai = r1(Math.max(0,
    sc(fields.replicabilityScore) * 0.20 +
    sc(fields.hookStrengthScore) * 0.15 +
    sc(fields.angleQualityScore) * 0.15 +
    sc(fields.platformNativeFitScore) * 0.15 +
    sc(fields.emotionalIntensityScore) * 0.15 +
    sc(fields.aiAvatarAdaptabilityScore) * 0.10 -
    sc(fields.productionDifficultyScore) * 0.10 -
    sc(fields.complianceRiskScore) * 0.10
  ));
  const overall = r1(ai * 0.40 + organic * 0.30 + paid * 0.30);
  return {
    organicViralPotential: organic,
    paidAdPotential: paid,
    aiReplicationValue: ai,
    overallUsefulnessScore: overall,
  };
}

// ── Tagging status badge colors ────────────────────────────────
function taggingBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { color: string; bg: string }> = {
    untagged:       { color: '#6B7280', bg: '#F3F4F6' },
    manual_tagged:  { color: '#0C447C', bg: '#E6F1FB' },
    ai_tagged:      { color: '#085041', bg: '#E1F5EE' },
    human_reviewed: { color: '#7C3AED', bg: '#EDE9FE' },
  };
  const cfg = map[status] ?? map.untagged;
  return { fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 12, color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap' as const };
}

function reviewBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { color: string; bg: string }> = {
    new:        { color: '#633806', bg: '#FEF3DA' },
    unreviewed: { color: '#633806', bg: '#FEF3DA' },
    reviewed:   { color: '#0C447C', bg: '#E6F1FB' },
    useful:     { color: '#085041', bg: '#E1F5EE' },
    rejected:   { color: '#7A1F1F', bg: '#FEECEC' },
  };
  const cfg = map[status?.toLowerCase()] ?? map.new;
  return { fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 12, color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap' as const };
}

function scoreColor(score: number): string {
  if (score >= 7) return '#085041';
  if (score >= 5) return '#633806';
  return '#7A1F1F';
}
function scoreBg(score: number): string {
  if (score >= 7) return '#E1F5EE';
  if (score >= 5) return '#FEF3DA';
  return '#FEECEC';
}

// ── Collapsible Section ────────────────────────────────────────
function CollapsibleSection({
  title, children, defaultOpen = true,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 1, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
          color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
        }}
      >
        {title}
        <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 20px 16px' }}>{children}</div>}
    </div>
  );
}

// ── Field label style ──────────────────────────────────────────
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 4,
};
const INPUT: React.CSSProperties = {
  width: '100%', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--color-border-tertiary)',
  padding: '6px 8px', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)',
  background: 'var(--color-background-primary)', boxSizing: 'border-box' as const,
};
const TEXTAREA: React.CSSProperties = { ...INPUT, minHeight: 72, resize: 'vertical' as const };
const SELECT: React.CSSProperties = { ...INPUT };
const FIELD_ROW: React.CSSProperties = { marginBottom: 12 };
const GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' };

// ── Score card ─────────────────────────────────────────────────
function ScoreCard({ label, value }: { label: string; value: unknown }) {
  const n = Number(value);
  const valid = !isNaN(n) && value !== null && value !== undefined && value !== '';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--border-radius-md)', textAlign: 'center',
      background: valid ? scoreBg(n) : 'var(--color-background-secondary)',
      border: '0.5px solid var(--color-border-tertiary)',
    }}>
      <div style={{ fontSize: 10, color: valid ? scoreColor(n) : 'var(--color-text-tertiary)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valid ? scoreColor(n) : 'var(--color-text-tertiary)' }}>
        {valid ? n.toFixed(1) : '—'}
      </div>
      <div style={{ fontSize: 10, color: valid ? scoreColor(n) : 'var(--color-text-tertiary)' }}>/10</div>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────
export default function AdPanel({
  ad,
  onClose,
  onUpdate,
}: {
  ad: Record<string, unknown>;
  onClose: () => void;
  onUpdate: (id: string, fields: Record<string, unknown>) => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>({ ...ad });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const id = ad.id as string;

  // ── Patch field immediately ───────────────────────────────
  const patchImmediate = useCallback(async (key: string, value: unknown) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    try {
      await fetch(`/api/ads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      onUpdate(id, { [key]: value });
    } catch { /* silent */ }
  }, [id, onUpdate]);

  // ── Debounced patch for textareas ─────────────────────────
  const patchDebounced = useCallback((key: string, value: unknown) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(async () => {
      try {
        await fetch(`/api/ads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        onUpdate(id, { [key]: value });
      } catch { /* silent */ }
    }, 600);
  }, [id, onUpdate]);

  // ── Recalculate composite scores ──────────────────────────
  const handleRecalculate = useCallback(async () => {
    const scores = computeScores(fields);
    setFields((prev) => ({ ...prev, ...scores }));
    try {
      await fetch(`/api/ads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scores),
      });
      onUpdate(id, scores);
    } catch { /* silent */ }
  }, [fields, id, onUpdate]);

  // ── AI Tag This Ad ─────────────────────────────────────────
  const handleAiTag = useCallback(async () => {
    const taggingStatus = fields.taggingStatus as string;
    const hasManualTags =
      taggingStatus === 'manual_tagged' ||
      taggingStatus === 'human_reviewed' ||
      !!(fields.hookExample) ||
      !!(fields.creativeAngle);

    if (hasManualTags) {
      const ok = window.confirm('This ad already has manual tags. Overwrite them with AI-generated tags?');
      if (!ok) return;
    }

    setAiLoading(true);
    setAiMessage(null);

    const evidence = {
      source_platform: fields.platform || fields.sourcePlatform || '',
      source_url: fields.referenceUrl || fields.adLink || '',
      creative_video_url: fields.adLink || fields.creativeVideoUrl || '',
      brand_or_creator: fields.brandOrCreator || '',
      organic_or_paid: fields.organicOrPaid || '',
      caption_or_ad_copy: fields.adCopy || fields.hookExample || '',
      transcript: '',
      visible_text_on_screen: fields.description || '',
      posted_date: '',
      views: fields.views || '',
      likes: fields.likes || '',
      comments: fields.comments || '',
      shares: fields.shares || '',
      saves: '',
    };

    try {
      const res = await fetch('/api/tag-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evidence),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as Record<string,string>).error || `HTTP ${res.status}`);
      }

      const data = await res.json() as { result?: Record<string, unknown>; error?: string };

      // Surface backend errors clearly
      if (data.error) throw new Error(`Backend: ${data.error}`);
      if (!data.result || typeof data.result !== 'object') {
        throw new Error(`Invalid response shape — got: ${JSON.stringify(data).slice(0, 200)}`);
      }

      const raw = data.result;

      // Map snake_case → camelCase
      const mapped: Record<string, unknown> = {
        hookExample: raw.hook_text,
        hookType: raw.hook_type,
        personaTarget: raw.target_persona,
        awarenessStage: raw.awareness_stage,
        painPoint: raw.pain_point,
        desire: raw.desire,
        creativeAngle: raw.creative_angle,
        retentionStructure: raw.retention_structure,
        formatType: raw.creative_format,
        primaryEmotionalTrigger: raw.primary_emotional_trigger,
        secondaryEmotionalTrigger: raw.secondary_emotional_trigger,
        proofType: raw.proof_type,
        proofMechanism: raw.proof_mechanism,
        ctaType: raw.cta_type,
        viralityMechanic: raw.virality_mechanic,
        hookStrengthScore: raw.hook_strength_score,
        audienceSpecificityScore: raw.audience_specificity_score,
        painClarityScore: raw.pain_clarity_score,
        desireIntensityScore: raw.desire_intensity_score,
        angleQualityScore: raw.angle_quality_score,
        messageClarityScore: raw.message_clarity_score,
        retentionQualityScore: raw.retention_quality_score,
        emotionalIntensityScore: raw.emotional_intensity_score,
        proofStrengthScore: raw.proof_strength_score,
        platformNativeFitScore: raw.platform_native_fit_score,
        shareabilityScore: raw.shareability_score,
        commentPotentialScore: raw.comment_potential_score,
        conversionIntentScore: raw.conversion_intent_score,
        replicabilityScore: raw.replicability_score,
        aiAvatarAdaptabilityScore: raw.ai_avatar_adaptability_score,
        productionDifficultyScore: raw.production_difficulty_score,
        complianceRiskScore: raw.compliance_risk_score,
        whyItLikelyWorked: raw.why_it_likely_worked,
        whyItLikelyFailed: raw.why_it_likely_failed,
        mainCreativePattern: raw.main_creative_pattern,
        winningHookPattern: raw.winning_hook_pattern,
        retentionDevice: raw.retention_device,
        keyWeakness: raw.key_weakness,
        bestReusableElement: raw.best_reusable_element,
        suggestedVariationsToTest: raw.suggested_variations_to_test,
        recommendedNextCreativeTest: raw.recommended_next_creative_test,
        creativeBucket: raw.creative_bucket,
        confidenceScore: raw.confidence_score,
        confidenceReason: raw.confidence_reason,
        // Usefulness classification
        usefulnessStatus: raw.usefulness_status,
        usefulnessReason: raw.usefulness_reason,
        usefulnessConfidence: raw.usefulness_confidence,
        recommendedAction: raw.recommended_action,
      };

      // Compute composite scores
      const compositeInput = { ...fields, ...mapped };
      const scores = computeScores(compositeInput);

      const allFields: Record<string, unknown> = {
        ...mapped,
        ...scores,
        taggingStatus: 'ai_tagged',
        aiTaggedAt: new Date().toISOString(),
      };

      // Patch to DB
      await fetch(`/api/ads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allFields),
      });

      setFields((prev) => ({ ...prev, ...allFields }));
      onUpdate(id, allFields);

      const conf = Number(mapped.confidenceScore);
      const confText = !isNaN(conf) ? ` · Confidence: ${conf}/10` : '';
      const reason = mapped.confidenceReason ? ` — ${mapped.confidenceReason}` : '';
      setAiMessage({ type: 'success', text: `✓ AI tags applied${confText}${reason}` });
    } catch (e) {
      setAiMessage({ type: 'error', text: `Error: ${e instanceof Error ? e.message : 'Request failed'}` });
    } finally {
      setAiLoading(false);
    }
  }, [fields, id, onUpdate]);

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this ad? This cannot be undone.')) return;
    setDeleting(true);
    await fetch(`/api/ads/${id}`, { method: 'DELETE' });
    onClose();
  }, [id, onClose]);

  const watchLink = (fields.adLink || fields.referenceUrl) as string | undefined;
  const brand = (fields.brandOrCreator || fields.brand || '') as string;
  const platform = (fields.platform || fields.sourcePlatform || '') as string;
  const taggingStatus = (fields.taggingStatus || 'untagged') as string;
  const reviewStatus = (fields.reviewStatus || 'new') as string;

  // ── Field helpers ──────────────────────────────────────────
  const F = {
    text: (key: string, label: string) => (
      <div style={FIELD_ROW}>
        <label style={LABEL}>{label}</label>
        <input
          style={INPUT}
          value={(fields[key] ?? '') as string}
          onChange={(e) => patchDebounced(key, e.target.value)}
        />
      </div>
    ),
    textarea: (key: string, label: string) => (
      <div style={FIELD_ROW}>
        <label style={LABEL}>{label}</label>
        <textarea
          style={TEXTAREA}
          value={(fields[key] ?? '') as string}
          onChange={(e) => patchDebounced(key, e.target.value)}
        />
      </div>
    ),
    select: (key: string, label: string, opts: string[]) => (
      <div style={FIELD_ROW}>
        <label style={LABEL}>{label}</label>
        <select
          style={SELECT}
          value={(fields[key] ?? '') as string}
          onChange={(e) => patchImmediate(key, e.target.value)}
        >
          <option value="">— select —</option>
          {opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
    ),
    number: (key: string, label: string) => (
      <div style={FIELD_ROW}>
        <label style={LABEL}>{label}</label>
        <input
          type="number" min={0} max={10} step={0.5}
          style={INPUT}
          value={(fields[key] ?? '') as string}
          onChange={(e) => patchDebounced(key, e.target.value === '' ? null : Number(e.target.value))}
        />
      </div>
    ),
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 540,
        background: 'var(--color-background-primary)',
        borderLeft: '0.5px solid var(--color-border-tertiary)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      }}>

        {/* ── Sticky Header ────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--color-background-primary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          padding: '14px 20px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {brand || 'Ad'}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {platform && (
                <span className="badge" style={{ fontSize: 10, background: '#F3F4F6', color: '#374151' }}>{platform}</span>
              )}
              <span style={taggingBadgeStyle(taggingStatus)}>{taggingStatus.replace(/_/g, ' ')}</span>
              <span style={reviewBadgeStyle(reviewStatus)}>{reviewStatus}</span>
              {watchLink && (
                <a
                  href={watchLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 10, color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500, padding: '2px 7px', borderRadius: 12, border: '1px solid var(--color-accent)' }}
                >
                  ▶ Watch
                </a>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm"
            style={{ flexShrink: 0, fontSize: 14, lineHeight: 1, padding: '5px 9px' }}
          >
            ✕
          </button>
        </div>

        {/* ── Sections ─────────────────────────────────────── */}

        {/* 1 · Review & Status */}
        <CollapsibleSection title="1 · Review & Status">
          <div style={GRID2}>
            {F.select('reviewStatus', 'Review Status', REVIEW_STATUSES)}
            {F.select('creativeBucket', 'Creative Bucket', CREATIVE_BUCKETS)}
            {F.select('taggingStatus', 'Tagging Status', TAGGING_STATUSES)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-sm" style={{ borderColor: '#27A06A', color: '#27A06A' }}
              onClick={() => patchImmediate('reviewStatus', 'useful')}>✓ Mark Useful</button>
            <button className="btn btn-sm" style={{ borderColor: '#D14040', color: '#D14040' }}
              onClick={() => patchImmediate('reviewStatus', 'rejected')}>✗ Skip</button>
            <button className="btn btn-sm"
              onClick={() => patchImmediate('reviewStatus', 'new')}>↺ Reset</button>
          </div>
        </CollapsibleSection>

        {/* 2 · Source */}
        <CollapsibleSection title="2 · Source">
          <div style={GRID2}>
            {F.select('platform', 'Platform', PLATFORMS)}
            {F.select('organicOrPaid', 'Organic or Paid', ORGANIC_OR_PAID)}
          </div>
          {F.text('brandOrCreator', 'Brand / Creator')}
          {F.text('firstSeen', 'First Seen')}
          {F.text('adLink', 'Ad Link')}
          {F.text('referenceUrl', 'Reference URL')}
        </CollapsibleSection>

        {/* 3 · Caption / Ad Copy */}
        <CollapsibleSection title="3 · Caption / Ad Copy">
          {F.textarea('adCopy', 'Caption / Ad Copy')}
          {F.textarea('hookExample', 'Transcript')}
          {F.textarea('description', 'Visible Text on Screen')}
        </CollapsibleSection>

        {/* 4 · Hook */}
        <CollapsibleSection title="4 · Hook">
          {F.text('hookExample', 'Hook Text')}
          {F.select('hookType', 'Hook Type', HOOK_TYPES)}
        </CollapsibleSection>

        {/* 5 · Audience */}
        <CollapsibleSection title="5 · Audience">
          {F.text('personaTarget', 'Persona Target')}
          {F.select('awarenessStage', 'Awareness Stage', AWARENESS_STAGES)}
          {F.text('painPoint', 'Pain Point')}
          {F.text('desire', 'Desire')}
        </CollapsibleSection>

        {/* 6 · Creative Strategy */}
        <CollapsibleSection title="6 · Creative Strategy">
          {F.select('creativeAngle', 'Creative Angle', ANGLES)}
          {F.text('ctaType', 'CTA Type')}
          {F.select('proofType', 'Proof Type', PROOFS)}
          {F.text('proofMechanism', 'Proof Mechanism')}
        </CollapsibleSection>

        {/* 7 · Format & Retention */}
        <CollapsibleSection title="7 · Format & Retention">
          {F.select('formatType', 'Format Type', FORMATS)}
          {F.select('viralityMechanic', 'Virality Mechanic', VIRALITY)}
          {F.text('retentionStructure', 'Retention Structure')}
        </CollapsibleSection>

        {/* 8 · Emotion */}
        <CollapsibleSection title="8 · Emotion">
          {F.select('primaryEmotionalTrigger', 'Primary Emotional Trigger', EMOTIONS)}
          {F.select('secondaryEmotionalTrigger', 'Secondary Emotional Trigger', EMOTIONS)}
        </CollapsibleSection>

        {/* 9 · Sub-scores — collapsed by default */}
        <CollapsibleSection title="9 · Sub-scores (0–10)" defaultOpen={false}>
          <div style={GRID2}>
            {F.number('hookStrengthScore', 'Hook Strength')}
            {F.number('audienceSpecificityScore', 'Audience Specificity')}
            {F.number('painClarityScore', 'Pain Clarity')}
            {F.number('desireIntensityScore', 'Desire Intensity')}
            {F.number('angleQualityScore', 'Angle Quality')}
            {F.number('messageClarityScore', 'Message Clarity')}
            {F.number('retentionQualityScore', 'Retention Quality')}
            {F.number('emotionalIntensityScore', 'Emotional Intensity')}
            {F.number('proofStrengthScore', 'Proof Strength')}
            {F.number('platformNativeFitScore', 'Platform Native Fit')}
            {F.number('shareabilityScore', 'Shareability')}
            {F.number('commentPotentialScore', 'Comment Potential')}
            {F.number('conversionIntentScore', 'Conversion Intent')}
            {F.number('replicabilityScore', 'Replicability')}
            {F.number('aiAvatarAdaptabilityScore', 'AI Avatar Adaptability')}
            {F.number('productionDifficultyScore', 'Production Difficulty')}
            {F.number('complianceRiskScore', 'Compliance Risk')}
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleRecalculate} style={{ marginTop: 8 }}>
            ⟳ Recalculate
          </button>
        </CollapsibleSection>

        {/* 10 · Computed Scores */}
        <CollapsibleSection title="10 · Computed Scores">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <ScoreCard label="Organic Viral Potential" value={fields.organicViralPotential} />
            <ScoreCard label="Paid Ad Potential" value={fields.paidAdPotential} />
            <ScoreCard label="AI Replication Value" value={fields.aiReplicationValue} />
            <ScoreCard label="Overall Usefulness" value={fields.overallUsefulnessScore} />
          </div>
        </CollapsibleSection>

        {/* 11 · Creative Intelligence */}
        <CollapsibleSection title="11 · Creative Intelligence">
          {F.textarea('whyItLikelyWorked', 'Why It Likely Worked')}
          {F.textarea('whyItLikelyFailed', 'Why It Likely Failed')}
          {F.textarea('mainCreativePattern', 'Main Creative Pattern')}
          {F.textarea('winningHookPattern', 'Winning Hook Pattern')}
          {F.textarea('keyWeakness', 'Key Weakness')}
          {F.textarea('bestReusableElement', 'Best Reusable Element')}
          {F.textarea('suggestedVariationsToTest', 'Suggested Variations to Test')}
          {F.textarea('recommendedNextCreativeTest', 'Recommended Next Creative Test')}
          <div style={GRID2}>
            {F.number('confidenceScore', 'Confidence Score (0–10)')}
          </div>
          {F.text('confidenceReason', 'Confidence Reason')}
        </CollapsibleSection>

        {/* 12 · Notes */}
        <CollapsibleSection title="12 · Notes">
          {F.textarea('notes', 'Notes')}
        </CollapsibleSection>

        {/* ── Bottom actions ────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {aiMessage && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 'var(--border-radius-md)',
              color: aiMessage.type === 'success' ? '#085041' : '#7A1F1F',
              background: aiMessage.type === 'success' ? '#E1F5EE' : '#FEECEC',
              lineHeight: 1.5,
            }}>
              {aiMessage.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={aiLoading}
              onClick={handleAiTag}
            >
              {aiLoading ? '⏳ Tagging…' : '✦ AI Tag This Ad'}
            </button>
            <button
              className="btn btn-sm btn-danger"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? '…' : '🗑 Delete'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
