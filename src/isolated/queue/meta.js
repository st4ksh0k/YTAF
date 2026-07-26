/**
 * Pull video metadata from watch page / feed tiles for queue rows.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.urls || !YTAD?.keys) return;

  const { extractVideoId } = YTAD.urls;
  const { VIDEO_ID_RE } = YTAD.keys;

  function thumbFor(videoId) {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
  }

  function fromWatchPage() {
    let videoId = "";
    try {
      videoId = new URL(location.href).searchParams.get("v") || "";
    } catch {
      /* ignore */
    }
    if (!VIDEO_ID_RE.test(videoId)) videoId = extractVideoId(location.href) || "";
    if (!videoId) return null;

    // Prefer live DOM title/channel; never trust og:image (stale across SPA navigations).
    const title =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() ||
      document.querySelector("h1 yt-formatted-string")?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, "").trim() ||
      videoId;
    const channel =
      document.querySelector("ytd-watch-metadata #channel-name a")?.textContent?.trim() ||
      document.querySelector("#owner #channel-name a")?.textContent?.trim() ||
      document.querySelector("ytd-channel-name a")?.textContent?.trim() ||
      "";

    return {
      videoId,
      title,
      channel,
      thumb: thumbFor(videoId),
      lengthText: "",
      addedAt: Date.now(),
    };
  }

  function fromTile(el) {
    if (!el) return null;
    const root =
      el.closest("ytd-rich-item-renderer") ||
      el.closest("ytd-compact-video-renderer") ||
      el.closest("ytd-video-renderer") ||
      el.closest("yt-lockup-view-model") ||
      el.closest("ytd-playlist-panel-video-renderer") ||
      el;

    const a =
      root.querySelector("a.ytLockupViewModelContentImage") ||
      root.querySelector("a.ytLockupMetadataViewModelTitle") ||
      root.querySelector("a#video-title-link") ||
      root.querySelector("a#thumbnail") ||
      root.querySelector('a[href*="/watch"]') ||
      root.querySelector('a[href*="/shorts/"]');
    const href = a?.getAttribute("href") || "";
    const videoId = extractVideoId(href);
    if (!videoId) return null;

    const title =
      root.querySelector("h3.ytLockupMetadataViewModelHeadingReset")?.getAttribute("title") ||
      root.querySelector("a.ytLockupMetadataViewModelTitle")?.textContent ||
      root.querySelector("#video-title")?.textContent ||
      root.querySelector("#video-title-link")?.textContent ||
      a?.getAttribute("title") ||
      "";
    const channel =
      root.querySelector(".ytContentMetadataViewModelMetadataRow a")?.textContent ||
      root.querySelector("#channel-name a")?.textContent ||
      root.querySelector("yt-formatted-string.ytd-channel-name")?.textContent ||
      "";
    const lengthText =
      root.querySelector(".ytBadgeShapeText")?.textContent?.trim() ||
      root.querySelector("badge-shape .ytBadgeShapeText")?.textContent?.trim() ||
      root.querySelector("span.ytd-thumbnail-overlay-time-status-renderer")?.textContent?.trim() ||
      "";

    return {
      videoId,
      title: (title || videoId).trim(),
      channel: (channel || "").trim(),
      // Always key thumbs to videoId — DOM imgs can be recycled/stale in the SPA.
      thumb: thumbFor(videoId),
      lengthText,
      addedAt: Date.now(),
    };
  }

  YTAD.define("queueMeta", { fromWatchPage, fromTile, thumbFor });
})();
