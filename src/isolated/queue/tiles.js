/**
 * Inject Play next / Add controls on feed tiles and the watch page.
 * Watch chips are real ytSpec tonal buttons inside ytd-menu-renderer’s flex row.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.queueStore || !YTAD?.queueMeta || !YTAD?.queueToast || !YTAD?.messaging) return;

  const { add, ensureWatching, refresh, get, setCurrent } = YTAD.queueStore;
  const { fromTile, fromWatchPage, thumbFor } = YTAD.queueMeta;
  const { show } = YTAD.queueToast;
  const { storageGet, sendRuntimeStat } = YTAD.messaging;

  const TILE_MARK = "data-ytad-queue-controls";
  const WATCH_MARK = "data-ytad-queue-watch";

  // Material / YouTube-style 24×24 glyphs (skip_next, playlist_add, playlist_play)
  const ICON_PLAY_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events:none;display:inherit;width:100%;height:100%"><path d="M6 18l8.5-6L6 6v12zm9-12v12h2V6h-2z"></path></svg>';
  const ICON_ADD_QUEUE =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events:none;display:inherit;width:100%;height:100%"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v2H2v-2z"></path></svg>';
  const ICON_QUEUE =
    '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events:none;display:inherit;width:100%;height:100%"><path d="M4 10h12v2H4v-2zm0-4h12v2H4V6zm0 8h8v2H4v-2zm10 0v6l5-3-5-3z"></path></svg>';

  function btn(label, title, onClick, className = "ytad-queue-chip") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(ev);
    });
    return b;
  }

  function normalizeItem(item) {
    if (!item?.videoId) return null;
    return {
      ...item,
      thumb: thumbFor(item.videoId),
      title: item.title || item.videoId,
      channel: item.channel || "",
    };
  }

  async function enqueue(item, playNext) {
    const row = normalizeItem(item);
    if (!row) return;
    // Tile "Next" can still insert after the watching video in the list.
    if (playNext && location.pathname.startsWith("/watch")) {
      const watching = normalizeItem(fromWatchPage());
      if (watching?.videoId && watching.videoId !== row.videoId) {
        await ensureWatching(watching);
      }
    }
    await add(row, { playNext });
    sendRuntimeStat("queuedVideos");
    show(playNext ? `Queued next: ${row.title}` : `Added to queue: ${row.title}`);
    YTAD.queuePanel?.setOpen?.(true);
  }

  /**
   * Watch-page "Play next": navigate to the top queue item
   * (or the next one if you're already on the top).
   */
  async function playNextFromQueue() {
    await refresh();
    const { items } = get();
    if (!items.length) {
      show("Queue is empty — add a video first");
      YTAD.queuePanel?.setOpen?.(true);
      return;
    }

    const playing = YTAD.queueNavigate?.currentVideoId?.() || "";
    let next = items[0];
    if (playing && next.videoId === playing) {
      next = items[1];
    }
    if (!next?.videoId) {
      show("Nothing else left in the queue");
      return;
    }

    await setCurrent(next.videoId);
    YTAD.queueNavigate.goToVideo(next.videoId);
    show(`Playing: ${next.title}`);
  }

  function attachTile(el) {
    if (!el || el.getAttribute(TILE_MARK) === "1") return;
    const meta = fromTile(el);
    if (!meta?.videoId) return;

    const host =
      el.querySelector("yt-lockup-view-model") ||
      el.querySelector("#dismissible") ||
      el.querySelector("a#thumbnail")?.parentElement ||
      el;

    const bar = document.createElement("div");
    bar.className = "ytad-queue-tile-bar";
    bar.append(
      btn("Next", "Play next", () => enqueue(fromTile(el) || meta, true)),
      btn("Add", "Add to queue", () => enqueue(fromTile(el) || meta, false))
    );
    host.style.position = host.style.position || "relative";
    host.appendChild(bar);
    el.setAttribute(TILE_MARK, "1");
  }

  /** Native-looking tonal chip inside ytd-menu-renderer flex row */
  function watchMenuButton({ label, title, iconSvg, onClick }) {
    const host = document.createElement("yt-button-view-model");
    host.className = "ytd-menu-renderer ytad-queue-watch-btn";
    host.setAttribute(WATCH_MARK, "1");

    const vm = document.createElement("button-view-model");
    vm.className = "ytSpecButtonViewModelHost style-scope ytd-menu-renderer";

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconLeading ytSpecButtonShapeNextEnableBackdropFilterExperiment";
    button.title = title;
    button.setAttribute("aria-label", title);

    button.innerHTML = `
      <div aria-hidden="true" class="ytSpecButtonShapeNextIcon ytSpecButtonShapeNextElevatedContent">
        <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
          <span class="yt-icon-shape ytSpecIconShapeHost">
            <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">${iconSvg}</div>
          </span>
        </span>
      </div>
      <div class="ytSpecButtonShapeNextButtonTextContent ytSpecButtonShapeNextElevatedContent">${label}</div>
      <yt-touch-feedback-shape aria-hidden="true" class="ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse">
        <div class="ytSpecTouchFeedbackShapeStroke"></div>
        <div class="ytSpecTouchFeedbackShapeFill"></div>
      </yt-touch-feedback-shape>
    `;

    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(ev);
    });

    vm.appendChild(button);
    host.appendChild(vm);
    return host;
  }

  function cleanupMisplacedWatchBars() {
    for (const el of document.querySelectorAll(".ytad-queue-watch-bar, .ytad-queue-watch-btn")) {
      el.remove();
    }
    for (const el of document.querySelectorAll(`[${WATCH_MARK}]`)) {
      el.removeAttribute(WATCH_MARK);
    }
  }

  function attachWatch() {
    if (!location.pathname.startsWith("/watch")) return;

    const menu = document.querySelector("ytd-watch-metadata ytd-menu-renderer");
    if (!menu) return;

    // Already correctly mounted inside the menu flex row
    if (menu.querySelector(`.ytad-queue-watch-btn[${WATCH_MARK}]`)) return;

    cleanupMisplacedWatchBars();

    const row =
      menu.querySelector("#flexible-item-buttons") ||
      menu.querySelector("#top-level-buttons-computed");
    if (!row) return;

    const buttons = [
      watchMenuButton({
        label: "Play next",
        title: "Play the next video in your queue",
        iconSvg: ICON_PLAY_NEXT,
        onClick: () => playNextFromQueue(),
      }),
      watchMenuButton({
        label: "Add to queue",
        title: "Add this video to the end of your queue",
        iconSvg: ICON_ADD_QUEUE,
        onClick: async () => {
          await enqueue(fromWatchPage(), false);
        },
      }),
      watchMenuButton({
        label: "Queue",
        title: "Open queue",
        iconSvg: ICON_QUEUE,
        onClick: () => YTAD.queuePanel?.toggle?.(),
      }),
    ];

    for (const b of buttons) row.appendChild(b);
    menu.setAttribute(WATCH_MARK, "1");
  }

  function sweep() {
    storageGet(["enabled", "queueEnabled"], ({ enabled, queueEnabled }) => {
      if (enabled === false || queueEnabled === false) {
        cleanupMisplacedWatchBars();
        return;
      }
      const tiles = document.querySelectorAll(
        [
          "ytd-rich-item-renderer",
          "ytd-compact-video-renderer",
          "ytd-video-renderer",
          "ytd-playlist-panel-video-renderer",
          "yt-lockup-view-model.lockup",
        ].join(",")
      );
      for (const el of tiles) attachTile(el);
      attachWatch();
    });
  }

  YTAD.define("queueTiles", { sweep, enqueue, playNextFromQueue });
})();
