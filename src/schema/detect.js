(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys || !YTAD?.selectors || !YTAD?.urls || !YTAD?.dom) return;

  const { FEED_AD_ENTRIES, AD_SLOT_LAYOUTS, SHORTS_FEED_ENTRIES, SHORTS_ENDPOINT_KEYS } = YTAD.keys;
  const {
    FEED_AD_HOSTS,
    FEED_AD_VIEW_MODELS,
    AD_BADGE_CLASS,
    PLAYER_AD_STATE,
    SKIP_BUTTONS,
    PLAYER_AD_OVERLAYS,
    PLAYER_ROOTS,
    SHORTS_HOSTS,
    SHORTS_HOST_CLASSES,
    SHORTS_RICH_SHELF,
  } = YTAD.selectors;
  const { isAdClickHref } = YTAD.urls;
  const { querySelectorDeep, querySelectorAllDeep, deepText } = YTAD.dom;

  const HOST_SEL = FEED_AD_HOSTS.join(",");
  const VM_SEL = FEED_AD_VIEW_MODELS.join(",");
  const SHORTS_HOST_SEL = SHORTS_HOSTS.join(",");
  const SHORTS_CLASS_SEL = SHORTS_HOST_CLASSES.map((c) => (c.startsWith(".") ? c : `.${c}`)).join(",");

  function objectHasAnyKey(obj, keys) {
    if (!obj || typeof obj !== "object") return false;
    for (const key of keys) {
      if (obj[key] != null) return true;
    }
    return false;
  }

  function hasFeedAdKey(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (objectHasAnyKey(obj, FEED_AD_ENTRIES)) return true;
    if (objectHasAnyKey(obj, AD_SLOT_LAYOUTS)) return true;
    const slot = obj.adSlotRenderer;
    if (slot) {
      const layout = slot.fulfillmentContent?.fulfilledLayout;
      if (objectHasAnyKey(layout, AD_SLOT_LAYOUTS)) return true;
      if (objectHasAnyKey(slot.renderingContent, FEED_AD_ENTRIES)) return true;
      if (layout && typeof layout === "object") {
        for (const v of Object.values(layout)) {
          if (!v || typeof v !== "object") continue;
          if (objectHasAnyKey(v, FEED_AD_ENTRIES)) return true;
          if (objectHasAnyKey(v.renderingContent, FEED_AD_ENTRIES)) return true;
        }
      }
    }
    return false;
  }

  function isFeedAdEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (hasFeedAdKey(entry)) return true;
    if (hasFeedAdKey(entry.richItemRenderer?.content)) return true;
    if (hasFeedAdKey(entry.richSectionRenderer?.content)) return true;
    if (hasFeedAdKey(entry.itemSectionRenderer)) return true;
    return false;
  }

  function hasShortsEndpoint(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 6) return false;
    if (objectHasAnyKey(obj, SHORTS_ENDPOINT_KEYS)) return true;
    const meta = obj.commandMetadata?.webCommandMetadata;
    if (meta?.webPageType === "WEB_PAGE_TYPE_SHORTS") return true;
    if (typeof meta?.url === "string" && meta.url.includes("/shorts/")) return true;
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && hasShortsEndpoint(v, depth + 1)) return true;
    }
    return false;
  }

  function shortsItems(list) {
    return Array.isArray(list) ? list : [];
  }

  function isShortsOnlyShelf(shelf) {
    if (!shelf || typeof shelf !== "object") return false;
    const items = shortsItems(shelf.items || shelf.contents);
    if (!items.length) return false;
    return items.every((item) => isShortsFeedEntry(item));
  }

  /** Innertube feed entry that should be dropped when hideShorts is on. */
  function isShortsFeedEntry(entry) {
    if (!entry || typeof entry !== "object") return false;
    if (objectHasAnyKey(entry, SHORTS_FEED_ENTRIES)) return true;
    if (entry.shortsLockupViewModel || entry.reelItemRenderer || entry.reelShelfRenderer) return true;
    if (entry.richItemRenderer?.content && isShortsFeedEntry(entry.richItemRenderer.content)) {
      return true;
    }
    const sectionContent = entry.richSectionRenderer?.content;
    if (sectionContent) {
      if (isShortsFeedEntry(sectionContent)) return true;
      if (sectionContent.richShelfRenderer && isShortsOnlyShelf(sectionContent.richShelfRenderer)) {
        return true;
      }
    }
    if (entry.richShelfRenderer && isShortsOnlyShelf(entry.richShelfRenderer)) return true;
    if (entry.itemSectionRenderer?.contents) {
      const contents = entry.itemSectionRenderer.contents;
      if (contents.length && contents.every((c) => isShortsFeedEntry(c))) return true;
    }
    if (hasShortsEndpoint(entry.onTap) || hasShortsEndpoint(entry.navigationEndpoint)) return true;
    return false;
  }

  function isShortsDomElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName?.toLowerCase?.() || "";
    if (SHORTS_HOSTS.some((h) => tag === h)) return true;
    for (const cls of SHORTS_HOST_CLASSES) {
      if (el.classList?.contains(cls)) return true;
    }
    if (tag === SHORTS_RICH_SHELF) {
      if (
        el.querySelector(SHORTS_HOST_SEL) ||
        el.querySelector(SHORTS_CLASS_SEL) ||
        el.querySelector('a[href*="/shorts/"]') ||
        querySelectorDeep(el, 'a[href*="/shorts/"]')
      ) {
        return true;
      }
    }
    if (tag === "ytd-rich-item-renderer") {
      if (
        el.querySelector(SHORTS_HOST_SEL) ||
        el.querySelector(SHORTS_CLASS_SEL) ||
        querySelectorDeep(el, SHORTS_HOST_SEL) ||
        querySelectorDeep(el, SHORTS_CLASS_SEL)
      ) {
        return true;
      }
      const href =
        el.querySelector('a[href*="/shorts/"]')?.getAttribute("href") ||
        querySelectorDeep(el, 'a[href*="/shorts/"]')?.getAttribute("href") ||
        "";
      if (href.includes("/shorts/")) return true;
    }
    return false;
  }

  function richItemDataContent(el) {
    try {
      const data = el.data || el.__data?.data || el.__data;
      return data?.content || null;
    } catch {
      return null;
    }
  }

  /**
   * DOM ad detection — same signals as the pre-split feed-fill.js that worked,
   * plus shadow-piercing queries for lockup internals.
   */
  function isAdRichItemElement(el) {
    if (!el || el.tagName !== "YTD-RICH-ITEM-RENDERER") return false;

    if (hasFeedAdKey(richItemDataContent(el))) return true;

    // Classic Polymer ad hosts (light DOM)
    if (el.querySelector(HOST_SEL)) return true;
    if (el.querySelector(VM_SEL)) return true;
    if (el.querySelector(`.${AD_BADGE_CLASS}`)) return true;

    // Same hosts / VMs inside open shadow trees
    if (querySelectorDeep(el, HOST_SEL)) return true;
    if (querySelectorDeep(el, VM_SEL)) return true;
    if (querySelectorDeep(el, `.${AD_BADGE_CLASS}`)) return true;

    // Pre-split href checks (substring) — keep these; URL parser alone misses some
    if (
      el.querySelector('a[href*="googleadservices"], a[href*="/pagead/"]') ||
      querySelectorDeep(el, 'a[href*="googleadservices"], a[href*="/pagead/"]')
    ) {
      return true;
    }

    for (const a of querySelectorAllDeep(el, "a[href]")) {
      const href = a.getAttribute("href") || "";
      if (isAdClickHref(href)) return true;
      if (href.includes("googleadservices") || href.includes("/pagead/")) return true;
    }

    // Pre-split Sponsored logic (worked on home display ads)
    const lockup =
      el.querySelector("yt-lockup-view-model") || querySelectorDeep(el, "yt-lockup-view-model");
    if (lockup) {
      const badgeText = deepText(el) || el.textContent || "";
      if (/\bSponsored\b/i.test(badgeText)) {
        const metaRow =
          el.querySelector(".ytContentMetadataViewModelMetadataRow") ||
          querySelectorDeep(el, ".ytContentMetadataViewModelMetadataRow");
        const ariaSponsored =
          el.querySelector('[aria-label*="Sponsored" i]') ||
          querySelectorDeep(el, '[aria-label*="Sponsored" i]');
        const badgeShapeText =
          el.querySelector(".ytBadgeShapeBadgeText, .ytBadgeShapeText") ||
          querySelectorDeep(el, ".ytBadgeShapeBadgeText, .ytBadgeShapeText");
        if (
          ariaSponsored ||
          badgeShapeText ||
          /\bSponsored\b/i.test(metaRow?.textContent || "") ||
          // Buttoned display ads: Sponsored byline is enough with lockup present
          querySelectorDeep(el, "ad-button-group-view-model, ytd-video-display-full-buttoned-and-button-group-renderer") ||
          /\bSponsored\s*[•·|]/i.test(badgeText)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function isOrganicRichItemElement(el) {
    if (!el || el.tagName !== "YTD-RICH-ITEM-RENDERER") return false;
    if (isAdRichItemElement(el)) return false;
    return !!(
      el.querySelector("yt-lockup-view-model.lockup") ||
      el.querySelector("ytd-rich-grid-media") ||
      querySelectorDeep(el, "yt-lockup-view-model.lockup") ||
      querySelectorDeep(el, "ytd-rich-grid-media")
    );
  }

  function getPlayerRoot() {
    for (const sel of PLAYER_ROOTS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function playerIsShowingAd(player) {
    if (!player) return false;
    for (const cls of PLAYER_AD_STATE) {
      if (player.classList?.contains(cls)) return true;
    }
    return !!player.querySelector?.(PLAYER_AD_OVERLAYS.join(","));
  }

  function findSkipButton(player) {
    if (!player) return null;
    for (const sel of SKIP_BUTTONS) {
      const btn = player.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  YTAD.define("detect", {
    hasFeedAdKey,
    isFeedAdEntry,
    isShortsFeedEntry,
    isShortsDomElement,
    isAdRichItemElement,
    isOrganicRichItemElement,
    getPlayerRoot,
    playerIsShowingAd,
    findSkipButton,
  });
})();
