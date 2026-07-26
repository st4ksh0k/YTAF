/**
 * Minimal skip notice toast.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD || YTAD.sponsorNotice) return;

  const HOST_ID = "ytad-sponsor-notice";
  let hideTimer = 0;

  function ensureHost() {
    let el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = HOST_ID;
    el.className = "ytad-sponsor-notice";
    el.setAttribute("role", "status");
    el.hidden = true;
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function show(label, durationMs = 4000) {
    const el = ensureHost();
    el.textContent = label;
    el.hidden = false;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  }

  function hide() {
    const el = document.getElementById(HOST_ID);
    if (el) el.hidden = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = 0;
  }

  YTAD.define("sponsorNotice", { show, hide });
})();
