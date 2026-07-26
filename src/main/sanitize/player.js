(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys) return;

  const { FORECASTING_RENDERER, PLAYABLE_PLACEMENT_RENDERERS } = YTAD.keys;

  function neuterRenderer(renderer) {
    if (!renderer || typeof renderer !== "object") return renderer;
    const out = { ...renderer };
    let stripped = false;
    for (const key of PLAYABLE_PLACEMENT_RENDERERS) {
      if (key in out) {
        delete out[key];
        stripped = true;
      }
    }
    if (stripped || !Object.keys(out).length) {
      out[FORECASTING_RENDERER] = out[FORECASTING_RENDERER] || {};
    }
    return out;
  }

  function neuterPlacement(placement) {
    if (!placement || typeof placement !== "object") return placement;
    const apr = placement.adPlacementRenderer;
    if (!apr) return placement;
    return {
      ...placement,
      adPlacementRenderer: {
        ...apr,
        renderer: neuterRenderer(apr.renderer || {}),
      },
    };
  }

  function looksLikePlayerResponse(obj) {
    return (
      !!obj &&
      typeof obj === "object" &&
      (Array.isArray(obj.adPlacements) ||
        Array.isArray(obj.adSlots) ||
        Array.isArray(obj.playerAds) ||
        (obj.videoDetails && obj.streamingData))
    );
  }

  function neuterPlayerResponse(pr, { stripPlayerAds = true, onChanged } = {}) {
    if (!pr || typeof pr !== "object" || !stripPlayerAds) {
      return { response: pr, changed: false };
    }

    let changed = false;

    if (Array.isArray(pr.adPlacements)) {
      pr.adPlacements = pr.adPlacements.map((p) => {
        const n = neuterPlacement(p);
        if (n !== p) changed = true;
        return n;
      });
    }

    if (Array.isArray(pr.adSlots) && pr.adSlots.length) {
      pr.adSlots = [];
      changed = true;
    }

    if (Array.isArray(pr.playerAds) && pr.playerAds.length) {
      pr.playerAds = [];
      changed = true;
    }

    if (changed && onChanged) onChanged();
    return { response: pr, changed };
  }

  YTAD.define("sanitizePlayer", {
    neuterRenderer,
    neuterPlacement,
    looksLikePlayerResponse,
    neuterPlayerResponse,
  });
})();
