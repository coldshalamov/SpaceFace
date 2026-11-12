// Shared by scripts/check-mobile-hud-area.mjs and scripts/fleet/looks/phone-swarm.mjs.
// What a pilot would call "the HUD": every deck control and every HUD plate that sits over the world.
export const HUD_FURNITURE = [
  '#sf-touch-overlay .mf-status',
  '#sf-touch-overlay .mf-pause',
  '#sf-touch-overlay .mf-edge',
  '#sf-touch-overlay .mf-buttons > *',
  '#sf-touch-overlay .mf-dock:not([hidden])',
  '#sf-touch-overlay .mf-toast:not([hidden])',
  '#sf-touch-overlay .mf-guide-open:not([hidden])',
  '#sf-touch-overlay .mf-reel:not([hidden])',
  '#sf-touch-overlay .mf-beam:not([hidden])',
  '#sf-touch-overlay .mf-ghost:not([hidden]) > svg',
  '#sf-touch-overlay .mf-ghost:not([hidden]) .mf-ghost-label',
  '#sf-touch-overlay .mf-stick:not([hidden]) > *',
  '#sf-touch-overlay .mf-wheel:not([hidden]) > *',
  '#hud > .sf-leftcontext > *',
  '#hud .sf-rightdock > *',
  '#hud > .sf-radar-wrap--expanded',
  '#hud .sf-radar-orrery',
  '#race-tape:not([hidden])',
  '#alerts > *',
  '#toasts > *',
  '#hud > .sf-vtape.sf-vtape--on',
  '#hud .sf-tells > *',
  '.ml2-cadence-slot',
  '#sf-ml2 .ml2-preview',
  '.sf-tutorial-flight-card',
  '#sf-sector-law:not([hidden])',
];

// The machine-pressure notices (the renderer's "Graphics eased/restored" toast) depend on how loaded the test
// machine is, not on the game's layout: the Swarm measurement skips them.
export const MACHINE_NOTICE = 'Graphics (eased|restored)';
// A live Swarm round adds its own plates: the round panel (left context), the centre column, the stage
// banner and the voice/lesson line. Transient ones count only while visible.
export const SWARM_FURNITURE = [
  '.sf-sj__col > *',
  '#sf-stage-banner .sf-stage__item',
  '.sf-bark:not([hidden])',
  '.sf-voice:not([hidden])',
];

/** Exact union of the visible furniture rectangles (overlaps counted once). */
export async function measureUnion(page, selectors, { ignoreText = null } = {}) {
  return page.evaluate(([selectors, ignoreText]) => {
    const ignore = ignoreText ? new RegExp(ignoreText, 'i') : null;
      const vw = window.innerWidth, vh = window.innerHeight;
      const seen = new Set();
      const rows = [];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          if (seen.has(el)) continue;
          if (ignore && ignore.test(el.textContent || '')) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          const left = Math.max(0, r.left), top = Math.max(0, r.top);
          const right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
          const width = right - left, height = bottom - top;
          if (width <= 0 || height <= 0) continue;
          if (!el.checkVisibility?.({ checkVisibilityCSS: true, checkOpacity: true })) continue;
          rows.push({
            sel, cls: String(el.className?.baseVal !== undefined ? el.className.baseVal : el.className || el.id || el.tagName).slice(0, 60),
            x: Math.round(left * 10) / 10, y: Math.round(top * 10) / 10, w: Math.round(width * 10) / 10, h: Math.round(height * 10) / 10,
          });
        }
      }
      // Exact union of axis-aligned rectangles: sweep x edges, merge covered y-intervals per slab.
      const xs = [...new Set(rows.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
      let covered = 0;
      for (let i = 0; i + 1 < xs.length; i += 1) {
        const x0 = xs[i], x1 = xs[i + 1];
        const ys = rows.filter((r) => r.x < x1 && r.x + r.w > x0)
          .flatMap((r) => [[r.y, 1], [r.y + r.h, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let depth = 0, start = 0;
        for (const [y, d] of ys) {
          if (depth === 0) start = y;
          depth += d;
          if (depth === 0) covered += (x1 - x0) * (y - start);
        }
      }
      return { vw, vh, area: vw * vh, covered, rows };
  }, [selectors, ignoreText]);
}
