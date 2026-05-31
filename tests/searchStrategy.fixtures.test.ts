/**
 * NWLA-50 fixture suite for the NL → SearchStrategy strategist.
 *
 * The fallback path is deterministic — it always emits exactly ONE plan
 * (the strategist requires an LLM to decompose long requests). These tests
 * exercise that fallback shape AND the LLM-output sanitiser path (which
 * is where the multi-plan decomposition lands in production).
 */

import { describe, expect, it } from "vitest";
import {
  fallbackStrategy,
  sanitiseLLMStrategy,
  keywordForBrightData,
  type SearchStrategy,
} from "../lib/searchStrategy";

type FallbackFixture = {
  name: string;
  input: string;
  expect: {
    intent?: SearchStrategy["intent"];
    plansLength?: number;
    plan0?: {
      platform?: "TikTok" | "Meta" | "Instagram" | "YouTube";
      planIntent?: "keyword" | "handle" | "competitor_url";
      keywordContains?: string;
      keywordEquals?: string;
      country?: string;
      language?: string | null;
      dateRangeDays?: number | null;
      maxResults?: number;
    };
    confidenceAtLeast?: number;
    confidenceAtMost?: number;
    warningMatches?: RegExp;
  };
};

const FALLBACK_FIXTURES: FallbackFixture[] = [
  {
    name: "explicit @handle → single brand plan, defaults Instagram",
    input: "@gymshark",
    expect: {
      intent: "brand",
      plansLength: 1,
      plan0: { platform: "Instagram", planIntent: "handle", keywordEquals: "gymshark" },
      confidenceAtLeast: 0.6,
    },
  },
  {
    name: "domain → brand plan on Instagram",
    input: "gymshark.com",
    expect: {
      intent: "brand",
      plan0: { platform: "Instagram", planIntent: "handle", keywordEquals: "gymshark" },
    },
  },
  {
    name: "@handle + explicit platform → respect the platform",
    input: "@gymshark on tiktok",
    expect: {
      intent: "brand",
      plan0: { platform: "TikTok", planIntent: "handle", keywordEquals: "gymshark" },
      confidenceAtLeast: 0.85,
    },
  },
  {
    name: "keyword phrase, no platform → 1 fallback plan on TikTok",
    input: "weight loss before and after",
    expect: {
      intent: "topic",
      plansLength: 1,
      plan0: { platform: "TikTok", planIntent: "keyword", keywordContains: "weight" },
    },
  },
  {
    name: "keyword + explicit TikTok",
    input: "weight loss before and after on tiktok",
    expect: {
      plan0: { platform: "TikTok", planIntent: "keyword" },
      confidenceAtLeast: 0.6,
    },
  },
  {
    name: "'from youtube' → YouTube",
    input: "make me money fast from youtube",
    expect: {
      plan0: { platform: "YouTube", planIntent: "keyword" },
    },
  },
  {
    name: "'instagram only' → Instagram",
    input: "fitness influencers instagram only",
    expect: {
      plan0: { platform: "Instagram", planIntent: "keyword" },
    },
  },
  {
    name: "modifier: last 30 days",
    input: "fitness ads in the last 30 days",
    expect: {
      plan0: { dateRangeDays: 30, country: "US" },
    },
  },
  {
    name: "modifier: in spanish",
    input: "weight loss ads in spanish",
    expect: {
      plan0: { language: "es" },
    },
  },
  {
    name: "Meta Ad Library URL → competitor URL plan on Meta",
    input: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=US&view_all_page_id=123456",
    expect: {
      intent: "competitor",
      plan0: { platform: "Meta", planIntent: "competitor_url" },
      confidenceAtLeast: 0.85,
      warningMatches: /NWLA-23|Meta/i,
    },
  },
  {
    name: "Facebook page URL → handle plan on Meta",
    input: "https://www.facebook.com/gymshark",
    expect: {
      intent: "brand",
      plan0: { platform: "Meta", planIntent: "handle", keywordEquals: "gymshark" },
    },
  },
  {
    name: "explicit '100 facebook ads from athleanx' → maxResults=100, Meta",
    input: "100 facebook ads from athleanx",
    expect: {
      plan0: { platform: "Meta", maxResults: 100 },
    },
  },
  {
    name: "ambiguous bare brand → low confidence",
    input: "nike",
    expect: {
      plan0: { platform: "TikTok", planIntent: "keyword" },
      confidenceAtMost: 0.5,
    },
  },
  {
    name: "long NL request (the BD-zero-hit case) → 1 fallback plan with literal keyword",
    input: "weight loss before and after for women over 40",
    expect: {
      intent: "topic",
      plansLength: 1,
      plan0: { platform: "TikTok", planIntent: "keyword", keywordContains: "weight" },
    },
  },
  {
    name: "country modifier: in the UK",
    input: "fitness ads in the UK",
    expect: {
      plan0: { country: "GB" },
    },
  },
  {
    name: "age qualifier 'over 40' doesn't leak into maxResults",
    input: "weight loss before and after for women over 40",
    expect: {
      plan0: { maxResults: 100 },
    },
  },
];

describe("fallbackStrategy fixtures", () => {
  for (const fx of FALLBACK_FIXTURES) {
    it(fx.name, () => {
      const got = fallbackStrategy(fx.input);
      const e = fx.expect;
      if (e.intent) expect(got.intent).toBe(e.intent);
      if (e.plansLength !== undefined) expect(got.plans).toHaveLength(e.plansLength);
      if (e.plan0) {
        const p = got.plans[0];
        if (e.plan0.platform) expect(p.platform).toBe(e.plan0.platform);
        if (e.plan0.planIntent) expect(p.intent).toBe(e.plan0.planIntent);
        if (e.plan0.keywordContains) expect(p.keyword).toContain(e.plan0.keywordContains);
        if (e.plan0.keywordEquals) expect(p.keyword).toBe(e.plan0.keywordEquals);
        if (e.plan0.country) expect(p.country).toBe(e.plan0.country);
        if (e.plan0.language !== undefined) expect(p.language).toBe(e.plan0.language);
        if (e.plan0.dateRangeDays !== undefined) expect(p.dateRangeDays).toBe(e.plan0.dateRangeDays);
        if (e.plan0.maxResults !== undefined) expect(p.maxResults).toBe(e.plan0.maxResults);
      }
      if (e.confidenceAtLeast !== undefined) expect(got.confidence).toBeGreaterThanOrEqual(e.confidenceAtLeast);
      if (e.confidenceAtMost !== undefined) expect(got.confidence).toBeLessThanOrEqual(e.confidenceAtMost);
      if (e.warningMatches) expect(got.warnings.some((w) => e.warningMatches!.test(w))).toBe(true);
    });
  }
});

describe("sanitiseLLMStrategy (LLM path)", () => {
  it("accepts a clean multi-plan strategy (the production case)", () => {
    const raw = {
      intent: "topic",
      reasoning: "Decomposed long phrase into 3 BD-friendly searches across platforms that surface before/after content.",
      confidence: 0.9,
      plans: [
        { platform: "TikTok",    intent: "keyword", keyword: "weight loss transformation", maxResults: 100, country: "US", language: null, dateRangeDays: null, reason: "TT concentrates transformation content." },
        { platform: "Instagram", intent: "keyword", keyword: "before after weight loss",   maxResults: 100, country: "US", language: null, dateRangeDays: null, reason: "IG has the strongest grid posts." },
        { platform: "TikTok",    intent: "keyword", keyword: "weight loss women 40s",      maxResults: 100, country: "US", language: null, dateRangeDays: null, reason: "Narrower demographic angle." },
      ],
      warnings: [],
    };
    const got = sanitiseLLMStrategy(raw as Record<string, unknown>, "weight loss before and after for women over 40");
    expect(got.intent).toBe("topic");
    expect(got.plans).toHaveLength(3);
    expect(got.plans[0].platform).toBe("TikTok");
    expect(got.plans[0].keyword).toBe("weight loss transformation");
    expect(got.plans[1].platform).toBe("Instagram");
    expect(got.confidence).toBe(0.9);
    expect(got.source).toBe("llm");
  });

  it("caps the plan list at 4", () => {
    const plans = Array.from({ length: 8 }, (_, i) => ({
      platform: "TikTok",
      intent: "keyword",
      keyword: `kw${i}`,
      reason: "test",
    }));
    const got = sanitiseLLMStrategy({ intent: "topic", reasoning: "x", confidence: 0.8, plans } as Record<string, unknown>, "x");
    expect(got.plans.length).toBeLessThanOrEqual(4);
  });

  it("drops plans missing platform or keyword", () => {
    const got = sanitiseLLMStrategy({
      intent: "topic",
      reasoning: "x",
      confidence: 0.8,
      plans: [
        { platform: "TikTok", intent: "keyword", keyword: "ok", reason: "good" },
        { platform: "TikTok", intent: "keyword", keyword: "", reason: "empty kw" },
        { platform: "Mars", intent: "keyword", keyword: "bad", reason: "bad platform" },
      ],
    } as Record<string, unknown>, "x");
    expect(got.plans).toHaveLength(1);
    expect(got.plans[0].keyword).toBe("ok");
  });

  it("falls back to single-plan strategy when LLM returns zero valid plans", () => {
    const got = sanitiseLLMStrategy({
      intent: "topic", reasoning: "x", confidence: 0.8, plans: [],
    } as Record<string, unknown>, "weight loss");
    expect(got.source).toBe("fallback");
    expect(got.plans).toHaveLength(1);
  });

  it("clamps confidence to [0,1]", () => {
    const high = sanitiseLLMStrategy(
      { intent: "topic", reasoning: "x", confidence: 2.5, plans: [{ platform: "TikTok", intent: "keyword", keyword: "x", reason: "y" }] } as Record<string, unknown>,
      "x",
    );
    expect(high.confidence).toBe(1);
    const low = sanitiseLLMStrategy(
      { intent: "topic", reasoning: "x", confidence: -1, plans: [{ platform: "TikTok", intent: "keyword", keyword: "x", reason: "y" }] } as Record<string, unknown>,
      "x",
    );
    expect(low.confidence).toBe(0);
  });

  it("emits the Meta-fails warning when any plan routes to Meta", () => {
    const got = sanitiseLLMStrategy(
      {
        intent: "topic", reasoning: "x", confidence: 0.8, warnings: [],
        plans: [{ platform: "Meta", intent: "keyword", keyword: "x", reason: "y" }],
      } as Record<string, unknown>,
      "x on facebook",
    );
    expect(got.warnings.some((w: string) => /NWLA-23|Meta/i.test(w))).toBe(true);
  });

  it("emits the IG-country warning when an IG plan has a non-US country", () => {
    const got = sanitiseLLMStrategy(
      {
        intent: "topic", reasoning: "x", confidence: 0.8, warnings: [],
        plans: [{ platform: "Instagram", intent: "keyword", keyword: "x", country: "GB", reason: "y" }],
      } as Record<string, unknown>,
      "x in the UK on instagram",
    );
    expect(got.warnings.some((w: string) => /country/i.test(w))).toBe(true);
  });

  it("clamps maxResults to [10,500]", () => {
    const tooBig = sanitiseLLMStrategy(
      { intent: "topic", reasoning: "x", confidence: 0.8, plans: [{ platform: "TikTok", intent: "keyword", keyword: "x", maxResults: 9999, reason: "y" }] } as Record<string, unknown>,
      "x",
    );
    expect(tooBig.plans[0].maxResults).toBe(500);
    const tooSmall = sanitiseLLMStrategy(
      { intent: "topic", reasoning: "x", confidence: 0.8, plans: [{ platform: "TikTok", intent: "keyword", keyword: "x", maxResults: 1, reason: "y" }] } as Record<string, unknown>,
      "x",
    );
    expect(tooSmall.plans[0].maxResults).toBe(10);
  });
});

describe("keywordForBrightData", () => {
  it("strips a leading @ from handle plans", () => {
    expect(keywordForBrightData({
      id: "x", platform: "Instagram", intent: "handle", keyword: "@gymshark",
      maxResults: 100, country: "US", language: null, dateRangeDays: null, reason: "x",
    })).toBe("gymshark");
  });
  it("passes keywords through untouched", () => {
    expect(keywordForBrightData({
      id: "x", platform: "TikTok", intent: "keyword", keyword: "weight loss",
      maxResults: 100, country: "US", language: null, dateRangeDays: null, reason: "x",
    })).toBe("weight loss");
  });
});
