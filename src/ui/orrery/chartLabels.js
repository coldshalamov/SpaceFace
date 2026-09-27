// src/ui/orrery/chartLabels.js — the Chart's anchored label placer (ORRERY §4 #7, Leader Callout).
//
// Every name on the chart is anchored: it sits within a few pixels of its mark, or it is joined to
// the mark by a leader of light (out of the mark at 45 degrees, then flat into the words). A label
// never covers a mark, never sits across a ring the chart draws (the sector's gate ring, a pool's
// rim) and never leaves the clear field; a label that cannot be seated within reach of its mark is
// held back (it shows when the mark is reached for) rather than drifting to wherever there is room.
//
// Pure geometry: no DOM, no canvas. Deterministic: priority, then id, own the order.

const NEAR_GAP = 4;

function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function rectDiscOverlap(rect, disc, gap = 0) {
  const cx = Math.max(rect.x, Math.min(disc.x, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(disc.y, rect.y + rect.height));
  const r = disc.r + gap;
  return (disc.x - cx) ** 2 + (disc.y - cy) ** 2 < r * r;
}

function rectInside(rect, bounds, inset = 0) {
  return rect.x >= bounds.x + inset && rect.y >= bounds.y + inset
    && rect.x + rect.width <= bounds.x + bounds.width - inset
    && rect.y + rect.height <= bounds.y + bounds.height - inset;
}

function rectInsideDisc(rect, disc, inset = 0) {
  const r = disc.r - inset;
  if (!(r > 0)) return false;
  for (const [px, py] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]) {
    if ((px - disc.x) ** 2 + (py - disc.y) ** 2 > r * r) return false;
  }
  return true;
}

/** Does the rect lie across the ring's drawn stroke (with `clear` px either side)? */
function rectCrossesRing(rect, ring) {
  const c = Number.isFinite(ring.clear) ? ring.clear : 8;
  const nx = Math.max(rect.x, Math.min(ring.x, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(ring.y, rect.y + rect.height));
  const dn = Math.hypot(ring.x - nx, ring.y - ny);
  let df = 0;
  for (const [px, py] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]) {
    df = Math.max(df, Math.hypot(px - ring.x, py - ring.y));
  }
  if (!(dn < ring.r + c && df > ring.r - c)) return false;
  const except = Array.isArray(ring.except) ? ring.except : [];
  if (!except.length) return true;
  // Merged pools draw a rim only where it is outside every other pool: sample the arc under the
  // rect and count it crossed only where the rim is actually drawn.
  const grow = { x: rect.x - c, y: rect.y - c, width: rect.width + c * 2, height: rect.height + c * 2 };
  const step = Math.max(0.01, 4 / Math.max(8, ring.r));
  for (let a = 0; a < Math.PI * 2; a += step) {
    const px = ring.x + Math.cos(a) * ring.r;
    const py = ring.y + Math.sin(a) * ring.r;
    if (px < grow.x || px > grow.x + grow.width || py < grow.y || py > grow.y + grow.height) continue;
    let hidden = false;
    for (const e of except) { if ((px - e.x) ** 2 + (py - e.y) ** 2 < (e.r - 1) ** 2) { hidden = true; break; } }
    if (!hidden) return true;
  }
  return false;
}

function segmentHitsRect(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.width - x1, y1 - r.y, r.y + r.height - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) { if (q[i] < 0) return false; } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

const DIAG = Math.SQRT1_2;

/**
 * Every seat a label of (w, h) may take around an anchor of radius R: the near seats (the words
 * against the mark) first, then seats at the end of a leader of increasing length.
 */
function seatsFor(c, w, h, { maxLeader }) {
  const ax = c.x;
  const ay = c.y;
  const R = Math.max(2, Number(c.anchorRadius) || 2);
  const e = R + NEAR_GAP;
  const seats = [];
  if (c.inside && c.inside.r > 0) {
    // A region's name reads inside its own region, clear of its rim, near its crown.
    const d = c.inside;
    for (const k of [0.34, 0.5, 0.2, 0.66, 0.08]) {
      const top = d.y - d.r + 10 + (d.r * 2 - h - 20) * k;
      seats.push({ x: d.x - w / 2, y: top, cost: k * 10, side: 'inside' });
    }
    return seats;
  }
  const near = [
    { x: ax + e, y: ay - h / 2, cost: 0, side: 'right' },
    { x: ax - e - w, y: ay - h / 2, cost: 1, side: 'left' },
    { x: ax - w / 2, y: ay - e - h, cost: 2, side: 'above' },
    { x: ax - w / 2, y: ay + e, cost: 3, side: 'below' },
    { x: ax + e * DIAG, y: ay - e * DIAG - h, cost: 4, side: 'upper-right' },
    { x: ax + e * DIAG, y: ay + e * DIAG, cost: 5, side: 'lower-right' },
    { x: ax - e * DIAG - w, y: ay - e * DIAG - h, cost: 6, side: 'upper-left' },
    { x: ax - e * DIAG - w, y: ay + e * DIAG, cost: 7, side: 'lower-left' },
  ];
  if (!c.leaderOnly) seats.push(...near);
  // Leaders: out of the mark on a diagonal (or level east/west), elbow, then 10 px flat into the words.
  const dirs = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0]];
  const lengths = (c.leaderOnly ? [24, 44, 64, 88, 116, 148, 184, 220] : [24, 40, 58, 80, 104]).filter((L) => L <= maxLeader);
  for (const L of lengths) {
    dirs.forEach(([dx, dy], i) => {
      const ux = dy ? dx * DIAG : dx;
      const uy = dy ? dy * DIAG : 0;
      const sx = ax + ux * (R + 2);
      const sy = ay + uy * (R + 2);
      const ex = ax + ux * (R + 2 + L);
      const ey = ay + uy * (R + 2 + L);
      const lx = ex + dx * 10;
      const x = dx > 0 ? lx + 3 : lx - 3 - w;
      const y = ey - h / 2;
      seats.push({
        x, y, cost: 12 + L * 0.35 + i * 0.6, side: 'leader',
        leader: { sx, sy, ex, ey, lx, ly: ey },
      });
    });
  }
  // A reading too big to seat beside its mark docks in a corner of the clear field, on a leader
  // that leaves the mark at 45 degrees and runs flat into the words.
  if (c.leaderOnly && c.dock) {
    const b = c.dock;
    const corners = [
      { x: b.x + 12, y: b.y + 12 }, { x: b.x + b.width - 12 - w, y: b.y + 12 },
      { x: b.x + 12, y: b.y + b.height - 12 - h }, { x: b.x + b.width - 12 - w, y: b.y + b.height - 12 - h },
    ];
    for (const k of corners) {
      const cy = k.y + h / 2;
      if (ax > k.x - 16 && ax < k.x + w + 16) {
        // the mark stands under (or over) the corner block: the leader rises straight to its edge
        const up = cy < ay;
        const sy = ay + (up ? -1 : 1) * (R + 2);
        const ey = up ? k.y + h + 3 : k.y - 3;
        if ((up && ey >= sy) || (!up && ey <= sy)) continue;
        seats.push({ x: k.x, y: k.y, cost: 40 + Math.abs(cy - ay) * 0.06, side: 'dock', leader: { sx: ax, sy, ex: ax, ey, lx: ax, ly: ey } });
        continue;
      }
      const right = k.x + w / 2 >= ax;
      const edgeX = right ? k.x - 3 : k.x + w + 3;
      const dy = cy - ay;
      const room = Math.abs(edgeX - ax) - R - 12;
      if (room <= 0) continue;
      const diag = Math.min(Math.abs(dy), room);
      const ux = right ? 1 : -1;
      const uy = Math.sign(dy) || -1;
      const sx = ax + ux * (R + 2) * DIAG;
      const sy = ay + uy * (R + 2) * DIAG;
      const ex = sx + ux * diag;
      const ey = sy + uy * diag;
      // when the corner is steeper than 45 degrees the flat run starts from the elbow's level
      seats.push({
        x: k.x, y: Math.abs(dy) > room ? ey - h / 2 : k.y, cost: 40 + Math.hypot(k.x - ax, cy - ay) * 0.06, side: 'dock',
        leader: { sx, sy, ex, ey, lx: edgeX, ly: ey },
      });
    }
  }
  return seats;
}

/**
 * Place the chart's labels. `candidates` carry { id, x, y, anchorRadius, width, height, ...}; the
 * result is one placement per candidate, in priority order, with { x, y, width, height, visible,
 * leader? } added — the shape layoutMapLabels returns, plus the leader when the label hangs off one.
 *
 * env: bounds (the clear field), reserved (rects: chrome, crests, anything painted outside the
 * solver), discs (marks and wells a label may not cover — every candidate's own anchor is added),
 * rings (strokes a label may not lie across: { x, y, r, clear, except }), segments (lanes: a label
 * lying on one costs more), priorityOf / eligible (the chart's own label policy), maxLeader.
 */
export function placeChartLabels(candidates, env = {}) {
  const bounds = env.bounds || { x: 0, y: 0, width: 1e5, height: 1e5 };
  const reserved = (env.reserved || []).filter(Boolean).map((r) => ({ x: +r.x || 0, y: +r.y || 0, width: +r.width || 0, height: +r.height || 0 }));
  const discs = (env.discs || []).filter((d) => d && Number.isFinite(d.x) && Number.isFinite(d.y) && d.r > 0);
  const rings = (env.rings || []).filter((r) => r && r.r > 0);
  const segments = env.segments || [];
  const priorityOf = typeof env.priorityOf === 'function' ? env.priorityOf : (c) => Number(c.priority) || 0;
  const eligible = typeof env.eligible === 'function' ? env.eligible : () => true;
  const maxLeader = Number.isFinite(env.maxLeader) ? env.maxLeader : 60;
  const gap = Number.isFinite(env.gap) ? env.gap : 3;

  const list = (candidates || []).map((c, i) => ({
    ...c,
    id: String(c && c.id != null ? c.id : `label-${i}`),
    text: String(c && c.text || '').replace(/\s+/g, ' ').trim(),
    priority: Number.isFinite(c && c.priority) ? c.priority : priorityOf(c),
    _i: i,
  })).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id) || a._i - b._i);

  // Every candidate's own mark is an obstacle for every label (its own included: words beside a
  // mark, never over it).
  const anchorDiscs = list.map((c) => ({ id: c.id, x: c.x, y: c.y, r: Math.max(2, Number(c.anchorRadius) || 2) - 1 }));
  const occupied = reserved.slice();
  const out = [];
  for (const c of list) {
    const { _i, ...pub } = c;
    if (!eligible(c) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      out.push({ ...pub, visible: false, reason: 'suppressed' });
      continue;
    }
    let best = null;
    let fallback = null;
    // a label may carry alternative shapes (a two-word name set on two lines) for a crowded chart
    const shapes = [{ width: c.width, height: c.height, lines: c.lines, extra: 0 }]
      .concat((Array.isArray(c.alts) ? c.alts : []).map((a, i) => ({ ...a, extra: 6 + i * 4 })));
    for (const shape of shapes) {
    const w = Math.max(12, Math.ceil(Number(shape.width) || 0));
    const h = Math.max(10, Math.ceil(Number(shape.height) || 12));
    for (const seat0 of seatsFor(c, w, h, { maxLeader: Number.isFinite(c.maxLeader) ? c.maxLeader : (c.objective ? Math.max(maxLeader, 80) : maxLeader) })) {
      const seat = { ...seat0, cost: seat0.cost + shape.extra, lines: shape.lines, nameLines: shape.nameLines };
      const rect = { x: seat.x, y: seat.y, width: w, height: h };
      let bad = 0;
      let cost = seat.cost;
      if (!rectInside(rect, bounds, 4)) bad += 4;
      if (c.inside && !rectInsideDisc(rect, c.inside, 8)) bad += 4;
      for (const o of occupied) if (rectsOverlap(rect, o, gap)) { bad += 3; break; }
      for (const d of anchorDiscs) {
        if (rectDiscOverlap(rect, d, 1)) { bad += 3; break; }
      }
      for (const d of discs) if (rectDiscOverlap(rect, d, 2)) { bad += 2; break; }
      for (const ring of rings) {
        if (c.inside && ring.x === c.inside.x && ring.y === c.inside.y && ring.r === c.inside.r) continue;
        if (!rectCrossesRing(rect, ring)) continue;
        // a hard ring (the sector's gate ring) is never crossed; a soft one (a pool's rim) only when
        // nothing near the mark keeps clear of it
        if (ring.hard) { bad += 2; break; }
        cost += 30;
      }
      for (const s of segments) if (segmentHitsRect(s.x1, s.y1, s.x2, s.y2, rect)) cost += 5;
      // a mark that stands on a ring (a gate on the sector's gate ring) names itself on the outside
      if (c.outsideOf && Math.hypot(rect.x + w / 2 - c.outsideOf.x, rect.y + h / 2 - c.outsideOf.y) < c.outsideOf.r) cost += 20;
      if (seat.leader) {
        // a leader may not run through another label
        for (const o of occupied) {
          if (segmentHitsRect(seat.leader.sx, seat.leader.sy, seat.leader.ex, seat.leader.ey, o)) { cost += 8; break; }
        }
      }
      if (!bad) {
        if (!best || cost < best.cost) best = { ...seat, rect, cost };
      } else if (!fallback || bad * 100 + cost < fallback.score) {
        fallback = { ...seat, rect, cost, score: bad * 100 + cost };
      }
    }
    if (best) break;
    }
    const pick = best || ((c.objective || c.selected || c.force) ? fallback : null);
    if (!pick) {
      out.push({ ...pub, visible: false, reason: 'collision' });
      continue;
    }
    const placement = { ...pub, ...pick.rect, side: pick.side, visible: true };
    if (Array.isArray(pick.lines)) placement.lines = pick.lines;
    if (pick.nameLines) placement.nameLines = pick.nameLines;
    if (pick.leader) placement.leader = pick.leader;
    out.push(placement);
    occupied.push(pick.rect);
  }
  return out;
}

/** Where a block of (w, h) hangs off a mark: the same seats, the same obstacles; null if none fits. */
export function placeChartCallout(anchor, w, h, env = {}) {
  const [placed] = placeChartLabels([{ id: 'callout', x: anchor.x, y: anchor.y, anchorRadius: anchor.r || 12, width: w, height: h, leaderOnly: true, force: true, priority: 1, maxLeader: env.maxLeader || 220, dock: env.bounds || null }],
    { ...env, maxLeader: env.maxLeader || 220 });
  return placed && placed.visible ? placed : null;
}
