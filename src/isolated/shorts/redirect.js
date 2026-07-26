/**
 * Force Shorts URLs into the horizontal watch player.
 * Matches kevlar reelWatchEndpoint → WEB_PAGE_TYPE_SHORTS (/shorts/{id}).
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.urls || !YTAD?.messaging || !YTAD?.keys) return;

  const { extractVideoId, parseUrl } = YTAD.urls;
  const { storageGet } = YTAD.messaging;
  const { VIDEO_ID_RE } = YTAD.keys;

  function shortsIdFromLocation() {
    try {
      const u = new URL(location.href);
      const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
      return m && VIDEO_ID_RE.test(m[1]) ? m[1] : "";
    } catch {
      return "";
    }
  }

  function watchUrl(videoId) {
    return `/watch?v=${encodeURIComponent(videoId)}`;
  }

  function redirectIfNeeded() {
    storageGet(["enabled", "redirectShorts", "hideShorts"], (data) => {
      if (data.enabled === false) return;
      if (data.redirectShorts === false && data.hideShorts === false) return;
      const id = shortsIdFromLocation();
      if (!id) return;
      const dest = watchUrl(id);
      if (location.pathname + location.search === dest) return;
      try {
        history.replaceState(null, "", dest);
        window.dispatchEvent(new PopStateEvent("popstate"));
        // Polymer may ignore replaceState — hard navigate as fallback
        setTimeout(() => {
          if (shortsIdFromLocation()) location.replace(dest);
        }, 400);
      } catch {
        location.replace(dest);
      }
    });
  }

  function onClick(ev) {
    storageGet(["enabled", "redirectShorts", "hideShorts"], (data) => {
      if (data.enabled === false) return;
      if (data.redirectShorts === false) return;
      const a = ev.target?.closest?.('a[href*="/shorts/"]');
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const id = extractVideoId(href) || parseUrl(href)?.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
      if (!id) return;
      ev.preventDefault();
      ev.stopPropagation();
      const dest = watchUrl(id);
      try {
        const anchor = document.createElement("a");
        anchor.href = dest;
        anchor.className = "yt-simple-endpoint";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch {
        location.assign(dest);
      }
    });
  }

  YTAD.define("shortsRedirect", { redirectIfNeeded, onClick, shortsIdFromLocation });
})();
