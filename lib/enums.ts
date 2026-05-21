/**
 * Controlled vocabulary — single source of truth for all enum values
 * used across the platform (UI, normalizer, validation, export).
 */

export const PLATFORMS = [
  "TikTok", "Instagram", "Facebook", "Meta", "YouTube",
  "Pinterest", "Snapchat", "Twitter", "X",
] as const;
export type Platform = typeof PLATFORMS[number];

export const HOOK_TYPES = [
  "audience_callout", "shock_statement", "curiosity_gap", "problem_callout",
  "transformation_claim", "controversial_take", "myth_busting", "question_hook",
  "visual_surprise", "pain_point_hook", "status_trigger", "secret_reveal",
  "mistake_warning", "before_after",
] as const;
export type HookType = typeof HOOK_TYPES[number];

export const CREATIVE_FORMATS = [
  "talking_head", "ugc_selfie", "product_demo", "screen_recording", "skit",
  "montage", "before_after", "unboxing", "tutorial", "reaction",
  "customer_footage", "meme_format", "polished_brand_ad", "ai_avatar",
  "text_overlay_only", "comment_reply",
] as const;
export type CreativeFormat = typeof CREATIVE_FORMATS[number];

export const CREATIVE_ANGLES = [
  "problem_solution", "before_after", "testimonial", "product_demo",
  "founder_story", "myth_busting", "comparison", "educational_breakdown",
  "ugc_recommendation", "objection_handling", "trend_adaptation",
  "lifestyle_aspiration", "social_proof", "contrarian_take",
  "personal_confession", "mistake_correction",
] as const;
export type CreativeAngle = typeof CREATIVE_ANGLES[number];

export const CREATIVE_BUCKETS = [
  "copy_this", "learn_from_this", "watchlist", "reject",
] as const;
export type CreativeBucket = typeof CREATIVE_BUCKETS[number];

export const AWARENESS_STAGES = [
  "unaware", "problem_aware", "solution_aware", "product_aware", "most_aware",
] as const;
export type AwarenessStage = typeof AWARENESS_STAGES[number];

export const TAGGING_STATUSES = [
  "untagged", "manual_tagged", "ai_tagged", "human_reviewed",
] as const;
export type TaggingStatus = typeof TAGGING_STATUSES[number];

export const REVIEW_STATUSES = [
  "new", "unreviewed", "reviewed", "useful", "rejected",
] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const USEFULNESS_STATUSES = [
  "useful", "not_useful", "uncertain",
] as const;
export type UsefulnessStatus = typeof USEFULNESS_STATUSES[number];

export const RECOMMENDED_ACTIONS = [
  "keep", "review", "delete_candidate",
] as const;
export type RecommendedAction = typeof RECOMMENDED_ACTIONS[number];

export const INGESTION_SOURCES = [
  "brightdata", "apify", "claude_chrome", "csv", "manual",
] as const;
export type IngestionSource = typeof INGESTION_SOURCES[number];

export const ORGANIC_OR_PAID = ["organic", "paid", "unknown"] as const;

// ── Helper: check membership ─────────────────────────────────
export function isValidEnum(value: unknown, list: readonly string[]): boolean {
  return typeof value === "string" && list.includes(value as string);
}

// ── Human-readable descriptions (for tooltips) ───────────────
export const HOOK_TYPE_DESCRIPTIONS: Record<string, string> = {
  audience_callout:     "Directly addresses the target audience (e.g. 'If you're a busy mum…')",
  shock_statement:      "Opens with a surprising or alarming claim",
  curiosity_gap:        "Creates an information gap that compels watching (e.g. 'Here's what no one tells you…')",
  problem_callout:      "Names the problem the viewer has right now",
  transformation_claim: "Promises a clear before/after change",
  controversial_take:   "States an opinion most people disagree with",
  myth_busting:         "Contradicts a widely-held belief",
  question_hook:        "Opens with a question the viewer wants answered",
  visual_surprise:      "Hook is primarily visual — unexpected image or action",
  pain_point_hook:      "Leads with a specific pain the viewer feels",
  status_trigger:       "Appeals to how the viewer wants to be perceived",
  secret_reveal:        "Promises inside information others don't know",
  mistake_warning:      "Warns about a common mistake the viewer might be making",
  before_after:         "Shows or implies the transformation visually",
};

export const FORMAT_DESCRIPTIONS: Record<string, string> = {
  talking_head:       "Person speaking directly to camera — no heavy editing",
  ugc_selfie:         "Raw, authentic self-recorded footage — looks user-generated",
  product_demo:       "Shows the product being used or its features",
  screen_recording:   "Captures a phone or computer screen",
  skit:               "Short acted scene or role-play",
  montage:            "Fast-cut sequence of clips",
  before_after:       "Visual split showing transformation",
  unboxing:           "Opening/revealing a product for the first time",
  tutorial:           "Step-by-step instructional content",
  reaction:           "Reacting to another piece of content",
  customer_footage:   "Real customer video used in the ad",
  meme_format:        "Follows a recognisable internet meme template",
  polished_brand_ad:  "High-production branded content",
  ai_avatar:          "AI-generated avatar presenter",
  text_overlay_only:  "Primarily text on screen, minimal live footage",
  comment_reply:      "Reply to a real comment used as the hook",
};
