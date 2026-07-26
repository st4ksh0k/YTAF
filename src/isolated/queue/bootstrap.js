(() => {
  const YTAD = globalThis.YTAD;
  if (
    !YTAD?.queueStore ||
    !YTAD?.queuePanel ||
    !YTAD?.queueTiles ||
    !YTAD?.queueAutoplay ||
    !YTAD?.queueNative ||
    !YTAD?.messaging
  ) {
    console.error(
      "[ytad] queue modules missing:",
      YTAD?.missing?.(
        "queueStore",
        "queuePanel",
        "queueTiles",
        "queueAutoplay",
        "queueNative",
        "queueMeta",
        "queueNavigate",
        "queueToast",
        "messaging"
      )
    );
    return;
  }

  YTAD.once("queueInstalled", () => {
    const { refresh } = YTAD.queueStore;
    const { start: startPanel } = YTAD.queuePanel;
    const { sweep } = YTAD.queueTiles;
    const { start: startAutoplay } = YTAD.queueAutoplay;
    const { start: startNative } = YTAD.queueNative;
    const { onStorageChanged, extAlive } = YTAD.messaging;

    refresh().then(() => {
      startPanel();
      startAutoplay();
      startNative();
      sweep();
    });

    const observer = new MutationObserver(() => {
      if (!extAlive()) return;
      sweep();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener("yt-navigate-finish", sweep);
    onStorageChanged((changes, area) => {
      if (area !== "local") return;
      if (changes.queueEnabled || changes.enabled) {
        startPanel();
        sweep();
      }
    });

    // Keyboard: Shift+Q toggles panel
    window.addEventListener("keydown", (ev) => {
      if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
      if (ev.target?.isContentEditable) return;
      if (ev.shiftKey && (ev.key === "Q" || ev.key === "q") && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        YTAD.queuePanel.toggle();
      }
    });

    setInterval(sweep, 2500);
  });
})();
