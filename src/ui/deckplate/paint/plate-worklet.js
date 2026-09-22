// Deckplate paint worklets — the plate's face, computed.
//
// This file runs inside a CSS Houdini PaintWorkletGlobalScope, NOT in the page. It has no DOM, no
// window, and no imports. It is registered by src/ui/deckplate/paint.js.
//
// WHY A WORKLET. A plate's face was three stacked CSS gradients, which reads as a smooth ramp —
// the reason a panel looks like a rectangle rather than machined metal. The usual fix is a tiling
// photograph of brushed steel, and that is the thing we are not doing: a raster is a fixed grid of
// pixels, so it is a visible repeat at 1x and a blur at 4x, and it is the same on every panel in
// the game. A worklet paints at the DEVICE's resolution every time the element is painted. Zoom in
// and the grain gets finer, not bigger. Two plates seeded differently are not the same plate.
//
// COST. A paint worklet runs on invalidation — a resize, or a change to one of its inputProperties
// — not per frame. Nothing here animates; C2's moving light animates the gradients layered over
// this, which stay on the compositor. Keep it that way: no time, no randomness, no state.

/** Deterministic hash → [0,1). The worklet must draw the same plate every repaint, so a plate
 *  cannot use Math.random: the grain would crawl every time the element resized. */
function hash(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040888963407;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function readNumber(props, name, fallback) {
  const raw = String(props.get(name) || '').trim();
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readColor(props, name, fallback) {
  const raw = String(props.get(name) || '').trim();
  return raw || fallback;
}

/* ── dp-plate — the machined face ───────────────────────────────────────────────────────────────
   Four coats, in the order a real plate has them:
     1. the body ramp            — the metal's own value, lit top, shadowed bottom
     2. the brush                — anisotropic streaks along the machining axis
     3. the key                  — one warm directional light, matching --dp-key-angle
     4. the micro-tooth          — a very fine cross-hatch that only resolves close up
   ─────────────────────────────────────────────────────────────────────────────────────────────── */
class DeckplatePlate {
  static get inputProperties() {
    return [
      '--dp-metal-1', '--dp-metal-2', '--dp-metal-3', '--dp-metal-4',
      '--dp-key-angle', '--dp-key-power', '--dp-plate-seed', '--dp-grain',
    ];
  }

  paint(ctx, size, props) {
    const { width: w, height: h } = size;
    if (w < 2 || h < 2) return;

    const m1 = readColor(props, '--dp-metal-1', '#12151a');
    const m2 = readColor(props, '--dp-metal-2', '#191d24');
    const m3 = readColor(props, '--dp-metal-3', '#232833');
    const m4 = readColor(props, '--dp-metal-4', '#2f3542');
    const angle = readNumber(props, '--dp-key-angle', 142);
    const power = Math.max(0, Math.min(1.6, readNumber(props, '--dp-key-power', 1)));
    const seed = readNumber(props, '--dp-plate-seed', 7) | 0;
    const grain = Math.max(0, Math.min(1.5, readNumber(props, '--dp-grain', 1)));

    // 1. THE BODY. Lit land at the top, falling to the unlit recess — the same 178deg the gradient
    //    recipe used, so a worklet plate and a fallback plate read as the same object.
    const body = ctx.createLinearGradient(0, 0, w * 0.06, h);
    body.addColorStop(0, m3);
    body.addColorStop(0.4, m2);
    body.addColorStop(0.74, m1);
    body.addColorStop(1, m1);
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);

    // 2. THE BRUSH. Machining is directional: the streaks run along one axis and vary in length and
    //    strength, never in position between repaints. One line per CSS pixel row is far too many
    //    on a tall panel, so the density is tied to the surface and capped.
    const rows = Math.min(420, Math.max(24, Math.round(h * 0.55)));
    ctx.lineWidth = 1;
    for (let i = 0; i < rows; i += 1) {
      const y = (i + 0.5) * (h / rows);
      const n = hash(i, 0, seed);
      const n2 = hash(i, 91, seed);
      // Most streaks are almost invisible; a few catch the light. That distribution is what makes
      // brushed metal read as metal instead of as noise.
      const strength = (n * n * n) * 0.085 * grain;
      if (strength < 0.002) continue;
      const lit = n2 > 0.5;
      const x0 = -w * 0.1 + n2 * w * 0.35;
      const x1 = x0 + w * (0.5 + n * 0.75);
      const streak = ctx.createLinearGradient(x0, 0, x1, 0);
      const tint = lit ? '255,236,206' : '0,0,0';
      streak.addColorStop(0, `rgba(${tint},0)`);
      streak.addColorStop(0.5, `rgba(${tint},${strength.toFixed(4)})`);
      streak.addColorStop(1, `rgba(${tint},0)`);
      ctx.strokeStyle = streak;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    // 3. THE KEY. One warm directional light. --dp-key-angle is where it comes FROM, so the hot
    //    spot sits on the opposite side of the plate and the falloff crosses it.
    const rad = (angle * Math.PI) / 180;
    const kx = w * (0.5 - Math.cos(rad) * 0.55);
    const ky = h * (0.5 - Math.sin(rad) * 0.55);
    const key = ctx.createRadialGradient(kx, ky, 0, kx, ky, Math.hypot(w, h) * 0.9);
    key.addColorStop(0, `rgba(255,228,186,${(0.085 * power).toFixed(4)})`);
    key.addColorStop(0.34, `rgba(255,224,178,${(0.03 * power).toFixed(4)})`);
    key.addColorStop(1, 'rgba(255,224,178,0)');
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, w, h);

    // 4. THE TOOTH. A fine cross-hatch at the resolution the device can actually show. At 1x it is
    //    a texture you feel rather than see; at 2x it resolves into the machining. This is the part
    //    a bitmap cannot do.
    const step = 3;
    ctx.globalAlpha = 0.5 * grain;
    for (let y = 0; y < h; y += step) {
      const n = hash(0, y, seed + 17);
      ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.018)';
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;

    // The machined edge: the top and left catch the key, the bottom and right fall away. Painted
    // here rather than as a box-shadow so it belongs to the same surface as the grain.
    ctx.fillStyle = m4;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, 0, 1, h);
    ctx.globalAlpha = 1;
  }
}

/* ── dp-channel — the recess a gauge fill travels in ────────────────────────────────────────────
   Cut INTO the plate: dark at the top where the lip shadows it, a thin warm bounce at the bottom.
   ─────────────────────────────────────────────────────────────────────────────────────────────── */
class DeckplateChannel {
  static get inputProperties() { return ['--dp-metal-0', '--dp-plate-seed']; }

  paint(ctx, size, props) {
    const { width: w, height: h } = size;
    if (w < 2 || h < 2) return;
    const base = readColor(props, '--dp-metal-0', '#0b0d10');
    const seed = readNumber(props, '--dp-plate-seed', 3) | 0;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    const cut = ctx.createLinearGradient(0, 0, 0, h);
    cut.addColorStop(0, 'rgba(0,0,0,0.55)');
    cut.addColorStop(0.55, 'rgba(0,0,0,0.16)');
    cut.addColorStop(1, 'rgba(255,232,190,0.05)');
    ctx.fillStyle = cut;
    ctx.fillRect(0, 0, w, h);

    // The tool marks run ALONG the channel, because that is the direction it was cut.
    const lines = Math.min(64, Math.max(6, Math.round(h * 0.7)));
    for (let i = 0; i < lines; i += 1) {
      const y = (i + 0.5) * (h / lines);
      const n = hash(i, 5, seed);
      ctx.fillStyle = `rgba(255,255,255,${(n * n * 0.02).toFixed(4)})`;
      ctx.fillRect(0, y, w, 1);
    }
  }
}

registerPaint('dp-plate', DeckplatePlate);
registerPaint('dp-channel', DeckplateChannel);
