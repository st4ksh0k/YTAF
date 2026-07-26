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
    "sanitizeHooks",
  ];
  if (!YTAD?.sanitizeHooks) {
    console.error("[ytad] sanitize modules missing:", (YTAD?.missing?.(...need) || need).join(", "));
    return;
  }

  if (globalThis.__YTAD_SANITIZE__) return;
  globalThis.__YTAD_SANITIZE__ = true;

  try {
    YTAD.sanitizeHooks.install();
  } catch (err) {
    globalThis.__YTAD_SANITIZE__ = false;
    console.error("[ytad] sanitizer install failed", err);
  }
})();
