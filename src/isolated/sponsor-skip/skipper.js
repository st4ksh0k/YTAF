/**
 * In-video sponsor skipper: fetch crowdsourced segments, schedule skips,
 * and paint markers on the player progress bar.
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (
    !YTAD?.sponsorApi ||
    !YTAD?.messaging ||
    !YTAD?.sponsorNotice ||
    !YTAD?.sponsorPreviewBar ||
    YTAD.sponsorSkipper
  ) {
    return;
  }

  const { fetchSkipSegments, AUTO_SKIP_CATEGORIES } = YTAD.sponsorApi;
  const { storageGet, sendRuntimeStat, onStorageChanged, extAlive } = YTAD.messaging;
  const notice = YTAD.sponsorNotice;
  const previewBar = YTAD.sponsorPreviewBar;

  const SKIP_BUFFER = 0.003;
  const SCHEDULE_OFFSET_MS = 150;

  const CATEGORY_LABELS = {
    sponsor: "Sponsor",
    selfpromo: "Self promotion",
    interaction: "Interaction reminder",
    intro: "Intro",
    outro: "Outro",
    preview: "Preview",
    hook: "Hook",
    filler: "Tangent",
    music_offtopic: "Non-music",
    exclusive_access: "Exclusive access",
    poi_highlight: "Highlight",
  };

  function log(...args) {
    console.info("[ytad:segments]", ...args);
  }

  function parseVideoId(href = location.href) {
    try {
      const u = new URL(href);
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
      if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    } catch {
      /* ignore */
    }
    return null;
  }

  function getMainVideo() {
    const list = [
      ...document.querySelectorAll("video.html5-main-video"),
      ...document.querySelectorAll("#movie_player video"),
      ...document.querySelectorAll("ytd-player video"),
      ...document.querySelectorAll("video"),
    ];
    let best = null;
    let bestArea = -1;
    for (const v of list) {
      if (!v) continue;
      const area = (v.clientWidth || 0) * (v.clientHeight || 0);
      const dur = v.duration;
      const score = area + (Number.isFinite(dur) && dur > 0 ? 1e6 : 0);
      if (score > bestArea) {
        best = v;
        bestArea = score;
      }
    }
    return best;
  }

  function isAdPlaying() {
    const player = document.getElementById("movie_player");
    return !!(
      player &&
      (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))
    );
  }

  function getCurrentTime(video) {
    return video?.currentTime ?? 0;
  }

  function getVideoDuration(video) {
    const d = video?.duration;
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  function setCurrentTime(video, t) {
    if (!video) return;
    try {
      // Chromium seek-precision workaround
      if (!video.muted) {
        video.muted = true;
        video.muted = false;
      }
    } catch {
      /* ignore */
    }
    try {
      video.currentTime = t;
    } catch {
      /* ignore */
    }
    // Also try page player API when exposed to this world
    try {
      const player = document.getElementById("movie_player");
      if (player && typeof player.seekTo === "function") {
        player.seekTo(t, true);
      }
    } catch {
      /* isolated world often cannot call page JS APIs */
    }
  }

  function normalizeSegments(raw, autoCategories) {
    const auto = new Set(autoCategories);
    const out = [];
    for (const seg of raw || []) {
      if (!seg || !Array.isArray(seg.segment) || seg.segment.length < 2) continue;
      const start = Number(seg.segment[0]);
      const end = Number(seg.segment[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const actionType = seg.actionType || "skip";
      const category = seg.category || "sponsor";
      // Full-video labels
      if (actionType === "full" || end - start > 1e6) continue;
      out.push({
        start,
        end,
        category,
        actionType,
        UUID: seg.UUID,
        autoSkip: auto.has(category) && (actionType === "skip" || actionType === "mute"),
      });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }

  function nextSkip(segments, currentTime) {
    let best = null;
    for (const seg of segments) {
      if (!seg.autoSkip) continue;
      if (seg.actionType !== "skip" && seg.actionType !== "mute") continue;
      // Already past this segment
      if (currentTime >= seg.end - SKIP_BUFFER) continue;
      // Currently inside or approaching
      if (currentTime < seg.end) {
        if (!best || seg.start < best.start) best = seg;
      }
    }
    return best;
  }

  YTAD.define("sponsorSkipper", {
    start() {
      let enabled = true;
      let skipSponsors = true;
      let autoCategories = [...AUTO_SKIP_CATEGORIES];
      let serverAddress;
      let videoID = null;
      let segments = [];
      let loadedFor = null; // last videoID we finished fetching (even if empty)
      let fetchGen = 0;
      let scheduleTimer = 0;
      let nearInterval = 0;
      let urlPoll = 0;
      let mutedByUs = false;
      let savedMuted = false;
      let lastSkipUUID = "";
      let paintedDuration = 0;

      function readConfig() {
        return new Promise((resolve) => {
          storageGet(
            ["enabled", "skipSponsors", "sponsorCategories", "sponsorServerAddress"],
            (data) => {
              enabled = data.enabled !== false;
              skipSponsors = data.skipSponsors !== false;
              if (Array.isArray(data.sponsorCategories) && data.sponsorCategories.length) {
                autoCategories = data.sponsorCategories;
              } else {
                autoCategories = [...AUTO_SKIP_CATEGORIES];
              }
              serverAddress = data.sponsorServerAddress || undefined;
              resolve();
            }
          );
        });
      }

      function cancelSchedule() {
        if (scheduleTimer) {
          clearTimeout(scheduleTimer);
          scheduleTimer = 0;
        }
        if (nearInterval) {
          clearInterval(nearInterval);
          nearInterval = 0;
        }
      }

      function restoreMute(video) {
        if (!mutedByUs) return;
        if (video) video.muted = savedMuted;
        mutedByUs = false;
      }

      function refreshPreview(video, { force = false } = {}) {
        const dur = getVideoDuration(video);
        if (!dur || !segments.length) {
          paintedDuration = 0;
          previewBar.clear();
          return;
        }
        // Avoid re-stamping chips (restarts entrance animation) unless duration jumped
        if (!force && Math.abs(dur - paintedDuration) < 0.5 && paintedDuration > 0) {
          previewBar.setActiveTime?.(getCurrentTime(video), dur);
          return;
        }
        paintedDuration = dur;
        previewBar.set(segments, dur);
        previewBar.setActiveTime?.(getCurrentTime(video), dur);
      }

      function updateActiveChip(video) {
        const dur = getVideoDuration(video);
        if (!dur || !segments.length) return;
        previewBar.setActiveTime?.(getCurrentTime(video), dur);
      }

      async function loadForVideo(id) {
        const gen = ++fetchGen;
        segments = [];
        loadedFor = null;
        lastSkipUUID = "";
        paintedDuration = 0;
        previewBar.clear();
        cancelSchedule();

        if (!id || !enabled || !skipSponsors) {
          log("skip load", { id, enabled, skipSponsors });
          loadedFor = id;
          return;
        }

        try {
          log("fetching segments", id);
          const result = await fetchSkipSegments(id, { serverAddress });
          if (gen !== fetchGen || videoID !== id) return;

          segments = normalizeSegments(result.segments, autoCategories);
          loadedFor = id;
          log(
            "loaded",
            segments.length,
            "segments (auto-skip",
            segments.filter((s) => s.autoSkip).length + ")",
            "prefix",
            result.prefix,
            "status",
            result.status
          );

          const video = getMainVideo();
          refreshPreview(video, { force: true });
          startSchedule();
        } catch (err) {
          console.warn("[ytad:segments] fetch failed", err);
          segments = [];
          loadedFor = id;
        }
      }

      async function onNavigation() {
        const id = parseVideoId();
        if (id === videoID && loadedFor === id) {
          if (segments.length) refreshPreview(getMainVideo());
          return;
        }

        videoID = id;
        await readConfig();
        await loadForVideo(id);
      }

      function skipToTime(video, seg) {
        const key = seg.UUID || `${seg.start}:${seg.end}`;
        if (key === lastSkipUUID) return;
        lastSkipUUID = key;

        if (seg.actionType === "mute") {
          if (!mutedByUs) {
            savedMuted = video.muted;
            mutedByUs = true;
          }
          video.muted = true;
          notice.show(`${CATEGORY_LABELS[seg.category] || seg.category} muted`);
          sendRuntimeStat("skippedSponsors");
          log("muted", seg);
          return;
        }

        const duration = getVideoDuration(video);
        let target = seg.end;
        if (duration > 1 && target >= duration) {
          target = Math.max(0, duration - 0.001);
        }

        setCurrentTime(video, target);
        notice.show(`${CATEGORY_LABELS[seg.category] || seg.category} skipped`);
        sendRuntimeStat("skippedSponsors");
        log("skipped", seg.category, seg.start, "→", target);
      }

      function startSchedule(fromTime) {
        cancelSchedule();
        if (!extAlive() || !enabled || !skipSponsors || !videoID) return;
        if (isAdPlaying()) {
          scheduleTimer = setTimeout(() => startSchedule(), 400);
          return;
        }

        const video = getMainVideo();
        if (!video) {
          scheduleTimer = setTimeout(() => startSchedule(), 400);
          return;
        }

        // Allow skip at t=0 even if paused (autoplay blocked); otherwise require playing
        const t0 = fromTime ?? getCurrentTime(video);
        if (video.paused && t0 !== 0) {
          return;
        }

        const duration = getVideoDuration(video);
        if (duration > 1 && t0 >= duration - 0.01) return;

        // Unmute when leaving mute segments
        if (mutedByUs) {
          const inMute = segments.some(
            (s) => s.actionType === "mute" && s.autoSkip && t0 >= s.start - SKIP_BUFFER && t0 < s.end
          );
          if (!inMute) restoreMute(video);
        }

        updateActiveChip(video);

        const seg = nextSkip(segments, t0);
        if (!seg) return;

        const scheduledStart = Math.max(seg.start, t0);
        const timeUntil = scheduledStart - t0;
        const rate = video.playbackRate || 1;

        const doSkip = (forceTime) => {
          if (!extAlive() || videoID !== parseVideoId()) return;
          if (isAdPlaying()) {
            startSchedule();
            return;
          }
          const v = getMainVideo() || video;
          const now = forceTime ?? Math.max(getCurrentTime(v), t0);
          if (now >= seg.start - SKIP_BUFFER && now < seg.end) {
            skipToTime(v, seg);
            // Reschedule from end (intersecting)
            startSchedule(seg.actionType === "mute" ? seg.start + 0.001 : seg.end);
          } else {
            startSchedule(now + 0.001);
          }
        };

        if (timeUntil < SKIP_BUFFER) {
          doSkip(t0);
          return;
        }

        let delayMs = (timeUntil * 1000) / rate;

        if (delayMs < 300 && seg.autoSkip) {
          const startWall = performance.now();
          const startVideoTime = Math.max(t0, getCurrentTime(video));
          delayMs = ((seg.start - startVideoTime) * 1000) / rate;

          nearInterval = setInterval(() => {
            const elapsed = performance.now() - startWall;
            const v = getMainVideo() || video;
            const approx = startVideoTime + (rate * elapsed) / 1000;
            if (elapsed + SKIP_BUFFER * 1000 >= delayMs || getCurrentTime(v) + SKIP_BUFFER >= seg.start) {
              clearInterval(nearInterval);
              nearInterval = 0;
              doSkip(Math.max(getCurrentTime(v), approx));
            }
          }, 0);
        } else {
          const offsetDelay = Math.max(0, delayMs - SCHEDULE_OFFSET_MS);
          scheduleTimer = setTimeout(() => doSkip(), offsetDelay);
        }
      }

      function onPlay() {
        startSchedule();
      }

      function onSeeked() {
        lastSkipUUID = "";
        startSchedule();
      }

      function onRateChange() {
        startSchedule();
      }

      function bindVideoEvents() {
        const video = getMainVideo();
        if (!video || video.dataset.ytadSbBound === "1") return video;
        video.dataset.ytadSbBound = "1";
        video.addEventListener("play", onPlay);
        video.addEventListener("playing", onPlay);
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("ratechange", onRateChange);
        video.addEventListener("durationchange", () => refreshPreview(video, { force: true }));
        video.addEventListener("timeupdate", () => {
          updateActiveChip(video);
          // Lightweight re-arm if schedule was cancelled while paused
          if (!scheduleTimer && !nearInterval && !video.paused) startSchedule();
        });
        return video;
      }

      // Boot
      readConfig().then(() => onNavigation());

      urlPoll = setInterval(() => {
        if (!extAlive()) return;
        bindVideoEvents();
        const id = parseVideoId();
        if (id !== videoID) onNavigation();
        else if (segments.length) {
          // Re-attach if YouTube rebuilt the progress bar DOM
          const parent = document.querySelector(".ytp-progress-bar.ytad-has-previewbar, .ytp-progress-bar");
          if (parent && !parent.querySelector("#ytad-previewbar")) {
            refreshPreview(getMainVideo(), { force: true });
          }
        }
      }, 500);

      document.addEventListener("yt-navigate-finish", () => onNavigation(), true);
      window.addEventListener("yt-navigate-finish", () => onNavigation(), true);
      window.addEventListener("popstate", () => onNavigation());

      onStorageChanged((changes, area) => {
        if (area !== "local") return;
        if (
          changes.enabled ||
          changes.skipSponsors ||
          changes.sponsorCategories ||
          changes.sponsorServerAddress
        ) {
          videoID = null;
          loadedFor = null;
          onNavigation();
        }
      });

      log("skipper installed");

      return () => {
        cancelSchedule();
        clearInterval(urlPoll);
        previewBar.clear();
      };
    },
  });
})();
