(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD?.keys) return;

  const {
    SANITIZE_INNERTUBE_ENDPOINTS,
    AD_BREAK_PATHS,
    AD_CLICK_HOSTS,
    VIDEO_ID_RE,
  } = YTAD.keys;

  function parseUrl(input) {
    try {
      if (input instanceof URL) return input;
      if (typeof input === "string") return new URL(input, location.href);
      if (input && typeof input.url === "string") return new URL(input.url, location.href);
    } catch {
      /* ignore */
    }
    return null;
  }

  function pathnameOf(input) {
    return parseUrl(input)?.pathname || "";
  }

  function innertubeEndpoint(input) {
    const path = pathnameOf(input);
    const prefix = "/youtubei/v1/";
    if (!path.startsWith(prefix)) return "";
    return path.slice(prefix.length);
  }

  function isAdBreakUrl(input) {
    const path = pathnameOf(input);
    if (!path) {
      const s = String(typeof input === "string" ? input : input?.url || "");
      return AD_BREAK_PATHS.some((p) => s.includes(p));
    }
    return AD_BREAK_PATHS.some((p) => path === p || path.endsWith(p));
  }

  function shouldSanitizeInnertubeUrl(input) {
    const u = parseUrl(input);
    if (!u) {
      const s = String(typeof input === "string" ? input : input?.url || "");
      return (
        SANITIZE_INNERTUBE_ENDPOINTS.some((ep) => s.includes(`/youtubei/v1/${ep}`)) ||
        s.includes("player_response")
      );
    }
    if (u.searchParams.has("player_response")) return true;
    const ep = innertubeEndpoint(u);
    if (!ep) return false;
    return SANITIZE_INNERTUBE_ENDPOINTS.some(
      (allowed) => ep === allowed || ep.startsWith(`${allowed}/`) || ep.startsWith(`${allowed}?`)
    );
  }

  function isAdClickHref(href) {
    const u = parseUrl(href);
    if (!u) return false;
    const host = u.hostname;
    if (AD_CLICK_HOSTS.some((h) => host === h || host.endsWith(`.${h.replace(/^www\./, "")}`))) {
      return true;
    }
    if ((host === "www.youtube.com" || host === "youtube.com") && u.pathname.startsWith("/pagead/")) {
      return true;
    }
    // Click-through often lands on advertiser site via target=_blank + /pc/ or /api/stats
    if (u.pathname.startsWith("/pc/") || u.pathname.includes("/pagead/")) return true;
    return false;
  }

  function extractVideoId(href) {
    const u = parseUrl(href);
    if (!u) return "";
    if (u.pathname === "/watch" || u.pathname.endsWith("/watch")) {
      const v = u.searchParams.get("v") || "";
      return VIDEO_ID_RE.test(v) ? v : "";
    }
    const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (shorts) return shorts[1];
    const embed = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (embed) return embed[1];
    const v = u.searchParams.get("v");
    return v && VIDEO_ID_RE.test(v) ? v : "";
  }

  YTAD.define("urls", {
    parseUrl,
    pathnameOf,
    innertubeEndpoint,
    isAdBreakUrl,
    shouldSanitizeInnertubeUrl,
    isAdClickHref,
    extractVideoId,
  });
})();
