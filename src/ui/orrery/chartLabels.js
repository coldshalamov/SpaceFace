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

/** Does the segment pass within the disc (radius + pad)? */
function segmentHitsDisc(x1, y1, x2, y2, d, pad = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((d.x - x1) * dx + (d.y - y1) * dy) / L2)) : 0;
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const r = d.r + pad;
  return (d.x - px) ** 2 + (d.y - py) ** 2 < r * r;
}

function segmentsCross(a, b) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const o1 = o(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = o(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = o(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = o(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o3 !== 0;
}

/** Distance from a segment to another (0 when they cross): two leaders may not run on one line. */
function segmentsNear(a, b, gap) {
  if (segmentsCross(a, b)) return true;
  const pd = (px, py, s) => {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L2)) : 0;
    return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
  };
  return Math.min(pd(a.x1, a.y1, b), pd(a.x2, a.y2, b), pd(b.x1, b.y1, a), pd(b.x2, b.y2, a)) < gap;
}

function rectDiscGap(rect, disc) {
  const cx = Math.max(rect.x, Math.min(disc.x, rect.x + rect.width));
  const cy = Math.max(rect.y, Math.min(disc.y, rect.y + rect.height));
  return Math.max(0, Math.hypot(disc.x - cx, disc.y - cy) - disc.r);
}

function leaderSegments(L) {
  const out = [{ x1: L.sx, y1: L.sy, x2: L.ex, y2: L.ey }];
  if (Math.hypot(L.lx - L.ex, L.ly - L.ey) > 0.5) out.push({ x1: L.ex, y1: L.ey, x2: L.lx, y2: L.ly });
  return out;
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
    if (!c.rimOnly) {
      // down the pool's middle first, then either side of it (a big pool has room off its centre)
      [0, -0.36, 0.36, -0.58, 0.58].forEach((u, j) => {
        for (const k of [0.34, 0.5, 0.2, 0.66, 0.08, 0.82, 0.42, 0.58, 0.74]) {
          const top = d.y - d.r + 10 + (d.r * 2 - h - 20) * k;
          seats.push({ x: d.x + u * d.r - w / 2, y: top, cost: k * 10 + j * 4, side: 'inside' });
        }
      });
    }
    if (!c.rimLeader) return seats;
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
    // above or below, set flush to one side of the mark (room at a chart's edge)
    { x: ax - w + 10, y: ay - e - h, cost: 8, side: 'above' },
    { x: ax - 10, y: ay - e - h, cost: 8.5, side: 'above' },
    { x: ax - w + 10, y: ay + e, cost: 9, side: 'below' },
    { x: ax - 10, y: ay + e, cost: 9.5, side: 'below' },
  ];
  if (!c.leaderOnly && !c.inside) seats.push(...near);
  // a pool too small for its name hangs it off its rim (never from inside the pool)
  const RL = c.inside && c.rimLeader ? Math.max(R, c.inside.r) : R;
  const rimCost = c.inside && c.rimLeader ? 24 : 0;
  // Leaders: out of the mark on a diagonal (or level east/west), elbow, then 10 px flat into the words.
  const dirs = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0]];
  const lengths = (c.leaderOnly ? [24, 44, 64, 88, 116, 148, 184, 220] : [24, 40, 58, 80, 104]).filter((L) => L <= maxLeader);
  for (const L of lengths) {
    dirs.forEach(([dx, dy], i) => {
      const ux = dy ? dx * DIAG : dx;
      const uy = dy ? dy * DIAG : 0;
      const sx = ax + ux * (RL + 2);
      const sy = ay + uy * (RL + 2);
      const ex = ax + ux * (RL + 2 + L);
      const ey = ay + uy * (RL + 2 + L);
      const lx = ex + dx * 10;
      const x = dx > 0 ? lx + 3 : lx - 3 - w;
      const y = ey - h / 2;
      seats.push({
        x, y, cost: 12 + rimCost + L * 0.35 + i * 0.6, side: 'leader',
        leader: { sx, sy, ex, ey, lx, ly: ey },
      });
    });
    // straight up or down out of the mark, the words hung level off the leader's end
    for (const dy of [1, -1]) {
      const sy = ay + dy * (RL + 2);
      const ey = ay + dy * (RL + 2 + L);
      const y = dy > 0 ? ey + 3 : ey - 3 - h;
      [[ax - w / 2, 0]].forEach(([x, k]) => {
        seats.push({ x, y, cost: 16 + rimCost + L * 0.35 + k * 0.6, side: 'leader', leader: { sx: ax, sy, ex: ax, ey, lx: ax, ly: ey } });
      });
    }
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
  // names a block may cover at a price (they give way on the next frame) rather than never
  const soft = (env.soft || []).filter(Boolean);
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
  const anchorDiscs = list.map((c) => ({ id: c.id, x: c.x, y: c.y, r: Math.max(2, Number(c.anchorRadius) || 2) - 1, area: !!c.area }));
  const occupied = reserved.slice();
  const placedLeaders = [];
  // where each laid leader ends: no other name may stand nearer that end than its own words
  const placedEnds = [];
  const out = [];
  for (const c of list) {
    const { _i, ...pub } = c;
    if (!eligible(c) || !Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      out.push({ ...pub, visible: false, reason: 'suppressed' });
      continue;
    }
    // a second way to name a mark (a pool's name off its rim) stands down when the first one seated
    if (c.unlessPlaced && out.some((o) => o.visible && o.id === c.unlessPlaced)) {
      out.push({ ...pub, visible: false, reason: 'named' });
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
      if (seat.side === 'inside' && !rectInsideDisc(rect, c.inside, 8)) bad += 4;
      // a leader off a pool's rim leaves where that rim is drawn (a merged rim is not drawn inside
      // its neighbours)
      if (c.rimOnly && seat.leader && Array.isArray(c.rimHidden)
        && c.rimHidden.some((o) => Math.hypot(seat.leader.sx - o.x, seat.leader.sy - o.y) < o.r - 1)) bad += 4;
      if (c.rimOnly && seat.leader && c.rimClip && c.rimClip.r > 0
        && Math.hypot(seat.leader.sx - c.rimClip.x, seat.leader.sy - c.rimClip.y) > c.rimClip.r) bad += 4;
      // a name that belongs inside a ring (a region of the sector) stays inside it
      if (c.within && c.within.r > 0 && !rectInsideDisc(rect, c.within, Number(c.within.clear) || 12)) bad += 4;
      for (const o of occupied) if (rectsOverlap(rect, o, gap)) { bad += 3; break; }
      for (const d of anchorDiscs) {
        if (rectDiscOverlap(rect, d, 1)) { bad += 3; break; }
      }
      for (const d of discs) if (rectDiscOverlap(rect, d, 2)) { bad += 2; break; }
      for (const ring of rings) {
        if (seat.side === 'inside' && ring.x === c.inside.x && ring.y === c.inside.y && ring.r === c.inside.r) continue;
        if (!rectCrossesRing(rect, ring)) continue;
        // a hard ring (the sector's gate ring) is never crossed; a soft one (a pool's rim) only when
        // nothing near the mark keeps clear of it
        if (ring.hard) { bad += 2; break; }
        cost += 30;
      }
      for (const s of segments) if (segmentHitsRect(s.x1, s.y1, s.x2, s.y2, rect)) cost += 5;
      for (const o of soft) {
        if (rectsOverlap(rect, o, 6)) cost += 40;
        if (seat.leader && leaderSegments(seat.leader).some((sg) => segmentHitsRect(sg.x1, sg.y1, sg.x2, sg.y2, o))) cost += 20;
      }
      // a mark that stands on a ring (a gate on the sector's gate ring) names itself on the outside
      if (c.outsideOf && Math.hypot(rect.x + w / 2 - c.outsideOf.x, rect.y + h / 2 - c.outsideOf.y) < c.outsideOf.r) cost += 60;
      // words may not crowd the end of another name's leader (its end reads as pointing at them)
      for (const pe of placedEnds) if (rectDiscGap(rect, { x: pe.x, y: pe.y, r: 0 }) < pe.gap + 8) { bad += 1; break; }
      // words may not lie across a leader already laid
      for (const ls of placedLeaders) if (segmentHitsRect(ls.x1, ls.y1, ls.x2, ls.y2, { x: rect.x - 2, y: rect.y - 2, width: rect.width + 4, height: rect.height + 4 })) { bad += 2; break; }
      if (seat.leader) {
        const segs = leaderSegments(seat.leader);
        // a leader ends on its own mark: it may not run through another label, over another mark's
        // disc, or on (or across) another leader's line
        let hit = false;
        for (const sg of segs) {
          for (const o of occupied) if (segmentHitsRect(sg.x1, sg.y1, sg.x2, sg.y2, o)) { hit = true; break; }
          if (hit) break;
          for (const d of anchorDiscs) {
            if (d.id === c.id) continue;
            if (d.area) {
              // an area (a field) may be crossed where nothing else serves, never started in
              if (segmentHitsDisc(sg.x1, sg.y1, sg.x2, sg.y2, d, 2)) cost += 16;
              if (Math.hypot(seat.leader.sx - d.x, seat.leader.sy - d.y) < d.r + 4) { hit = true; break; }
              continue;
            }
            if (segmentHitsDisc(sg.x1, sg.y1, sg.x2, sg.y2, d, 6)) { hit = true; break; }
          }
          if (hit) break;
          for (const d of discs) {
            if (Math.hypot(d.x - c.x, d.y - c.y) < 1.5) continue;
            if (segmentHitsDisc(sg.x1, sg.y1, sg.x2, sg.y2, d, 5)) { hit = true; break; }
          }
          if (hit) break;
          for (const ls of placedLeaders) if (segmentsNear(sg, ls, 6)) { hit = true; break; }
          if (hit) break;
          // a leader that crosses a lane costs its length again: a short seat beside the mark wins
          for (const s of segments) if (segmentsCross(sg, s)) cost += 10;
        }
        if (hit) bad += 2;
        // the leader's end points at its own words: no name already down stands as near it
        const endGap = rectDiscGap(rect, { x: seat.leader.lx, y: seat.leader.ly, r: 0 });
        for (const o of occupied) if (rectDiscGap(o, { x: seat.leader.lx, y: seat.leader.ly, r: 0 }) < endGap + 8) { bad += 1; break; }
      } else if (seat.side !== 'inside' && !c.leaderOnly) {
        // words set against a mark must sit nearer their own mark than any other, or they take a leader
        const own = rectDiscGap(rect, { x: c.x, y: c.y, r: Math.max(2, Number(c.anchorRadius) || 2) });
        // an area (a field) owns a wide rim: its words need only sit clearly nearer it than any mark
        const margin = c.area ? 4 : 5;
        let rival = false;
        for (const d of anchorDiscs) {
          if (d.id === c.id || Math.hypot(d.x - c.x, d.y - c.y) < 1.5) continue;
          if (rectDiscGap(rect, d) < own + margin) { rival = true; break; }
        }
        if (!rival) {
          for (const d of discs) {
            if (Math.hypot(d.x - c.x, d.y - c.y) < 1.5) continue;
            if (rectDiscGap(rect, d) < own + margin) { rival = true; break; }
          }
        }
        if (rival) bad += 1;
      }
      if (env.prefer && Math.abs(rect.x - env.prefer.x) < 2 && Math.abs(rect.y - env.prefer.y) < 2) cost -= 30;
      if (!bad) {
        if (!best || cost < best.cost) best = { ...seat, rect, cost };
      } else if (!fallback || bad * 100 + cost < fallback.score) {
        fallback = { ...seat, rect, cost, score: bad * 100 + cost };
      }
    }
    }
    const pick = best || ((c.objective || c.selected || c.force) ? fallback : null);
    if (!pick) {
      out.push({ ...pub, visible: false, reason: 'collision' });
      continue;
    }
    const placement = { ...pub, ...pick.rect, side: pick.side, visible: true };
    if (Array.isArray(pick.lines)) placement.lines = pick.lines;
    if (pick.nameLines) placement.nameLines = pick.nameLines;
    if (pick.leader) {
      placement.leader = pick.leader;
      placedLeaders.push(...leaderSegments(pick.leader));
      placedEnds.push({ x: pick.leader.lx, y: pick.leader.ly, gap: rectDiscGap(pick.rect, { x: pick.leader.lx, y: pick.leader.ly, r: 0 }) });
    }
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
