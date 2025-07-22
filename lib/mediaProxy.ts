/**
 * Utility functions for handling media URLs with conditional proxy support
 */

// Check if signed URLs are being used (exposed as public env var)
const useSignedUrls = process.env.NEXT_PUBLIC_USE_SIGNED_URL === "true";

/**
 * Get the appropriate URL for audio files, using proxy only when needed
 */
export function getAudioUrl(originalUrl: string): string {
  // Always use proxy for Google Cloud Storage URLs to avoid CORS issues
  if (
    isExternalUrl(originalUrl) &&
    originalUrl.includes("storage.googleapis.com")
  ) {
    return `/api/proxy-audio?url=${encodeURIComponent(originalUrl)}`;
  }
  // Use proxy if signed URLs are enabled and URL is external
  if (useSignedUrls && isExternalUrl(originalUrl)) {
    return `/api/proxy-audio?url=${encodeURIComponent(originalUrl)}`;
  }
  return originalUrl;
}

/**
 * Get the appropriate URL for video files, using proxy only when needed
 */
export function getVideoUrl(originalUrl: string): string {
  // Always use proxy for Google Cloud Storage URLs to avoid CORS issues
  if (
    isExternalUrl(originalUrl) &&
    originalUrl.includes("storage.googleapis.com")
  ) {
    return `/api/proxy-video?url=${encodeURIComponent(originalUrl)}`;
  }
  // Use proxy if signed URLs are enabled and URL is external
  if (useSignedUrls && isExternalUrl(originalUrl)) {
    return `/api/proxy-video?url=${encodeURIComponent(originalUrl)}`;
  }
  return originalUrl;
}

/**
 * Check if a URL is external (different domain from current site)
 */
function isExternalUrl(url: string): boolean {
  if (typeof window === "undefined") {
    // Server-side: assume external if it starts with http
    return url.startsWith("http");
  }
  // Client-side: check if it's a different hostname
  return url.startsWith("http") && !url.includes(window.location.hostname);
}
