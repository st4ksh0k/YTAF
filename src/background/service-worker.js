/**
 * Service worker: storage defaults + popup/runtime message API + segment API proxy.
 * Prefer the bundled dist/service-worker.js in the manifest.
 * This source file stays importScripts-based for direct debugging.
 */
importScripts("../shared/ns.js", "../shared/constants.js");

const { DEFAULTS, RUNTIME } = self.YTAD.constants;

function normalizeQueue(queue) {
  const items = Array.isArray(queue?.items)
    ? queue.items
        .filter((i) => i && typeof i.videoId === "string" && i.videoId.length >= 6)
        .map((i) => ({
          videoId: i.videoId,
          title: String(i.title || i.videoId),
          channel: String(i.channel || ""),
          // Always derive from id so SPA-stale og:image never poisons the queue
          thumb: `https://i.ytimg.com/vi/${i.videoId}/hqdefault.jpg`,
          lengthText: String(i.lengthText || ""),
          addedAt: Number(i.addedAt) || Date.now(),
        }))
    : [];
  let currentIndex = Number.isInteger(queue?.currentIndex) ? queue.currentIndex : -1;
  if (currentIndex >= items.length) currentIndex = items.length - 1;
  if (currentIndex < -1) currentIndex = -1;
  return { items, currentIndex };
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  await chrome.storage.local.set({
    ...DEFAULTS,
    ...existing,
    stats: { ...DEFAULTS.stats, ...(existing.stats || {}) },
    queue: normalizeQueue(existing.queue || DEFAULTS.queue),
  });
});

async function readQueue() {
  const { queue } = await chrome.storage.local.get(["queue"]);
  return normalizeQueue(queue || DEFAULTS.queue);
}

async function writeQueue(queue) {
  const next = normalizeQueue(queue);
  await chrome.storage.local.set({ queue: next });
  return next;
}

async function mutateQueue(message) {
  const action = message.action;
  let queue = await readQueue();
  const items = queue.items.slice();
  let currentIndex = queue.currentIndex;

  if (action === "add" || action === "playNext") {
    const item = message.item;
    if (!item?.videoId) return { ok: false, error: "missing item" };
    const existing = items.findIndex((i) => i.videoId === item.videoId);
    if (existing >= 0) items.splice(existing, 1);
    const row = {
      videoId: item.videoId,
      title: String(item.title || item.videoId),
      channel: String(item.channel || ""),
      thumb: String(item.thumb || ""),
      lengthText: String(item.lengthText || ""),
      addedAt: Date.now(),
    };
    if (action === "playNext") {
      const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
      items.splice(insertAt, 0, row);
      if (currentIndex < 0 && items.length === 1) currentIndex = 0;
    } else {
      items.push(row);
      if (currentIndex < 0 && items.length === 1) currentIndex = 0;
    }
  } else if (action === "remove") {
    const videoId = message.videoId;
    const idx = items.findIndex((i) => i.videoId === videoId);
    if (idx >= 0) {
      items.splice(idx, 1);
      if (idx < currentIndex) currentIndex -= 1;
      else if (idx === currentIndex) currentIndex = Math.min(currentIndex, items.length - 1);
    }
  } else if (action === "clear") {
    items.length = 0;
    currentIndex = -1;
  } else if (action === "reorder") {
    const from = message.fromIndex;
    const to = message.toIndex;
    if (
      Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 0 &&
      to >= 0 &&
      from < items.length &&
      to < items.length &&
      from !== to
    ) {
      const [row] = items.splice(from, 1);
      items.splice(to, 0, row);
      if (currentIndex === from) currentIndex = to;
      else if (from < currentIndex && to >= currentIndex) currentIndex -= 1;
      else if (from > currentIndex && to <= currentIndex) currentIndex += 1;
    }
  } else if (action === "setCurrent") {
    const idx = items.findIndex((i) => i.videoId === message.videoId);
    if (idx >= 0) currentIndex = idx;
  } else if (action === "ensureWatching") {
    const item = message.item;
    if (!item?.videoId) return { ok: false, error: "missing item" };
    let idx = items.findIndex((i) => i.videoId === item.videoId);
    if (idx < 0) {
      items.unshift({
        videoId: item.videoId,
        title: String(item.title || item.videoId),
        channel: String(item.channel || ""),
        thumb: String(item.thumb || ""),
        lengthText: String(item.lengthText || ""),
        addedAt: Date.now(),
      });
      idx = 0;
    }
    currentIndex = idx;
  } else if (action === "advance") {
    const { queueRemovePlayed } = await chrome.storage.local.get(["queueRemovePlayed"]);
    let idx = currentIndex;
    if (message.videoId) {
      const found = items.findIndex((i) => i.videoId === message.videoId);
      if (found >= 0) idx = found;
    }
    const nextId = idx >= 0 ? items[idx + 1]?.videoId : items[0]?.videoId;
    if (queueRemovePlayed !== false && idx >= 0 && idx < items.length) {
      items.splice(idx, 1);
      currentIndex = nextId ? items.findIndex((i) => i.videoId === nextId) : -1;
    } else if (nextId) {
      currentIndex = items.findIndex((i) => i.videoId === nextId);
    }
  } else {
    return { ok: false, error: "unknown action" };
  }

  const next = await writeQueue({ items, currentIndex });
  return { ok: true, queue: next };
}

async function fetchSponsorSegments(message) {
  const server = String(message.serverAddress || DEFAULTS.sponsorServerAddress).replace(
    /\/$/,
    ""
  );
  const prefix = message.prefix;
  const videoID = message.videoID;
  const categories = message.categories || [];
  const actionTypes = message.actionTypes || ["skip", "mute"];

  if (!prefix || !videoID) {
    return { ok: false, error: "missing videoID/prefix" };
  }

  const params = new URLSearchParams();
  params.set("categories", JSON.stringify(categories));
  params.set("actionTypes", JSON.stringify(actionTypes));

  const url = `${server}/api/skipSegments/${prefix}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-CLIENT-NAME": "YTAF",
      },
      credentials: "omit",
      cache: "no-cache",
    });

    if (res.status === 404) {
      return { ok: true, status: 404, segments: [] };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `http ${res.status}` };
    }

    const data = await res.json();
    let segments = [];

    if (Array.isArray(data)) {
      if (data.length && Array.isArray(data[0]?.segments)) {
        const match = data.find((row) => row.videoID === videoID);
        segments = Array.isArray(match?.segments) ? match.segments : [];
      } else if (data.length && Array.isArray(data[0]?.segment)) {
        segments = data;
      }
    }

    // Fallback: direct videoID query
    if (!segments.length) {
      const directParams = new URLSearchParams();
      directParams.set("videoID", videoID);
      directParams.set("categories", JSON.stringify(categories));
      directParams.set("actionTypes", JSON.stringify(actionTypes));
      const directUrl = `${server}/api/skipSegments?${directParams.toString()}`;
      const directRes = await fetch(directUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-CLIENT-NAME": "YTAF",
        },
        credentials: "omit",
        cache: "no-cache",
      });
      if (directRes.ok) {
        const directData = await directRes.json();
        if (Array.isArray(directData)) segments = directData;
      } else if (directRes.status === 404) {
        segments = [];
      }
    }

    console.info(
      "[ytad:segments] proxy",
      videoID,
      "prefix",
      prefix,
      "→",
      segments.length,
      "segments"
    );
    return { ok: true, status: res.status, segments };
  } catch (err) {
    console.warn("[ytad:segments] proxy fetch failed", err);
    return { ok: false, error: String(err?.message || err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === RUNTIME.STAT) {
    chrome.storage.local.get(["stats"]).then(({ stats }) => {
      const next = { ...(stats || DEFAULTS.stats) };
      if (message.key in next) next[message.key] += 1;
      chrome.storage.local.set({ stats: next });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === RUNTIME.GET_STATUS) {
    chrome.storage.local.get(null).then((data) => sendResponse({ ...DEFAULTS, ...data }));
    return true;
  }

  if (message?.type === RUNTIME.SET_ENABLED) {
    chrome.storage.local.set({ enabled: !!message.enabled }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === RUNTIME.FETCH_SPONSOR_SEGMENTS) {
    fetchSponsorSegments(message).then(sendResponse);
    return true;
  }

  if (message?.type === RUNTIME.QUEUE_GET) {
    readQueue().then((queue) => sendResponse({ ok: true, queue }));
    return true;
  }

  if (message?.type === RUNTIME.QUEUE_SET) {
    writeQueue(message.queue).then((queue) => sendResponse({ ok: true, queue }));
    return true;
  }

  if (message?.type === RUNTIME.QUEUE_MUTATE) {
    mutateQueue(message).then(sendResponse);
    return true;
  }

  return false;
});
