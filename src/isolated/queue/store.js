/**
 * Queue persistence via service worker + chrome.storage.local.
 * Shape mirrors kevlar queueProxy (ordered video ids + current index), without TLPQ.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.constants || !YTAD?.messaging) return;

  const { RUNTIME, DEFAULTS } = YTAD.constants;
  const { extAlive, onStorageChanged } = YTAD.messaging;

  const listeners = new Set();
  let cache = {
    items: [],
    currentIndex: -1,
  };

  function normalize(queue) {
    const items = Array.isArray(queue?.items) ? queue.items.filter((i) => i?.videoId) : [];
    let currentIndex = Number.isInteger(queue?.currentIndex) ? queue.currentIndex : -1;
    if (currentIndex >= items.length) currentIndex = items.length - 1;
    if (currentIndex < -1) currentIndex = -1;
    return { items, currentIndex };
  }

  function notify() {
    for (const fn of listeners) {
      try {
        fn(cache);
      } catch {
        /* ignore */
      }
    }
  }

  function get() {
    return cache;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function send(type, payload) {
    return new Promise((resolve) => {
      if (!extAlive()) {
        resolve(cache);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          if (chrome.runtime.lastError || !res?.ok) {
            resolve(cache);
            return;
          }
          cache = normalize(res.queue);
          notify();
          resolve(cache);
        });
      } catch {
        resolve(cache);
      }
    });
  }

  function refresh() {
    return send(RUNTIME.QUEUE_GET, {});
  }

  function mutate(action, payload = {}) {
    return send(RUNTIME.QUEUE_MUTATE, { action, ...payload });
  }

  function add(item, { playNext = false } = {}) {
    return mutate(playNext ? "playNext" : "add", { item });
  }

  function ensureWatching(item) {
    return mutate("ensureWatching", { item });
  }

  function remove(videoId) {
    return mutate("remove", { videoId });
  }

  function clear() {
    return mutate("clear");
  }

  function reorder(fromIndex, toIndex) {
    return mutate("reorder", { fromIndex, toIndex });
  }

  function setCurrent(videoId) {
    return mutate("setCurrent", { videoId });
  }

  function advance(videoId) {
    return mutate("advance", { videoId });
  }

  onStorageChanged((changes, area) => {
    if (area !== "local" || !changes.queue) return;
    cache = normalize(changes.queue.newValue || DEFAULTS.queue);
    notify();
  });

  YTAD.define("queueStore", {
    get,
    refresh,
    add,
    ensureWatching,
    remove,
    clear,
    reorder,
    setCurrent,
    advance,
    onChange,
    normalize,
  });
})();
