/**
 * Isolated-world bridge: storage config → MAIN via postMessage;
 * MAIN stats → chrome.runtime.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.constants || !YTAD?.messaging) return;

  YTAD.once("bridgeInstalled", () => {
    const { PAGE, RUNTIME } = YTAD.constants;
    const { postToPage, onPageMessage, storageGet, onStorageChanged, extAlive } = YTAD.messaging;

    function publishConfig() {
      storageGet(["enabled", "stripPlayerAds", "stubAdBreak", "hideShorts"], (data) => {
        postToPage(PAGE.CONFIG, {
          enabled: data.enabled !== false,
          stripPlayerAds: data.stripPlayerAds !== false,
          stubAdBreak: data.stubAdBreak !== false,
          hideShorts: data.hideShorts !== false,
        });
      });
    }

    onPageMessage((data) => {
      if (data.type !== PAGE.STAT || !data.payload?.key) return;
      if (!extAlive()) return;
      try {
        chrome.runtime.sendMessage({ type: RUNTIME.STAT, key: data.payload.key }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        /* Extension context invalidated — reload the tab */
      }
    });

    onStorageChanged((changes, area) => {
      if (area !== "local") return;
      if (changes.enabled || changes.stripPlayerAds || changes.stubAdBreak || changes.hideShorts) {
        publishConfig();
      }
    });

    publishConfig();
    setTimeout(publishConfig, 0);
    setTimeout(publishConfig, 500);
  });
})();
