(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.constants) return;

  const { MSG_SOURCE, PAGE, RUNTIME } = YTAD.constants;

  function extAlive() {
    try {
      // Accessing runtime.id throws when the extension was reloaded.
      return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
    } catch {
      return false;
    }
  }

  function isPageEnvelope(data) {
    return !!data && data.source === MSG_SOURCE && typeof data.type === "string";
  }

  function postToPage(type, payload) {
    try {
      const origin =
        typeof location !== "undefined" && location.origin ? location.origin : "*";
      window.postMessage({ source: MSG_SOURCE, type, payload }, origin);
    } catch {
      /* ignore */
    }
  }

  function bumpStat(key) {
    postToPage(PAGE.STAT, { key });
  }

  function sendRuntimeStat(key) {
    if (!extAlive()) return;
    try {
      chrome.runtime.sendMessage({ type: RUNTIME.STAT, key }, () => {
        try {
          void chrome.runtime.lastError;
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* Extension context invalidated */
    }
  }

  function storageGet(keys, cb) {
    if (!extAlive()) {
      try {
        cb({});
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      chrome.storage.local.get(keys, (data) => {
        try {
          if (!extAlive() || chrome.runtime.lastError) {
            cb({});
            return;
          }
          cb(data || {});
        } catch {
          /* invalidated during callback */
        }
      });
    } catch {
      try {
        cb({});
      } catch {
        /* ignore */
      }
    }
  }

  function onStorageChanged(listener) {
    if (!extAlive()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!extAlive()) return;
        try {
          listener(changes, area);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* invalidated */
    }
  }

  function onPageMessage(handler) {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      if (!isPageEnvelope(ev.data)) return;
      try {
        handler(ev.data, ev);
      } catch {
        /* ignore */
      }
    });
  }

  YTAD.define("messaging", {
    extAlive,
    isPageEnvelope,
    postToPage,
    bumpStat,
    sendRuntimeStat,
    storageGet,
    onStorageChanged,
    onPageMessage,
  });
})();
