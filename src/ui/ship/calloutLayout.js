// src/ui/ship/calloutLayout.js — where the system labels go around a hull (shipworks + THE SHIP).
//
// The hull owns a box in the middle of the stage (the keep-out). Every socket is a bead inside
// that box. Its label goes in a column beside the box, never inside it, so a label can never
// print over a bead, and a column is stacked so labels never print over each other. The leader
// runs level from the bead to a knee just short of its column, then angles into the label's
// middle: level runs sit on different heights and the angled parts all live in the same thin band
// in the same order, so no two leaders cross and no leader runs under a label.
//
// Pure geometry: no DOM, no Three.js. Stage coordinates in, stage coordinates out.

const finite = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Bounding box of points, grown by `pad`. */
export function pointsBox(points, pad = 0) {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const p of points) {
    if (!p) continue;
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  if (!Number.isFinite(left)) return null;
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}

/**
 * Two beads on the same spot (two mining arms on one mark, both RCS sockets on a side view) read
 * as one bead with two labels. Nudge later coincident beads apart so every label has its own.
 */
export function separateBeads(points, minGap = 12) {
  const out = points.map((p) => (p ? { ...p } : p));
  for (let i = 1; i < out.length; i++) {
    const p = out[i];
    if (!p) continue;
    for (let guard = 0; guard < 8; guard++) {
      const clash = out.slice(0, i).find((q) => q && Math.hypot(q.x - p.x, q.y - p.y) < minGap);
      if (!clash) break;
      p.y = clash.y + minGap;
    }
  }
  return out;
}

/**
 * Stack cards in one column: each card wants its middle on its bead's height; overlapping cards
 * merge into a block centred on what its members want, clamped to the column.
 * `cards` must be sorted by bead y. Returns the top of each card.
 */
function stackColumn(cards, colTop, colBottom, pitch) {
  if (!cards.length) return [];
  const total = cards.reduce((sum, c) => sum + c.h, 0);
  const avail = Math.max(0, colBottom - colTop);
  // More labels than the column holds: close the pitch before letting anything overprint.
  const gapPx = cards.length > 1
    ? Math.max(0, Math.min(pitch, (avail - total) / (cards.length - 1)))
    : 0;
  const blocks = [];
  for (const card of cards) {
    blocks.push({ cards: [card], want: card.want, h: card.h });
    for (;;) {
      const cur = blocks[blocks.length - 1];
      clampBlock(cur, colTop, colBottom);
      const prev = blocks[blocks.length - 2];
      if (!prev || prev.top + prev.h + gapPx <= cur.top) break;
      blocks.pop();
      const merged = { cards: prev.cards.concat(cur.cards), h: prev.h + gapPx + cur.h };
      // Each member wants its own top; the block top that best serves them all is the mean of
      // (member want - member offset in the block).
      let offset = 0; let sum = 0;
      for (const c of merged.cards) { sum += c.want - offset; offset += c.h + gapPx; }
      merged.want = sum / merged.cards.length;
      blocks[blocks.length - 1] = merged;
    }
  }
  const tops = new Map();
  for (const block of blocks) {
    let y = block.top;
    for (const c of block.cards) { tops.set(c, y); y += c.h + gapPx; }
  }
  return cards.map((c) => tops.get(c));
}

function clampBlock(block, colTop, colBottom) {
  block.top = Math.max(colTop, Math.min(colBottom - block.h, block.want));
  if (block.top < colTop) block.top = colTop; // taller than the column: pin to the top, never above it
}

/**
 * Lay out hull callouts.
 * @param {object} o
 * @param {{x:number,y:number,w:number,h:number,side?:'left'|'right'}[]} o.dots bead + label size
 * @param {{left:number,top:number,right:number,bottom:number}} o.bounds where labels may go
 * @param {{left:number,top:number,right:number,bottom:number}} [o.keepOut] the hull's box
 * @param {{left:number,top:number,right:number,bottom:number}[]} [o.obstacles] chrome to avoid
 * @returns {{side:'left'|'right', left:number, top:number, right:number, bottom:number,
 *   leader:number[][]}[]} one entry per dot, same order
 */
export function layoutHullCallouts({
  dots = [],
  bounds,
  keepOut = null,
  obstacles = [],
  gap = 28,
  pitch = 6,
  beadRadius = 6,
} = {}) {
  if (!Array.isArray(dots) || !dots.length || !bounds) return [];
  const hull = keepOut || pointsBox(dots, beadRadius + 8);
  const hullCx = (hull.left + hull.right) / 2;
  const colTop = bounds.top;
  const colBottom = bounds.bottom;

  const items = dots.map((d, index) => ({
    index,
    x: finite(d.x), y: finite(d.y),
    w: Math.max(1, finite(d.w, 120)), h: Math.max(1, finite(d.h, 36)),
    side: d.side === 'left' || d.side === 'right' ? d.side
      : (finite(d.x) < hullCx ? 'left' : finite(d.x) > hullCx ? 'right' : null),
  }));
  // Beads dead on the centre line go to whichever column is lighter.
  for (const it of items) {
    if (it.side) continue;
    const l = items.filter((o) => o.side === 'left').length;
    const r = items.filter((o) => o.side === 'right').length;
    it.side = l <= r ? 'left' : 'right';
  }

  // Each column's x-range sits flush against the hull box, across the gap, inside the bounds.
  const place = (it) => {
    if (it.side === 'left') {
      it.right = hull.left - gap;
      it.left = it.right - it.w;
      if (it.left < bounds.left) { it.left = bounds.left; it.right = it.left + it.w; }
    } else {
      it.left = hull.right + gap;
      it.right = it.left + it.w;
      if (it.right > bounds.right) { it.right = bounds.right; it.left = it.right - it.w; }
    }
  };
  // Chrome that shares a column's width (the nameplate up top, the camera words at the foot)
  // shortens that column from its end.
  const mid = (colTop + colBottom) / 2;
  const span = (side) => {
    const col = items.filter((o) => o.side === side);
    let top = colTop; let bottom = colBottom;
    if (!col.length) return { top, bottom };
    const colLeft = Math.min(...col.map((c) => c.left));
    const colRight = Math.max(...col.map((c) => c.right));
    for (const ob of obstacles) {
      if (!ob || ob.right <= colLeft || ob.left >= colRight) continue;
      if (ob.bottom <= colTop || ob.top >= colBottom) continue;
      if ((ob.top + ob.bottom) / 2 < mid) top = Math.max(top, ob.bottom + pitch);
      else bottom = Math.min(bottom, ob.top - pitch);
    }
    if (bottom - top < Math.max(...col.map((c) => c.h))) return { top: colTop, bottom: colBottom };
    return { top, bottom };
  };
  const need = (side, extra = 0) => {
    const list = items.filter((o) => o.side === side);
    const n = list.length + (extra ? 1 : 0);
    return list.reduce((s, o) => s + o.h, 0) + extra + pitch * Math.max(0, n - 1);
  };
  const room = (side) => { const r = span(side); return r.bottom - r.top; };
  for (const it of items) place(it);
  // A column that cannot hold its labels (after its chrome) hands the ones nearest the centre to
  // the other column, while that one has room.
  for (let guard = 0; guard < items.length; guard++) {
    const over = need('left') > room('left') ? 'left' : need('right') > room('right') ? 'right' : null;
    if (!over) break;
    const other = over === 'left' ? 'right' : 'left';
    const movable = items.filter((o) => o.side === over)
      .sort((a, b) => (over === 'left' ? b.x - a.x : a.x - b.x))[0];
    if (!movable) break;
    movable.side = other;
    place(movable);
    if (need(other) > room(other)) { movable.side = over; place(movable); break; }
  }

  for (const side of ['left', 'right']) {
    const col = items.filter((o) => o.side === side).sort((a, b) => a.y - b.y || a.index - b.index);
    if (!col.length) continue;
    const { top, bottom } = span(side);
    for (const c of col) c.want = c.y - c.h / 2;
    const tops = stackColumn(col, top, bottom, pitch);
    col.forEach((c, i) => { c.top = tops[i]; c.bottom = c.top + c.h; });
  }

  // Safety net for a squeezed stage (a column clamped back over the hull): a label may never sit
  // on a bead. Slide it clear along its column when there is room.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const it of items) {
      const rect = { left: it.left, right: it.right, top: it.top, bottom: it.bottom };
      const hit = items.find((d) => d.x > rect.left - beadRadius && d.x < rect.right + beadRadius
        && d.y > rect.top - beadRadius && d.y < rect.bottom + beadRadius);
      if (!hit) continue;
      const down = hit.y + beadRadius + 2;
      const up = hit.y - beadRadius - 2 - it.h;
      const siblings = items.filter((o) => o !== it && o.side === it.side);
      const fits = (t) => t >= colTop && t + it.h <= colBottom
        && !siblings.some((o) => rectsOverlap({ left: it.left, right: it.right, top: t, bottom: t + it.h }, o));
      const choice = [down, up].filter(fits).sort((a, b) => Math.abs(a - it.top) - Math.abs(b - it.top))[0];
      if (choice == null) continue;
      it.top = choice; it.bottom = choice + it.h; moved = true;
    }
    if (!moved) break;
  }

  return items.map((it) => {
    const cy = it.top + it.h / 2;
    let leader = [];
    if (it.side === 'left') {
      const start = it.x - beadRadius;
      const end = it.right + 4;
      if (start > end + 2) {
        const knee = Math.min(start, end + Math.min(18, (start - end) * 0.45));
        const blocked = items.some((d) => d !== it && Math.abs(d.y - it.y) < beadRadius
          && d.x < start && d.x > knee);
        leader = blocked ? [[start, it.y], [end, cy]] : [[start, it.y], [knee, it.y], [end, cy]];
      }
    } else {
      const start = it.x + beadRadius;
      const end = it.left - 4;
      if (end > start + 2) {
        const knee = Math.max(start, end - Math.min(18, (end - start) * 0.45));
        const blocked = items.some((d) => d !== it && Math.abs(d.y - it.y) < beadRadius
          && d.x > start && d.x < knee);
        leader = blocked ? [[start, it.y], [end, cy]] : [[start, it.y], [knee, it.y], [end, cy]];
      }
    }
    return { side: it.side, left: it.left, top: it.top, right: it.right, bottom: it.bottom, leader };
  });
}

/**
 * Where the hull's produced render goes: its ink (the hull's alpha bounding box, normalised to the
 * image) fitted into `region` with `reserveX` kept free on both sides for the label columns and
 * `reserveY` above and below. Returns the IMAGE rect (the ink rect sits inside it) and the ink
 * rect, both in the region's coordinates.
 */
export function fitHullInk({ region, ink, imageAspect, reserveX = 0, reserveY = 0, maxInkH = Infinity }) {
  const box = ink && ink.x1 > ink.x0 && ink.y1 > ink.y0 ? ink : { x0: 0.15, y0: 0.15, x1: 0.85, y1: 0.85 };
  const aspect = imageAspect > 0 ? imageAspect : 16 / 9;
  const inkAspect = ((box.x1 - box.x0) * aspect) / (box.y1 - box.y0);
  const availW = Math.max(40, (region.right - region.left) - reserveX * 2);
  const availH = Math.max(30, Math.min(maxInkH, (region.bottom - region.top) - reserveY * 2));
  let inkW = availW;
  let inkH = inkW / inkAspect;
  if (inkH > availH) { inkH = availH; inkW = inkH * inkAspect; }
  const cx = (region.left + region.right) / 2;
  const cy = (region.top + region.bottom) / 2;
  const inkRect = { left: cx - inkW / 2, top: cy - inkH / 2, right: cx + inkW / 2, bottom: cy + inkH / 2 };
  const imgW = inkW / (box.x1 - box.x0);
  const imgH = inkH / (box.y1 - box.y0);
  const imgRect = {
    left: inkRect.left - box.x0 * imgW,
    top: inkRect.top - box.y0 * imgH,
    width: imgW,
    height: imgH,
  };
  return { imgRect, inkRect };
}
