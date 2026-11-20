// Rock fields as regions — one painter shared by the flight minimap and the sector chart.
//
// A field is drawn where rocks really are: the union of a disc around every clustered rock, filled
// with a quiet stipple and edged by its outer contour only (no inner seams). A rock joins a field
// only when at least two other rocks' discs overlap its own, so a lone rock never becomes a bubble;
// lone rocks are drawn by the caller as chips. With `density`, every disc also lays a faint wash,
// so where rocks crowd the region reads denser and a mined-out stretch reads thin.

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A rock the room layer may draw: a field record or a live asteroid entity, never a ship. */
export function isRockRecord(rock) {
  return !!(rock && rock.pos && rock.alive !== false
    && (rock.type === 'asteroid' || rock.fieldResident === true)
    && Number.isFinite(rock.pos.x) && Number.isFinite(rock.pos.z));
}

/**
 * @param {Document} doc  — creates the stipple tile and the contour scratch canvas
 * @returns {{ paint(g, rocks, project, scale, width, height, opts?): number }}
 *   `paint` draws into `g` (CSS-pixel transform already applied) and returns the disc count drawn.
 *   opts: { dpr = 1, padWorld = 70, minPx = 5, maxPx = 34, fill, contour, density = false }
 */
export function createRockFieldPainter(doc) {
  let stipple = null;
  let stippleFor = null;
  const contourCanvas = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas') : null;
  const contourCtx = contourCanvas ? contourCanvas.getContext('2d') : null;
  const candidates = [];
  const discs = [];

  function ensureStipple(g) {
    if (stipple && stippleFor === g) return stipple;
    if (!doc || typeof doc.createElement !== 'function' || typeof g.createPattern !== 'function') return null;
    const c = doc.createElement('canvas');
    c.width = 9;
    c.height = 9;
    const sg = c.getContext('2d');
    if (!sg) return null;
    sg.fillStyle = 'rgba(176, 218, 236, 0.42)';
    sg.fillRect(1, 1, 1, 1);
    sg.fillRect(5, 3, 1, 1);
    sg.fillRect(3, 6, 1, 1);
    sg.fillRect(7, 7, 1, 1);
    stipple = g.createPattern(c, 'repeat');
    stippleFor = g;
    return stipple;
  }

  function paint(g, rocks, project, scale, width, height, {
    dpr = 1, padWorld = 70, minPx = 5, maxPx = 34, fill = 'rgba(96, 146, 172, 0.13)',
    contour = 'rgba(168, 214, 234, 0.46)', density = false,
  } = {}) {
    if (!g || !Array.isArray(rocks) || !rocks.length) return 0;
    const padPx = clamp(padWorld * scale, 3, 14);
    candidates.length = 0;
    for (let i = 0; i < rocks.length && candidates.length < 5400; i += 1) {
      const rock = rocks[i];
      if (!isRockRecord(rock)) continue;
      const at = project(rock.pos.x, rock.pos.z);
      const r = clamp((Number(rock.radius) || 12) * scale + padPx, minPx, maxPx);
      if (at.x + r < -4 || at.x - r > width + 4 || at.y + r < -4 || at.y - r > height + 4) continue;
      candidates.push(at.x, at.y, r);
    }
    if (!candidates.length) return 0;
    let maxR = 0;
    for (let i = 2; i < candidates.length; i += 3) if (candidates[i] > maxR) maxR = candidates[i];
    const cellPx = Math.max(8, maxR * 2);
    const cols = Math.ceil(width / cellPx) + 3;
    const rows = Math.ceil(height / cellPx) + 3;
    const buckets = new Map();
    const cellOf = (x, y) => (clamp(Math.floor(y / cellPx) + 1, 0, rows - 1) * cols) + clamp(Math.floor(x / cellPx) + 1, 0, cols - 1);
    for (let i = 0; i < candidates.length; i += 3) {
      const c = cellOf(candidates[i], candidates[i + 1]);
      let list = buckets.get(c);
      if (!list) { list = []; buckets.set(c, list); }
      list.push(i);
    }
    discs.length = 0;
    for (let i = 0; i < candidates.length; i += 3) {
      const x = candidates[i];
      const y = candidates[i + 1];
      const r = candidates[i + 2];
      const c = cellOf(x, y);
      const cxCell = c % cols;
      const cyCell = (c - cxCell) / cols;
      let n = 0;
      for (let oy = -1; oy <= 1 && n < 2; oy += 1) {
        for (let ox = -1; ox <= 1 && n < 2; ox += 1) {
          const list = buckets.get((cyCell + oy) * cols + cxCell + ox);
          if (!list) continue;
          for (let k = 0; k < list.length && n < 2; k += 1) {
            const j = list[k];
            if (j === i) continue;
            const link = (r + candidates[j + 2]) * 0.92;
            const ddx = candidates[j] - x;
            const ddy = candidates[j + 1] - y;
            if (ddx * ddx + ddy * ddy <= link * link) n += 1;
          }
        }
      }
      if (n >= 2) discs.push(x, y, r);
    }
    if (!discs.length) return 0;

    g.save();
    g.beginPath();
    for (let i = 0; i < discs.length; i += 3) {
      g.moveTo(discs[i] + discs[i + 2], discs[i + 1]);
      g.arc(discs[i], discs[i + 1], discs[i + 2], 0, TAU);
    }
    g.fillStyle = fill;
    g.fill();
    const pattern = ensureStipple(g);
    if (pattern) {
      g.fillStyle = pattern;
      g.fill();
    }
    if (density) {
      // Each rock lays a faint wash of its own: crowded ground accumulates, thin ground stays thin.
      g.fillStyle = 'rgba(150, 196, 216, 0.035)';
      for (let i = 0; i < discs.length; i += 3) {
        g.beginPath();
        g.arc(discs[i], discs[i + 1], discs[i + 2] * 0.8, 0, TAU);
        g.fill();
      }
    }
    g.restore();

    if (contourCtx) {
      const pw = Math.max(1, Math.round(width * dpr));
      const ph = Math.max(1, Math.round(height * dpr));
      if (contourCanvas.width !== pw) contourCanvas.width = pw;
      if (contourCanvas.height !== ph) contourCanvas.height = ph;
      const c = contourCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, pw, ph);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.save();
      c.beginPath();
      for (let i = 0; i < discs.length; i += 3) {
        c.moveTo(discs[i] + discs[i + 2], discs[i + 1]);
        c.arc(discs[i], discs[i + 1], discs[i + 2], 0, TAU);
      }
      c.strokeStyle = contour;
      c.lineWidth = 2.2;
      c.stroke();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      for (let i = 0; i < discs.length; i += 3) {
        const r = Math.max(1, discs[i + 2] - 1.1);
        c.moveTo(discs[i] + r, discs[i + 1]);
        c.arc(discs[i], discs[i + 1], r, 0, TAU);
      }
      c.fillStyle = '#000';
      c.fill();
      c.restore();
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(contourCanvas, 0, 0, pw, ph);
      g.restore();
    }
    return discs.length / 3;
  }

  return { paint };
}
