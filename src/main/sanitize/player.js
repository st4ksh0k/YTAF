/**
 * Player-response neuter (Adblock-for-YouTube style hard wipe).
 *
 * Wipe adPlacements / adSlots / playerAds entirely (undefined), keep WEB SABR.
 * onAbnormalityDetected is nooped in sanitizeDefend — forecasting START shells
 * are no longer required for T1.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys) return;

  const { PLAYABLE_PLACEMENT_RENDERERS } = YTAD.keys;

  function hasPlayableRenderer(renderer) {
    if (!renderer || typeof renderer !== "object") return false;
    for (const key of PLAYABLE_PLACEMENT_RENDERERS) {
      if (renderer[key] != null) return true;
    }
    return false;
  }

  function hasAdaptiveUrlFormats(pr) {
    const list = pr?.streamingData?.adaptiveFormats;
    if (!Array.isArray(list)) return false;
    for (const f of list) {
      if (!f || typeof f !== "object") continue;
      if (typeof f.url === "string" && f.url) return true;
      if (typeof f.signatureCipher === "string" && f.signatureCipher) return true;
      if (typeof f.cipher === "string" && f.cipher) return true;
    }
    return false;
  }

  function isLivePlayerResponse(pr) {
    const d = pr?.videoDetails;
    if (!d) return false;
    return !!(d.isLive || d.isLiveContent || d.isLiveDvrEnabled || pr.playabilityStatus?.liveStreamability);
  }

  function scrubPlaybackNudges(pr) {
    if (!pr || typeof pr !== "object") return false;
    let changed = false;
    try {
      if (pr.playerConfig?.audioConfig?.muteOnStart) {
        delete pr.playerConfig.audioConfig.muteOnStart;
        changed = true;
      }
    } catch {
      /* ignore */
    }
    try {
      const messages = pr.messages;
      if (Array.isArray(messages)) {
        for (let i = 0; i < messages.length; i++) {
          if (messages[i]?.youThereRenderer) {
            delete messages[i].youThereRenderer;
            changed = true;
          }
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const gvs = pr.playerConfig?.granularVariableSpeedConfig;
      if (gvs && (gvs.minimumPlaybackRate === 100 || gvs.maximumPlaybackRate === 100)) {
        gvs.minimumPlaybackRate = 25;
        gvs.maximumPlaybackRate = 200;
        changed = true;
      }
    } catch {
      /* ignore */
    }
    return changed;
  }

  function hardWipeAdFields(pr) {
    if (!pr || typeof pr !== "object") return false;
    let changed = false;
    for (const key of ["adPlacements", "adSlots", "playerAds"]) {
      if (key in pr && pr[key] != null) {
        try {
          delete pr[key];
          changed = true;
        } catch {
          try {
            pr[key] = undefined;
            changed = true;
          } catch {
            /* ignore */
          }
        }
      }
    }
    if ("adBreakHeartbeatParams" in pr) {
      try {
        delete pr.adBreakHeartbeatParams;
        changed = true;
      } catch {
        /* ignore */
      }
    }
    return changed;
  }

  function looksLikePlayerResponse(obj) {
    return (
      !!obj &&
      typeof obj === "object" &&
      (Array.isArray(obj.adPlacements) ||
        Array.isArray(obj.adSlots) ||
        Array.isArray(obj.playerAds) ||
        "adPlacements" in obj ||
        "adSlots" in obj ||
        "playerAds" in obj ||
        (obj.videoDetails && obj.streamingData))
    );
  }

  function neuterPlayerResponse(pr, { stripPlayerAds = true, onChanged } = {}) {
    if (!pr || typeof pr !== "object" || !stripPlayerAds) {
      return { response: pr, changed: false };
    }

    let changed = hardWipeAdFields(pr);
    if (scrubPlaybackNudges(pr)) changed = true;

    // Nested playerResponse (watch / get_watch envelopes).
    if (pr.playerResponse && typeof pr.playerResponse === "object") {
      const nested = neuterPlayerResponse(pr.playerResponse, { stripPlayerAds: true });
      if (nested.changed) changed = true;
    }

    if (changed && onChanged) onChanged();
    return { response: pr, changed };
  }

  YTAD.define("sanitizePlayer", {
    neuterRenderer: (r) => r,
    neuterPlacement: () => null,
    hasPlayableRenderer,
    hasAdaptiveUrlFormats,
    hasStandaloneStreams: hasAdaptiveUrlFormats,
    isSabrOnly: () => false,
    isLivePlayerResponse,
    disableSabr: () => false,
    forecastingStartShell: () => null,
    hardWipeAdFields,
    scrubPlaybackNudges,
    looksLikePlayerResponse,
    neuterPlayerResponse,
  });
})();
