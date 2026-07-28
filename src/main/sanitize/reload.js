/**
 * Cold-load helpers — hard-wipe ads on known globals (keep WEB SABR).
 * Playback recovery / ladder lives in sanitizeDefend.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.sanitizePlayer) return;

  const { isLivePlayerResponse, neuterPlayerResponse, hardWipeAdFields } = YTAD.sanitizePlayer;

  function videoIdOf(pr) {
    const id = pr?.videoDetails?.videoId;
    return typeof id === "string" && id.length >= 6 ? id : "";
  }

  function killAdsOnPlayerResponse(target) {
    if (!target || typeof target !== "object") return false;
    return hardWipeAdFields(target);
  }

  function scrubPlayerGlobals() {
    try {
      if (window.ytInitialPlayerResponse) {
        killAdsOnPlayerResponse(window.ytInitialPlayerResponse);
        neuterPlayerResponse(window.ytInitialPlayerResponse, { stripPlayerAds: true });
      }
    } catch {
      /* ignore */
    }
    try {
      const boot = window.ytplayer?.bootstrapPlayerResponse;
      if (boot) {
        killAdsOnPlayerResponse(boot);
        neuterPlayerResponse(boot, { stripPlayerAds: true });
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = window.ytplayer?.config?.args?.raw_player_response;
      if (raw && typeof raw === "object") {
        killAdsOnPlayerResponse(raw);
        neuterPlayerResponse(raw, { stripPlayerAds: true });
      }
    } catch {
      /* ignore */
    }
  }

  function ensurePlayerPrefetch() {
    return null;
  }

  function installCreateGate() {
    return true;
  }

  async function mergeVrIntoPlayerResponse(pr) {
    if (!pr || typeof pr !== "object") return pr;
    if (isLivePlayerResponse(pr)) return pr;
    killAdsOnPlayerResponse(pr);
    neuterPlayerResponse(pr, { stripPlayerAds: true });
    return pr;
  }

  function scheduleSabrColdReload(pr) {
    if (!pr || isLivePlayerResponse(pr)) return;
    killAdsOnPlayerResponse(pr);
    neuterPlayerResponse(pr, { stripPlayerAds: true });
    scrubPlayerGlobals();

    let passes = 0;
    const timer = setInterval(() => {
      scrubPlayerGlobals();
      passes += 1;
      if (passes > 40) clearInterval(timer);
    }, 50);
  }

  YTAD.define("sanitizeReload", {
    scheduleSabrColdReload,
    ensurePlayerPrefetch,
    installCreateGate,
    mergeVrIntoPlayerResponse,
    needsVrMerge: (pr) => !!pr && !isLivePlayerResponse(pr) && !!videoIdOf(pr),
    applyVrToPlayerResponse: killAdsOnPlayerResponse,
    killAdsOnPlayerResponse,
  });
})();
