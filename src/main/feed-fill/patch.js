(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.urls || !YTAD?.selectors || !YTAD?.detect) return;

  const { extractVideoId, isAdClickHref } = YTAD.urls;
  const { FEED_AD_HOSTS, FEED_AD_VIEW_MODELS, AD_BADGE_CLASS, RICH_ITEM } = YTAD.selectors;
  const { isOrganicRichItemElement } = YTAD.detect;

  const AD_CHROME_STRIP = Object.freeze([
    ...FEED_AD_VIEW_MODELS,
    ...FEED_AD_HOSTS,
    "lockup-attachments-view-model",
    "thumbnail-overlay-button-view-model",
  ]);

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function patchLockup(lockupRoot, meta) {
    const watchHref = `/watch?v=${meta.videoId}`;
    const thumb = meta.img || `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`;

    const host = lockupRoot.querySelector(".ytLockupViewModelHost");
    if (host) {
      for (const cls of [...host.classList]) {
        if (cls.startsWith("content-id-")) host.classList.remove(cls);
      }
      host.classList.add(`content-id-${meta.videoId}`);
    }

    for (const a of lockupRoot.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      const isWatchOrShorts =
        !!extractVideoId(href) || href.includes("/watch") || href.includes("/shorts/");
      if (
        isWatchOrShorts ||
        isAdClickHref(href) ||
        a.classList.contains("ytLockupViewModelContentImage") ||
        a.classList.contains("ytLockupMetadataViewModelTitle")
      ) {
        a.setAttribute("href", watchHref);
        a.removeAttribute("target");
        a.removeAttribute("rel");
      }
    }

    for (const img of lockupRoot.querySelectorAll(
      "yt-thumbnail-view-model img, img.ytCoreImageHost"
    )) {
      img.setAttribute("src", thumb);
      img.classList.add("ytCoreImageLoaded");
    }

    const heading = lockupRoot.querySelector("h3.ytLockupMetadataViewModelHeadingReset");
    if (heading) {
      heading.setAttribute("title", meta.title);
      heading.setAttribute("aria-label", meta.title);
    }

    const titleLink = lockupRoot.querySelector("a.ytLockupMetadataViewModelTitle");
    if (titleLink) {
      titleLink.setAttribute("aria-label", meta.title);
      const span = titleLink.querySelector("span") || titleLink;
      span.textContent = meta.title;
    }

    const channelLink = lockupRoot.querySelector(
      ".ytContentMetadataViewModelMetadataRow a.ytAttributedStringLink"
    );
    if (channelLink && meta.channel) {
      const label = channelLink.childNodes[0];
      if (label && label.nodeType === Node.TEXT_NODE) {
        label.textContent = meta.channel;
      } else {
        const s = channelLink.querySelector("span span") || channelLink;
        if (s.childNodes[0]?.nodeType === Node.TEXT_NODE) {
          s.childNodes[0].textContent = meta.channel;
        }
      }
      channelLink.setAttribute(
        "href",
        `/results?search_query=${encodeURIComponent(meta.channel)}`
      );
    }

    if (meta.lengthText) {
      for (const badge of lockupRoot.querySelectorAll(".ytBadgeShapeText")) {
        if (badge.closest(`.${AD_BADGE_CLASS}`)) continue;
        badge.textContent = meta.lengthText;
        break;
      }
    }

    const rows = lockupRoot.querySelectorAll(".ytContentMetadataViewModelMetadataRow");
    if (rows[1] && meta.viewsRow) rows[1].textContent = meta.viewsRow;

    for (const sel of AD_CHROME_STRIP) {
      for (const n of lockupRoot.querySelectorAll(sel)) n.remove();
    }
    for (const n of lockupRoot.querySelectorAll(`.${AD_BADGE_CLASS}`)) n.remove();
    for (const n of lockupRoot.querySelectorAll("yt-thumbnail-overlay-progress-bar-view-model")) {
      n.remove();
    }
  }

  function findOrganicDonor() {
    for (const el of document.querySelectorAll(RICH_ITEM)) {
      if (!isOrganicRichItemElement(el) || el.hasAttribute("data-ytad-filled")) continue;
      if (el.querySelector("#content > yt-lockup-view-model.lockup")) return el;
      if (el.querySelector("ytd-rich-grid-media")) return el;
    }
    return null;
  }

  function fillAdItem(adItem, meta, usedVideoIds) {
    const parent = adItem.parentElement;
    if (!parent) {
      adItem.remove();
      return false;
    }

    const donor = findOrganicDonor();
    let replacement;

    if (donor) {
      replacement = donor.cloneNode(true);
      replacement.removeAttribute("data-ytad-busy");
      replacement.setAttribute("data-ytad-filled", "1");
      replacement.setAttribute("data-ytad-handled", "1");
      replacement.removeAttribute("is-locked");
      for (const attr of [...replacement.attributes]) {
        if (attr.name.startsWith("jscontroller") || attr.name === "jsmodel") {
          replacement.removeAttribute(attr.name);
        }
      }

      const lockup = replacement.querySelector("yt-lockup-view-model");
      if (lockup) patchLockup(lockup, meta);
      else {
        const media = replacement.querySelector("ytd-rich-grid-media");
        if (media) patchLockup(media, meta);
      }
    } else {
      replacement = document.createElement("ytd-rich-item-renderer");
      replacement.className = adItem.className;
      replacement.setAttribute("data-ytad-filled", "1");
      replacement.setAttribute("data-ytad-handled", "1");
      replacement.innerHTML = `
        <div id="content" class="style-scope ytd-rich-item-renderer">
          <div class="ytad-fill-card" style="display:flex;flex-direction:column;gap:10px;">
            <a href="/watch?v=${meta.videoId}" style="display:block;border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:#111;">
              <img src="${meta.img || `https://i.ytimg.com/vi/${meta.videoId}/hqdefault.jpg`}"
                   style="width:100%;height:100%;object-fit:cover;display:block;" alt="" />
            </a>
            <a href="/watch?v=${meta.videoId}" style="color:var(--yt-spec-text-primary,#fff);text-decoration:none;font:500 14px/1.35 Roboto,Arial,sans-serif;">
              ${escapeHtml(meta.title)}
            </a>
            <div style="color:#aaa;font:12px/1.4 Roboto,Arial,sans-serif;">${escapeHtml(meta.channel)}</div>
          </div>
        </div>`;
    }

    parent.insertBefore(replacement, adItem);
    adItem.remove();
    usedVideoIds.add(meta.videoId);
    return true;
  }

  YTAD.define("feedPatch", { patchLockup, fillAdItem, findOrganicDonor });
})();
