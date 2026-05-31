/**
 * NWLA-50 fixture suite for the NL → ParsedQuery parser.
 *
 * Each fixture asserts the deterministic regex path (`fallbackParse`) against
 * the expected ParsedQuery shape. The LLM path (`/api/parse-query`) shares the
 * same `sanitiseLLMResult` clamping, so anything missing from the LLM response
 * falls back to these same values — that's why we exercise the fallback here
 * rather than mocking Anthropic.
 *
 * Coverage spans:
 *   - Brand/handle: `@gymshark`, `gymshark.com`, `Gymshark ads`
 *   - Keyword phrase: `weight loss before and after`
 *   - Platform hints: `on tiktok`, `from youtube`, `instagram only`
 *   - Modifiers: `last 30 days`, `in the US`, `in spanish`
 *   - Competitor URL: Meta Ad Library URL, Facebook page URL
 *   - Multi-platform: `weight loss on tiktok and instagram`
 *   - Ambiguous: `nike`
 */

import { describe, expect, it } from "vitest";
import {
  fallbackParse,
  sanitiseLLMResult,
  type ParsedQuery,
} from "../lib/queryParse";

type Fixture = {
  name: string;
  input: string;
  expect: Partial<Pick<ParsedQuery,
    | "intent" | "platform" | "term" | "country" | "language"
    | "dateRangeDays" | "maxResults"
  >> & {
    alsoConsiderIncludes?: ParsedQuery["alsoConsider"];
    ambiguousIncludes?: ParsedQuery["ambiguousFields"];
    confidenceAtLeast?: number;
    confidenceAtMost?: number;
  };
};

const FIXTURES: Fixture[] = [
  {
    name: "explicit @handle, no platform → defaults Instagram, flags platform ambiguous",
    input: "@gymshark",
    expect: {
      intent: "handle",
      platform: "Instagram",
      term: "gymshark",
      ambiguousIncludes: ["platform"],
      confidenceAtLeast: 0.85,
    },
  },
  {
    name: "domain → handle on Instagram",
    input: "gymshark.com",
    expect: {
      intent: "handle",
      platform: "Instagram",
      term: "gymshark",
      ambiguousIncludes: ["platform"],
      confidenceAtLeast: 0.8,
    },
  },
  {
    name: "brand + 'ads' (no @ / no domain) → keyword path on TikTok",
    input: "Gymshark ads",
    expect: {
      intent: "keyword",
      platform: "TikTok",
      term: "gymshark",
      ambiguousIncludes: ["platform"],
    },
  },
  {
    name: "keyword phrase, no platform → TikTok + alsoConsider IG/YT",
    input: "weight loss before and after",
    expect: {
      intent: "keyword",
      platform: "TikTok",
      term: "weight loss before",
      alsoConsiderIncludes: ["Instagram", "YouTube"],
    },
  },
  {
    name: "keyword + explicit TikTok",
    input: "weight loss before and after on tiktok",
    expect: {
      intent: "keyword",
      platform: "TikTok",
      term: "weight loss before",
      confidenceAtLeast: 0.7,
    },
  },
  {
    name: "platform 'from youtube'",
    input: "make me money fast from youtube",
    expect: {
      intent: "keyword",
      platform: "YouTube",
      confidenceAtLeast: 0.7,
    },
  },
  {
    name: "'instagram only' is treated as IG platform",
    input: "fitness influencers instagram only",
    expect: {
      intent: "keyword",
      platform: "Instagram",
    },
  },
  {
    name: "modifier: last 30 days",
    input: "fitness ads in the last 30 days",
    expect: {
      intent: "keyword",
      dateRangeDays: 30,
      country: "US",
    },
  },
  {
    name: "modifier: in the US (default country still US)",
    input: "weight loss in the US",
    expect: {
      country: "US",
    },
  },
  {
    name: "modifier: in spanish",
    input: "weight loss ads in spanish",
    expect: {
      language: "es",
    },
  },
  {
    name: "Meta Ad Library URL → competitor_url on Meta",
    input: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&view_all_page_id=123456",
    expect: {
      intent: "competitor_url",
      platform: "Meta",
      confidenceAtLeast: 0.85,
    },
  },
  {
    name: "Facebook page URL → handle on Meta",
    input: "https://www.facebook.com/gymshark",
    expect: {
      intent: "handle",
      platform: "Meta",
      term: "gymshark",
    },
  },
  {
    name: "multi-platform: tiktok AND instagram",
    input: "weight loss on tiktok and instagram",
    expect: {
      intent: "keyword",
      platform: "TikTok",
      alsoConsiderIncludes: ["Instagram"],
    },
  },
  {
    name: "ambiguous bare brand → keyword + intent in ambiguousFields, low confidence",
    input: "nike",
    expect: {
      intent: "keyword",
      ambiguousIncludes: ["intent"],
      confidenceAtMost: 0.5,
    },
  },
  {
    name: "explicit '100 facebook ads from athleanx' → Meta keyword, maxResults=100",
    input: "100 facebook ads from athleanx",
    expect: {
      intent: "keyword",
      platform: "Meta",
      maxResults: 100,
    },
  },
];

describe("fallbackParse fixtures", () => {
  for (const fx of FIXTURES) {
    it(fx.name, () => {
      const got = fallbackParse(fx.input);
      const e = fx.expect;
      if (e.intent)        expect(got.intent).toBe(e.intent);
      if (e.platform)      expect(got.platform).toBe(e.platform);
      if (e.term !== undefined) expect(got.term).toContain(e.term);
      if (e.country)       expect(got.country).toBe(e.country);
      if (e.language !== undefined) expect(got.language).toBe(e.language);
      if (e.dateRangeDays !== undefined) expect(got.dateRangeDays).toBe(e.dateRangeDays);
      if (e.maxResults !== undefined) expect(got.maxResults).toBe(e.maxResults);
      if (e.alsoConsiderIncludes) {
        for (const p of e.alsoConsiderIncludes) expect(got.alsoConsider).toContain(p);
      }
      if (e.ambiguousIncludes) {
        for (const a of e.ambiguousIncludes) expect(got.ambiguousFields).toContain(a);
      }
      if (e.confidenceAtLeast !== undefined) {
        expect(got.confidence).toBeGreaterThanOrEqual(e.confidenceAtLeast);
      }
      if (e.confidenceAtMost !== undefined) {
        expect(got.confidence).toBeLessThanOrEqual(e.confidenceAtMost);
      }
    });
  }
});

describe("sanitiseLLMResult (LLM path)", () => {
  it("trusts a clean LLM response", () => {
    const raw: Record<string, unknown> = {
      intent: "handle",
      platform: "TikTok",
      term: "gymshark",
      maxResults: 200,
      country: "GB",
      language: "en",
      dateRangeDays: 30,
      reasoning: "Explicit handle and platform.",
      warnings: [],
      confidence: 0.95,
      ambiguousFields: [],
      alsoConsider: ["Instagram"],
    };
    const got = sanitiseLLMResult(raw, "@gymshark on tiktok in the UK in english last 30 days");
    expect(got.intent).toBe("handle");
    expect(got.platform).toBe("TikTok");
    expect(got.term).toBe("gymshark");
    expect(got.country).toBe("GB");
    expect(got.language).toBe("en");
    expect(got.dateRangeDays).toBe(30);
    expect(got.confidence).toBe(0.95);
    expect(got.ambiguousFields).toEqual([]);
    expect(got.alsoConsider).toEqual(["Instagram"]);
    expect(got.source).toBe("llm");
  });

  it("falls back per-field when the LLM omits values", () => {
    const got = sanitiseLLMResult(
      { intent: "keyword", platform: "TikTok", term: "weight loss", reasoning: "ok" },
      "weight loss",
    );
    // Missing maxResults → fallback default (100).
    expect(got.maxResults).toBe(100);
    // Missing confidence → default 0.85 (the LLM gave a clean plan).
    expect(got.confidence).toBe(0.85);
    expect(got.ambiguousFields).toEqual([]);
  });

  it("clamps confidence to [0,1] and rejects out-of-range LLM values", () => {
    const high = sanitiseLLMResult(
      { intent: "keyword", platform: "TikTok", term: "x", reasoning: "ok", confidence: 2.5 },
      "x",
    );
    expect(high.confidence).toBe(1);
    const low = sanitiseLLMResult(
      { intent: "keyword", platform: "TikTok", term: "x", reasoning: "ok", confidence: -1 },
      "x",
    );
    expect(low.confidence).toBe(0);
  });

  it("filters unknown ambiguousFields and keeps known ones", () => {
    const got = sanitiseLLMResult(
      {
        intent: "keyword",
        platform: "TikTok",
        term: "nike",
        reasoning: "ambig",
        confidence: 0.4,
        ambiguousFields: ["intent", "garbage", "platform"],
      } as Record<string, unknown>,
      "nike",
    );
    expect(got.ambiguousFields).toEqual(["intent", "platform"]);
  });

  it("emits the Meta-fails warning even when the LLM forgets it", () => {
    const got = sanitiseLLMResult(
      { intent: "keyword", platform: "Meta", term: "x", reasoning: "ok", warnings: [] },
      "x on facebook",
    );
    expect(got.warnings.some((w) => /NWLA-23|Meta/.test(w))).toBe(true);
  });
});
