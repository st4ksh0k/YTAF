(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  YTAD.define("constants", {
    MSG_SOURCE: "ytad-extension",

    PAGE: Object.freeze({
      CONFIG: "ytad:config",
      STAT: "ytad:stat",
      READY: "ytad:ready",
    }),

    RUNTIME: Object.freeze({
      STAT: "ytad:stat",
      GET_STATUS: "ytad:getStatus",
      SET_ENABLED: "ytad:setEnabled",
      FETCH_SPONSOR_SEGMENTS: "ytad:fetchSponsorSegments",
      QUEUE_GET: "ytad:queueGet",
      QUEUE_SET: "ytad:queueSet",
      QUEUE_MUTATE: "ytad:queueMutate",
    }),

    DEFAULTS: Object.freeze({
      enabled: true,
      stripPlayerAds: true,
      stubAdBreak: true,
      hideEnforcement: true,
      skipSponsors: true,
      /** Drop Shorts shelves/tiles from Innertube + DOM (RE: shortsLockupViewModel / reelShelfRenderer). */
      hideShorts: true,
      /** /shorts/{id} → /watch?v={id} */
      redirectShorts: true,
      /** Extension-owned play queue (Premium-style; does not need TLPQ / playlist/create). */
      queueEnabled: true,
      /** After a queued video ends, remove it from the list. */
      queueRemovePlayed: true,
      /** Default crowdsourced segment API host */
      sponsorServerAddress: "https://sponsor.ajay.app",
      queue: Object.freeze({
        items: Object.freeze([]),
        currentIndex: -1,
      }),
      stats: Object.freeze({
        sanitizedResponses: 0,
        stubbedAdBreaks: 0,
        skippedUiAds: 0,
        filledFeedSlots: 0,
        skippedSponsors: 0,
        hiddenShorts: 0,
        queuedVideos: 0,
      }),
    }),

    EMPTY_AD_BREAK: Object.freeze({
      adPlacements: [],
      adSlots: [],
      playerAds: [],
    }),
  });
})();
