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
          "What the user typed: a brand/account handle, a free-text search phrase, a category/niche name, or a full competitor URL.",
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
          "Other platforms worth running separately for the same query. Leave empty if the user explicitly named one platform.",
      },
      term: {
        type: "string",
        description:
          "Cleaned search term to send to Bright Data: the handle (without @), the keyword phrase, the category name, or the full URL. Strip platform words, region words, and 'last 30 days'-style modifiers.",
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
        description: "Days back to constrain results to. Null if not mentioned.",
      },
      reasoning: {
        type: "string",
        description:
          "One short sentence shown to the user explaining the routing decision. No marketing fluff — just the decision rationale.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Soft warnings the UI should display. Include 'Meta currently fails' if you routed to Meta. Empty array if none.",
      },
    },
    required: ["intent", "platform", "term", "reasoning"],
  },
};

const SYSTEM = `You parse natural-language scrape queries for an ad-intelligence platform.

Output is rendered as a "We'll scrape: …" preview card the user confirms before the scrape launches, so be precise and conservative.

Routing rules:
- "@handle" or "name.com" → intent=handle, term=the handle without "@" or domain TLD.
- "ads for X", "X ads", "X in last 30 days" → intent=keyword.
- A bare niche/category like "weight loss" or "skincare" → intent=keyword (categories collapse to keywords for BD search).
- A full URL ("https://…") → intent=competitor_url, term=the URL.

Platform routing:
- User names a platform explicitly → use it.
- Handle/domain with no platform → Instagram (BD has the most reliable handle-based scrape for IG).
- Keyword/category with no platform → TikTok (default), and list Instagram + YouTube in alsoConsider.

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
