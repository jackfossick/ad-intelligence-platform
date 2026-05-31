/**
 * POST /api/parse-query
 *
 * Parses a free-form fast-scrape query into a deterministic ParsedQuery the
 * UI can render and the dispatcher can route on. Uses Anthropic Claude with
 * the tool-use JSON schema so the structure is guaranteed.
 *
 * Falls back to the regex parser if ANTHROPIC_API_KEY is missing or the LLM
 * call fails — that way the UI never breaks on a parser outage.
 *
 * Body:   { text: string }
 * Reply:  ParsedQuery (see lib/queryParse.ts)
 *
 * NWLA-50: schema now requires confidence + ambiguousFields so the UI can
 * mark uncertain extractions and force an explicit confirm before launch.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { fallbackParse, sanitiseLLMResult, type ParsedQuery } from "@/lib/queryParse";

const MODEL = "claude-sonnet-4-5";

const PARSE_TOOL = {
  name: "parsed_scrape_query",
  description:
    "Structured plan for an ad-library scrape, derived from a free-form natural-language query.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: ["handle", "keyword", "category", "competitor_url"],
        description:
          "What the user typed: a brand/account handle, a free-text search phrase, a category/niche name, or a full competitor URL. " +
          "Prefer `handle` only when the text contains a clear @mention, a domain, or a brand the user explicitly said to scrape ads for. " +
          "When the input is one bare word that is a well-known brand AND a generic keyword (e.g. `nike`), pick `keyword` and add `intent` to `ambiguousFields`.",
      },
      platform: {
        type: "string",
        enum: ["TikTok", "Meta", "Instagram", "YouTube"],
        description:
          "Best single platform to dispatch this scrape to. If the user named a platform explicitly use that. Otherwise pick the platform most likely to surface the kind of content described.",
      },
      alsoConsider: {
        type: "array",
        items: { type: "string", enum: ["TikTok", "Meta", "Instagram", "YouTube"] },
        description:
          "Other platforms worth running separately for the same query. " +
          "Include every platform the user named that wasn't picked as the primary (e.g. `weight loss on tiktok and instagram` → primary=TikTok, alsoConsider=[Instagram]). " +
          "Leave empty if the user explicitly named one platform only.",
      },
      term: {
        type: "string",
        description:
          "Cleaned search term to send to Bright Data: the handle (without @), the keyword phrase, the category name, or the full URL. " +
          "Strip platform words, region words, 'last 30 days'-style modifiers, language tags, and explicit max-result counts.",
      },
      maxResults: {
        type: "number",
        description: "10–500. Default 100. Honour an explicit count in the query (e.g. '50 ads').",
      },
      country: {
        type: "string",
        description: "ISO 3166-1 alpha-2 country code, e.g. 'US' or 'GB'. Default 'US'.",
      },
      language: {
        type: ["string", "null"],
        description: "ISO 639-1 language code if the user mentioned a language, else null.",
      },
      dateRangeDays: {
        type: ["number", "null"],
        description:
          "Days back to constrain results to. Null if not mentioned. Convert 'last week' to 7, 'last month' to 30, 'last quarter' to 90, 'last year' to 365.",
      },
      reasoning: {
        type: "string",
        description:
          "One short sentence shown to the user explaining the routing decision. No marketing fluff — just the decision rationale. " +
          "If `intent` or `platform` is ambiguous, explain *why* it's ambiguous so the user can correct it.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Soft warnings the UI should display. Include 'Meta currently fails' if you routed to Meta. Empty array if none.",
      },
      confidence: {
        type: "number",
        description:
          "Your confidence in the overall extraction, 0..1. " +
          "Use ≥ 0.85 when the input is unambiguous (e.g. explicit @handle + platform); " +
          "0.6–0.85 when at least one field was inferred but reasonable; " +
          "< 0.6 when intent or platform is genuinely uncertain (the UI will force the user to explicitly confirm).",
      },
      ambiguousFields: {
        type: "array",
        items: {
          type: "string",
          enum: ["intent", "platform", "term", "country", "language", "dateRangeDays"],
        },
        description:
          "Field names where the extraction is genuinely uncertain — the UI marks these red and forces edit. " +
          "Use sparingly: only flag a field when a reasonable alternative reading exists. " +
          "Examples: bare `nike` → ['intent']; `weight loss ads` with no platform → ['platform']; URL with no Library/Search hint → []. " +
          "Leave empty when the parse is clean.",
      },
    },
    required: ["intent", "platform", "term", "reasoning", "confidence", "ambiguousFields"],
  },
};

const SYSTEM = `You parse natural-language scrape queries for an ad-intelligence platform.

Output is rendered as a "We'll scrape: …" preview card the user confirms before the scrape launches, so be precise and conservative.

Intent routing:
- "@handle" or "name.com" → intent=handle, term=the handle without "@" or domain TLD.
- Any "https://…" URL → intent=competitor_url, term=the URL. If it's a Meta Ad Library link, set platform=Meta. If it's a tiktok.com/@x, instagram.com/x, or youtube.com/@x profile URL, intent=handle on that platform with term=the slug.
- "ads for X", "X ads", "X in last 30 days", a bare niche/category like "weight loss" or "skincare" → intent=keyword.
- A single bare word that's a well-known brand AND a generic keyword (e.g. "nike", "apple") → intent=keyword AND add "intent" to ambiguousFields with a confidence of 0.4–0.5.

Platform routing:
- User names a platform explicitly → use it. If the user named more than one (e.g. "weight loss on tiktok and instagram"), pick the first as primary and put the rest in alsoConsider.
- Handle/domain with no platform → Instagram (BD has the most reliable handle-based scrape for IG). Flag platform in ambiguousFields.
- Keyword/category with no platform → TikTok (default), list Instagram + YouTube in alsoConsider, and flag platform in ambiguousFields.

Modifiers:
- "in the US" / "in the UK" → country=US/GB. Default US.
- "in spanish" / "spanish-language" → language=es. Otherwise null. Don't infer language from a brand name.
- "last 30 days" / "last week" / "last month" → dateRangeDays. Null if not mentioned.
- "50 ads" / "100 results" → maxResults. Default 100. Don't interpret "30 days" as 30 results.

Confidence rules:
- 0.9+: explicit URL, explicit @handle + explicit platform, or a clear domain + explicit platform.
- 0.75–0.85: clean keyword + explicit platform, OR handle/domain with default platform.
- 0.6–0.74: clean keyword, no platform mentioned, or handle/domain with default platform AND no other signals.
- < 0.6: at least one field is genuinely ambiguous — must list those fields in ambiguousFields.

Always include a one-sentence reasoning. If you routed to Meta, add a warning that Meta currently fails (NWLA-23 tracks the underlying crawl_error fix).`;

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
    // No key in env — return the fallback parse so the UI keeps working.
    const parsed = fallbackParse(text);
    return NextResponse.json({
      ...parsed,
      warnings: [
        ...parsed.warnings,
        "ANTHROPIC_API_KEY is not set — using rule-based fallback parse. Set the env var for smarter parsing.",
      ],
    } satisfies ParsedQuery);
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: PARSE_TOOL.name },
      messages: [{ role: "user", content: text }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Anthropic response missing tool_use block");
    }

    const parsed = sanitiseLLMResult(
      toolBlock.input as Record<string, unknown>,
      text,
    );
    return NextResponse.json(parsed);
  } catch (e) {
    // LLM outage / quota / network — return the rule-based parse and a soft
    // warning so the user can still launch a scrape.
    const fallback = fallbackParse(text);
    const msg = e instanceof Error ? e.message : "LLM parse failed";
    return NextResponse.json({
      ...fallback,
      warnings: [
        ...fallback.warnings,
        `Smart parse unavailable (${msg.slice(0, 120)}). Showing rule-based parse — review carefully before running.`,
      ],
    } satisfies ParsedQuery);
  }
}
