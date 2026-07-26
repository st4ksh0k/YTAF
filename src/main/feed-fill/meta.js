(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.urls || !YTAD?.detect || !YTAD?.similarity || !YTAD?.keys || !YTAD?.selectors) {
    return;
  }

  const { extractVideoId } = YTAD.urls;
  const { isAdRichItemElement, isOrganicRichItemElement } = YTAD.detect;
  const { tokenize } = YTAD.similarity;
  const { VIDEO_ID_RE } = YTAD.keys;
  const RICH = YTAD.selectors.RICH_ITEM;

  function videoMeta(el) {
    const a =
      el.querySelector("a.ytLockupViewModelContentImage") ||
      el.querySelector("a.ytLockupMetadataViewModelTitle") ||
      el.querySelector("a#video-title-link") ||
      el.querySelector('a[href*="/watch"]') ||
      el.querySelector('a[href*="/shorts/"]');
    const href = a?.getAttribute("href") || "";
    const videoId = extractVideoId(href);
    const title =
      el.querySelector("h3.ytLockupMetadataViewModelHeadingReset")?.getAttribute("title") ||
      el.querySelector("a.ytLockupMetadataViewModelTitle")?.textContent ||
      el.querySelector("#video-title")?.textContent ||
      "";
    const channel =
      el.querySelector(".ytContentMetadataViewModelMetadataRow a")?.textContent ||
      el.querySelector("#channel-name a")?.textContent ||
      "";
    const img =
      el.querySelector("yt-thumbnail-view-model img")?.getAttribute("src") ||
      el.querySelector("img.ytCoreImageHost")?.getAttribute("src") ||
      "";
    const lengthText =
      el.querySelector(".ytBadgeShapeText")?.textContent?.trim() ||
      el.querySelector("badge-shape .ytBadgeShapeText")?.textContent?.trim() ||
      "";
    const metaRows = [...el.querySelectorAll(".ytContentMetadataViewModelMetadataRow")];
    const viewsRow = metaRows[1]?.textContent?.trim() || "";
    return {
      el,
      videoId,
      title: title.trim(),
      channel: channel.trim(),
      img,
      lengthText,
      viewsRow,
      tokens: tokenize(`${title} ${channel}`),
    };
  }

  function neighborContext(adItem) {
    const parent = adItem.parentElement;
    if (!parent) return new Set();
    const siblings = [...parent.children].filter((n) => n.tagName === "YTD-RICH-ITEM-RENDERER");
    const idx = siblings.indexOf(adItem);
    const bag = new Set();
    for (let i = idx - 3; i <= idx + 3; i++) {
      if (i < 0 || i === idx || i >= siblings.length) continue;
      const item = siblings[i];
      if (isAdRichItemElement(item) || item.hasAttribute("data-ytad-filled")) continue;
      for (const t of videoMeta(item).tokens) bag.add(t);
    }
    return bag;
  }

  function candidatePool(excludeEl, usedVideoIds) {
    const out = [];
    for (const el of document.querySelectorAll(RICH)) {
      if (el === excludeEl || el.hasAttribute("data-ytad-filled")) continue;
      if (!isOrganicRichItemElement(el)) continue;
      const meta = videoMeta(el);
      if (!meta.videoId || !meta.title) continue;
      if (usedVideoIds.has(meta.videoId)) continue;
      out.push(meta);
    }
    return out;
  }

  function getInnertube() {
    try {
      const key = window.ytcfg?.get?.("INNERTUBE_API_KEY") || window.ytcfg?.data_?.INNERTUBE_API_KEY;
      const context =
        window.ytcfg?.get?.("INNERTUBE_CONTEXT") || window.ytcfg?.data_?.INNERTUBE_CONTEXT;
      if (!key || !context) return null;
      return { key, context };
    } catch {
      return null;
    }
  }

  async function fetchRelatedCandidates(query, usedVideoIds, limit = 10) {
    const cfg = getInnertube();
    if (!cfg || !query) return [];
    try {
      const res = await fetch(`/youtubei/v1/search?prettyPrint=false&key=${cfg.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: cfg.context, query }),
        credentials: "same-origin",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const out = [];
      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents || [];
      for (const section of sections) {
        for (const item of section?.itemSectionRenderer?.contents || []) {
          const v = item.videoRenderer;
          if (!v?.videoId || !VIDEO_ID_RE.test(v.videoId)) continue;
          if (usedVideoIds.has(v.videoId)) continue;
          const title =
            (v.title?.runs || []).map((r) => r.text).join("") || v.title?.simpleText || "";
          const channel =
            v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || "";
          const thumbs = v.thumbnail?.thumbnails || [];
          out.push({
            videoId: v.videoId,
            title,
            channel,
            img: thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            lengthText: v.lengthText?.simpleText || "",
            viewsRow:
              [
                v.shortViewCountText?.simpleText || v.viewCountText?.simpleText,
                v.publishedTimeText?.simpleText,
              ]
                .filter(Boolean)
                .join(" • ") || "",
            tokens: tokenize(`${title} ${channel}`),
            el: null,
          });
          if (out.length >= limit) return out;
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  YTAD.define("feedMeta", {
    videoMeta,
    neighborContext,
    candidatePool,
    fetchRelatedCandidates,
  });
})();
