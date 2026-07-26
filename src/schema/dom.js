/**
 * Light + open-shadow DOM helpers (lockup internals often live in shadow roots).
 */
(() => {
  const YTAD = globalThis.YTAD;
  if (!YTAD) return;

  function querySelectorDeep(root, selector) {
    if (!root) return null;
    try {
      const direct = root.querySelector?.(selector);
      if (direct) return direct;
    } catch {
      /* invalid selector */
    }

    const walk = (node) => {
      if (!node) return null;
      if (node.nodeType === 1) {
        try {
          if (node.matches?.(selector)) return node;
        } catch {
          /* ignore */
        }
        if (node.shadowRoot) {
          const hit = querySelectorDeep(node.shadowRoot, selector);
          if (hit) return hit;
        }
        for (const child of node.children || []) {
          const hit = walk(child);
          if (hit) return hit;
        }
      }
      return null;
    };

    return walk(root);
  }

  function querySelectorAllDeep(root, selector) {
    const out = [];
    const seen = new Set();

    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    };

    try {
      root.querySelectorAll?.(selector)?.forEach(add);
    } catch {
      /* ignore */
    }

    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        try {
          if (node.matches?.(selector)) add(node);
        } catch {
          /* ignore */
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.children || []) walk(child);
      }
    };
    walk(root);
    return out;
  }

  /** textContent that includes open shadow roots */
  function deepText(root) {
    if (!root) return "";
    let out = "";
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        out += node.nodeValue || "";
        return;
      }
      if (node.nodeType === 1) {
        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes || []) walk(child);
      }
    };
    walk(root);
    return out;
  }

  YTAD.define("dom", {
    querySelectorDeep,
    querySelectorAllDeep,
    deepText,
  });
})();
