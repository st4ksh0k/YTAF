/**
 * document_idle: install in-video sponsor skipper + progress-bar markers.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (
    !YTAD?.sponsorSkipper ||
    !YTAD?.sponsorApi ||
    !YTAD?.sponsorPreviewBar ||
    !YTAD?.messaging
  ) {
    console.error(
      "[ytad] sponsor-skip modules missing:",
      YTAD?.missing?.(
        "sponsorSkipper",
        "sponsorApi",
        "sponsorPreviewBar",
        "messaging"
      )
    );
    return;
  }

  YTAD.once("sponsorSkipInstalled", () => {
    YTAD.sponsorSkipper.start();
  });
})();
