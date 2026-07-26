/**
 * MAIN-world feed filler — MutationObserver catches tiles as they appear.
 */
(() => {
  const YTAD = globalThis.YTAD;
  const need = ["detect", "similarity", "feedMeta", "feedPatch", "messaging", "selectors"];
  if (!YTAD?.has?.(...need)) {
    console.error("[ytad] feed-fill modules missing:", (YTAD?.missing?.(...need) || need).join(", "));
    return;
  }

  if (globalThis.__YTAD_FEED_FILL__) return;
  globalThis.__YTAD_FEED_FILL__ = true;

  const { isAdRichItemElement } = YTAD.detect;
  const { jaccard, pickBest } = YTAD.similarity;
  const { neighborContext, candidatePool, fetchRelatedCandidates } = YTAD.feedMeta;
  const { fillAdItem } = YTAD.feedPatch;
  const { bumpStat } = YTAD.messaging;
  const RICH = YTAD.selectors.RICH_ITEM;

  const usedVideoIds = new Set();
  let busy = false;
  let sweepTimer = 0;

  async function replaceAdItem(adItem) {
    if (adItem.hasAttribute("data-ytad-busy")) return;
    if (adItem.hasAttribute("data-ytad-filled") && isAdRichItemElement(adItem)) {
      adItem.removeAttribute("data-ytad-filled");
      adItem.removeAttribute("data-ytad-handled");
    }
    if (adItem.hasAttribute("data-ytad-filled")) return;

    adItem.setAttribute("data-ytad-busy", "1");

    try {
      const context = neighborContext(adItem);
      let pool = candidatePool(adItem, usedVideoIds);
      let best = pickBest(context, pool);

      if (!best || jaccard(context, best.tokens) < 0.04) {
        const q =
          [...context].slice(0, 6).join(" ") || document.title.replace(/\s*-\s*YouTube$/, "");
        pool = pool.concat(await fetchRelatedCandidates(q, usedVideoIds));
        best = pickBest(context, pool);
      }

      if (!best) best = pool[0] || candidatePool(adItem, usedVideoIds)[0];

      if (!best?.videoId) {
        adItem.remove();
        bumpStat("filledFeedSlots");
        return;
      }

      if (fillAdItem(adItem, best, usedVideoIds)) {
        bumpStat("filledFeedSlots");
      }
    } catch (err) {
      console.warn("[ytad] feed-fill failed", err);
      try {
        adItem.remove();
      } catch {
        /* ignore */
      }
    } finally {
      adItem.removeAttribute("data-ytad-busy");
    }
  }

  async function sweep() {
    if (busy) return;
    busy = true;
    try {
      for (const el of document.querySelectorAll(`${RICH}[data-ytad-filled]`)) {
        if (isAdRichItemElement(el)) {
          el.removeAttribute("data-ytad-filled");
          el.removeAttribute("data-ytad-handled");
        }
      }

      const ads = [...document.querySelectorAll(RICH)].filter(
        (el) => isAdRichItemElement(el) && !el.hasAttribute("data-ytad-busy")
      );

      for (const ad of ads.slice(0, 8)) {
        await replaceAdItem(ad);
      }
    } finally {
      busy = false;
    }
  }

  const root = document.documentElement || document;
  const obs = new MutationObserver(() => {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 120);
  });
  obs.observe(root, { childList: true, subtree: true });

  sweep();
  setInterval(sweep, 1500);
})();
