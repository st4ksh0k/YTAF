/**
 * Hijack YouTube’s native “Add to queue” / “Play next” menu items
 * (listItemViewModel + ADD_TO_QUEUE_TAIL / QUEUE_PLAY_NEXT) into the YTAF queue.
 *
 * Premium Lite often shows the menu but the CLIENT_SIGNAL → TLPQ create path is dead;
 * we stop that handler and fulfill the action ourselves.
 *
 * IMPORTANT: click interception must stay synchronous (cached toggles) so
 * stopImmediatePropagation runs before YouTube’s listeners.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.queueMeta || !YTAD?.keys || !YTAD?.urls || !YTAD?.messaging) return;

  const { fromTile, fromWatchPage, thumbFor } = YTAD.queueMeta;
  const { QUEUE, VIDEO_ID_RE } = YTAD.keys;
  const { extractVideoId } = YTAD.urls;
  const { storageGet, onStorageChanged } = YTAD.messaging;

  let enabled = true;
  let queueEnabled = true;
  let lastMenuItem = null;
  let lastMenuAt = 0;

  const ADD_RE = /^\s*add to queue\s*$/i;
  const NEXT_RE = /^\s*play next\s*$/i;

  function refreshFlags() {
    storageGet(["enabled", "queueEnabled"], (data) => {
      enabled = data.enabled !== false;
      queueEnabled = data.queueEnabled !== false;
    });
  }

  function textOf(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function walkVideoId(obj, depth = 0) {
    if (!obj || depth > 8) return "";
    if (typeof obj === "string") {
      if (VIDEO_ID_RE.test(obj)) return obj;
      return extractVideoId(obj) || "";
    }
    if (typeof obj !== "object") return "";
    if (typeof obj.videoId === "string" && VIDEO_ID_RE.test(obj.videoId)) return obj.videoId;
    if (Array.isArray(obj.videoIds)) {
      for (const id of obj.videoIds) {
        if (typeof id === "string" && VIDEO_ID_RE.test(id)) return id;
      }
    }
    const cmd = obj.addToPlaylistCommand || obj[QUEUE.COMMAND];
    if (cmd) {
      const id = walkVideoId(cmd, depth + 1);
      if (id) return id;
    }
    if (obj.signalServiceEndpoint) {
      const id = walkVideoId(obj.signalServiceEndpoint, depth + 1);
      if (id) return id;
    }
    if (Array.isArray(obj.actions)) {
      for (const a of obj.actions) {
        const id = walkVideoId(a, depth + 1);
        if (id) return id;
      }
    }
    for (const v of Object.values(obj)) {
      if (!v || (typeof v !== "object" && typeof v !== "string")) continue;
      if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 40) continue;
      const id = walkVideoId(v, depth + 1);
      if (id) return id;
    }
    return "";
  }

  function polymerData(el) {
    if (!el) return null;
    try {
      return el.data || el.__data?.data || el.__data || el.command || null;
    } catch {
      return null;
    }
  }

  function itemFromElementData(el) {
    let node = el;
    for (let i = 0; i < 10 && node; i++) {
      const data = polymerData(node);
      const videoId = walkVideoId(data);
      if (videoId) {
        return {
          videoId,
          title: videoId,
          channel: "",
          thumb: thumbFor(videoId),
          lengthText: "",
          addedAt: Date.now(),
        };
      }
      node = node.parentElement;
    }
    return null;
  }

  function isOurUi(target) {
    return !!target?.closest?.(
      [
        "#ytad-queue-panel",
        "#ytad-queue-fab",
        "#ytad-queue-toast",
        ".ytad-queue-chip",
        ".ytad-queue-tile-bar",
        ".ytad-queue-watch-bar",
        ".ytad-queue-watch-btn",
        "yt-button-view-model.ytad-queue-watch-btn",
      ].join(",")
    );
  }

  function menuKindFromTarget(target) {
    // Never hijack our own watch chips / panel (capture-phase used to steal "Play next").
    if (!target || isOurUi(target)) return null;

    // Only real overflow / sheet menu rows — not arbitrary buttons labeled "Play next".
    const row =
      target.closest?.("yt-list-item-view-model") ||
      target.closest?.("ytd-list-item-view-model") ||
      target.closest?.("ytd-menu-service-item-renderer") ||
      target.closest?.("tp-yt-paper-item") ||
      target.closest?.('[role="menuitem"]');
    if (!row) return null;

    // Must be inside a menu / sheet popup, not the watch metadata action row.
    const inMenu =
      row.closest?.("tp-yt-iron-dropdown") ||
      row.closest?.("ytd-menu-popup-renderer") ||
      row.closest?.("yt-sheet-view-model") ||
      row.closest?.("tp-yt-paper-listbox") ||
      row.closest?.("[role='menu']") ||
      row.closest?.("ytd-popup-container");
    if (!inMenu && !row.closest?.("ytd-menu-service-item-renderer")) {
      // Still allow classic paper menu items without dropdown ancestor in some builds
      if (!row.matches?.("ytd-menu-service-item-renderer, yt-list-item-view-model, ytd-list-item-view-model")) {
        return null;
      }
    }

    const t = textOf(row);
    if (t && t.length < 48) {
      if (ADD_RE.test(t) || /\badd to queue\b/i.test(t)) return { kind: "add", row };
      if (NEXT_RE.test(t) || /\bplay next\b/i.test(t)) return { kind: "playNext", row };
    }

    const data = polymerData(row) || polymerData(row.parentElement);
    const blob = data ? JSON.stringify(data) : "";
    if (
      blob.includes(QUEUE.LIST_TYPE) ||
      blob.includes(QUEUE.ICONS.ADD) ||
      blob.includes("ADD_TO_QUEUE_TAIL")
    ) {
      const playNext =
        blob.includes(QUEUE.ICONS.PLAY_NEXT) || blob.includes("QUEUE_PLAY_NEXT");
      return { kind: playNext ? "playNext" : "add", row };
    }

    return null;
  }

  function rememberMenuSource(target) {
    const host =
      target.closest?.("ytd-rich-item-renderer") ||
      target.closest?.("ytd-compact-video-renderer") ||
      target.closest?.("ytd-video-renderer") ||
      target.closest?.("yt-lockup-view-model") ||
      target.closest?.("ytd-playlist-panel-video-renderer") ||
      target.closest?.("ytd-watch-metadata");
    if (!host) return;

    const item =
      host.tagName === "YTD-WATCH-METADATA" ? fromWatchPage() : fromTile(host);
    if (!item?.videoId) return;
    lastMenuItem = item;
    lastMenuAt = Date.now();
  }

  function resolveItem(row) {
    const fromData = itemFromElementData(row);
    if (fromData) {
      // Prefer richer title/channel from the tile we remembered
      if (lastMenuItem && lastMenuItem.videoId === fromData.videoId) {
        return { ...fromData, ...lastMenuItem, videoId: fromData.videoId };
      }
      return fromData;
    }
    if (lastMenuItem && Date.now() - lastMenuAt < 20000) return lastMenuItem;
    return fromWatchPage();
  }

  function onPointerDown(ev) {
    if (!enabled || !queueEnabled) return;
    rememberMenuSource(ev.target);
  }

  function onClick(ev) {
    if (!enabled || !queueEnabled) return;

    rememberMenuSource(ev.target);

    const hit = menuKindFromTarget(ev.target);
    if (!hit) return;

    const item = resolveItem(hit.row);
    if (!item?.videoId) {
      YTAD.queueToast?.show("Couldn’t find that video to queue");
      return;
    }

    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();

    const enqueue = YTAD.queueTiles?.enqueue;
    if (typeof enqueue === "function") {
      enqueue(item, hit.kind === "playNext");
    }
  }

  function start() {
    refreshFlags();
    onStorageChanged((changes, area) => {
      if (area !== "local") return;
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.queueEnabled) queueEnabled = changes.queueEnabled.newValue !== false;
    });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
  }

  YTAD.define("queueNative", { start, menuKindFromTarget, resolveItem });
})();
