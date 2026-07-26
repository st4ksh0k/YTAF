(() => {
  const YTAD = globalThis.YTAD;
  if (
    !YTAD?.sanitizePlayer ||
    !YTAD?.sanitizeFeed ||
    !YTAD?.sanitizeShorts ||
    !YTAD?.urls ||
    !YTAD?.messaging ||
    !YTAD?.constants
  ) {
    return;
  }

  const { looksLikePlayerResponse, neuterPlayerResponse } = YTAD.sanitizePlayer;
  const { stripFeedAds } = YTAD.sanitizeFeed;
  const { stripShorts } = YTAD.sanitizeShorts;
  const { isAdBreakUrl, shouldSanitizeInnertubeUrl } = YTAD.urls;
  const { bumpStat, onPageMessage } = YTAD.messaging;
  const { PAGE, EMPTY_AD_BREAK } = YTAD.constants;

  function createConfig() {
    return {
      enabled: true,
      stripPlayerAds: true,
      stubAdBreak: true,
      hideShorts: true,
    };
  }

  function looksLikePlayerOrWatchPayload(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (looksLikePlayerResponse(obj)) return true;
    if (obj.playerResponse && looksLikePlayerResponse(obj.playerResponse)) return true;
    if (obj.onResponseReceivedEndpoints || obj.contents || obj.responseContext) return true;
    return false;
  }

  function sanitizeDeep(value, cfg) {
    if (!value || typeof value !== "object") return value;

    if (looksLikePlayerResponse(value)) {
      neuterPlayerResponse(value, {
        stripPlayerAds: cfg.stripPlayerAds,
        onChanged: () => bumpStat("sanitizedResponses"),
      });
    }

    if (value.playerResponse && looksLikePlayerResponse(value.playerResponse)) {
      neuterPlayerResponse(value.playerResponse, {
        stripPlayerAds: cfg.stripPlayerAds,
        onChanged: () => bumpStat("sanitizedResponses"),
      });
    }

    if (stripFeedAds(value, 0) > 0) bumpStat("sanitizedResponses");
    if (cfg.hideShorts !== false && stripShorts(value, 0) > 0) bumpStat("hiddenShorts");
    return value;
  }

  function emptyJsonResponse() {
    bumpStat("stubbedAdBreaks");
    return new Response(JSON.stringify(EMPTY_AD_BREAK), {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  function installNetworkHooks(cfg, natives) {
    const nativeParse = natives.parse;
    const nativeResponseJson = natives.responseJson;
    const nativeFetch = natives.fetch;

    Response.prototype.json = async function patchedResponseJson() {
      const value = await nativeResponseJson.call(this);
      if (!cfg.enabled) return value;
      try {
        if (looksLikePlayerOrWatchPayload(value)) return sanitizeDeep(value, cfg);
      } catch {
        /* ignore */
      }
      return value;
    };

    window.fetch = async function patchedFetch(input, init) {
      if (cfg.enabled && cfg.stubAdBreak && isAdBreakUrl(input)) {
        return emptyJsonResponse();
      }

      const response = await nativeFetch.call(this, input, init);
      if (!cfg.enabled || !shouldSanitizeInnertubeUrl(input)) return response;

      try {
        const ct = response.headers.get("content-type") || "";
        if (!ct.includes("json") && !ct.includes("text/plain") && !ct.includes("javascript")) {
          return response;
        }
        const data = await response.clone().json();
        if (looksLikePlayerOrWatchPayload(data)) {
          sanitizeDeep(data, cfg);
          return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      } catch {
        /* fall through */
      }
      return response;
    };

    const XHR = XMLHttpRequest.prototype;
    const nativeOpen = natives.xhrOpen;
    const nativeSend = natives.xhrSend;

    XHR.open = function patchedOpen(method, url, ...rest) {
      this.__ytad_url = String(url || "");
      return nativeOpen.call(this, method, url, ...rest);
    };

    XHR.send = function patchedSend(body) {
      if (cfg.enabled && cfg.stubAdBreak && isAdBreakUrl(this.__ytad_url || "")) {
        Object.defineProperty(this, "readyState", { configurable: true, get: () => 4 });
        Object.defineProperty(this, "status", { configurable: true, get: () => 200 });
        Object.defineProperty(this, "responseText", {
          configurable: true,
          get: () => JSON.stringify(EMPTY_AD_BREAK),
        });
        Object.defineProperty(this, "response", {
          configurable: true,
          get: () => JSON.stringify(EMPTY_AD_BREAK),
        });
        bumpStat("stubbedAdBreaks");
        setTimeout(() => {
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new Event("load"));
        }, 0);
        return;
      }
      return nativeSend.call(this, body);
    };

    JSON.parse = function patchedParse(text, reviver) {
      const value = nativeParse.call(this, text, reviver);
      if (!cfg.enabled) return value;
      try {
        if (looksLikePlayerOrWatchPayload(value)) return sanitizeDeep(value, cfg);
      } catch (err) {
        console.warn("[ytad] sanitize JSON.parse failed", err);
      }
      return value;
    };
  }

  function installGlobalTraps(cfg, nativeParse) {
    function sanitizeGlobals() {
      if (!cfg.enabled) return;
      try {
        if (window.ytInitialPlayerResponse) {
          neuterPlayerResponse(window.ytInitialPlayerResponse, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
        }
      } catch {
        /* ignore */
      }
      try {
        const raw = window.ytplayer?.config?.args?.raw_player_response;
        if (typeof raw === "string") {
          const parsed = nativeParse(raw);
          neuterPlayerResponse(parsed, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
          window.ytplayer.config.args.raw_player_response = JSON.stringify(parsed);
        } else if (raw && typeof raw === "object") {
          neuterPlayerResponse(raw, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
        }
      } catch {
        /* ignore */
      }
    }

    function sanitizeInitialData() {
      if (!cfg.enabled || !window.ytInitialData) return;
      try {
        if (stripFeedAds(window.ytInitialData, 0) > 0) bumpStat("sanitizedResponses");
        if (cfg.hideShorts !== false && stripShorts(window.ytInitialData, 0) > 0) {
          bumpStat("hiddenShorts");
        }
      } catch {
        /* ignore */
      }
    }

    try {
      let stored = window.ytInitialPlayerResponse;
      Object.defineProperty(window, "ytInitialPlayerResponse", {
        configurable: true,
        enumerable: true,
        get: () => stored,
        set(value) {
          if (!cfg.enabled) {
            stored = value;
            return;
          }
          const { response } = neuterPlayerResponse(value, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
          stored = response;
        },
      });
    } catch {
      /* ignore */
    }

    try {
      let storedData = window.ytInitialData;
      Object.defineProperty(window, "ytInitialData", {
        configurable: true,
        enumerable: true,
        get: () => storedData,
        set(value) {
          storedData = value;
          if (cfg.enabled && value) {
            stripFeedAds(storedData, 0);
            if (cfg.hideShorts !== false) stripShorts(storedData, 0);
          }
        },
      });
    } catch {
      /* ignore */
    }

    return { sanitizeGlobals, sanitizeInitialData };
  }

  function install() {
    const cfg = createConfig();
    // Capture true natives once so re-inject after extension reload doesn't nest patches.
    const natives = (globalThis.__YTAD_NATIVES__ ||= {
      parse: JSON.parse,
      fetch: window.fetch.bind(window),
      responseJson: Response.prototype.json,
      xhrOpen: XMLHttpRequest.prototype.open,
      xhrSend: XMLHttpRequest.prototype.send,
    });

    installNetworkHooks(cfg, natives);
    const { sanitizeGlobals, sanitizeInitialData } = installGlobalTraps(cfg, natives.parse);

    sanitizeGlobals();
    sanitizeInitialData();

    let passes = 0;
    const timer = setInterval(() => {
      sanitizeGlobals();
      sanitizeInitialData();
      passes += 1;
      if (passes > 40) clearInterval(timer);
    }, 250);

    try {
      onPageMessage((data) => {
        if (data.type === PAGE.CONFIG) Object.assign(cfg, data.payload || {});
      });
      YTAD.messaging.postToPage(PAGE.READY);
    } catch {
      /* page messaging optional — hooks already active */
    }
  }

  YTAD.define("sanitizeHooks", { install, sanitizeDeep, looksLikePlayerOrWatchPayload });
})();
