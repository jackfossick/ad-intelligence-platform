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
 */

import type { SupportedPlatform } from "./brightData";

export type QueryIntent = "handle" | "keyword" | "category" | "competitor_url";

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
};

const SUPPORTED: SupportedPlatform[] = ["TikTok", "Meta", "Instagram", "YouTube"];

/** Map a free-text platform name (or alias) to a SupportedPlatform. */
export function normalisePlatform(raw: string | null | undefined): SupportedPlatform | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (/tiktok|tt\b/.test(s)) return "TikTok";
  if (/instagram|insta\b|\big\b/.test(s)) return "Instagram";
  if (/meta|facebook|fb\b/.test(s)) return "Meta";
  if (/youtube|yt\b/.test(s)) return "YouTube";
  return null;
}

/** Pull a handle from text like "@gymshark" or "gymshark.com". Returns null on no match. */
function extractHandleOrDomain(text: string): { handle: string; isDomain: boolean } | null {
  const at = text.match(/@([A-Za-z0-9._-]{2,})/);
  if (at) return { handle: at[1], isDomain: false };
  const domain = text.match(/\b([a-z0-9-]{2,})\.(com|co|io|net|org|uk|us|app)\b/i);
  if (domain) return { handle: domain[1], isDomain: true };
  return null;
}

const STOPWORDS = new Set([
  "the", "and", "or", "with", "for", "of", "in", "on", "from",
  "find", "get", "scrape", "all", "platforms",
  "ads", "ad", "tiktok", "meta", "facebook", "instagram", "youtube", "yt",
  "last", "days", "day", "weeks", "week", "months", "month",
  "english", "spanish", "french", "german",
  "us", "uk", "usa", "country", "region",
  "this", "that", "about", "around",
]);

/** Strip platform/region/length tokens out of the raw text to leave search terms. */
function extractSearchTerm(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/@([A-Za-z0-9._-]{2,})/g, " ")
    .replace(/\b[a-z0-9-]{2,}\.(com|co|io|net|org|uk|us|app)\b/gi, " ")
    .replace(/\blast\s+\d+\s+(days?|weeks?|months?)\b/g, " ")
    .replace(/\bin\s+(the\s+)?(us|usa|uk|eu|europe|america)\b/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .slice(0, 6)
    .join(" ");
  return cleaned.trim();
}

function extractMaxResults(text: string): number {
  const m = text.match(/\b(\d{2,4})\b/);
  if (!m) return 100;
  return Math.max(10, Math.min(500, Number(m[1])));
}

function extractDateRangeDays(text: string): number | null {
  const t = text.toLowerCase();
  const m = t.match(/last\s+(\d{1,3})\s*(day|days|d)/);
  if (m) return Math.max(1, Math.min(365, Number(m[1])));
  if (/last\s+week/.test(t)) return 7;
  if (/last\s+month/.test(t)) return 30;
  if (/last\s+(quarter|3\s+months)/.test(t)) return 90;
  return null;
}

function extractCountry(text: string): string {
  const t = text.toLowerCase();
  if (/\bin\s+(the\s+)?uk\b|\bbritain\b|\bbritish\b/.test(t)) return "GB";
  if (/\bin\s+(the\s+)?(us|usa|america|states)\b/.test(t)) return "US";
  if (/\bin\s+canada\b|\bcanadian\b/.test(t)) return "CA";
  if (/\bin\s+australia\b|\baustralian\b/.test(t)) return "AU";
  return "US";
}

function extractLanguage(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bspanish\b|\bes\b/.test(t)) return "es";
  if (/\bfrench\b|\bfr\b/.test(t)) return "fr";
  if (/\bgerman\b|\bde\b/.test(t)) return "de";
  if (/\benglish\b|\ben\b/.test(t)) return "en";
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
  const lower = text.toLowerCase();

  const platformHint = normalisePlatform(
    /tiktok/.test(lower) ? "tiktok" :
    /instagram|insta\b/.test(lower) ? "instagram" :
    /meta|facebook/.test(lower) ? "meta" :
    /youtube|yt\b/.test(lower) ? "youtube" : null,
  );

  const handleMatch = extractHandleOrDomain(text);
  const platform: SupportedPlatform = platformHint ?? (handleMatch ? "Instagram" : "TikTok");
  const warnings: string[] = [];

  if (platform === "Meta") {
    warnings.push(
      "Meta scraping currently returns a Bright Data crawl_error — see NWLA-23. " +
      "The request will reach BD but is expected to fail until that is fixed.",
    );
  }

  let intent: QueryIntent;
  let term: string;
  if (handleMatch) {
    intent = "handle";
    term = handleMatch.handle;
  } else {
    intent = "keyword";
    const cleaned = extractSearchTerm(text);
    term = cleaned || text.replace(/[^\w\s-]/g, " ").trim();
  }

  const alsoConsider: SupportedPlatform[] = [];
  if (!platformHint && intent === "keyword") {
    // Generic keyword with no platform hint — surface the other supported ones
    // so the user can run extra snapshots if they want.
    for (const p of SUPPORTED) if (p !== platform && p !== "Meta") alsoConsider.push(p);
  }

  return {
    intent,
    platform,
    alsoConsider,
    term: term || text,
    rawText: text,
    maxResults: extractMaxResults(text),
    country: extractCountry(text),
    language: extractLanguage(text),
    dateRangeDays: extractDateRangeDays(text),
    reasoning: platformHint
      ? `Detected ${platform} from the text and parsed the rest as a ${intent}.`
      : intent === "handle"
        ? `Detected a handle/domain — defaulting to ${platform}. Edit the platform if you meant something else.`
        : `No platform mentioned — defaulting to TikTok keyword search. Pick a different platform if you meant Meta/IG/YouTube.`,
    warnings,
    source: "fallback",
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

  const reasoning = typeof raw.reasoning === "string" && raw.reasoning.trim()
    ? raw.reasoning.trim().slice(0, 400)
    : fb.reasoning;

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
