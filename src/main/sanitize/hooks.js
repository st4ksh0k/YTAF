(() => {
  const YTAD = globalThis.YTAD;
  if (
    !YTAD?.sanitizePlayer ||
    !YTAD?.sanitizeFeed ||
    !YTAD?.sanitizeShorts ||
    !YTAD?.sanitizeRequest ||
    !YTAD?.sanitizeReload ||
    !YTAD?.sanitizeDefend ||
    !YTAD?.urls ||
    !YTAD?.messaging ||
    !YTAD?.constants
  ) {
    return;
  }

  const { looksLikePlayerResponse, neuterPlayerResponse } = YTAD.sanitizePlayer;
  const { stripFeedAds } = YTAD.sanitizeFeed;
  const { stripShorts } = YTAD.sanitizeShorts;
  const {
    scheduleSabrColdReload,
    ensurePlayerPrefetch,
    installCreateGate,
    mergeVrIntoPlayerResponse,
  } = YTAD.sanitizeReload;
  const {
    rewriteJsonBodyText,
    looksLikePlayerRequestBody,
    installRequestHooks,
    observeParsedResponse,
  } = YTAD.sanitizeRequest;
  const { installDefend } = YTAD.sanitizeDefend;
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
      if (cfg.stripPlayerAds) scheduleSabrColdReload(value);
    }

    if (value.playerResponse && looksLikePlayerResponse(value.playerResponse)) {
      neuterPlayerResponse(value.playerResponse, {
        stripPlayerAds: cfg.stripPlayerAds,
        onChanged: () => bumpStat("sanitizedResponses"),
      });
      if (cfg.stripPlayerAds) scheduleSabrColdReload(value.playerResponse);
    }

    if (cfg.stripPlayerAds) {
      try {
        observeParsedResponse(value);
        if (value.playerResponse) observeParsedResponse(value.playerResponse);
      } catch {
        /* ignore */
      }
    }

    if (stripFeedAds(value, 0) > 0) bumpStat("sanitizedResponses");
    if (cfg.hideShorts !== false && stripShorts(value, 0) > 0) bumpStat("hiddenShorts");
    return value;
  }

  async function sanitizePlayerPayload(data, cfg) {
    sanitizeDeep(data, cfg);
    if (!cfg.stripPlayerAds) return data;
    try {
      if (looksLikePlayerResponse(data)) {
        await mergeVrIntoPlayerResponse(data);
      } else if (data?.playerResponse && looksLikePlayerResponse(data.playerResponse)) {
        await mergeVrIntoPlayerResponse(data.playerResponse);
      }
    } catch {
      /* ignore */
    }
    return data;
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
        if (looksLikePlayerOrWatchPayload(value)) {
          return await sanitizePlayerPayload(value, cfg);
        }
      } catch {
        /* ignore */
      }
      return value;
    };

    window.fetch = async function patchedFetch(input, init) {
      if (cfg.enabled && cfg.stubAdBreak && isAdBreakUrl(input)) {
        return emptyJsonResponse();
      }

      if (
        cfg.enabled &&
        cfg.stripPlayerAds &&
        init &&
        typeof init.body === "string" &&
        looksLikePlayerRequestBody(init.body)
      ) {
        init = { ...init, body: rewriteJsonBodyText(init.body) };
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
          await sanitizePlayerPayload(data, cfg);
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
      if (cfg.enabled && cfg.stripPlayerAds && typeof body === "string" && looksLikePlayerRequestBody(body)) {
        body = rewriteJsonBodyText(body);
      } else if (
        cfg.enabled &&
        cfg.stripPlayerAds &&
        Array.isArray(body) &&
        typeof body[0] === "string" &&
        looksLikePlayerRequestBody(body[0])
      ) {
        body = [rewriteJsonBodyText(body[0]), ...body.slice(1)];
      }
      return nativeSend.call(this, body);
    };

    JSON.parse = function patchedParse(text, reviver) {
      const value = nativeParse.call(this, text, reviver);
      if (!cfg.enabled) return value;
      try {
        // Unlock playback-rate clamps used by anti-adblock paths.
        if (
          typeof text === "string" &&
          text.includes('"minimumPlaybackRate":100,"maximumPlaybackRate":100')
        ) {
          /* object already parsed — fix on value below */
        }
        if (value?.playerConfig?.granularVariableSpeedConfig) {
          const g = value.playerConfig.granularVariableSpeedConfig;
          if (g.minimumPlaybackRate === 100) g.minimumPlaybackRate = 25;
          if (g.maximumPlaybackRate === 100) g.maximumPlaybackRate = 200;
        }
        if (looksLikePlayerOrWatchPayload(value)) return sanitizeDeep(value, cfg);
        if (cfg.stripPlayerAds) observeParsedResponse(value);
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
      if (cfg.enabled && stored) {
        try {
          neuterPlayerResponse(stored, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
          if (cfg.stripPlayerAds) scheduleSabrColdReload(stored);
        } catch (err) {
          console.warn("[ytad] initial player neuter failed", err);
        }
      }
      Object.defineProperty(window, "ytInitialPlayerResponse", {
        configurable: true,
        enumerable: true,
        get: () => stored,
        set(value) {
          stored = value;
          if (!cfg.enabled || !value) return;
          try {
            neuterPlayerResponse(stored, {
              stripPlayerAds: cfg.stripPlayerAds,
              onChanged: () => bumpStat("sanitizedResponses"),
            });
            if (cfg.stripPlayerAds) scheduleSabrColdReload(stored);
          } catch (err) {
            console.warn("[ytad] ytInitialPlayerResponse neuter failed", err);
          }
        },
      });
    } catch (err) {
      console.warn("[ytad] ytInitialPlayerResponse trap failed", err);
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

    // Mirror set-constant playerResponse.adPlacements → undefined on movie_player.
    try {
      const desc = Object.getOwnPropertyDescriptor(window, "playerResponse");
      if (!desc || desc.configurable) {
        let pr = window.playerResponse;
        Object.defineProperty(window, "playerResponse", {
          configurable: true,
          enumerable: true,
          get: () => pr,
          set(value) {
            pr = value;
            if (cfg.enabled && cfg.stripPlayerAds && value) {
              try {
                neuterPlayerResponse(value, { stripPlayerAds: true });
              } catch {
                /* ignore */
              }
            }
          },
        });
        if (pr && cfg.stripPlayerAds) neuterPlayerResponse(pr, { stripPlayerAds: true });
      }
    } catch {
      /* ignore */
    }

    return { sanitizeGlobals, sanitizeInitialData };
  }

  function install() {
    const cfg = createConfig();
    const natives = (globalThis.__YTAD_NATIVES__ ||= {});
    natives.parse ||= JSON.parse;
    natives.stringify ||= JSON.stringify;
    natives.assign ||= Object.assign;
    natives.fetch ||= window.fetch.bind(window);
    natives.responseJson ||= Response.prototype.json;
    natives.xhrOpen ||= XMLHttpRequest.prototype.open;
    natives.xhrSend ||= XMLHttpRequest.prototype.send;
    natives.promiseThen ||= Promise.prototype.then;
    natives.appendChild ||= Node.prototype.appendChild;
    natives.textEncode ||= TextEncoder.prototype.encode;
    natives.Request ||= window.Request;

    // Defense first — abnormality noop must win before player boots.
    installDefend(cfg, natives);
    installRequestHooks(cfg, natives);
    installNetworkHooks(cfg, natives);
    installCreateGate();
    const { sanitizeGlobals, sanitizeInitialData } = installGlobalTraps(cfg, natives.parse);

    sanitizeGlobals();
    sanitizeInitialData();

    let passes = 0;
    const timer = setInterval(() => {
      sanitizeGlobals();
      sanitizeInitialData();
      try {
        installCreateGate();
        const boot =
          window.ytplayer?.bootstrapPlayerResponse || window.ytInitialPlayerResponse;
        if (boot && typeof boot === "object") {
          neuterPlayerResponse(boot, {
            stripPlayerAds: cfg.stripPlayerAds,
            onChanged: () => bumpStat("sanitizedResponses"),
          });
          if (cfg.stripPlayerAds) {
            ensurePlayerPrefetch(boot);
            scheduleSabrColdReload(boot);
          }
        }
      } catch {
        /* ignore */
      }
      passes += 1;
      if (passes > 400) clearInterval(timer);
    }, 50);

    try {
      onPageMessage((data) => {
        if (data.type === PAGE.CONFIG) Object.assign(cfg, data.payload || {});
      });
      YTAD.messaging.postToPage(PAGE.READY);
    } catch {
      /* page messaging optional */
    }
  }

  YTAD.define("sanitizeHooks", { install, sanitizeDeep, looksLikePlayerOrWatchPayload });
})();
