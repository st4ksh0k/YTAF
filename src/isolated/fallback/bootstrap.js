/**
 * document_idle fallbacks: hide enforcement UI; skip leftover player ads.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.detect || !YTAD?.selectors || !YTAD?.messaging) {
    console.error("[ytad] fallback modules missing:", YTAD?.missing?.("detect", "selectors", "messaging"));
    return;
  }

  YTAD.once("fallbackInstalled", () => {
    const { getPlayerRoot, playerIsShowingAd, findSkipButton } = YTAD.detect;
    const { ENFORCEMENT, PLAYER_AD_STATE } = YTAD.selectors;
    const { sendRuntimeStat, storageGet, extAlive } = YTAD.messaging;

    function hideEnforcement() {
      storageGet(["enabled", "hideEnforcement"], ({ enabled, hideEnforcement }) => {
        if (enabled === false || hideEnforcement === false) return;
        for (const sel of ENFORCEMENT) {
          for (const el of document.querySelectorAll(sel)) {
            el.style.setProperty("display", "none", "important");
            el.setAttribute("data-ytad-hidden", "1");
          }
        }
      });
    }

    function trySkipAd() {
      storageGet(["enabled"], ({ enabled }) => {
        if (enabled === false) return;

        const player = getPlayerRoot();
        if (!player || !playerIsShowingAd(player)) return;

        const skip = findSkipButton(player);
        if (skip) {
          skip.click();
          sendRuntimeStat("skippedUiAds");
          return;
        }

        try {
          if (typeof player.skipAd === "function") {
            player.skipAd();
            sendRuntimeStat("skippedUiAds");
            return;
          }
          if (typeof player.getPlayerState === "function" && typeof player.playVideo === "function") {
            const video = player.querySelector("video");
            if (
              video &&
              video.duration &&
              video.currentTime < 1 &&
              player.classList.contains("ad-showing")
            ) {
              for (const cls of PLAYER_AD_STATE) player.classList.remove(cls);
              video.currentTime = Math.max(video.currentTime, video.duration - 0.1);
              sendRuntimeStat("skippedUiAds");
            }
          }
        } catch {
          /* ignore */
        }
      });
    }

    function tick() {
      if (!extAlive()) return;
      hideEnforcement();
      trySkipAd();
    }

    tick();

    const observer = new MutationObserver(tick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    setInterval(tick, 1000);
  });
})();
