/**
 * Natural-language query parsing for the Fast-mode scrape input.
 *
 * Two layers:
 *   1. `fallbackParse` — deterministic regex parse. Always available, fires
 *      synchronously so the UI can show *something* immediately while the
 *      LLM call is in flight, and is the only path when ANTHROPIC_API_KEY
 *      is unset (build-time, local dev without keys).
 *   2. `parseQueryLLM` (server-only, in /api/parse-query) — Anthropic call
 *      with a strict tool-use schema so the JSON shape is guaranteed.
 *
 * Output (ParsedQuery) feeds the scrape dispatcher and is also shown to the
 * user as a confirmation card before any BD snapshot is triggered (NWLA-32).
 *
 * NWLA-50: added `confidence` (0..1) and `ambiguousFields` so the UI can
 * mark uncertain extractions and force an explicit confirm before launch.
 */

import type { SupportedPlatform } from "./brightData";

export type QueryIntent = "handle" | "keyword" | "category" | "competitor_url";

/** Field keys that may be flagged as ambiguous by the parser. */
export type AmbiguousField =
  | "intent"
  | "platform"
  | "term"
  | "country"
  | "language"
  | "dateRangeDays";

export type ParsedQuery = {
  /** What kind of input the user typed. */
  intent: QueryIntent;
  /** Primary platform to dispatch to. */
  platform: SupportedPlatform;
  /** Other platforms worth running separately. UI surfaces these as chips. */
  alsoConsider: SupportedPlatform[];
  /** Cleaned search term — handle (without @), keyword phrase, or page name. */
  term: string;
  /** Original raw text from the user. */
  rawText: string;
  /** 10..500. */
  maxResults: number;
  /** ISO 3166-1 alpha-2, defaults to "US". */
  country: string;
  /** ISO 639-1, e.g. "en". Optional — passed through to BD where supported. */
  language: string | null;
  /** Number of days back. null = no constraint. */
  dateRangeDays: number | null;
  /** Short rationale shown to the user. */
  reasoning: string;
  /** Soft warnings (e.g. "Meta scraping currently fails — see NWLA-23"). */
  warnings: string[];
  /** "llm" or "fallback" — UI hints when a richer parse is available. */
  source: "llm" | "fallback";
  /**
   * Parser confidence in the overall extraction, 0..1.
   *
   *   ≥ 0.85 — high; UI runs without extra confirmation.
   *   0.6 – 0.85 — medium; UI shows plan, user can launch directly.
   *   < 0.6 — low; UI forces an explicit "Confirm and run" gate.
   *
   * Fallback path emits 0.45–0.9 depending on signal strength. LLM path is
   * trusted only when it returns its own number; missing → defaults to 0.85.
   */
  confidence: number;
  /** Field keys that the parser is unsure about — UI marks them red. */
  ambiguousFields: AmbiguousField[];
};

const SUPPORTED: SupportedPlatform[] = ["TikTok", "Meta", "Instagram", "YouTube"];

/** Brands that are ambiguous between handle and keyword on a bare mention. */
const AMBIGUOUS_BRAND_TOKENS = new Set([
  "nike", "adidas", "apple", "tesla", "amazon", "google",
  "samsung", "puma", "uber", "airbnb", "netflix", "spotify",
]);

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

/** Find every platform named in the text, in source-order. */
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

/**
 * Detect a full URL in the input. Recognises:
 *   - Meta Ad Library URL → "competitor_url" + Meta platform
 *   - facebook.com / .../pages/... page URL → "handle" + Meta
 *   - tiktok.com / instagram.com / youtube.com profile/page URL → handle on that platform
 *   - any other http(s) URL → competitor_url, platform left to other detection.
 */
function extractUrl(text: string): {
  url: string;
  intent: QueryIntent;
  platform: SupportedPlatform | null;
  term: string;
} | null {
  const m = text.match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;)\]>]+$/, "");

  let host = "";
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return { url, intent: "competitor_url", platform: null, term: url }; }

  if (host.includes("facebook.com") && url.toLowerCase().includes("/ads/library")) {
    return { url, intent: "competitor_url", platform: "Meta", term: url };
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    const slug = url.match(/facebook\.com\/(?:pages\/[^/]+\/)?([^/?#]+)/i)?.[1];
    return { url, intent: "handle", platform: "Meta", term: slug ?? url };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const slug = url.match(/tiktok\.com\/@([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", platform: "TikTok", term: slug }
      : { url, intent: "competitor_url", platform: "TikTok", term: url };
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const slug = url.match(/instagram\.com\/([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", platform: "Instagram", term: slug }
      : { url, intent: "competitor_url", platform: "Instagram", term: url };
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    const slug = url.match(/youtube\.com\/(?:@|c\/|channel\/|user\/)?([^/?#]+)/i)?.[1];
    return slug
      ? { url, intent: "handle", platform: "YouTube", term: slug }
      : { url, intent: "competitor_url", platform: "YouTube", term: url };
  }

  return { url, intent: "competitor_url", platform: null, term: url };
}

/** Pull a handle from text like "@gymshark" or "gymshark.com". Returns null on no match. */
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
  // Prefer explicit "<N> ads" / "<N> results" over a bare number that might be
  // a date or a stray count — protects "30 days" from bleeding into maxResults.
  const explicit = text.match(/\b(\d{2,4})\s*(ads?|results?|items?|posts?)\b/i);
  if (explicit) return Math.max(10, Math.min(500, Number(explicit[1])));
  const bare = text.match(/\b(\d{2,4})\b/);
  if (!bare) return 100;
  const ctx = text.slice(Math.max(0, (bare.index ?? 0) - 5), (bare.index ?? 0) + bare[1].length + 12);
  if (/(?:last|past|previous)\s*\d/i.test(ctx) || /\d{1,3}\s*(?:days?|weeks?|months?|years?)/i.test(ctx)) {
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
  // Require "in <language>" or "<language>-language" framing so we don't
  // mis-extract a language from a brand name.
  if (/\bin\s+spanish\b|\bspanish[-\s]language\b/.test(t)) return "es";
  if (/\bin\s+french\b|\bfrench[-\s]language\b/.test(t)) return "fr";
  if (/\bin\s+german\b|\bgerman[-\s]language\b/.test(t)) return "de";
  if (/\bin\s+english\b|\benglish[-\s]language\b/.test(t)) return "en";
  return null;
}

/**
 * Synchronous regex-based parser. Used as fallback when the LLM key is
 * missing or the API call fails, and used as the immediate preview while
 * the LLM call is in flight. Conservative on intent: only flags `handle`
 * when an explicit `@x` or `x.com` is in the text.
 */
export function fallbackParse(rawText: string): ParsedQuery {
  const text = rawText.trim();
  const ambiguousFields: AmbiguousField[] = [];
  let confidence = 0.7;

  const urlInfo = extractUrl(text);
  const allPlatforms = extractAllPlatforms(text);
  const platformHint = allPlatforms[0] ?? null;
  const handleMatch = urlInfo ? null : extractHandleOrDomain(text);

  let intent: QueryIntent;
  let platform: SupportedPlatform;
  let term: string;

  if (urlInfo) {
    intent = urlInfo.intent;
    platform = urlInfo.platform ?? platformHint ?? "Meta";
    term = urlInfo.term;
    confidence = 0.9;
  } else if (handleMatch) {
    intent = "handle";
    platform = platformHint ?? "Instagram";
    term = handleMatch.handle;
    confidence = handleMatch.isDomain ? 0.85 : 0.9;
    if (!platformHint) ambiguousFields.push("platform");
  } else {
    intent = "keyword";
    platform = platformHint ?? "TikTok";
    const cleaned = extractSearchTerm(text);
    term = cleaned || text.replace(/[^\w\s-]/g, " ").trim();
    confidence = platformHint ? 0.75 : 0.6;
    if (!platformHint) ambiguousFields.push("platform");

    // Single-token, well-known brand → ambiguous (brand vs. keyword).
    const trimmedLower = term.toLowerCase().trim();
    if (/^[a-z][a-z0-9-]*$/i.test(trimmedLower) && AMBIGUOUS_BRAND_TOKENS.has(trimmedLower)) {
      ambiguousFields.push("intent");
      confidence = Math.min(confidence, 0.45);
    }
  }

  const warnings: string[] = [];
  if (platform === "Meta") {
    warnings.push(
      "Meta scraping currently returns a Bright Data crawl_error — see NWLA-23. " +
      "The request will reach BD but is expected to fail until that is fixed.",
    );
  }
  // NWLA-49: BD's Instagram dataset takes a username with no country field,
  // so any country the user specified will be silently ignored. Surface it
  // upfront instead of letting the result set look country-correct.
  const fbCountry = extractCountry(text);
  if (platform === "Instagram" && fbCountry !== "US") {
    warnings.push(
      `Instagram scrape ignores the country filter ("${fbCountry}") — BD's IG dataset only takes a username. ` +
      `Results will be unfiltered by country.`,
    );
  }

  // alsoConsider — additional platforms the user named, minus the primary,
  // plus other supported platforms when no platform was named on a keyword.
  const alsoConsider: SupportedPlatform[] = [];
  for (const p of allPlatforms) if (p !== platform && !alsoConsider.includes(p)) alsoConsider.push(p);
  if (!platformHint && intent === "keyword") {
    for (const p of SUPPORTED) {
      if (p !== platform && p !== "Meta" && !alsoConsider.includes(p)) alsoConsider.push(p);
    }
  }

  const country = extractCountry(text);
  const language = extractLanguage(text);
  const dateRangeDays = extractDateRangeDays(text);
  const maxResults = extractMaxResults(text);

  const reasoning = urlInfo
    ? `Detected a ${urlInfo.intent === "handle" ? "page/profile" : "competitor"} URL on ${platform}; using it directly.`
    : handleMatch
      ? platformHint
        ? `Detected ${platform} and a ${handleMatch.isDomain ? "domain" : "handle"} — parsing as a brand scrape.`
        : `Detected a ${handleMatch.isDomain ? "domain" : "handle"} — defaulting to ${platform}. Edit the platform if you meant something else.`
      : platformHint
        ? `Detected ${platform} from the text and parsed the rest as a keyword.`
        : ambiguousFields.includes("intent")
          ? `"${term}" could be a brand or a keyword — pick the right intent below before launching.`
          : `No platform mentioned — defaulting to TikTok keyword search. Pick a different platform if you meant Meta/IG/YouTube.`;

  return {
    intent,
    platform,
    alsoConsider,
    term: term || text,
    rawText: text,
    maxResults,
    country,
    language,
    dateRangeDays,
    reasoning,
    warnings,
    source: "fallback",
    confidence,
    ambiguousFields,
  };
}

/** Clamp/sanitise a partially-trusted LLM response into a ParsedQuery. */
export function sanitiseLLMResult(
  raw: Partial<ParsedQuery> & Record<string, unknown>,
  rawText: string,
): ParsedQuery {
  const fb = fallbackParse(rawText);
  const platform: SupportedPlatform =
    SUPPORTED.includes(raw.platform as SupportedPlatform)
      ? (raw.platform as SupportedPlatform)
      : fb.platform;

  const alsoConsiderRaw = Array.isArray(raw.alsoConsider) ? raw.alsoConsider : [];
  const alsoConsider: SupportedPlatform[] = [];
  for (const p of alsoConsiderRaw) {
    if (SUPPORTED.includes(p as SupportedPlatform) && p !== platform && !alsoConsider.includes(p as SupportedPlatform)) {
      alsoConsider.push(p as SupportedPlatform);
    }
  }

  const intent: QueryIntent = ["handle", "keyword", "category", "competitor_url"].includes(
    raw.intent as string,
  )
    ? (raw.intent as QueryIntent)
    : fb.intent;

  const term = typeof raw.term === "string" && raw.term.trim() ? raw.term.trim() : fb.term;
  const maxResults = typeof raw.maxResults === "number"
    ? Math.max(10, Math.min(500, Math.round(raw.maxResults)))
    : fb.maxResults;
  const country = typeof raw.country === "string" && /^[A-Za-z]{2}$/.test(raw.country)
    ? raw.country.toUpperCase()
    : fb.country;
  const language = typeof raw.language === "string" && /^[a-z]{2}$/.test(raw.language)
    ? raw.language
    : (raw.language === null ? null : fb.language);
  const dateRangeDays = typeof raw.dateRangeDays === "number"
    ? Math.max(1, Math.min(365, Math.round(raw.dateRangeDays)))
    : fb.dateRangeDays;

  const warnings: string[] = [];
  if (Array.isArray(raw.warnings)) {
    for (const w of raw.warnings) if (typeof w === "string" && w.trim()) warnings.push(w.trim());
  }
  if (platform === "Meta" && !warnings.some((w) => /NWLA-23|crawl_error|Meta/i.test(w))) {
    warnings.push(
      "Meta scraping currently fails with a Bright Data crawl_error — see NWLA-23. " +
      "The job will still launch so you can see the failure surfaced cleanly.",
    );
  }
  if (platform === "Instagram" && country !== "US" && !warnings.some((w) => /country/i.test(w))) {
    warnings.push(
      `Instagram scrape ignores the country filter ("${country}") — BD's IG dataset only takes a username. ` +
      `Results will be unfiltered by country.`,
    );
  }

  const reasoning = typeof raw.reasoning === "string" && raw.reasoning.trim()
    ? raw.reasoning.trim().slice(0, 400)
    : fb.reasoning;

  const llmConfidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.85;

  const ambigRaw = Array.isArray(raw.ambiguousFields) ? raw.ambiguousFields : [];
  const ambiguousFields: AmbiguousField[] = [];
  const allowed: AmbiguousField[] = ["intent", "platform", "term", "country", "language", "dateRangeDays"];
  for (const f of ambigRaw) {
    if (typeof f === "string" && allowed.includes(f as AmbiguousField) && !ambiguousFields.includes(f as AmbiguousField)) {
      ambiguousFields.push(f as AmbiguousField);
    }
  }

  return {
    intent,
    platform,
    alsoConsider,
    term,
    rawText,
    maxResults,
    country,
    language,
    dateRangeDays,
    reasoning,
    warnings,
    source: "llm",
    confidence: llmConfidence,
    ambiguousFields,
  };
}

/**
 * Synthesise the keyword/handle string we pass through to triggerSnapshot.
 *
 * BD adapter quirks (see lib/brightData.ts buildTrigger):
 *   - TikTok: keyword is appended to a search URL — so for `handle` intent
 *     we send "@<handle>" which produces a profile-page discover URL when
 *     synthesised into the search URL upstream. Adapter handles the leading
 *     "@" stripping per platform.
 *   - Instagram: keyword IS the username (BD discovers by user_name).
 *   - YouTube/Meta: keyword/phrase passed through.
 */
export function termForBrightData(parsed: ParsedQuery): string {
  if (parsed.intent === "handle") return parsed.term.replace(/^@/, "");
  return parsed.term;
}
