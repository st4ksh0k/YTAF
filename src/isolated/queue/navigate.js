/**
 * SPA-friendly navigation to the next queued watch URL.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys) return;

  const { VIDEO_ID_RE } = YTAD.keys;

  function currentVideoId() {
    try {
      const v = new URL(location.href).searchParams.get("v") || "";
      return VIDEO_ID_RE.test(v) ? v : "";
    } catch {
      return "";
    }
  }

  function goToVideo(videoId) {
    if (!VIDEO_ID_RE.test(videoId)) return;
    const dest = `/watch?v=${encodeURIComponent(videoId)}`;
    if (currentVideoId() === videoId) return;

    // Prefer clicking a synthetic endpoint so Polymer updates watch flexy.
    try {
      const a = document.createElement("a");
      a.href = dest;
      a.className = "yt-simple-endpoint style-scope ytd-compact-video-renderer";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Fallback if SPA click is ignored
      setTimeout(() => {
        if (currentVideoId() !== videoId) location.assign(dest);
      }, 600);
      return;
    } catch {
      location.assign(dest);
    }
  }

  YTAD.define("queueNavigate", { goToVideo, currentVideoId });
})();
