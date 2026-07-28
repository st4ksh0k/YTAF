/**
 * MAIN-world entry: install player/feed sanitizer hooks.
 */
(() => {
  const YTAD = globalThis.YTAD;
  const need = [
    "constants",
    "messaging",
    "keys",
    "urls",
    "detect",
    "sanitizePlayer",
    "sanitizeFeed",
    "sanitizeShorts",
    "sanitizeRequest",
    "sanitizeReload",
    "sanitizeDefend",
    "sanitizeHooks",
  ];
  if (!YTAD?.sanitizeHooks) {
    console.error("[ytad] sanitize modules missing:", (YTAD?.missing?.(...need) || need).join(", "));
    return;
  }

  if (globalThis.__YTAD_SANITIZE__) return;
  globalThis.__YTAD_SANITIZE__ = true;

  try {
    // Player loads static.doubleclick.net/instream/ad_status.js and sets DCLKSTAT
    // from whether window.google_ad_status exists (1=ok, 2/3=blocked). Stub early.
    try {
      if (!("google_ad_status" in window)) {
        Object.defineProperty(window, "google_ad_status", {
          configurable: true,
          enumerable: true,
          value: 1,
          writable: false,
        });
      }
    } catch {
      try {
        window.google_ad_status = 1;
      } catch {
        /* ignore */
      }
    }

    YTAD.sanitizeHooks.install();
  } catch (err) {
    globalThis.__YTAD_SANITIZE__ = false;
    console.error("[ytad] sanitizer install failed", err);
  }
})();
