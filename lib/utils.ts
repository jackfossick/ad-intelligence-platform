import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function isWatchableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("tiktok.com") ||
    url.includes("instagram.com") ||
    url.includes("facebook.com")
  );
}

export function getYouTubeEmbedId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export const PLATFORMS = ["Meta", "TikTok", "YouTube", "Instagram", "Pinterest", "Snapchat", "Google", "Other"];
export const HOOK_TYPES = ["Problem-agitate", "Before/After", "Social proof", "Curiosity gap", "Direct offer", "Story", "Statistics", "Challenge", "Other"];
export const CREATIVE_FORMATS = ["UGC video", "AI avatar", "Testimonial", "Explainer", "Product demo", "Slideshow", "Static image", "Carousel", "Other"];
export const REVIEW_STATUSES = ["needs_review", "approved", "rejected", "archived"];
export const URL_TYPES = ["direct_ad", "ad_library", "ad_snapshot", "creator_video", "advertiser_page", "landing_page", "search_result", "not_available"];
export const ORGANIC_OR_PAID = ["paid", "organic", "unknown"];
