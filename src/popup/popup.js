(() => {
  const { RUNTIME } = YTAD.constants;

  const enabledEl = document.getElementById("enabled");
  const queueEnabledEl = document.getElementById("queueEnabled");
  const hideShortsEl = document.getElementById("hideShorts");
  const redirectShortsEl = document.getElementById("redirectShorts");
  const skipSponsorsEl = document.getElementById("skipSponsors");
  const sanitizedEl = document.getElementById("sanitizedResponses");
  const stubbedEl = document.getElementById("stubbedAdBreaks");
  const skippedEl = document.getElementById("skippedUiAds");
  const filledEl = document.getElementById("filledFeedSlots");
  const sponsorsEl = document.getElementById("skippedSponsors");
  const hiddenShortsEl = document.getElementById("hiddenShorts");
  const queuedVideosEl = document.getElementById("queuedVideos");
  const queueLengthEl = document.getElementById("queueLength");

  function render(status) {
    enabledEl.checked = status.enabled !== false;
    queueEnabledEl.checked = status.queueEnabled !== false;
    hideShortsEl.checked = status.hideShorts !== false;
    redirectShortsEl.checked = status.redirectShorts !== false;
    skipSponsorsEl.checked = status.skipSponsors !== false;
    const stats = status.stats || {};
    sanitizedEl.textContent = String(stats.sanitizedResponses || 0);
    stubbedEl.textContent = String(stats.stubbedAdBreaks || 0);
    skippedEl.textContent = String(stats.skippedUiAds || 0);
    filledEl.textContent = String(stats.filledFeedSlots || 0);
    sponsorsEl.textContent = String(stats.skippedSponsors || 0);
    hiddenShortsEl.textContent = String(stats.hiddenShorts || 0);
    queuedVideosEl.textContent = String(stats.queuedVideos || 0);
    queueLengthEl.textContent = String(status.queue?.items?.length || 0);
  }

  chrome.runtime.sendMessage({ type: RUNTIME.GET_STATUS }, (status) => {
    if (chrome.runtime.lastError) return;
    render(status || {});
  });

  enabledEl.addEventListener("change", () => {
    chrome.runtime.sendMessage({ type: RUNTIME.SET_ENABLED, enabled: enabledEl.checked });
  });

  queueEnabledEl.addEventListener("change", () => {
    chrome.storage.local.set({ queueEnabled: queueEnabledEl.checked });
  });

  hideShortsEl.addEventListener("change", () => {
    chrome.storage.local.set({ hideShorts: hideShortsEl.checked });
  });

  redirectShortsEl.addEventListener("change", () => {
    chrome.storage.local.set({ redirectShorts: redirectShortsEl.checked });
  });

  skipSponsorsEl.addEventListener("change", () => {
    chrome.storage.local.set({ skipSponsors: skipSponsorsEl.checked });
  });
})();
