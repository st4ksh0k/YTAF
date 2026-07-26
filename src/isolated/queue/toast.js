(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  let host = null;
  let hideTimer = 0;

  function ensure() {
    if (host && document.documentElement.contains(host)) return host;
    host = document.createElement("div");
    host.id = "ytad-queue-toast";
    host.setAttribute("role", "status");
    document.documentElement.appendChild(host);
    return host;
  }

  function show(message, { ms = 2200 } = {}) {
    const el = ensure();
    el.textContent = message;
    el.classList.add("ytad-queue-toast--show");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      el.classList.remove("ytad-queue-toast--show");
    }, ms);
  }

  YTAD.define("queueToast", { show });
})();
