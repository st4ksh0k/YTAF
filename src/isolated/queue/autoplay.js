/**
 * When the watch video finishes, play the next queue item.
 *
 * - Watching something in the queue → play the following entry
 * - Watching anything else → play the top of the queue
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.queueStore || !YTAD?.queueNavigate || !YTAD?.messaging || !YTAD?.detect) return;

  const { get, advance, setCurrent, refresh } = YTAD.queueStore;
  const { goToVideo, currentVideoId } = YTAD.queueNavigate;
  const { storageGet } = YTAD.messaging;
  const { getPlayerRoot, playerIsShowingAd } = YTAD.detect;

  let boundVideo = null;
  let advancing = false;
  let lastAdvanceAt = 0;

  function mainVideo() {
    return (
      document.querySelector("video.html5-main-video") ||
      document.querySelector("#movie_player video") ||
      document.querySelector("ytd-player video") ||
      null
    );
  }

  function videoNearEnd(video) {
    if (!video) return false;
    if (video.ended) return true;
    const d = video.duration;
    if (!d || !Number.isFinite(d) || d < 1) return false;
    return video.currentTime >= d - 0.5;
  }

  /**
   * Pick the video that should play after the current one ends.
   * Returns null when the queue has nothing left to play.
   */
  function pickNext(playing, items) {
    if (!items.length) return null;
    const idx = playing ? items.findIndex((i) => i.videoId === playing) : -1;
    if (idx >= 0) {
      // Currently on a queued video → continue after it
      return items[idx + 1] || null;
    }
    // Watching something outside the queue → jump to the top queued video
    return items[0] || null;
  }

  async function maybeAdvance(reason) {
    if (advancing) return;
    if (Date.now() - lastAdvanceAt < 2500) return;

    storageGet(["enabled", "queueEnabled"], async ({ enabled, queueEnabled }) => {
      if (enabled === false || queueEnabled === false) return;
      if (advancing) return;

      const player = getPlayerRoot();
      if (player && playerIsShowingAd(player)) return;

      const video = boundVideo || mainVideo();
      if (reason !== "ended" && !videoNearEnd(video)) return;

      await refresh();
      const playing = currentVideoId();
      const queue = get();
      const next = pickNext(playing, queue.items || []);
      if (!next?.videoId) return;
      if (next.videoId === playing) return;

      advancing = true;
      lastAdvanceAt = Date.now();
      try {
        // Remove / step past the finished queued item when applicable
        if (playing && queue.items.some((i) => i.videoId === playing)) {
          await advance(playing);
        } else {
          await setCurrent(next.videoId);
        }
        YTAD.queueToast?.show(`Up next: ${next.title}`);
        goToVideo(next.videoId);
      } finally {
        setTimeout(() => {
          advancing = false;
        }, 2000);
      }
    });
  }

  function onEnded() {
    maybeAdvance("ended");
  }

  function onTimeUpdate() {
    if (videoNearEnd(boundVideo)) maybeAdvance("timeupdate");
  }

  function bind() {
    const video = mainVideo();
    if (!video) return;
    if (video === boundVideo) return;
    if (boundVideo) {
      boundVideo.removeEventListener("ended", onEnded);
      boundVideo.removeEventListener("timeupdate", onTimeUpdate);
    }
    boundVideo = video;
    boundVideo.addEventListener("ended", onEnded);
    boundVideo.addEventListener("timeupdate", onTimeUpdate);
  }

  function syncCurrentFromUrl() {
    const id = currentVideoId();
    if (!id) return;
    const queue = get();
    if (queue.items.some((i) => i.videoId === id)) {
      setCurrent(id);
    }
  }

  function start() {
    bind();
    syncCurrentFromUrl();
    window.addEventListener("yt-navigate-finish", () => {
      advancing = false;
      bind();
      syncCurrentFromUrl();
    });
    setInterval(bind, 1000);
  }

  YTAD.define("queueAutoplay", { start, onEnded, pickNext });
})();
