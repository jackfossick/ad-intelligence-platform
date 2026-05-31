/**
 * Natural-language → AI-driven search strategy for Fast-mode scraping.
 *
 * NWLA-50 redesign: the old `lib/queryParse.ts` returned ONE literal plan
 * (`keyword = "weight loss before and after for women over 40"`) which BD
 * matched literally and returned zero rows for. This module replaces that
 * with a strategist:
 *
 *   user input  →  intent classification  →  array of search plans
 *
 * Each plan is one BD trigger. The UI shows the plans, lets the user
 * tick/untick rows, and fans out scrapes when "Run all selected" is hit.
 *
 * Two layers:
 *   1. `fallbackStrategy` — deterministic. Synchronous. Emits a single
 *      plan derived from regex parsing of the input. Used when no LLM key
 *      is set OR when the LLM call fails OR for the immediate preview
 *      shown while the LLM call is in flight.
 *   2. `parseLLMStrategy` — server-side, called from /api/search-strategy.
 *      Uses Anthropic Sonnet 4.6 with a tool schema that returns the
 *      structured plan array.
 */

import type { SupportedPlatform } from "./brightData";

/** What kind of ad-discovery request the user made. */
export type StrategyIntent = "brand" | "topic" | "competitor" | "url";

/** Search routing for a single plan — one BD trigger. */
export type SearchPlanIntent = "keyword" | "handle" | "competitor_url";

export type SearchPlan = {
  /** Stable id used as React key and in run telemetry. */
  id: string;
  /** Platform to dispatch this single plan to. */
  platform: SupportedPlatform;
  /** What kind of input to send to BD: keyword search, handle, or URL. */
  intent: SearchPlanIntent;
  /** Cleaned keyword/handle/URL to send to BD. */
  keyword: string;
  /** Per-plan max results (10–500). User can edit before launch. */
  maxResults: number;
  /** ISO 3166-1 alpha-2. Defaults to "US". */
  country: string;
  /** ISO 639-1 if specified by the user, else null. */
  language: string | null;
  /** Days back to constrain results, or null for unconstrained. */
  dateRangeDays: number | null;
  /** Short one-sentence rationale for *this* plan — shown next to the row. */
  reason: string;
};

export type SearchStrategy = {
  /** Original raw text from the user. */
  rawText: string;
  /** What kind of request the user made — drives the strategist's plan shape. */
  intent: StrategyIntent;
  /** Array of search plans the strategist generated. 1–4 plans. */
  plans: SearchPlan[];
  /** Overall one-sentence rationale shown above the plan list. */
  reasoning: string;
  /** Soft warnings (Meta currently fails, country-filter caveats, etc.). */
  warnings: string[];
  /** "llm" or "fallback". UI hints when a richer plan list is available. */
  source: "llm" | "fallback";
  /**
   * Strategist confidence in the overall strategy, 0..1.
   *
   *   ≥ 0.85 — high; UI runs without extra confirmation.
   *   0.6 – 0.85 — medium; UI shows plans, user can launch directly.
   *   < 0.6 — low; UI forces an explicit "Confirm and run" gate.
   */
  confidence: number;
};

const SUPPORTED: SupportedPlatform[] = ["TikTok", "Meta", "Instagram", "YouTube"];

const AMBIGUOUS_BRAND_TOKENS = new Set([
  "nike", "adidas", "apple", "tesla", "amazon", "google",
  "samsung", "puma", "uber", "airbnb", "netflix", "spotify",
]);

/** Random plan id — 8 chars, base36. Stable enough as React keys + telemetry tags. */
function newPlanId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Map a free-text platform name (or alias) to a SupportedPlatform. */
export function normalisePlatform(raw: string | null | undefined): SupportedPlatform | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (/\btiktok\b|\btt\b/.test(s)) return "TikTok";
  if (/\binstagram\b|\binsta\b|\big\b/.test(s)) return "Instagram";
  if (/\bmeta\b|\bfacebook\b|\bfb\b/.test(s)) return "Meta";
  if (/\byoutube\b|\byt\b/.test(s)) return "YouTube";
  return null;
}

function extractAllPlatforms(text: string): SupportedPlatform[] {
  const s = text.toLowerCase();
  const hits: { idx: number; p: SupportedPlatform }[] = [];
  const patterns: { re: RegExp; p: SupportedPlatform }[] = [
    { re: /\btiktok\b|\btt\b/g,                   p: "TikTok"    },
    { re: /\binstagram\b|\binsta\b|\big\b/g,      p: "Instagram" },
    { re: /\bmeta\b|\bfacebook\b|\bfb\b/g,        p: "Meta"      },
    { re: /\byoutube\b|\byt\b/g,                  p: "YouTube"   },
  ];
  for (const { re, p } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) hits.push({ idx: m.index, p });
  }
  hits.sort((a, b) => a.idx - b.idx);
  const out: SupportedPlatform[] = [];
  for (const h of hits) if (!out.includes(h.p)) out.push(h.p);
  return out;
}

function extractUrl(text: string): {
  url: string;
  intent: SearchPlanIntent;
  strategyIntent: StrategyIntent;
  platform: SupportedPlatform | null;
  term: string;
} | null {
  const m = text.match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;)\]>]+$/, "");

  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return { url, intent: "competitor_url", strategyIntent: "url", platform: null, term: url }; }

  if (host.includes("facebook.com") && url.toLowerCase().includes("/ads/library")) {
    return { url, intent: "competitor_url", strategyIntent: "competitor", platform: "Meta", term: url };
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    const slug = url.match(/facebook\.com\/(?:pages\/[^/]+\/)?([^/?#]+)/i)?.[1];
    return { url, intent: "handle", strategyIntent: "brand", platform: "Meta", term: slug ?? url };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const slug = url.match(/tiktok\.com\/@([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", strategyIntent: "brand", platform: "TikTok", term: slug }
      : { url, intent: "competitor_url", strategyIntent: "url", platform: "TikTok", term: url };
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const slug = url.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", strategyIntent: "brand", platform: "Instagram", term: slug }
      : { url, intent: "competitor_url", strategyIntent: "url", platform: "Instagram", term: url };
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    const slug = url.match(/youtube\.com\/(?:@|c\/|channel\/|user\/)?([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", strategyIntent: "brand", platform: "YouTube", term: slug }
      : { url, intent: "competitor_url", strategyIntent: "url", platform: "YouTube", term: url };
  }

  return { url, intent: "competitor_url", strategyIntent: "url", platform: null, term: url };
}

function extractHandleOrDomain(text: string): { handle: string; isDomain: boolean } | null {
  const at = text.match(/@([A-Za-z0-9._-]{2,})/);
  if (at) return { handle: at[1], isDomain: false };
  const domain = text.match(/\b([a-z0-9-]{2,})\.(com|co|io|net|org|uk|us|app|store|shop)\b/i);
  if (domain) return { handle: domain[1], isDomain: true };
  return null;
}

const STOPWORDS = new Set([
  "the", "and", "or", "with", "for", "of", "in", "on", "from", "by", "via", "only",
  "find", "get", "scrape", "all", "platforms", "show", "fetch", "pull", "grab",
  "ads", "ad", "tiktok", "meta", "facebook", "instagram", "youtube", "yt", "ig", "fb", "insta", "tt",
  "last", "days", "day", "weeks", "week", "months", "month", "year", "quarter",
  "english", "spanish", "french", "german", "language", "lang",
  "us", "uk", "usa", "country", "region", "canada", "australia",
  "this", "that", "about", "around",
]);

function extractSearchTerm(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/@([A-Za-z0-9._-]{2,})/g, " ")
    .replace(/\b[a-z0-9-]{2,}\.(com|co|io|net|org|uk|us|app|store|shop)\b/gi, " ")
    .replace(/\blast\s+\d+\s+(days?|weeks?|months?)\b/g, " ")
    .replace(/\blast\s+(week|month|year|quarter)\b/g, " ")
    .replace(/\bin\s+(the\s+)?(us|usa|uk|eu|europe|america|canada|australia)\b/g, " ")
    .replace(/\bin\s+(english|spanish|french|german)\b/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .slice(0, 6)
    .join(" ");
  return cleaned.trim();
}

function extractMaxResults(text: string): number {
  const explicit = text.match(/\b(\d{2,4})\s*(ads?|results?|items?|posts?)\b/i);
  if (explicit) return Math.max(10, Math.min(500, Number(explicit[1])));
  const bare = text.match(/\b(\d{2,4})\b/);
  if (!bare) return 100;
  // Look at 12 chars on each side so age qualifiers ("over 40", "under 25",
  // "aged 30+") don't bleed into maxResults the same way "30 days" doesn't.
  const ctx = text.slice(Math.max(0, (bare.index ?? 0) - 12), (bare.index ?? 0) + bare[1].length + 12);
  if (/(?:last|past|previous)\s*\d/i.test(ctx) || /\d{1,3}\s*(?:days?|weeks?|months?|years?)/i.test(ctx)) {
    return 100;
  }
  if (/(?:over|under|above|below|aged?)\s*\d/i.test(ctx) || /\d{1,3}\s*\+/.test(ctx)) {
    return 100;
  }
  return Math.max(10, Math.min(500, Number(bare[1])));
}

function extractDateRangeDays(text: string): number | null {
  const t = text.toLowerCase();
  const m = t.match(/(?:last|past|previous)\s+(\d{1,3})\s*(day|days|d)\b/);
  if (m) return Math.max(1, Math.min(365, Number(m[1])));
  const w = t.match(/(?:last|past|previous)\s+(\d{1,3})\s*(week|weeks)\b/);
  if (w) return Math.max(1, Math.min(365, Number(w[1]) * 7));
  const mo = t.match(/(?:last|past|previous)\s+(\d{1,3})\s*(month|months)\b/);
  if (mo) return Math.max(1, Math.min(365, Number(mo[1]) * 30));
  if (/(?:last|past)\s+week\b/.test(t)) return 7;
  if (/(?:last|past)\s+month\b/.test(t)) return 30;
  if (/(?:last|past)\s+(quarter|3\s+months)\b/.test(t)) return 90;
  if (/(?:last|past)\s+year\b/.test(t)) return 365;
  return null;
}

function extractCountry(text: string): string {
  const t = text.toLowerCase();
  if (/\bin\s+(the\s+)?uk\b|\bbritain\b|\bbritish\b/.test(t)) return "GB";
  if (/\bin\s+(the\s+)?(us|usa|america|states)\b/.test(t)) return "US";
  if (/\bin\s+canada\b|\bcanadian\b/.test(t)) return "CA";
  if (/\bin\s+australia\b|\baustralian\b/.test(t)) return "AU";
  if (/\bin\s+germany\b|\bgerman\s+market\b/.test(t)) return "DE";
  if (/\bin\s+france\b|\bfrench\s+market\b/.test(t)) return "FR";
  return "US";
}

function extractLanguage(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bin\s+spanish\b|\bspanish[-\s]language\b/.test(t)) return "es";
  if (/\bin\s+french\b|\bfrench[-\s]language\b/.test(t)) return "fr";
  if (/\bin\s+german\b|\bgerman[-\s]language\b/.test(t)) return "de";
  if (/\bin\s+english\b|\benglish[-\s]language\b/.test(t)) return "en";
  return null;
}

function buildWarnings(plans: SearchPlan[]): string[] {
  const w: string[] = [];
  if (plans.some((p) => p.platform === "Meta")) {
    w.push(
      "Meta scraping currently returns a Bright Data crawl_error — see NWLA-23. " +
      "Plans routed to Meta will reach BD but are expected to fail until that is fixed.",
    );
  }
  if (plans.some((p) => p.platform === "Instagram" && p.country !== "US")) {
    w.push(
      "Instagram plans ignore the country filter — BD's IG dataset only takes a username. " +
      "Results from IG plans will be unfiltered by country.",
    );
  }
  return w;
}

/**
 * Regex/heuristic fallback. Always emits exactly ONE plan. The strategist
 * cannot reason without an LLM, so when the key is missing or the call
 * fails we fall back to running the user's literal text as a single scrape.
 * The reason string is honest about it so the user can rewrite the query.
 */
export function fallbackStrategy(rawText: string): SearchStrategy {
  const text = rawText.trim();
  const urlInfo = extractUrl(text);
  const allPlatforms = extractAllPlatforms(text);
  const platformHint = allPlatforms[0] ?? null;
  const handleMatch = urlInfo ? null : extractHandleOrDomain(text);

  const country = extractCountry(text);
  const language = extractLanguage(text);
  const dateRangeDays = extractDateRangeDays(text);
  const maxResults = extractMaxResults(text);

  let plan: SearchPlan;
  let strategyIntent: StrategyIntent;
  let confidence: number;
  let reasoning: string;

  if (urlInfo) {
    strategyIntent = urlInfo.strategyIntent;
    confidence = 0.9;
    plan = {
      id: newPlanId(),
      platform: urlInfo.platform ?? platformHint ?? "Meta",
      intent: urlInfo.intent,
      keyword: urlInfo.term,
      maxResults,
      country,
      language,
      dateRangeDays,
      reason: urlInfo.intent === "handle"
        ? `Profile URL → scraping ${urlInfo.term} on ${urlInfo.platform ?? "the detected platform"}.`
        : `Pasted URL → scraping it directly.`,
    };
    reasoning = urlInfo.intent === "handle"
      ? `Detected a profile URL on ${plan.platform} — single brand scrape.`
      : `Detected a URL — running it as a competitor scrape.`;
  } else if (handleMatch) {
    strategyIntent = "brand";
    const platform = platformHint ?? "Instagram";
    confidence = platformHint ? 0.9 : 0.7;
    plan = {
      id: newPlanId(),
      platform,
      intent: "handle",
      keyword: handleMatch.handle,
      maxResults,
      country,
      language,
      dateRangeDays,
      reason: platformHint
        ? `Brand handle @${handleMatch.handle} on ${platform}.`
        : `Brand handle @${handleMatch.handle} — defaulting to Instagram (BD's most reliable handle scrape). Switch the platform if you meant TikTok/Meta/YouTube.`,
    };
    reasoning = platformHint
      ? `Detected a brand handle on ${platform}.`
      : `Detected a brand handle — defaulting to Instagram. Pick a different platform if needed.`;
  } else {
    strategyIntent = "topic";
    const platform = platformHint ?? "TikTok";
    const cleaned = extractSearchTerm(text);
    const term = cleaned || text.replace(/[^\w\s-]/g, " ").trim();
    const isAmbiguousBare = /^[a-z][a-z0-9-]*$/i.test(term.trim())
      && AMBIGUOUS_BRAND_TOKENS.has(term.trim().toLowerCase());
    confidence = isAmbiguousBare ? 0.45 : platformHint ? 0.7 : 0.55;
    plan = {
      id: newPlanId(),
      platform,
      intent: "keyword",
      keyword: term || text,
      maxResults,
      country,
      language,
      dateRangeDays,
      reason: isAmbiguousBare
        ? `Ambiguous bare word "${term}" — could be a brand or a generic keyword. Edit if you meant the brand handle.`
        : platformHint
          ? `Keyword scrape on ${platform}.`
          : `Keyword scrape — defaulting to ${platform}. AI strategist is unavailable so this is one literal-phrase scrape; rewrite or expand manually if it returns few hits.`,
    };
    reasoning = platformHint
      ? `Running as a keyword scrape on ${platform}.`
      : isAmbiguousBare
        ? `"${term}" could be a brand or a keyword — pick the right plan below.`
        : `AI strategist unavailable — running as one literal-phrase scrape on ${platform}.`;
  }

  const warnings = buildWarnings([plan]);

  return {
    rawText: text,
    intent: strategyIntent,
    plans: [plan],
    reasoning,
    warnings,
    source: "fallback",
    confidence,
  };
}

/**
 * Clamp/sanitise a partially-trusted LLM tool-use response into a
 * SearchStrategy. Anything missing/invalid falls back to the regex output.
 */
export function sanitiseLLMStrategy(
  raw: Partial<SearchStrategy> & Record<string, unknown>,
  rawText: string,
): SearchStrategy {
  const fb = fallbackStrategy(rawText);

  const intent: StrategyIntent = ["brand", "topic", "competitor", "url"].includes(raw.intent as string)
    ? (raw.intent as StrategyIntent)
    : fb.intent;

  const reasoning = typeof raw.reasoning === "string" && raw.reasoning.trim()
    ? raw.reasoning.trim().slice(0, 400)
    : fb.reasoning;

  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.85;

  const rawPlans = Array.isArray(raw.plans) ? raw.plans : [];
  const plans: SearchPlan[] = [];
  for (const p of rawPlans.slice(0, 4)) {
    if (!p || typeof p !== "object") continue;
    const cand = p as Record<string, unknown>;
    const platform: SupportedPlatform | null = SUPPORTED.includes(cand.platform as SupportedPlatform)
      ? (cand.platform as SupportedPlatform)
      : null;
    const keyword = typeof cand.keyword === "string" ? cand.keyword.trim() : "";
    if (!platform || !keyword) continue;

    const planIntent: SearchPlanIntent = ["keyword", "handle", "competitor_url"].includes(cand.intent as string)
      ? (cand.intent as SearchPlanIntent)
      : (intent === "brand" ? "handle" : intent === "url" || intent === "competitor" ? "competitor_url" : "keyword");

    const maxResults = typeof cand.maxResults === "number"
      ? Math.max(10, Math.min(500, Math.round(cand.maxResults)))
      : fb.plans[0].maxResults;

    const country = typeof cand.country === "string" && /^[A-Za-z]{2}$/.test(cand.country)
      ? cand.country.toUpperCase()
      : fb.plans[0].country;

    const language = typeof cand.language === "string" && /^[a-z]{2}$/.test(cand.language)
      ? cand.language
      : (cand.language === null ? null : fb.plans[0].language);

    const dateRangeDays = typeof cand.dateRangeDays === "number"
      ? Math.max(1, Math.min(365, Math.round(cand.dateRangeDays)))
      : fb.plans[0].dateRangeDays;

    const reason = typeof cand.reason === "string" && cand.reason.trim()
      ? cand.reason.trim().slice(0, 200)
      : `${platform} ${planIntent} scrape.`;

    plans.push({
      id: newPlanId(),
      platform,
      intent: planIntent,
      keyword,
      maxResults,
      country,
      language,
      dateRangeDays,
      reason,
    });
  }

  if (plans.length === 0) return fb;

  const warningsFromLLM: string[] = [];
  if (Array.isArray(raw.warnings)) {
    for (const w of raw.warnings) if (typeof w === "string" && w.trim()) warningsFromLLM.push(w.trim());
  }
  const merged = [...warningsFromLLM, ...buildWarnings(plans)];
  const warnings = Array.from(new Set(merged));

  return {
    rawText,
    intent,
    plans,
    reasoning,
    warnings,
    source: "llm",
    confidence,
  };
}

/**
 * BD payload helper — strips a leading "@" so the handle reaches BD's
 * dataset adapter cleanly (TikTok/IG/YouTube datasets all expect a bare
 * username; the BD adapter handles its own prefix logic upstream).
 */
export function keywordForBrightData(plan: SearchPlan): string {
  if (plan.intent === "handle") return plan.keyword.replace(/^@/, "");
  return plan.keyword;
}
