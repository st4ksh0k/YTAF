/**
 * DOM selectors from kevlar component stamps + player SkipButton / layout adapters.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  YTAD.define("selectors", {
    FEED_AD_HOSTS: Object.freeze([
      "ytd-ad-slot-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-page-top-ad-layout-renderer",
      "ytd-promoted-video-renderer",
      "ytd-display-ad-renderer",
      "ytd-carousel-ad-renderer",
      "ytd-promoted-sparkles-web-renderer",
      "ytd-promoted-sparkles-text-search-renderer",
      "ytd-compact-promoted-video-renderer",
      "ytd-banner-promo-renderer",
      "ytd-video-masthead-ad-v3-renderer",
      // Buttoned in-feed display ads (Sponsored · Brand + Watch / Visit site)
      "ytd-video-display-full-buttoned-and-button-group-renderer",
      "ytd-video-display-full-buttoned-renderer",
    ]),

    FEED_AD_VIEW_MODELS: Object.freeze([
      "feed-ad-metadata-view-model",
      "ad-badge-view-model",
      "ad-button-group-view-model",
      "ad-disclosure-banner-view-model",
      "top-landscape-image-layout-view-model",
      "square-image-layout-view-model",
      "text-image-no-button-layout-view-model",
      "text-image-button-layout-view-model",
    ]),

    /** Op$ badge type 3 ← BADGE_STYLE_TYPE_AD / _AD_STARK */
    AD_BADGE_CLASS: "ytBadgeShapeAd",

    /** Metadata / badge hosts that often carry "Sponsored" without ytBadgeShapeAd */
    AD_META_SELECTORS: Object.freeze([
      "badge-shape.ytBadgeShapeAd",
      `.ytBadgeShapeAd`,
      "ad-badge-view-model",
      "feed-ad-metadata-view-model",
    ]),

    PLAYER_AD_STATE: Object.freeze(["ad-showing", "ad-interrupting"]),

    SKIP_BUTTONS: Object.freeze([
      ".ytp-ad-skip-button",
      ".ytp-ad-skip-button-modern",
      ".ytp-skip-ad-button",
      ".ytp-ad-skip-button-slot button",
      "button.ytp-ad-skip-button",
      "button.ytp-skip-ad-button",
    ]),

    PLAYER_AD_OVERLAYS: Object.freeze([
      ".ytp-ad-player-overlay",
      ".ytp-ad-module",
      ".ytp-ad-skip-button-container",
      ".video-ads",
    ]),

    ENFORCEMENT: Object.freeze([
      "ytd-enforcement-message-view-model",
      "ytd-mealbar-promo-renderer",
      "#offer-module",
      "#masthead-ad",
    ]),

    PLAYER_ROOTS: Object.freeze(["#movie_player", ".html5-video-player", "ytd-player"]),

    RICH_ITEM: "ytd-rich-item-renderer",

    /**
     * Shorts hosts from kevlar stamps (is:"ytd-reel-shelf-renderer", Lit short lockups).
     * Hide these when hideShorts is on; rich-shelf only when it contains Shorts children.
     */
    SHORTS_HOSTS: Object.freeze([
      "ytd-reel-shelf-renderer",
      "ytd-reel-item-renderer",
      "ytd-reel-video-renderer",
      "ytm-shorts-lockup-view-model",
      "ytm-shorts-lockup-view-model-v2",
      "ytd-shorts",
    ]),

    SHORTS_HOST_CLASSES: Object.freeze([
      "shortsLockupViewModelHost",
      "ytdRichItemRendererIsShortsGrid",
      "ytdRichItemRendererIsShortsGridSlimMedia",
      "reel-item-endpoint",
    ]),

    SHORTS_RICH_SHELF: "ytd-rich-shelf-renderer",
    SHORTS_GUIDE_HREF: 'a[href="/shorts"], a[href^="/shorts?"]',
  });
})();
