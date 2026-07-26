/**
 * DOM fallback for Shorts that hydrate after JSON sanitize.
 * Hosts/classes from kevlar stamps.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.detect || !YTAD?.selectors || !YTAD?.messaging) return;

  const { isShortsDomElement } = YTAD.detect;
  const { SHORTS_HOSTS, SHORTS_HOST_CLASSES, SHORTS_RICH_SHELF, SHORTS_GUIDE_HREF } = YTAD.selectors;
  const { sendRuntimeStat, storageGet } = YTAD.messaging;

  const ATTR = "data-ytad-hide-shorts";

  function hideEl(el) {
    if (!el || el.getAttribute(ATTR) === "1") return false;
    el.style.setProperty("display", "none", "important");
    el.setAttribute(ATTR, "1");
    return true;
  }

  function sweep() {
    storageGet(["enabled", "hideShorts"], ({ enabled, hideShorts }) => {
      if (enabled === false || hideShorts === false) return;

      let hidden = 0;
      const sel = [
        ...SHORTS_HOSTS,
        SHORTS_RICH_SHELF,
        ...SHORTS_HOST_CLASSES.map((c) => `.${c}`),
        'ytd-rich-item-renderer a[href*="/shorts/"]',
        SHORTS_GUIDE_HREF,
      ].join(",");

      for (const el of document.querySelectorAll(sel)) {
        const target =
          el.closest("ytd-rich-item-renderer") ||
          el.closest("ytd-rich-section-renderer") ||
          el.closest("ytd-item-section-renderer") ||
          el.closest("ytd-guide-entry-renderer") ||
          el;
        if (isShortsDomElement(el) || isShortsDomElement(target) || el.matches?.(SHORTS_GUIDE_HREF)) {
          const host =
            el.closest("ytd-guide-entry-renderer") ||
            el.closest("ytd-rich-section-renderer") ||
            el.closest(SHORTS_RICH_SHELF) ||
            el.closest("ytd-reel-shelf-renderer") ||
            target;
          if (hideEl(host || el)) hidden += 1;
        }
      }

      // Direct host sweep (no need for isShortsDomElement on pure reel shelves)
      for (const host of SHORTS_HOSTS) {
        for (const el of document.querySelectorAll(host)) {
          if (hideEl(el)) hidden += 1;
        }
      }

      if (hidden > 0) sendRuntimeStat("hiddenShorts");
    });
  }

  YTAD.define("shortsHide", { sweep, hideEl });
})();
