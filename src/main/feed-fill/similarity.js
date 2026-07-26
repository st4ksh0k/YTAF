(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  function tokenize(text) {
    return new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  }

  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    return inter / (a.size + b.size - inter);
  }

  function pickBest(contextTokens, pool) {
    let best = null;
    let bestScore = -1;
    for (const c of pool) {
      let score = jaccard(contextTokens, c.tokens) + Math.random() * 0.03;
      if (c.channel) {
        for (const t of tokenize(c.channel)) if (contextTokens.has(t)) score += 0.1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  YTAD.define("similarity", { tokenize, jaccard, pickBest });
})();
