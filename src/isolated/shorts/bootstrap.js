(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.shortsHide || !YTAD?.shortsRedirect || !YTAD?.messaging) {
    console.error(
      "[ytad] shorts modules missing:",
      YTAD?.missing?.("shortsHide", "shortsRedirect", "messaging")
    );
    return;
  }

  YTAD.once("shortsInstalled", () => {
    const { sweep } = YTAD.shortsHide;
    const { redirectIfNeeded, onClick } = YTAD.shortsRedirect;
    const { onStorageChanged, extAlive } = YTAD.messaging;

    function tick() {
      if (!extAlive()) return;
      redirectIfNeeded();
      sweep();
    }

    tick();
    document.addEventListener("click", onClick, true);
    window.addEventListener("yt-navigate-finish", tick);
    window.addEventListener("popstate", tick);

    const observer = new MutationObserver(() => {
      sweep();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    onStorageChanged((changes, area) => {
      if (area !== "local") return;
      if (changes.hideShorts || changes.redirectShorts || changes.enabled) tick();
    });

    setInterval(tick, 2000);
  });
})();
