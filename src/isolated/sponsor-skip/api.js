/**
 * Crowdsourced in-video segment fetch (hash-prefix privacy lookup).
 * Proxied through the service worker.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.constants || YTAD.sponsorApi) return;

  const { RUNTIME } = YTAD.constants;

  /** Default crowdsourced segment API host */
  const DEFAULT_SERVER = "https://sponsor.ajay.app";

  /** Categories requested from the segment API. */
  const FETCH_CATEGORIES = Object.freeze([
    "sponsor",
    "selfpromo",
    "exclusive_access",
    "interaction",
    "poi_highlight",
    "intro",
    "outro",
    "preview",
    "hook",
    "filler",
    "chapter",
    "music_offtopic",
  ]);

  /** Categories YTAF auto-skips by default. */
  const AUTO_SKIP_CATEGORIES = Object.freeze([
    "sponsor",
    "selfpromo",
    "interaction",
    "music_offtopic",
  ]);

  const ACTION_TYPES = Object.freeze(["skip", "mute", "full", "poi", "chapter"]);

  async function sha256Once(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function runtimeFetch(payload) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.runtime?.id) {
          reject(new Error("extension context invalidated"));
          return;
        }
        chrome.runtime.sendMessage(
          { type: RUNTIME.FETCH_SPONSOR_SEGMENTS, ...payload },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message || "runtime error"));
              return;
            }
            if (!response?.ok) {
              reject(new Error(response?.error || `segment api ${response?.status || "?"}`));
              return;
            }
            resolve(response);
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * @returns {Promise<{segments: Array, status: number, videoID: string}>}
   */
  async function fetchSkipSegments(videoID, opts = {}) {
    const serverAddress = (opts.serverAddress || DEFAULT_SERVER).replace(/\/$/, "");
    const categories = opts.categories || FETCH_CATEGORIES;
    const actionTypes = opts.actionTypes || ACTION_TYPES;

    const hash = await sha256Once(videoID);
    const prefix = hash.slice(0, 5);

    const response = await runtimeFetch({
      videoID,
      prefix,
      serverAddress,
      categories,
      actionTypes,
    });

    return {
      videoID,
      status: response.status,
      segments: Array.isArray(response.segments) ? response.segments : [],
      prefix,
    };
  }

  YTAD.define("sponsorApi", {
    DEFAULT_SERVER,
    FETCH_CATEGORIES,
    AUTO_SKIP_CATEGORIES,
    ACTION_TYPES,
    fetchSkipSegments,
    sha256Once,
  });
})();
