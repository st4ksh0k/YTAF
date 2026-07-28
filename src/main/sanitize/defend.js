/**
 * Playback defense — ported from Adblock for Youtube™ inline MAIN scripts.
 *
 * - Noop onAbnormalityDetected (T1 SABR anti-adblock)
 * - Force web_streaming_watch experiment off
 * - SSAP midroll segment seek
 * - Playability-error recovery via loadVideoById + request ladder
 * - Promise.then scrub for muteOnStart / youThere / jspb ad fields
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.sanitizePlayer || !YTAD?.sanitizeRequest) return;

  const { neuterPlayerResponse, hardWipeAdFields, scrubPlaybackNudges } = YTAD.sanitizePlayer;
  const {
    STAGE,
    getStage,
    setStage,
    advanceStage,
    resetStage,
    noteVideoId,
    observeParsedResponse,
  } = YTAD.sanitizeRequest;

  function installAbnormalityAndScrub(natives) {
    const nativeThen = natives.promiseThen || Promise.prototype.then;
    natives.promiseThen = nativeThen;

    Promise.prototype.then = function patchedThen(onFulfilled, onRejected) {
      let fn = onFulfilled;
      if (typeof fn === "function") {
        let src = "";
        try {
          src = fn.toString();
        } catch {
          src = "";
        }

        if (src.includes("onAbnormalityDetected")) {
          fn = function noopAbnormality() {};
        } else if (src.includes(".next(")) {
          const inner = fn;
          fn = new Proxy(inner, {
            apply(target, thisArg, args) {
              const msg = args[0];
              if (typeof msg?.value === "string" && msg.value.includes("playerResponse")) {
                try {
                  let v = msg.value;
                  const onWatch =
                    location.href.includes("/watch") ||
                    (v.includes("cards") && !v.includes('"miniplayer"'));
                  if (onWatch && v.includes('"muteOnStart":true')) {
                    v = v.replace('"muteOnStart":true', '"muteOnStart":false');
                  }
                  if (v.includes('"youThereRenderer":')) {
                    v = v.replace('"youThereRenderer":', '"no_youThereRenderer":');
                  }
                  v = v.replace(/"(adSlots|playerAds)":/g, '"no_ads":');
                  args = [{ ...msg, value: v }];
                } catch {
                  /* ignore */
                }
              }
              return Reflect.apply(target, thisArg, args);
            },
          });
        } else if (src.includes("jspbResponseCtor")) {
          const inner = fn;
          fn = new Proxy(inner, {
            apply(target, thisArg, args) {
              const result = Reflect.apply(target, thisArg, args);
              if (result?.responseContext) {
                try {
                  hardWipeAdFields(result);
                  scrubPlaybackNudges(result);
                } catch {
                  /* ignore */
                }
              }
              return result;
            },
          });
        }
      }
      return nativeThen.call(this, fn, onRejected);
    };
  }

  function installWebStreamingWatchOff() {
    const apply = () => {
      for (const root of [window.ytcfg?.data_, window.yt?.config_]) {
        try {
          const flags = root?.EXPERIMENT_FLAGS;
          if (flags && flags.web_streaming_watch !== false) {
            flags.web_streaming_watch = false;
          }
        } catch {
          /* ignore */
        }
      }
    };
    apply();
    setInterval(apply, 250);
  }

  function installSsapSeek() {
    const nativePush = Array.prototype.push;
    const segments = [];
    const seenIds = [];
    let href = location.href;
    let primed = false;
    let appliedKey = "";

    Array.prototype.push = new Proxy(nativePush, {
      apply(target, thisArg, args) {
        try {
          const flags = window.yt?.config_?.EXPERIMENT_FLAGS;
          const item = args[0];
          if (
            flags?.html5_enable_ssap_entity_id &&
            item &&
            item !== window &&
            typeof item.start === "number" &&
            item.end &&
            item.namespace === "ssap" &&
            item.id
          ) {
            if (!primed || item.start === 0 || !seenIds.includes(item.id)) {
              if (!primed || item.start === 0) {
                segments.length = 0;
                seenIds.length = 0;
                primed = true;
              }
              if (!seenIds.includes(item.id)) {
                nativePush.call(segments, item);
                nativePush.call(seenIds, item.id);
              }
            }
          }
        } catch {
          /* ignore */
        }
        return Reflect.apply(target, thisArg, args);
      },
    });

    const tick = () => {
      try {
        if (!window.yt?.config_?.EXPERIMENT_FLAGS?.html5_enable_ssap_entity_id) return;
        const video = document.querySelector("video");
        if (!video || !segments.length) return;
        const duration = Math.round(video.duration);
        const last = segments.at(-1);
        const endSec = Math.round(last.end / 1000);
        const key = seenIds.join(",");
        if (duration && duration === endSec) {
          const startSec = last.start / 1000;
          if (video.currentTime < startSec) {
            video.currentTime = startSec;
            primed = false;
            appliedKey = key;
          }
        } else if (appliedKey === key) {
          /* already applied */
        }
      } catch {
        /* ignore */
      }
    };

    document.addEventListener("DOMContentLoaded", () => {
      tick();
      new MutationObserver(() => {
        if (href !== location.href) {
          href = location.href;
          segments.length = 0;
          seenIds.length = 0;
          primed = false;
          appliedKey = "";
          resetStage();
        }
        tick();
      }).observe(document.documentElement || document, { childList: true, subtree: true });
    });
  }

  function installIframeFetchBridge(natives) {
    const nativeAppend = natives.appendChild || Node.prototype.appendChild;
    natives.appendChild = nativeAppend;
    Node.prototype.appendChild = new Proxy(nativeAppend, {
      apply(target, thisArg, args) {
        const node = Reflect.apply(target, thisArg, args);
        try {
          if (
            node instanceof HTMLIFrameElement &&
            node.src === "about:blank" &&
            node.contentWindow
          ) {
            node.contentWindow.fetch = window.fetch;
            node.contentWindow.Request = window.Request;
          }
        } catch {
          /* ignore */
        }
        return node;
      },
    });
  }

  function installPlaybackRecovery() {
    const PLAYER_ID = "movie_player";
    const ERR_FLEX = "ytd-watch-flexy[player-unavailable]";
    const ERR_YTP = `#${PLAYER_ID} > .ytp-error`;
    const ERR_SCREEN = "yt-playability-error-supported-renderers#error-screen:has(>*)";
    const SUPPORT_LINK =
      'yt-playability-error-supported-renderers#error-screen a[href^="//support.google.com/youtube/answer/2802245"]';

    const reloaded = new Set();
    let lastPair = { videoId: "", stage: "", count: 0 };

    function currentVideo() {
      const player = document.getElementById(PLAYER_ID);
      const params = new URLSearchParams(location.search);
      const videoId = params.get("v") || player?.getVideoData?.()?.video_id || "";
      const timeInSeconds = parseInt(params.get("t") ?? "0", 10) || 0;
      return { videoId, timeInSeconds, player };
    }

    function hideErrorChrome() {
      const player = document.getElementById(PLAYER_ID);
      const support = document.querySelector(SUPPORT_LINK);
      if (!player || support) return;
      const status = player.getPlayerResponse?.()?.playabilityStatus?.status;
      const flex = document.querySelector(ERR_FLEX);
      const screen = document.querySelector(ERR_SCREEN);
      const mini = document.querySelector(
        "yt-playability-error-supported-renderers.ytdMiniplayerPlayerContainerPlayabilityError:has(>*)"
      );
      if (status === "LOGIN_REQUIRED" || status === "CONTENT_CHECK_REQUIRED") {
        screen?.style.setProperty("display", "block", "important");
        return;
      }
      if (flex || mini) {
        screen?.style.setProperty("display", "none", "important");
        mini?.style.setProperty("display", "none", "important");
        flex?.removeAttribute("player-unavailable");
      }
    }

    function shouldAdvance(stageName) {
      const { videoId } = currentVideo();
      if (!videoId) return false;
      if (lastPair.videoId === videoId && lastPair.stage === stageName) {
        lastPair.count += 1;
      } else {
        lastPair = { videoId, stage: stageName, count: 1 };
      }
      if (lastPair.count >= 2) {
        lastPair.count = 0;
        return true;
      }
      return false;
    }

    function reloadPlayer() {
      hideErrorChrome();
      const { videoId, timeInSeconds, player } = currentVideo();
      if (!player || typeof player.loadVideoById !== "function" || !videoId) return;
      try {
        noteVideoId(videoId);
        player.loadVideoById(videoId, timeInSeconds);
      } catch {
        /* ignore */
      }
    }

    function playerLooksBroken() {
      const player = document.getElementById(PLAYER_ID);
      const support = document.querySelector(SUPPORT_LINK);
      if (!player || support) return false;
      const status = player.getPlayerResponse?.()?.playabilityStatus?.status;
      if (status === "LOGIN_REQUIRED" || status === "CONTENT_CHECK_REQUIRED") return false;
      const err =
        document.querySelector(ERR_SCREEN) ||
        document.querySelector(ERR_FLEX) ||
        document.querySelector(ERR_YTP);
      const data = player.getVideoData?.();
      return !!(err && data && data.errorCode != null);
    }

    const root = document.documentElement;
    if (!root) return;

    new MutationObserver(() => {
      try {
        if (document.querySelector(ERR_SCREEN)) hideErrorChrome();
        if (!playerLooksBroken()) return;

        const { videoId } = currentVideo();
        noteVideoId(videoId);
        for (const id of [...reloaded]) {
          if (id !== videoId) reloaded.delete(id);
        }

        const stage = getStage();
        if (stage === STAGE.PARAM_FIRST) {
          if (!shouldAdvance(STAGE.PARAM_SECOND)) {
            reloadPlayer();
            return;
          }
          setStage(STAGE.PARAM_SECOND);
          reloadPlayer();
        } else if (stage === STAGE.PARAM_SECOND) {
          if (!shouldAdvance(STAGE.PYV)) {
            reloadPlayer();
            return;
          }
          setStage(STAGE.PYV);
          reloadPlayer();
        } else if (stage === STAGE.PYV) {
          if (!shouldAdvance(STAGE.CLIENT_SCREEN)) {
            reloadPlayer();
            return;
          }
          setStage(STAGE.CLIENT_SCREEN);
          reloadPlayer();
        } else if (stage === STAGE.CLIENT_SCREEN) {
          if (!shouldAdvance(STAGE.AD_TYPE)) {
            reloadPlayer();
            return;
          }
          setStage(STAGE.AD_TYPE);
          reloadPlayer();
        } else if (stage === STAGE.AD_TYPE) {
          if (!shouldAdvance(STAGE.NONE)) {
            reloadPlayer();
            return;
          }
          setStage(STAGE.NONE);
          reloadPlayer();
        } else if (stage === STAGE.NONE) {
          if (!videoId || reloaded.has(videoId)) {
            hideErrorChrome();
            return;
          }
          reloaded.add(videoId);
          reloadPlayer();
        }
      } catch {
        /* ignore */
      }
    }).observe(root, { attributes: true, childList: true, subtree: true });
  }

  function installJsonParseObserve(cfg, natives) {
    // Layered on top of hooks' JSON.parse — hooks installs first, then we wrap again
    // only if hooks hasn't been installed yet. Prefer exporting observe for hooks to call.
    void cfg;
    void natives;
  }

  function installDefend(cfg, natives) {
    if (cfg.enabled === false) return;
    installAbnormalityAndScrub(natives);
    installWebStreamingWatchOff();
    installSsapSeek();
    installIframeFetchBridge(natives);
    installPlaybackRecovery();

    // Keep globals wiped while kevlar boots.
    const scrub = () => {
      try {
        if (window.ytInitialPlayerResponse) {
          neuterPlayerResponse(window.ytInitialPlayerResponse, { stripPlayerAds: true });
        }
      } catch {
        /* ignore */
      }
    };
    scrub();
    let n = 0;
    const t = setInterval(() => {
      scrub();
      n += 1;
      if (n > 80) clearInterval(t);
    }, 50);
  }

  YTAD.define("sanitizeDefend", {
    installDefend,
    installAbnormalityAndScrub,
    installWebStreamingWatchOff,
    installSsapSeek,
    installPlaybackRecovery,
    observeParsedResponse,
    advanceStage,
  });
})();
