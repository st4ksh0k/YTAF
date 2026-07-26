(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys || !YTAD?.detect || !YTAD?.sanitizePlayer) return;

  const { FEED_LIST_FIELDS } = YTAD.keys;
  const { isFeedAdEntry } = YTAD.detect;
  const { looksLikePlayerResponse } = YTAD.sanitizePlayer;

  function stripFeedAdsFromArray(arr) {
    if (!Array.isArray(arr)) return 0;
    let write = 0;
    let removed = 0;
    for (let read = 0; read < arr.length; read++) {
      const item = arr[read];
      if (isFeedAdEntry(item)) {
        removed += 1;
        continue;
      }
      arr[write++] = item;
    }
    arr.length = write;
    return removed;
  }

  function stripFeedAds(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 14) return 0;
    if (depth === 0 && looksLikePlayerResponse(value) && !value.contents) return 0;

    let removed = 0;

    if (Array.isArray(value)) {
      removed += stripFeedAdsFromArray(value);
      for (const item of value) {
        if (item && typeof item === "object") removed += stripFeedAds(item, depth + 1);
      }
      return removed;
    }

    for (const key of Object.keys(value)) {
      const child = value[key];
      if (!child || typeof child !== "object") continue;
      if (key === "playerResponse" || key === "adPlacements" || key === "adSlots") continue;

      if (Array.isArray(child) && FEED_LIST_FIELDS.includes(key)) {
        removed += stripFeedAdsFromArray(child);
        for (const item of child) {
          if (item && typeof item === "object") removed += stripFeedAds(item, depth + 1);
        }
        continue;
      }

      removed += stripFeedAds(child, depth + 1);
    }

    return removed;
  }

  YTAD.define("sanitizeFeed", {
    stripFeedAdsFromArray,
    stripFeedAds,
  });
})();
