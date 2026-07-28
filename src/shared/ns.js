/**
 * Global namespace for plain (non-bundled) content scripts.
 * Every module extends `globalThis.YTAD`.
 *
 * Bump BUILD when the public module API changes.
 * Bundle execution always starts here and rebuilds YTAD from scratch.
 */
(() => {
  const BUILD = 23;

  // Always rebuild the namespace when this file runs (bundle is atomic).
  // Clear install flags so a post-reload re-inject can hook again.
  globalThis.YTAD = { __build: BUILD };
  try {
    delete globalThis.__YTAD_SANITIZE__;
    delete globalThis.__YTAD_FEED_FILL__;
  } catch {
    /* ignore */
  }

  const YTAD = globalThis.YTAD;

  YTAD.once = (flag, fn) => {
    const key = `$${flag}`;
    if (YTAD[key]) return false;
    fn();
    YTAD[key] = true;
    return true;
  };

  YTAD.define = (name, value) => {
    YTAD[name] = Object.freeze(value);
    return YTAD[name];
  };

  YTAD.has = (...names) => names.every((n) => !!YTAD[n]);

  YTAD.missing = (...names) => names.filter((n) => !YTAD[n]);
})();
