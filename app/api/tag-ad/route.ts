import { NextRequest, NextResponse } from "next/server";
import {
  HOOK_TYPES,
  CREATIVE_ANGLES,
  CREATIVE_FORMATS,
  CREATIVE_BUCKETS,
  AWARENESS_STAGES,
  USEFULNESS_STATUSES,
  RECOMMENDED_ACTIONS,
  isValidEnum,
} from "@/lib/enums";

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert short-form ad creative analyst and strategist.

Analyse the provided ad/video data for reusable creative intelligence, then assess its usefulness for an AI ad-generation system.

Rules:
- Use only the data provided. Do not invent performance metrics.
- If evidence is missing, lower the confidence score.
- Score fields from 0 to 10. Use null or empty string where evidence is unavailable.
- Return valid JSON only.

Your output must answer TWO questions:
1. "What creative mechanisms make this ad work, and how could an AI system replicate them?"
2. "Is this ad worth keeping in our training database, or should it be deleted?"

For the usefulness assessment, consider:
- Is the creative pattern learnable and replicable by an AI avatar / talking-head system?
- Is there enough evidence to actually learn from it (has copy, hook, URL, or transcript)?
- Is it a strong example of its pattern, or a low-quality/near-duplicate?
- Ads with no URL, no copy, and no distinguishing pattern → "not_useful" / "delete_candidate"
- Ads with clear hooks, strong patterns, and good evidence → "useful" / "keep"
- Borderline cases with some evidence but limited replication value → "uncertain" / "review"

Return a JSON object with EXACTLY these fields:
{
  "hook_text": "",
  "hook_type": "",
  "target_persona": "",
  "awareness_stage": "",
  "pain_point": "",
  "desire": "",
  "creative_angle": "",
  "retention_structure": "",
  "creative_format": "",
  "primary_emotional_trigger": "",
  "secondary_emotional_trigger": "",
  "proof_type": "",
  "proof_mechanism": "",
  "cta_type": "",
  "virality_mechanic": "",
  "hook_strength_score": 0,
  "audience_specificity_score": 0,
  "pain_clarity_score": 0,
  "desire_intensity_score": 0,
  "angle_quality_score": 0,
  "message_clarity_score": 0,
  "retention_quality_score": 0,
  "emotional_intensity_score": 0,
  "proof_strength_score": 0,
  "platform_native_fit_score": 0,
  "shareability_score": 0,
  "comment_potential_score": 0,
  "conversion_intent_score": 0,
  "replicability_score": 0,
  "ai_avatar_adaptability_score": 0,
  "production_difficulty_score": 0,
  "compliance_risk_score": 0,
  "why_it_likely_worked": "",
  "why_it_likely_failed": "",
  "main_creative_pattern": "",
  "winning_hook_pattern": "",
  "retention_device": "",
  "key_weakness": "",
  "best_reusable_element": "",
  "suggested_variations_to_test": "",
  "recommended_next_creative_test": "",
  "creative_bucket": "",
  "confidence_score": 0,
  "confidence_reason": "",
  "usefulness_status": "",
  "usefulness_reason": "",
  "usefulness_confidence": 0,
  "recommended_action": ""
}

IMPORTANT: hook_type and creative_angle are DIFFERENT fields with DIFFERENT enums. Do not mix them.
- hook_type = the *opening device* in the first ~3 seconds (how the ad grabs attention).
- creative_angle = the *overall narrative framing* of the whole ad (the persuasion strategy).
Examples of correct pairing:
- An ad opening "If you're a busy mum…" then framed as a customer success story → hook_type: audience_callout, creative_angle: testimonial
- An ad opening with a glamorous lifestyle shot then framed around aspiration → hook_type: visual_surprise, creative_angle: lifestyle_aspiration
- An ad opening "Most people get this wrong…" then explaining how → hook_type: myth_busting, creative_angle: educational_breakdown
Never use a creative_angle value (e.g. lifestyle_aspiration, testimonial, problem_solution) as a hook_type. Never invent values outside the listed enums.

For hook_type use exactly one of: audience_callout, shock_statement, curiosity_gap, problem_callout, transformation_claim, controversial_take, myth_busting, question_hook, visual_surprise, pain_point_hook, status_trigger, secret_reveal, mistake_warning, before_after
For creative_angle use exactly one of: problem_solution, before_after, testimonial, product_demo, founder_story, myth_busting, comparison, educational_breakdown, ugc_recommendation, objection_handling, trend_adaptation, lifestyle_aspiration, social_proof, contrarian_take, personal_confession, mistake_correction
For creative_format use one of: talking_head, ugc_selfie, product_demo, screen_recording, skit, montage, before_after, unboxing, tutorial, reaction, customer_footage, meme_format, polished_brand_ad, ai_avatar, text_overlay_only, comment_reply
For creative_bucket use one of: copy_this, learn_from_this, watchlist, reject
For awareness_stage use one of: unaware, problem_aware, solution_aware, product_aware, most_aware
For usefulness_status use one of: useful, not_useful, uncertain
For recommended_action use one of: keep, review, delete_candidate
usefulness_confidence is 0-100 (how confident you are in the usefulness_status)`;

// ── Enum guard ────────────────────────────────────────────────────────────────
// GPT-4o occasionally cross-pollinates between hook_type and creative_angle
// (NWLA-47). For known cross-pollination cases we map to the nearest valid
// HOOK_TYPES value; otherwise we null out invalid enum values so they never
// reach the DB as enum violations.
const HOOK_TYPE_CROSS_POLLINATION: Record<string, string> = {
  lifestyle_aspiration:   "audience_callout",
  aspirational_statement: "audience_callout",
  testimonial:            "audience_callout",
  social_proof:           "audience_callout",
  problem_solution:       "problem_callout",
  educational_breakdown:  "curiosity_gap",
  contrarian_take:        "controversial_take",
  personal_confession:    "secret_reveal",
  mistake_correction:     "mistake_warning",
};

const ENUM_FIELDS: { field: string; enumList: readonly string[] }[] = [
  { field: "hook_type",          enumList: HOOK_TYPES },
  { field: "creative_angle",     enumList: CREATIVE_ANGLES },
  { field: "creative_format",    enumList: CREATIVE_FORMATS },
  { field: "creative_bucket",    enumList: CREATIVE_BUCKETS },
  { field: "awareness_stage",    enumList: AWARENESS_STAGES },
  { field: "usefulness_status",  enumList: USEFULNESS_STATUSES },
  { field: "recommended_action", enumList: RECOMMENDED_ACTIONS },
];

function sanitizeEnums(result: Record<string, unknown>): {
  cleaned: Record<string, unknown>;
  corrections: { field: string; from: string; to: string | null }[];
} {
  const cleaned = { ...result };
  const corrections: { field: string; from: string; to: string | null }[] = [];

  for (const { field, enumList } of ENUM_FIELDS) {
    const raw = cleaned[field];
    if (raw == null || raw === "") continue;
    if (isValidEnum(raw, enumList)) continue;

    const rawStr = String(raw);
    let mapped: string | null = null;
    if (field === "hook_type" && HOOK_TYPE_CROSS_POLLINATION[rawStr]) {
      mapped = HOOK_TYPE_CROSS_POLLINATION[rawStr];
    }
    cleaned[field] = mapped ?? "";
    corrections.push({ field, from: rawStr, to: mapped });
  }

  return { cleaned, corrections };
}

// ── Evidence fields — only these are forwarded from the ad ────────────────────
const EVIDENCE_FIELDS = [
  "source_platform",
  "source_url",
  "creative_video_url",
  "brand_or_creator",
  "organic_or_paid",
  "caption_or_ad_copy",
  "transcript",
  "visible_text_on_screen",
  "posted_date",
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
] as const;

export async function POST(req: NextRequest) {
  // ── Guard: API key must be set server-side ──────────────────────────────────
  const apiKey = process.env.PIF_OPENAI_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY (or PIF_OPENAI_KEY) is not configured on the server." },
      { status: 500 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Extract only evidence fields — never forward full ad or state ────────────
  const evidence: Record<string, unknown> = {};
  EVIDENCE_FIELDS.forEach((f) => {
    evidence[f] = body[f] ?? "";
  });

  // ── Call OpenAI ─────────────────────────────────────────────────────────────
  let openAiRes: Response;
  try {
    openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyse this ad and return creative intelligence + usefulness assessment as structured JSON.\n\nAd evidence:\n${JSON.stringify(evidence, null, 2)}`,
          },
        ],
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json(
      { error: `Failed to reach OpenAI: ${msg}` },
      { status: 502 }
    );
  }

  if (!openAiRes.ok) {
    const text = await openAiRes.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenAI error ${openAiRes.status}: ${text}` },
      { status: 502 }
    );
  }

  // ── Parse response ──────────────────────────────────────────────────────────
  const openAiData = (await openAiRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = openAiData.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "Empty response from OpenAI" },
      { status: 502 }
    );
  }

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "OpenAI returned invalid JSON", raw: content },
      { status: 502 }
    );
  }

  const { cleaned, corrections } = sanitizeEnums(result);
  if (corrections.length > 0) {
    console.warn("[tag-ad] enum corrections applied", corrections);
  }

  return NextResponse.json({ result: cleaned, corrections });
}
