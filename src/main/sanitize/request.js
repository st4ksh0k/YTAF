/**
 * Outgoing player-request patches.
 *
 * Ported from Adblock for Youtube™:
 * - isInlinePlaybackNoAd on contentPlaybackContext
 * - clientScreen WATCH → ADUNIT (always-on spoof)
 * - Escalation ladder (params / CHANNEL / pyv / AD_TYPE_INSTREAM) when
 *   playability fails — driven by sanitizeDefend
 * - Strip context.client.configInfo.appInstallData
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  const FLAG = "isInlinePlaybackNoAd";
  const FLAG_SNIPPET = `"${FLAG}":true`;
  const CTX_NEEDLE = `"contentPlaybackContext":{`;
  const CTX_REPLACEMENT = `"contentPlaybackContext":{${FLAG_SNIPPET},`;

  const STAGE = Object.freeze({
    PARAM_FIRST: "param_first",
    PARAM_SECOND: "param_second",
    PYV: "pyv",
    CLIENT_SCREEN: "client_screen",
    AD_TYPE: "ad_type",
    NONE: "none",
  });

  const PARAMS_FIRST = "eAFgAQ";
  const PARAMS_SECOND = "8AUB";
  const CHANNEL_PREFIX = "YAHI";
  const CLIENT_SCREEN_CHANNEL = "CHANNEL";

  const STAGE_ORDER = [
    STAGE.PARAM_FIRST,
    STAGE.PARAM_SECOND,
    STAGE.PYV,
    STAGE.CLIENT_SCREEN,
    STAGE.AD_TYPE,
    STAGE.NONE,
  ];

  let stage = STAGE.PARAM_FIRST;
  let lastVideoId = null;
  let visibilityDesc = null;

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function skipLadderLocation() {
    const href = location.href || "";
    return (
      href.includes("/shorts/") ||
      href.includes("youtube.com/tv") ||
      href.includes("youtube.com/embed/")
    );
  }

  function getStage() {
    return stage;
  }

  function setStage(next) {
    if (STAGE_ORDER.includes(next)) stage = next;
  }

  function resetStage() {
    stage = STAGE.PARAM_FIRST;
  }

  function advanceStage() {
    const i = STAGE_ORDER.indexOf(stage);
    if (i < 0 || i >= STAGE_ORDER.length - 1) {
      stage = STAGE.NONE;
      return stage;
    }
    stage = STAGE_ORDER[i + 1];
    return stage;
  }

  function noteVideoId(videoId) {
    if (!videoId || typeof videoId !== "string") return;
    if (lastVideoId && lastVideoId !== videoId) resetStage();
    lastVideoId = videoId;
  }

  function forceVisibilityVisible() {
    try {
      if (!visibilityDesc) {
        visibilityDesc = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
      }
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
    } catch {
      /* ignore */
    }
  }

  function restoreVisibility() {
    if (!visibilityDesc) return;
    try {
      Object.defineProperty(document, "visibilityState", visibilityDesc);
    } catch {
      /* ignore */
    }
  }

  function stripAppInstallData(body) {
    try {
      if (body?.context?.client?.configInfo && "appInstallData" in body.context.client.configInfo) {
        delete body.context.client.configInfo.appInstallData;
      }
    } catch {
      /* ignore */
    }
  }

  function applyLadderToBody(body, playbackContext) {
    if (!body || !playbackContext || stage === STAGE.NONE || skipLadderLocation()) return;
    noteVideoId(body.videoId);

    const clientScreen = body.context?.client?.clientScreen;
    const params = typeof body.params === "string" ? body.params : "";
    const cpc = playbackContext.contentPlaybackContext;
    if (isPlainObject(cpc)) {
      cpc.lactMilliseconds = String(Date.now());
    }

    if (stage === STAGE.PARAM_FIRST) {
      if (clientScreen === CLIENT_SCREEN_CHANNEL || params.startsWith(CHANNEL_PREFIX)) return;
      body.params = PARAMS_FIRST;
      if (body.playerRequest) body.playerRequest.params = PARAMS_FIRST;
      if (body.playbackContext) body.playbackContext.params = PARAMS_FIRST;
      forceVisibilityVisible();
      stripAppInstallData(body);
      return;
    }

    if (stage === STAGE.PARAM_SECOND) {
      if (clientScreen === CLIENT_SCREEN_CHANNEL || params.startsWith(CHANNEL_PREFIX)) return;
      body.params = PARAMS_SECOND;
      if (body.playerRequest) body.playerRequest.params = PARAMS_SECOND;
      if (body.playbackContext) body.playbackContext.params = PARAMS_SECOND;
      if (!body.playlistId && body.context?.client) {
        body.context.client.clientScreen = CLIENT_SCREEN_CHANNEL;
      }
      forceVisibilityVisible();
      stripAppInstallData(body);
      return;
    }

    if (stage === STAGE.PYV) {
      if (clientScreen === CLIENT_SCREEN_CHANNEL) return;
      playbackContext.adPlaybackContext = { pyv: true };
      forceVisibilityVisible();
      stripAppInstallData(body);
      return;
    }

    if (stage === STAGE.CLIENT_SCREEN) {
      if (body.context?.client?.clientName === "WEB") {
        body.context.client.clientScreen = CLIENT_SCREEN_CHANNEL;
      }
      forceVisibilityVisible();
      stripAppInstallData(body);
      return;
    }

    if (stage === STAGE.AD_TYPE) {
      playbackContext.adPlaybackContext = { adType: "AD_TYPE_INSTREAM" };
      forceVisibilityVisible();
      stripAppInstallData(body);
      return;
    }
  }

  function injectNoAdFlag(value) {
    if (!isPlainObject(value)) return value;
    const pbCtx = value.playbackContext;
    if (!isPlainObject(pbCtx)) return value;
    const ctx = pbCtx.contentPlaybackContext;
    if (!isPlainObject(ctx)) return value;
    if (ctx[FLAG] === true) return value;

    return {
      ...value,
      playbackContext: {
        ...pbCtx,
        contentPlaybackContext: {
          ...ctx,
          [FLAG]: true,
        },
      },
    };
  }

  function patchRequestObject(value) {
    if (!isPlainObject(value) || !value.context?.client) return value;
    try {
      if (value.playbackContext && value.playbackContext.adPlaybackContext === undefined) {
        applyLadderToBody(value, value.playbackContext);
      }
      if (value.playerRequest?.playbackContext && value.playerRequest.playbackContext.adPlaybackContext === undefined) {
        applyLadderToBody(value, value.playerRequest.playbackContext);
      }
    } catch {
      /* ignore */
    }
    return injectNoAdFlag(value);
  }

  function spoofClientScreenText(text) {
    if (typeof text !== "string") return text;
    let out = text;
    if (out.includes('"clientScreen":"WATCH"')) {
      out = out.split('"clientScreen":"WATCH"').join('"clientScreen":"ADUNIT"');
    }
    if (
      out.includes('isWebNativeShareAvailable":true}}') &&
      !out.includes('"clientScreen":"ADUNIT"') &&
      !out.includes('"clientScreen":"CHANNEL"')
    ) {
      out = out.replace(
        'isWebNativeShareAvailable":true}}',
        'isWebNativeShareAvailable":true},"clientScreen":"ADUNIT"}'
      );
    }
    return out;
  }

  function injectNoAdIntoJsonText(text) {
    if (typeof text !== "string" || !text.includes("contentPlaybackContext")) return text;
    let out = text;
    if (!out.includes(FLAG_SNIPPET) && out.includes(CTX_NEEDLE)) {
      out = out.replace(CTX_NEEDLE, CTX_REPLACEMENT);
    }
    return spoofClientScreenText(out);
  }

  function looksLikePlayerRequestBody(text) {
    return (
      typeof text === "string" &&
      (text.includes("contentPlaybackContext") || text.includes("adSignalsInfo")) &&
      text.includes("playbackContext")
    );
  }

  function rewriteJsonBodyText(text) {
    if (!looksLikePlayerRequestBody(text)) return text;
    try {
      const nativeParse = globalThis.__YTAD_NATIVES__?.parse || JSON.parse;
      const nativeStringify = globalThis.__YTAD_NATIVES__?.stringify || JSON.stringify;
      const obj = nativeParse(text);
      if (!obj?.context?.client) return injectNoAdIntoJsonText(text);
      patchRequestObject(obj);
      if (obj.playerRequest) patchRequestObject(obj.playerRequest);
      return spoofClientScreenText(nativeStringify(obj));
    } catch {
      return injectNoAdIntoJsonText(text);
    }
  }

  function rewriteAssignResult(result) {
    if (!result || typeof result !== "object") return result;
    if (typeof result.body !== "string" || !looksLikePlayerRequestBody(result.body)) {
      return result;
    }
    const next = rewriteJsonBodyText(result.body);
    if (next !== result.body) {
      try {
        result.body = next;
      } catch {
        /* locked body */
      }
    }
    return result;
  }

  function observeParsedResponse(value) {
    if (!value || typeof value !== "object") return value;
    if (skipLadderLocation() || stage === STAGE.NONE) return value;
    if (!value.responseContext && !value.playabilityStatus) return value;

    try {
      const nativeStringify = globalThis.__YTAD_NATIVES__?.stringify || JSON.stringify;
      const text = nativeStringify(value);
      const failed =
        (text.includes("playerErrorMessageRenderer") || text.includes("UNPLAYABLE")) &&
        !text.includes("CONTENT_CHECK_REQUIRED");
      if (failed) {
        advanceStage();
      } else if (stage === STAGE.PARAM_FIRST) {
        // Healthy response on first stage — scrub mute nudges already handled in player.js
      }
    } catch {
      /* ignore */
    }
    return value;
  }

  function installRequestHooks(cfg, natives) {
    const nativeStringify = natives.stringify || JSON.stringify;
    const nativeAssign = natives.assign || Object.assign;
    const nativeEncode = natives.textEncode || TextEncoder.prototype.encode;
    const NativeRequest = natives.Request || window.Request;

    natives.textEncode ||= TextEncoder.prototype.encode;
    natives.Request ||= window.Request;

    try {
      const desc = Object.getOwnPropertyDescriptor(JSON, "stringify");
      if (desc && desc.writable === false) {
        console.warn("[ytad] JSON.stringify locked; using body rewrite paths");
      } else {
        JSON.stringify = function patchedStringify(value, replacer, space) {
          if (cfg.enabled !== false && cfg.stripPlayerAds !== false) {
            try {
              value = patchRequestObject(value);
            } catch {
              /* ignore */
            }
          }
          let out = nativeStringify.call(JSON, value, replacer, space);
          if (cfg.enabled !== false && cfg.stripPlayerAds !== false && typeof out === "string") {
            out = spoofClientScreenText(out);
          }
          return out;
        };
      }
    } catch (err) {
      console.warn("[ytad] JSON.stringify patch failed", err);
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(Object, "assign");
      if (!desc || desc.writable !== false) {
        Object.assign = function patchedAssign(target, ...sources) {
          const result = nativeAssign(target, ...sources);
          if (cfg.enabled !== false && cfg.stripPlayerAds !== false) {
            try {
              rewriteAssignResult(result);
            } catch {
              /* ignore */
            }
          }
          return result;
        };
      }
    } catch (err) {
      console.warn("[ytad] Object.assign patch failed", err);
    }

    try {
      TextEncoder.prototype.encode = function patchedEncode(input) {
        if (
          cfg.enabled !== false &&
          cfg.stripPlayerAds !== false &&
          typeof input === "string" &&
          !skipLadderLocation() &&
          looksLikePlayerRequestBody(input)
        ) {
          input = rewriteJsonBodyText(input);
        }
        return nativeEncode.call(this, input);
      };
    } catch (err) {
      console.warn("[ytad] TextEncoder patch failed", err);
    }

    try {
      window.Request = new Proxy(NativeRequest, {
        construct(Target, args) {
          try {
            if (
              cfg.enabled !== false &&
              cfg.stripPlayerAds !== false &&
              !skipLadderLocation()
            ) {
              const url = String(args[0] || "");
              const init = args[1];
              let body = init?.body;
              if (
                url.includes("youtubei") &&
                typeof body === "string" &&
                looksLikePlayerRequestBody(body)
              ) {
                const next = rewriteJsonBodyText(body);
                if (next !== body) {
                  args = [args[0], { ...init, body: next }];
                }
              }
            }
          } catch {
            /* ignore */
          }
          return Reflect.construct(Target, args);
        },
      });
    } catch (err) {
      console.warn("[ytad] Request patch failed", err);
    }
  }

  YTAD.define("sanitizeRequest", {
    STAGE,
    injectNoAdFlag,
    injectNoAdIntoJsonText,
    looksLikePlayerRequestBody,
    rewriteJsonBodyText,
    patchRequestObject,
    spoofClientScreenText,
    observeParsedResponse,
    getStage,
    setStage,
    resetStage,
    advanceStage,
    noteVideoId,
    forceVisibilityVisible,
    restoreVisibility,
    installRequestHooks,
  });
})();
