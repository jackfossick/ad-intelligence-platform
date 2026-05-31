/**
 * POST /api/search-strategy
 *
 * NWLA-50: redesigned from the old /api/parse-query single-plan parser into
 * an AI-driven *strategist* that returns an array of search plans.
 *
 * The strategist reasons about the user's intent, then proposes 1–4 BD-friendly
 * search plans the user picks from before scraping. Each plan is one BD trigger.
 *
 * Falls back to the regex strategy (single literal-keyword plan) if
 * ANTHROPIC_API_KEY is missing or the LLM call fails — that way the UI
 * never breaks on an LLM outage.
 *
 * Body:   { text: string }
 * Reply:  SearchStrategy (see lib/searchStrategy.ts)
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fallbackStrategy, sanitiseLLMStrategy, type SearchStrategy } from "@/lib/searchStrategy";

const MODEL = "claude-sonnet-4-6";

const STRATEGY_TOOL = {
  name: "ad_search_strategy",
  description:
    "Structured strategy for an ad-library scrape. Returns 1–4 BD-friendly search plans the user picks from. " +
    "Each plan is ONE BD trigger — the dispatcher fans out one snapshot per ticked plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: ["brand", "topic", "competitor", "url"],
        description:
          "Classification of the user's request. " +
          "`brand` = they want a specific brand/account's ads. " +
          "`topic` = they want ads about a subject (the common case for long natural-language inputs). " +
          "`competitor` = they pasted a Meta Ad Library competitor URL. " +
          "`url` = any other URL paste.",
      },
      reasoning: {
        type: "string",
        description:
          "One short sentence above the plan list explaining the overall strategy. " +
          "Tell the user *why* you proposed multiple plans (or one plan). No marketing fluff.",
      },
      plans: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["TikTok", "Meta", "Instagram", "YouTube"],
              description: "Platform to dispatch this single plan to.",
            },
            intent: {
              type: "string",
              enum: ["keyword", "handle", "competitor_url"],
              description:
                "How to send `keyword` to BD: `keyword` = free-text search, `handle` = brand username, `competitor_url` = paste a URL.",
            },
            keyword: {
              type: "string",
              description:
                "The actual string sent to BD. For `topic` intent, this is a SHORT BD-friendly search term (2–4 words), NOT the user's full natural-language sentence. " +
                "Example: input `weight loss before and after for women over 40` → keyword `weight loss transformation` or `before after weight loss women`. " +
                "For `handle` intent, just the username (no `@`). For `competitor_url`, the URL.",
            },
            maxResults: {
              type: "number",
              description: "10–500 ads for this plan. Default 100. Honour an explicit count in the user's request.",
            },
            country: {
              type: "string",
              description: "ISO 3166-1 alpha-2. Default 'US'.",
            },
            language: {
              type: ["string", "null"],
              description: "ISO 639-1 if specified, else null.",
            },
            dateRangeDays: {
              type: ["number", "null"],
              description: "Days back to constrain results, or null. 'last week'=7, 'last month'=30, 'last quarter'=90, 'last year'=365.",
            },
            reason: {
              type: "string",
              description:
                "One short sentence explaining *why this specific plan*. " +
                "Example: 'TikTok concentrates before/after transformation content from creators in this niche.'",
            },
          },
          required: ["platform", "intent", "keyword", "reason"],
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Soft warnings to surface in the UI. Include 'Meta currently fails (NWLA-23)' if any plan routes to Meta. Empty array if none.",
      },
      confidence: {
        type: "number",
        description:
          "Strategy-level confidence 0..1. " +
          "≥ 0.85 = unambiguous (explicit handle + platform, or clean topic with strong signals). " +
          "0.6–0.85 = inferred but reasonable. " +
          "< 0.6 = genuinely uncertain — the UI will force confirmation before running.",
      },
    },
    required: ["intent", "reasoning", "plans", "confidence"],
  },
};

const SYSTEM = `You are an ad-discovery strategist for an ad-intelligence platform.

The user types a natural-language request. Your job: figure out what kind of ads they're actually looking for, then propose 1–4 search plans that will SURFACE THOSE ADS on Bright Data's ad-library scrapers. Each plan becomes one BD snapshot.

CORE PRINCIPLE: BD matches keywords literally. A long sentence like "weight loss before and after for women over 40" returns zero hits because no ad's metadata contains that exact phrase. You MUST decompose long requests into 2–4 short BD-friendly keywords (2–4 words each) that real creators actually tag/caption.

Decomposition rules:
- "weight loss before and after for women over 40" →
   • TikTok, keyword "weight loss transformation" — TikTok concentrates this format.
   • Instagram, keyword "before after weight loss" — IG has the strongest before/after grid posts.
   • TikTok, keyword "weight loss women 40s" — narrower demographic angle.
- "ozempic ads from women influencers" →
   • TikTok, keyword "ozempic transformation"
   • Instagram, keyword "ozempic journey"
- "skincare for oily skin" →
   • TikTok, keyword "oily skin routine"
   • Instagram, keyword "oily skin skincare"
- "ads for hair loss" →
   • TikTok, keyword "hair loss treatment"
   • YouTube, keyword "hair regrowth"

Single-plan cases (do NOT fan out):
- A specific @handle or domain → one plan, intent=handle, platform from context (default IG).
- A pasted URL → one plan, intent=competitor_url (Meta if Ad Library URL).
- A single brand word ("nike") → one plan with intent=keyword, mark confidence ~0.5; suggest the user edit if they meant the brand handle.
- A short clean keyword phrase the user already wrote ("running shoes ads") → one plan.

Platform routing:
- Before/after transformation content → TikTok primary, Instagram secondary.
- Influencer content → TikTok and Instagram.
- Tutorial/long-form → YouTube.
- Direct-response brand campaigns → Meta (but warn it currently fails — NWLA-23).
- Beauty / fashion grid → Instagram.
- If user explicitly named a platform, respect it for the primary plan.

Modifiers:
- "in the US" → country=US (default). "in the UK" → GB.
- "in spanish" → language=es, otherwise null.
- "last 30 days" → dateRangeDays=30, etc.
- "50 ads" → maxResults=50 (per plan). Default 100. Don't interpret "30 days" as 30 results.

Always:
- Generate 1–4 plans. Never 0, never more than 4.
- Each plan needs its own short "reason" — the UI shows it next to the row so the user can decide which plans to keep.
- Keep keywords SHORT (2–4 words). Never paste the user's full sentence as a keyword.
- One overall reasoning sentence above the plan list.
- Set warnings (notably "Meta currently fails — NWLA-23") when applicable.`;

export async function POST(req: NextRequest) {
  let text: string;
  try {
    const body = await req.json() as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: "text must be <= 1000 chars" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const strategy = fallbackStrategy(text);
    return NextResponse.json({
      ...strategy,
      warnings: [
        ...strategy.warnings,
        "ANTHROPIC_API_KEY is not set — using rule-based fallback strategy (single literal-phrase plan). Set the env var for AI-generated search plans.",
      ],
    } satisfies SearchStrategy);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      tools: [STRATEGY_TOOL],
      tool_choice: { type: "tool", name: STRATEGY_TOOL.name },
      messages: [{ role: "user", content: text }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Anthropic response missing tool_use block");
    }

    const strategy = sanitiseLLMStrategy(
      toolBlock.input as Record<string, unknown>,
      text,
    );
    return NextResponse.json(strategy);
  } catch (e) {
    const fallback = fallbackStrategy(text);
    const msg = e instanceof Error ? e.message : "LLM strategy failed";
    return NextResponse.json({
      ...fallback,
      warnings: [
        ...fallback.warnings,
        `Smart strategy unavailable (${msg.slice(0, 120)}). Showing rule-based fallback — review carefully before running.`,
      ],
    } satisfies SearchStrategy);
  }
}
