/**
 * RE-derived Innertube / placement keys.
 * Anchors: player base.js B_C(); kevlar rich-item + ad-slot stamper maps.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  YTAD.define("keys", {
    FORECASTING_RENDERER: "clientForecastingAdRenderer",

    /** Playable creatives branched in B_C(N.renderer) — strip these */
    PLAYABLE_PLACEMENT_RENDERERS: Object.freeze([
      "instreamVideoAdRenderer",
      "linearAdSequenceRenderer",
      "sandwichedLinearAdRenderer",
      "adBreakServiceRenderer",
      "instreamSurveyAdRenderer",
      "invideoOverlayAdRenderer",
      "instreamAdPlayerOverlayRenderer",
      "actionCompanionAdRenderer",
      "imageCompanionAdRenderer",
      "topBannerImageTextIconButtonedLayoutViewModel",
      "bannerImageLayoutViewModel",
      "shoppingCompanionCarouselRenderer",
      "adsEngagementPanelRenderer",
      "adsEngagementPanelLayoutViewModel",
      "videoAdTrackingRenderer",
      "remoteSlotsRenderer",
    ]),

    /**
     * Feed / search ad entry keys (rich-item content + in-feed renderingContent).
     * Includes buttoned display layouts used for "Sponsored · Brand" tiles.
     */
    FEED_AD_ENTRIES: Object.freeze([
      "adSlotRenderer",
      "promotedVideoRenderer",
      "displayAdRenderer",
      "promotedSparklesWebRenderer",
      "promotedSparklesTextSearchRenderer",
      "bannerPromoRenderer",
      "videoMastheadAdV3Renderer",
      "videoMastheadAdPrimaryVideoRenderer",
      "carouselAdRenderer",
      "compactPromotedVideoRenderer",
      "videoDisplayFullButtonedRenderer",
      "videoDisplayButtonGroupRenderer",
      "squareImageLayoutViewModel",
      "topLandscapeImageLayoutViewModel",
      "textImageNoButtonLayoutViewModel",
      "textImageButtonLayoutViewModel",
      "bannerImageLayoutViewModel",
    ]),

    /** adSlotRenderer.fulfillmentContent.fulfilledLayout */
    AD_SLOT_LAYOUTS: Object.freeze([
      "inFeedAdLayoutRenderer",
      "pageTopAdLayoutRenderer",
      "sequenceItemInPlayerAdLayoutRenderer",
    ]),

    FEED_LIST_FIELDS: Object.freeze([
      "contents",
      "items",
      "results",
      "continuationItems",
      "mutations",
    ]),

    /**
     * Shorts / Reels entry keys (kevlar MM + watch secondary reelShelfRenderer).
     * Prefer these over locale "Shorts" strings.
     */
    SHORTS_FEED_ENTRIES: Object.freeze([
      "shortsLockupViewModel",
      "reelItemRenderer",
      "reelShelfRenderer",
      "reelVideoRenderer",
    ]),

    /** Innertube navigation that opens the vertical Shorts player */
    SHORTS_ENDPOINT_KEYS: Object.freeze(["reelWatchEndpoint"]),

    /**
     * Desktop queue contract (kevlar Ju1 / $Z2 / queueProxy).
     * Native path uses playlist/create params CAQ= → TLPQ* lists; YTAF owns its own queue.
     */
    QUEUE: Object.freeze({
      LIST_TYPE: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
      LIST_ID_PREFIX: "TLPQ",
      CREATE_API: "/youtubei/v1/playlist/create",
      CREATE_PARAMS: "CAQ=",
      COMMAND: "addToPlaylistCommand",
      SIGNAL: "CLIENT_SIGNAL",
      ICONS: Object.freeze({
        ADD: "ADD_TO_QUEUE_TAIL",
        PLAY_NEXT: "QUEUE_PLAY_NEXT",
        PLAY_LAST: "QUEUE_PLAY_LAST",
      }),
    }),

    SANITIZE_INNERTUBE_ENDPOINTS: Object.freeze([
      "player",
      "next",
      "browse",
      "search",
      "reel",
      "player/ad_break",
    ]),

    AD_BREAK_PATHS: Object.freeze([
      "/youtubei/v1/player/ad_break",
      "/get_midroll_info",
    ]),

    AD_CLICK_HOSTS: Object.freeze([
      "googleadservices.com",
      "www.googleadservices.com",
      "ad.doubleclick.net",
      "pagead2.googlesyndication.com",
    ]),

    VIDEO_ID_RE: /^[A-Za-z0-9_-]{11}$/,
  });
})();
