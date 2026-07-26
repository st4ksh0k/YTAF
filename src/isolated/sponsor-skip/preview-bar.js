/**
 * Progress-bar segment overlay for in-video promo markers.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD || YTAD.sponsorPreviewBar) return;

  const CATEGORY_LABELS = Object.freeze({
    sponsor: "Sponsor",
    selfpromo: "Self promo",
    exclusive_access: "Exclusive access",
    interaction: "Interaction",
    intro: "Intro",
    outro: "Outro",
    preview: "Preview",
    hook: "Hook",
    filler: "Tangent",
    music_offtopic: "Non-music",
    poi_highlight: "Highlight",
    chapter: "Chapter",
  });

  const ATTACH_SELECTORS = [
    ".ytp-progress-bar",
    ".YtPlayerProgressBarProgressBar",
    ".ytp-progress-bar-container > .html5-progress-bar > .ytp-progress-list",
  ];

  function findAttachEl() {
    for (const sel of ATTACH_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el && el.offsetWidth > 0) return el;
      }
    }
    return document.querySelector(ATTACH_SELECTORS[0]);
  }

  function ensureContainer(parent) {
    let ul = parent.querySelector(":scope > #ytad-previewbar");
    if (ul) return ul;
    ul = document.createElement("ul");
    ul.id = "ytad-previewbar";
    ul.className = "ytad-previewbar";
    parent.classList.add("ytad-has-previewbar");
    parent.appendChild(ul);
    return ul;
  }

  function clear() {
    for (const ul of document.querySelectorAll("#ytad-previewbar, #previewbar")) {
      ul.replaceChildren();
      ul.parentElement?.classList.remove("ytad-has-previewbar");
      if (ul.id === "previewbar") ul.remove();
    }
  }

  /**
   * @param {Array<{start:number,end:number,category:string,actionType:string}>} segments
   * @param {number} videoDuration
   */
  function set(segments, videoDuration) {
    const parent = findAttachEl();
    if (!parent || !videoDuration || videoDuration <= 0) {
      clear();
      return;
    }

    const ul = ensureContainer(parent);
    ul.replaceChildren();
    parent.classList.add("ytad-has-previewbar");

    const usable = [...(segments || [])].filter(
      (s) => s.actionType === "skip" || s.actionType === "mute" || s.actionType === "poi"
    );

    if (!usable.length) {
      clear();
      return;
    }

    usable.sort((a, b) => b.end - b.start - (a.end - a.start));

    let i = 0;
    for (const seg of usable) {
      const start = Math.max(0, Math.min(videoDuration, seg.start));
      const end = Math.max(start, Math.min(videoDuration, seg.end));
      if (end <= start) continue;

      const leftPct = (start / videoDuration) * 100;
      const widthPct = ((end - start) / videoDuration) * 100;
      const category = seg.category || "sponsor";
      const label = CATEGORY_LABELS[category] || category;

      const li = document.createElement("li");
      li.className = "ytad-seg";
      li.dataset.category = category;
      li.dataset.action = seg.actionType || "skip";
      li.setAttribute("aria-label", label);
      li.title = label;
      li.style.setProperty("--ytad-left", `${leftPct}%`);
      li.style.setProperty("--ytad-width", `${Math.max(widthPct, 0.35)}%`);
      li.style.setProperty("--ytad-delay", `${Math.min(i * 28, 280)}ms`);

      const fill = document.createElement("span");
      fill.className = "ytad-seg-fill";
      fill.setAttribute("aria-hidden", "true");

      const sheen = document.createElement("span");
      sheen.className = "ytad-seg-sheen";
      sheen.setAttribute("aria-hidden", "true");

      const tip = document.createElement("span");
      tip.className = "ytad-seg-tip";
      tip.textContent = label;

      li.append(fill, sheen, tip);
      ul.appendChild(li);
      i += 1;
    }
  }

  /**
   * Highlight the segment under the playhead.
   * @param {number} currentTime
   * @param {number} videoDuration
   */
  function setActiveTime(currentTime, videoDuration) {
    if (!videoDuration) return;
    const pct = (currentTime / videoDuration) * 100;
    for (const li of document.querySelectorAll("#ytad-previewbar .ytad-seg")) {
      const left = parseFloat(li.style.getPropertyValue("--ytad-left")) || 0;
      const width = parseFloat(li.style.getPropertyValue("--ytad-width")) || 0;
      const on = pct >= left && pct < left + width;
      li.classList.toggle("ytad-seg-active", on);
    }
  }

  YTAD.define("sponsorPreviewBar", { set, clear, setActiveTime, CATEGORY_LABELS });
})();
