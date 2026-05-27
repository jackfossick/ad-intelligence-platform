/**
 * normalizeAdData — shared ingestion normalizer.
 *
 * Accepts a raw object from any source (Apify actor output,
 * Claude Chrome JSON paste, CSV row) and returns a clean record
 * that maps directly onto the Prisma Ad model fields.
 *
 * Rules:
 *  - Preserves real URLs exactly — never invents them.
 *  - Requires at minimum one URL (referenceUrl or creativeVideoUrl).
 *  - Missing fields → null (never placeholder strings).
 *  - Unknown fields stored in rawSourcePayload (capped at 2 KB).
 */

export type RawAd = Record<string, unknown>;
export type IngestionSource = "brightdata" | "apify" | "claude_chrome" | "csv" | "manual";

export interface NormalizedAdInput {
  // Identity
  platform:          string | null;
  brandOrCreator:    string | null;
  externalId:        string | null;
  organicOrPaid:     string | null;  // "organic" | "paid"
  sourceType:        string | null;  // e.g. "ad_library", "organic_post"
  country:           string | null;
  language:          string | null;

  // URLs
  referenceUrl:      string | null;   // primary public link (ad library, post page)
  adLibraryUrl:      string | null;   // explicit Ad Library link if separate
  creativeVideoUrl:  string | null;   // direct video file or embed
  creativeImageUrl:  string | null;   // static creative image
  thumbnailUrl:      string | null;   // image/thumbnail
  destinationUrl:    string | null;   // landing page
  advertiserPageUrl: string | null;   // creator/brand profile URL

  // Creative text
  adCopy:            string | null;   // caption / body copy
  headline:          string | null;
  description:       string | null;
  ctaType:           string | null;
  offer:             string | null;   // visible_offer

  // Engagement (factual counts)
  views:             number | null;
  likes:             number | null;
  comments:          number | null;
  shares:            number | null;
  impressions:       number | null;
  spend:             number | null;
  currency:          string | null;
  engagementProxy:   number | null;  // engagement_rate_if_visible

  // Metadata
  firstSeen:         Date | null;
  lastSeen:          Date | null;
  notes:             string | null;  // also captures comments_sample, discount_code, etc.
  referenceTitle:    string | null;  // landing_page_title

  // Tagging defaults
  taggingStatus:     string;
  reviewStatus:      string;

  // Ingestion tracking
  ingestionSource:   IngestionSource;
  ingestionKeyword:  string | null;
  rawSourcePayload:  string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function str(raw: RawAd, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (v != null && v !== "" && typeof v !== "object") return String(v).trim();
  }
  return null;
}

function num(raw: RawAd, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    if (!isNaN(n) && isFinite(n)) return Math.round(n);
  }
  return null;
}

function date(raw: RawAd, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = raw[k];
    if (!v) continue;
    const d = new Date(String(v));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function nestedStr(raw: RawAd, path: string): string | null {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[p];
  }
  return cur != null && cur !== "" ? String(cur).trim() : null;
}

/** Validate that a string looks like a real URL (not a placeholder). */
function validUrl(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://")) return null;
  if (t.includes("example.com") || t.includes("placeholder")) return null;
  return t;
}

// ── Apify-specific field extraction ─────────────────────────────

function extractApifyInstagram(raw: RawAd): Partial<NormalizedAdInput> {
  // apify/instagram-scraper output shape
  const videoUrl = str(raw, "videoUrl", "videoUrlBackup");
  const displayUrl = str(raw, "displayUrl", "thumbnail");
  return {
    platform:         "Instagram",
    externalId:       str(raw, "id", "shortCode"),
    referenceUrl:     validUrl(str(raw, "url", "permalink")),
    creativeVideoUrl: validUrl(videoUrl),
    thumbnailUrl:     validUrl(displayUrl),
    brandOrCreator:   str(raw, "ownerUsername", "ownerId"),
    adCopy:           str(raw, "caption"),
    views:            num(raw, "videoPlayCount", "playCount", "videoViewCount"),
    likes:            num(raw, "likesCount", "likesCount"),
    comments:         num(raw, "commentsCount"),
    firstSeen:        date(raw, "timestamp", "takenAt"),
  };
}

function extractApifyTikTok(raw: RawAd): Partial<NormalizedAdInput> {
  // clockworks/tiktok-scraper output shape
  const meta = raw.videoMeta as Record<string, unknown> | undefined ?? {};
  const author = raw.authorMeta as Record<string, unknown> | undefined ?? {};
  return {
    platform:         "TikTok",
    externalId:       str(raw, "id"),
    referenceUrl:     validUrl(str(raw, "webVideoUrl")),
    creativeVideoUrl: validUrl(
      nestedStr(raw, "videoMeta.downloadAddr") ??
      str(raw, "videoUrl", "downloadUrl")
    ),
    thumbnailUrl:     validUrl(
      nestedStr(raw, "videoMeta.coverUrl") ??
      str(raw, "thumbnailUrl", "cover")
    ),
    brandOrCreator:   String(author.name ?? author.nickName ?? str(raw, "author") ?? "").trim() || null,
    adCopy:           str(raw, "text"),
    views:            num(raw, "playCount") ?? (typeof meta.duration === "number" ? null : null),
    likes:            num(raw, "diggCount", "likeCount"),
    comments:         num(raw, "commentCount"),
    shares:           num(raw, "shareCount"),
    firstSeen:        date(raw, "createTimeISO", "createTime"),
  };
}

function extractApifyFacebook(raw: RawAd): Partial<NormalizedAdInput> {
  // apify/facebook-ads-scraper output shape
  const snap = raw.snapshot as Record<string, unknown> | undefined ?? {};
  const vids = (snap.videos as Array<Record<string, unknown>>) ?? [];
  const imgs = (snap.images as Array<Record<string, unknown>>) ?? [];
  const archiveId = str(raw, "adArchiveID", "ad_archive_id");
  const libUrl = archiveId
    ? `https://www.facebook.com/ads/library/?id=${archiveId}`
    : null;
  return {
    platform:         "Meta",
    externalId:       archiveId,
    referenceUrl:     validUrl(libUrl ?? str(raw, "url")),
    adLibraryUrl:     validUrl(libUrl),
    creativeVideoUrl: validUrl(
      String(vids[0]?.video_hd_url ?? vids[0]?.video_sd_url ?? "").trim() || null
    ),
    thumbnailUrl:     validUrl(
      String(vids[0]?.video_preview_image_url ?? imgs[0]?.url ?? "").trim() || null
    ),
    brandOrCreator:   str(raw, "pageName", "page_name"),
    adCopy:           nestedStr(raw, "snapshot.body.markup.__html") ||
                      String((snap.body ?? snap.message) ?? "").trim() || null,
    headline:         String(snap.title ?? snap.link_title ?? "").trim() || null,
    destinationUrl:   validUrl(String(snap.link_url ?? "").trim() || null),
    firstSeen:        date(raw, "startDate", "start_date"),
  };
}

// ── Actor dispatch ───────────────────────────────────────────────

export function extractApifyFields(raw: RawAd, actor: string): Partial<NormalizedAdInput> {
  if (actor.includes("instagram")) return extractApifyInstagram(raw);
  if (actor.includes("tiktok"))    return extractApifyTikTok(raw);
  if (actor.includes("facebook"))  return extractApifyFacebook(raw);
  return {};
}

// ── Bright Data-specific field extraction ───────────────────────
// BD Dataset Marketplace returns snake_case JSON rows. Field names vary per
// dataset; the mappings below cover the documented common shapes for the
// TikTok / Meta-Ad-Library / Instagram datasets we use.

function extractBrightDataTikTok(raw: RawAd): Partial<NormalizedAdInput> {
  // BD's TikTok dataset returns *profile-level* rows (not flat videos) with
  // nested `top_videos[]` / `top_posts_data[]` arrays. Map the profile-level
  // fields here; the first top_video supplies the creative video URL.
  const topVideos = (raw.top_videos as Array<Record<string, unknown>> | undefined) ?? [];
  const v0 = topVideos[0] ?? {};
  return {
    platform:         "TikTok",
    externalId:       str(raw, "account_id", "id"),
    referenceUrl:     validUrl(str(raw, "url")),
    creativeVideoUrl: validUrl(str(v0, "video_url", "download_url")),
    thumbnailUrl:     validUrl(str(raw, "profile_pic_url_hd", "profile_pic_url") ?? str(v0, "cover")),
    brandOrCreator:   str(raw, "nickname", "account_id"),
    adCopy:           str(raw, "biography", "signature") ?? str(v0, "description"),
    views:            num(v0, "playcount", "play_count"),
    likes:            num(raw, "likes", "like_count", "digg_count"),
    comments:         num(v0, "commentcount", "comment_count"),
    shares:           num(v0, "share_count"),
    firstSeen:        date(raw, "create_time"),
  };
}

function extractBrightDataMeta(raw: RawAd): Partial<NormalizedAdInput> {
  const archiveId = str(raw, "ad_archive_id", "archive_id", "id");
  const libUrl = archiveId ? `https://www.facebook.com/ads/library/?id=${archiveId}` : null;
  return {
    platform:         "Meta",
    externalId:       archiveId,
    referenceUrl:     validUrl(libUrl ?? str(raw, "ad_library_url", "url")),
    adLibraryUrl:     validUrl(libUrl ?? str(raw, "ad_library_url")),
    creativeVideoUrl: validUrl(str(raw, "video_url", "creative_video_url", "video_hd_url", "video_sd_url")),
    creativeImageUrl: validUrl(str(raw, "image_url", "creative_image_url")),
    thumbnailUrl:     validUrl(str(raw, "thumbnail_url", "preview_image_url")),
    brandOrCreator:   str(raw, "page_name", "advertiser_name", "page"),
    adCopy:           str(raw, "ad_copy", "body", "ad_text"),
    headline:         str(raw, "headline", "title", "link_title"),
    destinationUrl:   validUrl(str(raw, "link_url", "destination_url", "landing_page_url")),
    ctaType:          str(raw, "cta", "call_to_action"),
    firstSeen:        date(raw, "start_date", "ad_started_at", "start_time"),
    lastSeen:         date(raw, "end_date", "ad_ended_at", "end_time"),
  };
}

function extractBrightDataInstagram(raw: RawAd): Partial<NormalizedAdInput> {
  // BD's IG dataset (discover_by=user_name) returns profile-level rows with a
  // nested `posts[]` array, similar shape to the TikTok dataset.
  const posts = (raw.posts as Array<Record<string, unknown>> | undefined) ?? [];
  const p0 = posts[0] ?? {};
  return {
    platform:         "Instagram",
    externalId:       str(raw, "id", "fbid"),
    referenceUrl:     validUrl(str(raw, "profile_url", "url")),
    creativeVideoUrl: validUrl(str(p0, "video_url", "media_url")),
    thumbnailUrl:     validUrl(str(raw, "profile_image_link") ?? str(p0, "display_url", "thumbnail_url")),
    brandOrCreator:   str(raw, "full_name", "account", "profile_name"),
    adCopy:           str(raw, "biography") ?? str(p0, "caption"),
    likes:            num(p0, "like_count", "likes"),
    comments:         num(p0, "comment_count", "comments"),
    views:            num(p0, "video_play_count", "play_count"),
    firstSeen:        date(p0, "timestamp", "taken_at"),
  };
}

function extractBrightDataYouTube(raw: RawAd): Partial<NormalizedAdInput> {
  return {
    platform:         "YouTube",
    externalId:       str(raw, "id", "video_id"),
    referenceUrl:     validUrl(str(raw, "video_url", "url")),
    creativeVideoUrl: validUrl(str(raw, "video_url", "url")),
    thumbnailUrl:     validUrl(str(raw, "preview_image", "thumbnail_url", "thumbnail")),
    brandOrCreator:   str(raw, "youtuber", "handle_name", "channel_name", "author"),
    advertiserPageUrl: validUrl(str(raw, "channel_url")),
    headline:         str(raw, "title"),
    adCopy:           str(raw, "description"),
    views:            num(raw, "views", "view_count"),
    likes:            num(raw, "likes", "like_count"),
    comments:         num(raw, "num_comments", "comment_count", "comments"),
    firstSeen:        date(raw, "date_posted", "upload_date", "published_at"),
  };
}

export function extractBrightDataFields(raw: RawAd, platform: string): Partial<NormalizedAdInput> {
  const p = platform.toLowerCase();
  if (p.includes("tiktok"))    return extractBrightDataTikTok(raw);
  if (p.includes("meta") || p.includes("facebook")) return extractBrightDataMeta(raw);
  if (p.includes("instagram")) return extractBrightDataInstagram(raw);
  if (p.includes("youtube"))   return extractBrightDataYouTube(raw);
  return {};
}

// ── Main normalizer ──────────────────────────────────────────────

export function normalizeAdData(
  raw: RawAd,
  source: IngestionSource,
  opts: { actor?: string; keyword?: string; platform?: string } = {}
): NormalizedAdInput | null {
  // Source-specific extraction first
  let extracted: Partial<NormalizedAdInput> = {};
  if (source === "apify" && opts.actor) {
    extracted = extractApifyFields(raw, opts.actor);
  } else if (source === "brightdata") {
    const plat = opts.platform ?? String(raw.platform ?? "");
    if (plat) extracted = extractBrightDataFields(raw, plat);
  }

  // Generic field mapping (Claude Chrome + CSV + fallback)
  const platform = extracted.platform ??
    str(raw, "platform", "source_platform", "sourcePlatform", "network") ?? null;

  const referenceUrl = extracted.referenceUrl ?? validUrl(
    str(raw, "source_url", "sourceUrl", "url", "ad_url", "adUrl",
        "ad_library_url", "adLibraryUrl", "permalink", "referenceUrl")
  );

  const adLibraryUrl = extracted.adLibraryUrl ?? validUrl(
    str(raw, "ad_library_url", "adLibraryUrl")
  );

  const creativeVideoUrl = extracted.creativeVideoUrl ?? validUrl(
    str(raw, "creative_video_url", "creativeVideoUrl", "video_url",
        "videoUrl", "media_url", "mediaUrl")
  );

  const creativeImageUrl = validUrl(
    str(raw, "creative_image_url", "creativeImageUrl", "image_url", "imageUrl")
  );

  const thumbnailUrl = extracted.thumbnailUrl ?? validUrl(
    str(raw, "thumbnail_url", "thumbnailUrl", "display_url", "displayUrl")
  );

  const destinationUrl = extracted.destinationUrl ?? validUrl(
    str(raw, "destination_url", "destinationUrl", "landing_page_url", "landingPageUrl")
  );

  const advertiserPageUrl = validUrl(
    str(raw, "profile_url", "profileUrl", "advertiser_page_url", "advertiserPageUrl")
  );

  const brandOrCreator = extracted.brandOrCreator ??
    str(raw, "brand_or_creator", "brandOrCreator", "brand", "creator",
        "advertiser_name", "advertiserName", "creator_handle", "creatorHandle",
        "page_name", "pageName", "advertiser", "author", "username") ?? null;

  const adCopy = extracted.adCopy ??
    str(raw, "caption_or_ad_copy", "captionOrAdCopy", "ad_copy", "adCopy",
        "caption", "copy", "body", "text") ?? null;

  const headline = extracted.headline ??
    str(raw, "headline", "title") ?? null;

  const description = str(raw, "description") ?? null;

  const ctaType = extracted.ctaType ??
    str(raw, "cta", "cta_type", "ctaType", "call_to_action", "callToAction") ?? null;

  const offer = str(raw, "visible_offer", "visibleOffer", "offer") ?? null;

  const referenceTitle = str(raw, "landing_page_title", "landingPageTitle", "referenceTitle") ?? null;

  const organicOrPaid = str(raw, "paid_or_organic", "paidOrOrganic",
    "organic_or_paid", "organicOrPaid", "source_type") ?? null;

  const sourceType = str(raw, "source_type", "sourceType") ?? null;

  const language = str(raw, "language", "lang") ?? null;

  const views = extracted.views ??
    num(raw, "views", "view_count", "viewCount", "play_count", "playCount") ?? null;

  const likes = extracted.likes ??
    num(raw, "likes", "like_count", "likeCount") ?? null;

  const comments = extracted.comments ??
    num(raw, "comments", "comment_count", "commentCount") ?? null;

  const shares = extracted.shares ??
    num(raw, "shares", "share_count", "shareCount") ?? null;

  const impressions = num(raw, "impressions", "impression_count", "impressionCount") ?? null;
  const spend       = num(raw, "spend") ?? null;
  const currency    = str(raw, "currency") ?? null;
  const engagementProxy = num(raw, "engagement_rate_if_visible", "engagementRate",
    "engagement_rate", "engagementProxy") ?? null;

  const firstSeen = extracted.firstSeen ??
    date(raw, "posted_date", "postedDate", "first_seen", "firstSeen",
         "start_date", "startDate", "timestamp") ?? null;

  const lastSeen = date(raw, "last_seen", "lastSeen") ?? null;

  // Aggregate supplementary text into notes (comments sample, discount codes, ad status)
  const notesParts: string[] = [];
  const rawNotes = str(raw, "notes");
  if (rawNotes) notesParts.push(rawNotes);
  const commentsSample = str(raw, "comments_sample_if_visible", "commentsSample");
  if (commentsSample) notesParts.push(`Comments: ${commentsSample}`);
  const discountCode = str(raw, "discount_code", "discountCode");
  if (discountCode) notesParts.push(`Code: ${discountCode}`);
  const adStatus = str(raw, "ad_status", "adStatus", "status");
  if (adStatus) notesParts.push(`Status: ${adStatus}`);
  const hashtags = str(raw, "hashtags");
  if (hashtags) notesParts.push(`Hashtags: ${hashtags}`);
  const audio = str(raw, "audio_or_sound", "audioOrSound", "sound", "audio");
  if (audio) notesParts.push(`Audio: ${audio}`);
  const notes = notesParts.join(" | ") || null;

  const country = str(raw, "country", "country_or_region", "countryOrRegion", "geo", "region") ?? null;
  const externalId = extracted.externalId ?? str(raw, "id", "externalId", "external_id") ?? null;

  // Require at least one real usable URL
  if (!referenceUrl && !creativeVideoUrl && !creativeImageUrl && !adLibraryUrl) return null;

  // Lightweight raw payload (cap at 2 KB to avoid bloating the DB)
  const rawJson = JSON.stringify(raw);
  const rawSourcePayload = rawJson.length <= 2048 ? rawJson : rawJson.slice(0, 2048) + "…";

  return {
    platform,
    brandOrCreator,
    externalId,
    organicOrPaid,
    sourceType,
    country,
    language,
    referenceUrl,
    adLibraryUrl,
    creativeVideoUrl,
    creativeImageUrl,
    thumbnailUrl,
    destinationUrl,
    advertiserPageUrl,
    adCopy,
    headline,
    description,
    ctaType,
    offer,
    referenceTitle,
    views,
    likes,
    comments,
    shares,
    impressions,
    spend,
    currency,
    engagementProxy,
    firstSeen,
    lastSeen,
    notes,
    taggingStatus:    "untagged",
    reviewStatus:     "new",
    ingestionSource:  source,
    ingestionKeyword: opts.keyword ?? null,
    rawSourcePayload,
  };
}
