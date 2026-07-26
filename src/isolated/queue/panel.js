/**
 * Polished queue side panel — inspired by ytd-playlist-panel-renderer layout.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.queueStore || !YTAD?.queueNavigate || !YTAD?.messaging) return;

  const { get, onChange, remove, clear, reorder, setCurrent } = YTAD.queueStore;
  const { goToVideo, currentVideoId } = YTAD.queueNavigate;
  const { storageGet } = YTAD.messaging;
  const thumbFor = YTAD.queueMeta?.thumbFor || ((id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""));

  let root = null;
  let open = false;
  let dragFrom = -1;

  function ensure() {
    if (root && document.documentElement.contains(root)) return root;
    root = document.createElement("aside");
    root.id = "ytad-queue-panel";
    root.setAttribute("aria-label", "YTAF play queue");
    root.innerHTML = `
      <header class="ytad-queue-panel__header">
        <div class="ytad-queue-panel__title-wrap">
          <h2 class="ytad-queue-panel__title">Queue</h2>
          <span class="ytad-queue-panel__count" data-ytad-count>0</span>
        </div>
        <div class="ytad-queue-panel__actions">
          <button type="button" class="ytad-queue-panel__btn" data-ytad-clear title="Clear queue">Clear</button>
          <button type="button" class="ytad-queue-panel__icon" data-ytad-close aria-label="Close queue">×</button>
        </div>
      </header>
      <p class="ytad-queue-panel__hint">Play next jumps to the top item · drag to reorder · auto-advances on end</p>
      <ol class="ytad-queue-panel__list" data-ytad-list></ol>
      <div class="ytad-queue-panel__empty" data-ytad-empty hidden>Queue is empty. Use <strong>Play next</strong> or <strong>Add</strong> on any video.</div>
    `;
    document.documentElement.appendChild(root);

    root.querySelector("[data-ytad-close]").addEventListener("click", () => setOpen(false));
    root.querySelector("[data-ytad-clear]").addEventListener("click", async () => {
      await clear();
      YTAD.queueToast?.show("Queue cleared");
    });
    return root;
  }

  function setOpen(next) {
    open = !!next;
    const el = ensure();
    el.classList.toggle("ytad-queue-panel--open", open);
  }

  function toggle() {
    setOpen(!open);
  }

  function renderItem(item, index, currentIndex) {
    const li = document.createElement("li");
    li.className = "ytad-queue-panel__item";
    li.draggable = true;
    li.dataset.index = String(index);
    if (index === currentIndex) li.classList.add("ytad-queue-panel__item--current");

    const thumb = document.createElement("img");
    thumb.className = "ytad-queue-panel__thumb";
    thumb.src = thumbFor(item.videoId) || item.thumb || "";
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.referrerPolicy = "no-referrer";
    thumb.onerror = () => {
      if (item.videoId && !thumb.dataset.fallback) {
        thumb.dataset.fallback = "1";
        thumb.src = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
      }
    };

    const body = document.createElement("div");
    body.className = "ytad-queue-panel__meta";
    const title = document.createElement("div");
    title.className = "ytad-queue-panel__item-title";
    title.textContent = item.title || item.videoId;
    const channel = document.createElement("div");
    channel.className = "ytad-queue-panel__item-channel";
    channel.textContent = item.channel || (index === currentIndex ? "Now playing" : "");
    body.append(title, channel);

    const length = document.createElement("span");
    length.className = "ytad-queue-panel__length";
    length.textContent = item.lengthText || "";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ytad-queue-panel__remove";
    removeBtn.title = "Remove";
    removeBtn.setAttribute("aria-label", "Remove from queue");
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      remove(item.videoId);
    });

    li.append(thumb, body, length, removeBtn);

    li.addEventListener("click", async () => {
      await setCurrent(item.videoId);
      goToVideo(item.videoId);
    });

    li.addEventListener("dragstart", (ev) => {
      dragFrom = index;
      li.classList.add("ytad-queue-panel__item--dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", String(index));
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("ytad-queue-panel__item--dragging");
      dragFrom = -1;
    });
    li.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      li.classList.add("ytad-queue-panel__item--drop");
    });
    li.addEventListener("dragleave", () => li.classList.remove("ytad-queue-panel__item--drop"));
    li.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      li.classList.remove("ytad-queue-panel__item--drop");
      const to = index;
      const from = dragFrom >= 0 ? dragFrom : Number(ev.dataTransfer.getData("text/plain"));
      if (Number.isInteger(from) && from !== to) await reorder(from, to);
    });

    return li;
  }

  function render(queue = get()) {
    storageGet(["queueEnabled"], ({ queueEnabled }) => {
      const el = ensure();
      if (queueEnabled === false) {
        el.hidden = true;
        setOpen(false);
        return;
      }
      el.hidden = false;

      const list = el.querySelector("[data-ytad-list]");
      const empty = el.querySelector("[data-ytad-empty]");
      const count = el.querySelector("[data-ytad-count]");
      const items = queue.items || [];
      count.textContent = String(items.length);
      list.replaceChildren();
      empty.hidden = items.length > 0;

      const playing = currentVideoId();
      let currentIndex = queue.currentIndex;
      if (playing) {
        const idx = items.findIndex((i) => i.videoId === playing);
        if (idx >= 0) currentIndex = idx;
      }

      items.forEach((item, index) => {
        list.appendChild(renderItem(item, index, currentIndex));
      });
    });
  }

  function mountFab() {
    let fab = document.getElementById("ytad-queue-fab");
    if (fab) return fab;
    fab = document.createElement("button");
    fab.id = "ytad-queue-fab";
    fab.type = "button";
    fab.title = "Open queue";
    fab.setAttribute("aria-label", "Open play queue");
    fab.innerHTML = `<span class="ytad-queue-fab__label">Queue</span><span class="ytad-queue-fab__badge" data-ytad-fab-count hidden>0</span>`;
    fab.addEventListener("click", () => toggle());
    document.documentElement.appendChild(fab);
    return fab;
  }

  function syncFab(queue = get()) {
    storageGet(["queueEnabled"], ({ queueEnabled }) => {
      const fab = mountFab();
      if (queueEnabled === false) {
        fab.hidden = true;
        return;
      }
      fab.hidden = false;
      const n = queue.items?.length || 0;
      const badge = fab.querySelector("[data-ytad-fab-count]");
      badge.hidden = n === 0;
      badge.textContent = String(n);
    });
  }

  function start() {
    ensure();
    mountFab();
    render();
    syncFab();
    onChange((q) => {
      render(q);
      syncFab(q);
    });
    window.addEventListener("yt-navigate-finish", () => render());
  }

  YTAD.define("queuePanel", { start, render, toggle, setOpen });
})();
