// ui-layout-measure.mjs — layout forensics for the runtime UI matrix.
//
// The grammar matrix measures type, budget and reachability. It cannot see geometry: text drawn
// on top of text, a tooltip rendered UNDER the card that raised it, a button a player cannot
// click because a transparent box eats the hit. Those are the defects players report and string
// checks never find.
//
// Two things live here:
//   1. `layoutProbe` — a SELF-CONTAINED, READ-ONLY browser function (no closures, no imports)
//      that observes one open surface's geometry. `elementFromPoint` IS the player's eye: what
//      hit-tests on top is what is drawn on top.
//   2. `hoverBegin` / `hoverDiff` — the two halves of the hover pass. `page.mouse.move` produces
//      a REAL :hover; between the calls a window-side seen-set remembers what was already on
//      screen so only elements the hover revealed are judged.
//   3. Pure helpers (`rectOverlap`, `dedupeFindings`, `summarizeFindings`) so the test file can
//      prove the classification logic without a browser.
//
// Findings vocabulary (each names the player-visible failure):
//   text-occluded     a text node whose sampled points are covered by a painted element
//   control-occluded  an interactive element whose centre is covered (unclickable / unreadable)
//   text-clipped      text wider/taller than its own non-scrolling box
//   text-overlap      two text-bearing elements occupying the same pixels, neither containing
//                     the other — the "overlapping text" report, measured not inferred
//   hover-buried      a hover revealed element that is not topmost at its own centre —
//                     the "tooltip under the box" report
//   hover-offscreen   a hover revealed element drawn outside the viewport

// ---------------------------------------------------------------------------------------------
// Pure geometry/classification helpers (importable for tests)
// ---------------------------------------------------------------------------------------------

export function rectOverlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (w > 0 && h > 0) ? w * h : 0;
}

/** Fold identical findings (same rule + victim + occluder) and cap each rule's list. */
export function dedupeFindings(findings, perRuleCap = 12) {
  const seen = new Set();
  const counts = {};
  const out = [];
  for (const finding of findings) {
    const key = `${finding.rule}|${finding.victim}|${finding.occluder || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[finding.rule] = (counts[finding.rule] || 0) + 1;
    if (counts[finding.rule] <= perRuleCap) out.push(finding);
  }
  return out;
}

/** One-line-per-rule counts for the report header. */
export function summarizeFindings(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] || 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------------------------
// The browser probe. SELF-CONTAINED and READ-ONLY — no imports, no closures, no game calls.
// ---------------------------------------------------------------------------------------------

/**
 * Geometry audit of one open surface. `arg` is { selectors, surfaceId }.
 * Returns raw findings; judgement (dedupe, caps) happens in `dedupeFindings`.
 */
export function layoutProbe(arg) {
  const selectors = (arg && arg.selectors) || [];
  const out = {
    surfaceId: (arg && arg.surfaceId) || null,
    rootSelector: null,
    found: false,
    findings: [],
    nodesSeen: 0,
    textNodesSeen: 0,
    controlsSeen: 0,
    error: null,
  };

  const styleCache = new Map();
  function styleOf(node) {
    let cached = styleCache.get(node);
    if (!cached) { cached = getComputedStyle(node); styleCache.set(node, cached); }
    return cached;
  }
  const hiddenCache = new Map();
  function hiddenSelfOrAncestor(node) {
    const memo = hiddenCache.get(node);
    if (memo !== undefined) return memo;
    let cur = node;
    while (cur && cur.nodeType === 1) {
      const style = styleOf(cur);
      if (cur.hidden
        || (cur.getAttribute && cur.getAttribute('aria-hidden') === 'true')
        || style.display === 'none'
        || style.visibility === 'hidden'
        || parseFloat(style.opacity || '1') <= 0.01) {
        hiddenCache.set(node, true);
        return true;
      }
      if (cur === document.body) break;
      cur = cur.parentElement;
    }
    hiddenCache.set(node, false);
    return false;
  }
  function visible(node) {
    if (!node || !node.getBoundingClientRect) return false;
    if (hiddenSelfOrAncestor(node)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function cssPath(node) {
    if (!node) return '(none)';
    const parts = [];
    let cur = node;
    for (let depth = 0; cur && cur.nodeType === 1 && depth < 4; depth += 1) {
      let part = cur.tagName ? cur.tagName.toLowerCase() : '?';
      if (cur.id) { part += '#' + cur.id; parts.unshift(part); break; }
      const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\s+/)[0] : '';
      if (cls) part += '.' + cls;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function ownText(node) {
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += child.nodeValue;
    }
    return text.replace(/\s+/g, ' ').trim();
  }
  // Glyph-level truth: Range.getClientRects on each direct text child gives the boxes the
  // letters actually paint. A full-width h1 whose glyphs sit in the first 150 px is measured
  // by those 150 px, not the block's border box — box-vs-box overlap is not visible overlap.
  // The Range rect is the line box, though: adjacent lines' boxes legitimately kiss by a few px
  // (descender allowance) without ink touching. measureText's actualBoundingBox* gives the tight
  // ink extents, so each line box is tightened to the rows the glyphs really paint.
  let inkMeasureCtx = null;
  function ownTextRects(node) {
    const rects = [];
    const range = document.createRange();
    const style = styleOf(node);
    for (const child of node.childNodes) {
      if (child.nodeType !== 3 || !child.nodeValue || !child.nodeValue.trim()) continue;
      range.selectNodeContents(child);
      const list = range.getClientRects();
      let ink = null;
      try {
        if (!inkMeasureCtx) inkMeasureCtx = document.createElement('canvas').getContext('2d');
        inkMeasureCtx.font = style.font;
        const m = inkMeasureCtx.measureText(child.nodeValue);
        const asc = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent;
        const desc = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : m.actualBoundingBoxDescent;
        const inkAsc = m.actualBoundingBoxAscent;
        const inkDesc = m.actualBoundingBoxDescent;
        if ([asc, desc, inkAsc, inkDesc].every(Number.isFinite)) ink = { asc, desc, inkAsc, inkDesc };
      } catch (_) { ink = null; }
      for (let i = 0; i < list.length; i += 1) {
        const r = list[i];
        if (!(r.width > 0 && r.height > 0)) continue;
        let top = r.top;
        let bottom = r.bottom;
        if (ink) {
          // The baseline sits at the half-leading position inside the line box; ink extends
          // actualBoundingBox above and below it — the painted rows, not the CSS rows.
          const baseline = r.top + (r.height + ink.asc - ink.desc) / 2;
          top = Math.max(r.top, baseline - ink.inkAsc);
          bottom = Math.min(r.bottom, baseline + ink.inkDesc);
        }
        if (bottom > top) rects.push({ left: r.left, top, right: r.right, bottom });
      }
    }
    range.detach();
    return rects;
  }
  function unionRects(rects) {
    let u = null;
    for (const r of rects) {
      u = u
        ? { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return u;
  }
  function isAncestor(a, b) {
    for (let cur = b; cur; cur = cur.parentElement) { if (cur === a) return true; }
    return false;
  }
  // A hit-test winner is only a VISUAL occluder if the player can see something there. A fully
  // transparent div still eats clicks (control-occluded) but cannot hide text (text-occluded).
  function paintsPixels(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName;
    if (tag === 'CANVAS' || tag === 'IMG' || tag === 'SVG' || tag === 'VIDEO') return true;
    const style = styleOf(node);
    const bg = style.backgroundColor || '';
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return true;
    if (style.backgroundImage && style.backgroundImage !== 'none') return true;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(style['border' + side + 'Width'] || '0');
      const c = style['border' + side + 'Color'] || '';
      if (w > 0 && c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') return true;
    }
    if (ownText(node)) return true;
    return false;
  }
  function topAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el || null;
  }
  // `#ui-root` is pointer-events:none, so most HUD text never hit-tests at all — elementFromPoint
  // would report the GL canvas "covering" every HUD label. To measure PAINT order for a
  // pointer-transparent victim, elevate it for the duration of one synchronous hit-test. The
  // style is restored before the call returns: no paint happens mid-evaluate, nothing observes
  // the mutation, and a synchronous layout read is all elementFromPoint ever triggers.
  // A pe:none ANCESTOR makes the whole subtree hit-test transparent too, so the whole chain
  // from the node up must be elevated, not just the leaf.
  function elevatePointerTransparent(node) {
    const restore = [];
    for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
      if (getComputedStyle(el).pointerEvents === 'none') {
        restore.push([el, el.style.pointerEvents]);
        el.style.pointerEvents = 'auto';
      }
    }
    return () => { for (const [el, pe] of restore) el.style.pointerEvents = pe; };
  }
  function topAbove(node, x, y) {
    const restore = elevatePointerTransparent(node);
    let stack;
    try {
      stack = document.elementsFromPoint(x, y);
    } finally {
      restore();
    }
    if (!stack || !stack.length) return null;
    const idx = stack.indexOf(node);
    if (idx === -1) return null;
    for (let i = 0; i < idx; i += 1) {
      if (paintsPixels(stack[i])) return stack[i];
    }
    return null;
  }
  function covers(topEl, node) {
    // topEl occludes node when it is neither the node itself nor painted by it (descendant).
    if (!topEl) return false;
    if (topEl === node) return false;
    if (isAncestor(node, topEl)) return false;
    // .sf-fx-morph__v copies are authored absolutely-stacked cross-fade clones — a sibling copy
    // above the victim for ~180ms is the effect working, not an occlusion.
    if (topEl.parentElement === node.parentElement
      && node.classList && node.classList.contains('sf-fx-morph__v')
      && topEl.classList && topEl.classList.contains('sf-fx-morph__v')) return false;
    return true;
  }
  function samplePoints(rect) {
    // Centre plus four interior points at the quarter marks — cheap and covers most coverers.
    // Accepts edge-based rects ({left,top,right,bottom}); width/height are derived.
    const w = rect.right != null ? rect.right - rect.left : rect.width;
    const h = rect.bottom != null ? rect.bottom - rect.top : rect.height;
    const ix = rect.left + 2;
    const iw = Math.max(0, w - 4);
    const iy = rect.top + 2;
    const ih = Math.max(0, h - 4);
    return [
      [ix + iw / 2, iy + ih / 2],
      [ix + iw * 0.25, iy + ih * 0.25],
      [ix + iw * 0.75, iy + ih * 0.25],
      [ix + iw * 0.25, iy + ih * 0.75],
      [ix + iw * 0.75, iy + ih * 0.75],
    ];
  }

  function rectOut(rect) {
    if (!rect) return null;
    const w = rect.width != null ? rect.width : rect.right - rect.left;
    const h = rect.height != null ? rect.height : rect.bottom - rect.top;
    return { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(w), h: Math.round(h) };
  }
  function intersectRects(a, b) {
    if (!a) return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return { left, top, right: Math.max(right, left), bottom: Math.max(bottom, top) };
  }
  function rectArea(r) {
    return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  }
  // getBoundingClientRect ignores ancestor clipping: a row 400 px below a scrollport still
  // reports a rect down there. Paint happens only inside every clipping ancestor's box, so the
  // PAINT rect is rect ∩ clip chain — and a scrollable ancestor means clipped-away content is
  // reachable by scrolling, which is a layout choice, not a defect.
  const clipCache = new Map();
  function clipChainFor(node) {
    const memo = clipCache.get(node);
    if (memo) return memo;
    let clip = null;
    let scrollable = false;
    let cur = node.parentElement;
    while (cur && cur !== document.documentElement) {
      const s = styleOf(cur);
      const ox = s.overflowX || 'visible';
      const oy = s.overflowY || 'visible';
      const clips = ox !== 'visible' || oy !== 'visible'
        || (s.contain || '').indexOf('paint') >= 0;
      if (clips) {
        const r = cur.getBoundingClientRect();
        clip = intersectRects(clip, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        if (ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') scrollable = true;
      }
      cur = cur.parentElement;
    }
    const result = { clip, scrollable };
    clipCache.set(node, result);
    return result;
  }
  function paintRectFor(node, rect) {
    const chain = clipChainFor(node);
    const paint = intersectRects(chain.clip, rect);
    return { paint, scrollable: chain.scrollable };
  }

  let root = null;
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && visible(node)) { root = node; out.rootSelector = selector; break; }
  }
  if (!root) {
    out.error = 'no visible root matched ' + JSON.stringify(selectors);
    return out;
  }
  out.found = true;

  const all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const textNodes = [];
  const controlSel = 'button, a[href], input, select, textarea, [role="button"], [role="link"],'
    + ' [role="tab"], [tabindex]:not([tabindex="-1"])';

  for (const node of all) {
    if (!visible(node)) continue;
    out.nodesSeen += 1;
    const rect = node.getBoundingClientRect();
    const style = styleOf(node);
    const text = ownText(node);
    const { paint, scrollable } = paintRectFor(node, rect);

    // Dead content: clipped away entirely (or drawn fully offscreen) with no scrollable ancestor
    // — the player can never reach it. Scroll-clipped content is a layout choice, not a defect.
    // 1 px boxes and .sr-only carriers are the screen-reader pattern — hidden on purpose.
    const srCarrier = (rect.width <= 1 && rect.height <= 1)
      || (typeof node.className === 'string' && /\b(sr-only|visually-hidden|screen-reader)\b/.test(node.className));
    const paintVisible = rectArea(paint) >= 1
      && paint.right >= 0 && paint.bottom >= 0 && paint.left <= viewport.w && paint.top <= viewport.h;
    if (!paintVisible) {
      if (!scrollable && !srCarrier) {
        out.findings.push({
          rule: 'off-viewport',
          victim: cssPath(node) + (text ? ` "${text.slice(0, 40)}"` : ''),
          detail: `rect ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} painted nowhere in ${viewport.w}x${viewport.h}`,
          victimRect: rectOut(rect),
        });
      }
      continue;
    }

    if (text) {
      out.textNodesSeen += 1;
      // The node's own box clips its text when it clips overflow: Range.getClientRects returns
      // the text's full LAYOUT extent, so an ellipsized name otherwise reports ink under the
      // column to its right that never actually paints past the cell edge.
      let clip = clipChainFor(node).clip;
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        clip = intersectRects(clip, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
      }
      let glyphRects = ownTextRects(node)
        .map((r) => intersectRects(clip, r))
        .filter((r) => r && rectArea(r) >= 1);
      if (!glyphRects.length) glyphRects = [paint];
      textNodes.push({ node, rects: glyphRects, text });

      // text-clipped: the node's own box cannot hold its text AND it clips that overflow. A
      // scrollable box reaching its content is working as designed; overflow:visible is a spill
      // the overlap checks will catch where it lands. A 1 px box is a hidden carrier (live
      // regions, aria text) — never meant to be read.
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      // text-overflow:ellipsis is a disclosed truncation — the reader sees the "…" and knows.
      // A silent horizontal cut (or any vertical cut) is still a defect.
      const xDisclosed = clipsX && style.textOverflow === 'ellipsis';
      if (node.clientWidth > 1 && node.clientHeight > 1
        && ((clipsX && !xDisclosed && node.scrollWidth - node.clientWidth > 1)
          || (clipsY && node.scrollHeight - node.clientHeight > 1))) {
        out.findings.push({
          rule: 'text-clipped',
          victim: cssPath(node) + ` "${text.slice(0, 40)}"`,
          detail: `scroll ${node.scrollWidth}x${node.scrollHeight} > client ${node.clientWidth}x${node.clientHeight}`,
          victimRect: rectOut(rect),
        });
      }

      // text-occluded: a painted element hit-tests on top of this text's GLYPHS. `topAbove`
      // elevates the victim past pointer-events:none so the stack is paint order, not click
      // order. Sampling the glyph rects (not the block box) means a wide-but-mostly-empty
      // heading only flags when letters themselves are covered.
      let occluder = null;
      for (const g of glyphRects.slice(0, 4)) {
        if (occluder) break;
        for (const [x, y] of samplePoints(g)) {
          const top = topAbove(node, x, y);
          if (top && covers(top, node)) { occluder = top; break; }
        }
      }
      if (occluder) {
        out.findings.push({
          rule: 'text-occluded',
          victim: cssPath(node) + ` "${text.slice(0, 40)}"`,
          occluder: cssPath(occluder),
          victimRect: rectOut(unionRects(glyphRects)),
          occluderRect: rectOut(occluder.getBoundingClientRect()),
        });
      }
    }

    if (node.matches && node.matches(controlSel) && style.pointerEvents !== 'none') {
      // pointer-events:none controls (the power-rail slots, tabindex=-1 semantic carriers) are
      // deliberately click-transparent — clicks passing through them to the world is the design,
      // not an occlusion. Only an element that SHOULD take the click can be occluded.
      out.controlsSeen += 1;
      const cx = Math.min(Math.max(paint.left + (paint.right - paint.left) / 2, 1), viewport.w - 1);
      const cy = Math.min(Math.max(paint.top + (paint.bottom - paint.top) / 2, 1), viewport.h - 1);
      const top = topAt(cx, cy);
      // Any hit-test winner here — painted or not — blocks the player's click. `covers` is false
      // when the winner is the control itself or its own descendant. A winner that is itself (or
      // inside) another live control is overlap between two controls, not a dead zone: the click
      // still does something the player aimed at. Only non-interactive layers bury a control.
      const winnerIsControl = top && top.closest && top.closest(controlSel);
      if (covers(top, node) && !winnerIsControl) {
        out.findings.push({
          rule: 'control-occluded',
          victim: cssPath(node) + ` "${(text || node.getAttribute('aria-label') || '').slice(0, 40)}"`,
          occluder: cssPath(top),
          victimRect: rectOut(paint),
          occluderRect: rectOut(top ? top.getBoundingClientRect() : rect),
        });
      }
    }
  }

  // text-overlap: two visible text elements in the same pixels. Ancestor/descendant pairs are a
  // container and its label, not an overlap.
  const seenPair = [];
  for (let i = 0; i < textNodes.length; i += 1) {
    for (let j = i + 1; j < textNodes.length; j += 1) {
      const a = textNodes[i];
      const b = textNodes[j];
      let area = 0;
      let bandH = 0;
      for (const ra of a.rects) {
        for (const rb of b.rects) {
          const ov = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          const ar = rectOverlapLocal(ra, rb);
          if (ar > area) { area = ar; bandH = ov; }
        }
      }
      // Two thresholds: a visible band (≥3 px tall) with real area (≥24 px²). Sub-3 px slivers
      // are adjacent line boxes kissing at a boundary — Range rects carry full line-height, so
      // tight display leading overlaps the next element's line box without the glyphs colliding.
      if (area < 24 || bandH < 3) continue;
      if (isAncestor(a.node, b.node) || isAncestor(b.node, a.node)) continue;
      // Duplicate text on the same spot is a common deliberate layered-render pattern (glow);
      // different texts fighting for one rect is the defect.
      if (a.text === b.text) continue;
      // .sf-fx-morph__v copies are authored absolutely-stacked cross-fades — a copy sliding over
      // its sibling or a neighbour for the ~180 ms morph is the effect working, not a collision.
      if ((a.node.classList && a.node.classList.contains('sf-fx-morph__v'))
        || (b.node.classList && b.node.classList.contains('sf-fx-morph__v'))) continue;
      seenPair.push({
        rule: 'text-overlap',
        victim: `${cssPath(a.node)} "${a.text.slice(0, 32)}"`,
        occluder: `${cssPath(b.node)} "${b.text.slice(0, 32)}"`,
        detail: `overlap ${Math.round(area)}px²`,
        victimRect: rectOut(unionRects(a.rects)),
        occluderRect: rectOut(unionRects(b.rects)),
      });
      if (seenPair.length >= 12) break;
    }
    if (seenPair.length >= 12) break;
  }
  out.findings.push(...seenPair);

  function rectOverlapLocal(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Hover pass — two in-page halves around a real Playwright mouse move.
// `hoverBegin` tags everything currently visible on `window.__sfLayoutSeen`.
// `hoverDiff` reports elements the hover revealed and whether each one is topmost at its own
// centre — a revealed element hit-testing UNDER another element is the "tooltip buried under
// the card" defect, measured live.
// ---------------------------------------------------------------------------------------------

export function hoverBegin() {
  const seen = new Set();
  const all = document.querySelectorAll('*');
  for (const node of all) {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden'
      || parseFloat(style.opacity || '1') <= 0.01) continue;
    seen.add(node);
  }
  window.__sfLayoutSeen = seen;
  return seen.size;
}

/** Hover triggers worth exercising, most specific first, capped. Runs in-page. */
export function hoverTriggers(rootSelectors) {
  const roots = [];
  for (const sel of rootSelectors || []) {
    const el = document.querySelector(sel);
    if (el) roots.push(el);
  }
  const scope = roots.length ? roots : [document.body];
  const triggers = [];
  const seen = new Set();
  const sel = 'button, a[href], input, select, [role="button"], [role="tab"],'
    + ' [title], [data-tip], [aria-describedby], [data-why], [tabindex]:not([tabindex="-1"])';
  for (const rootEl of scope) {
    for (const node of rootEl.querySelectorAll(sel)) {
      if (seen.has(node)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      seen.add(node);
      triggers.push({
        x: Math.min(Math.max(rect.left + rect.width / 2, 1), window.innerWidth - 1),
        y: Math.min(Math.max(rect.top + rect.height / 2, 1), window.innerHeight - 1),
        path: (() => {
          let part = node.tagName ? node.tagName.toLowerCase() : '?';
          if (node.id) return part + '#' + node.id;
          const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : '';
          return cls ? part + '.' + cls : part;
        })(),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      });
      if (triggers.length >= 20) return triggers;
    }
  }
  return triggers;
}

export function hoverDiff() {
  // Self-contained: this function body is page.evaluate'd alone. Same contract as the copy in
  // layoutProbe — a pe:none ancestor makes the whole subtree hit-test transparent, so elevate
  // the full chain to read paint order, then restore.
  function elevatePointerTransparent(node) {
    const restore = [];
    for (let el = node; el && el !== document.documentElement; el = el.parentElement) {
      if (getComputedStyle(el).pointerEvents === 'none') {
        restore.push([el, el.style.pointerEvents]);
        el.style.pointerEvents = 'auto';
      }
    }
    return () => { for (const [el, pe] of restore) el.style.pointerEvents = pe; };
  }
  const seen = window.__sfLayoutSeen || new Set();
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const revealed = [];
  const all = document.querySelectorAll('*');
  for (const node of all) {
    if (seen.has(node)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden'
      || parseFloat(style.opacity || '1') <= 0.01) continue;
    seen.add(node); // revealed now — do not re-report for the next trigger
    // Clip-aware centre: a tip revealed inside a clipping ancestor only paints inside the clip
    // box; its raw rect can point at pixels it never produces.
    let clip = null;
    let clippedAncestor = null;
    for (let anc = node.parentElement; anc && anc !== document.documentElement; anc = anc.parentElement) {
      const as = getComputedStyle(anc);
      if ((as.overflowX && as.overflowX !== 'visible') || (as.overflowY && as.overflowY !== 'visible')) {
        const ar = anc.getBoundingClientRect();
        clip = clip
          ? { left: Math.max(clip.left, ar.left), top: Math.max(clip.top, ar.top), right: Math.min(clip.right, ar.right), bottom: Math.min(clip.bottom, ar.bottom) }
          : { left: ar.left, top: ar.top, right: ar.right, bottom: ar.bottom };
        if (!clippedAncestor) clippedAncestor = anc;
      }
    }
    const paint = clip
      ? {
        left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top),
        right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom),
      }
      : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    const painted = paint.right > paint.left && paint.bottom > paint.top;
    const cx = Math.min(Math.max((paint.left + paint.right) / 2, 1), viewport.w - 1);
    const cy = Math.min(Math.max((paint.top + paint.bottom) / 2, 1), viewport.h - 1);
    // Same pointer-events problem as layoutProbe: tips are deliberately pointer-transparent, so
    // elevate the revealed node (and its pe:none ancestors) for one synchronous hit-test to read
    // paint order, not click order.
    const restore = elevatePointerTransparent(node);
    let stack;
    try {
      stack = document.elementsFromPoint(cx, cy);
    } finally {
      restore();
    }
    let buriedBy = null;
    if (stack && stack.length) {
      const idx = stack.indexOf(node);
      // Elements above node in the stack that are its own descendants are the tip's label painting
      // above the tip's box — correct order, not burial. The first NON-related element above it
      // (or swallowing its point entirely when idx === -1) is the burying element.
      const relates = (el) => {
        if (el === node) return true;
        for (let cur = el; cur; cur = cur.parentElement) { if (cur === node) return true; }
        for (let cur = node; cur; cur = cur.parentElement) { if (cur === el) return true; }
        // .sf-fx-morph__v siblings are authored cross-fade clones stacked on the same spot.
        if (el.parentElement === node.parentElement && el.classList
          && el.classList.contains('sf-fx-morph__v')
          && node.classList && node.classList.contains('sf-fx-morph__v')) return true;
        // Two elements inside the same interactive control (a hardpoint's leader line under its
        // own reticle dot) are intra-control paint order — by design, not burial.
        const controlSel = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"]';
        const nodeControl = node.closest ? node.closest(controlSel) : null;
        if (nodeControl && el.closest && el.closest(controlSel) === nodeControl) return true;
        return false;
      };
      // For a pointer-transparent reveal (a tooltip) only a PAINTED element above it can hide it —
      // a transparent container sitting higher in the stack hides nothing. For a hit-testable
      // reveal anything above eats the click, painted or not.
      const pointerTransparent = getComputedStyle(node).pointerEvents === 'none';
      const paints = (el) => {
        if (!el || el.nodeType !== 1) return false;
        const tag = el.tagName;
        if (tag === 'CANVAS' || tag === 'IMG' || tag === 'SVG' || tag === 'VIDEO') return true;
        const s = getComputedStyle(el);
        const bg = s.backgroundColor || '';
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return true;
        if (s.backgroundImage && s.backgroundImage !== 'none') return true;
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const w = parseFloat(s['border' + side + 'Width'] || '0');
          const c = s['border' + side + 'Color'] || '';
          if (w > 0 && c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') return true;
        }
        for (const child of el.childNodes) {
          if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) return true;
        }
        return false;
      };
      // idx === -1 means the victim does not hit-test at its own painted centre even elevated —
      // a stroke-only SVG path (fill:none) or a zero-area node — which is geometry, not burial.
      // Covered elements still appear in elementsFromPoint below their cover, so a victim that
      // IS in the stack with an unrelated element above it is the only provable burial.
      const above = idx === -1 ? [] : stack.slice(0, idx);
      buriedBy = above.find((el) => !relates(el) && (!pointerTransparent || paints(el))) || null;
    }
    let path = '';
    let cur = node;
    for (let depth = 0; cur && cur.nodeType === 1 && depth < 4; depth += 1) {
      let part = cur.tagName ? cur.tagName.toLowerCase() : '?';
      if (cur.id) { part += '#' + cur.id; path = path ? part + ' > ' + path : part; break; }
      const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\s+/)[0] : '';
      if (cls) part += '.' + cls;
      path = path ? part + ' > ' + path : part;
      cur = cur.parentElement;
    }
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    revealed.push({
      path,
      text,
      rect: { left: Math.round(rect.left), top: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) },
      buriedBy: buriedBy ? (buriedBy.tagName.toLowerCase() + (buriedBy.id ? '#' + buriedBy.id : '')
        + (typeof buriedBy.className === 'string' && buriedBy.className.trim()
          ? '.' + buriedBy.className.trim().split(/\s+/)[0] : '')) : null,
      clippedAway: !painted && clippedAncestor
        ? (clippedAncestor.tagName.toLowerCase()
          + (clippedAncestor.id ? '#' + clippedAncestor.id : '')
          + (typeof clippedAncestor.className === 'string' && clippedAncestor.className.trim()
            ? '.' + clippedAncestor.className.trim().split(/\s+/)[0] : ''))
        : null,
      offscreen: rect.left < 0 || rect.top < 0 || rect.right > viewport.w || rect.bottom > viewport.h,
    });
    if (revealed.length >= 12) break;
  }
  return revealed;
}
