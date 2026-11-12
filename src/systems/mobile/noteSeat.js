// MOB-03 — where a phone caption or toast sits so it never lands on the control cluster, the tether
// reel, the dock key or the powers handle, in either hand and at any --mf-scale.
// Pure geometry: the view measures the note's natural seat (CSS) and the live blockers, and this
// answers with a seat that clears them, or null when the natural seat is already clear.

const hits = (a, b, gap) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
const box = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });

/**
 * @param {{vw:number, vh:number, note:{left:number, top:number, w:number, h:number},
 *   blockers:Array<{left:number, top:number, right:number, bottom:number}>,
 *   margin?:{left:number, right:number, top:number, bottom:number}, gap?:number}} input
 * @returns {null | {left:number, top:number, maxWidth:number}}
 */
export function seatNote({ vw, vh, note, blockers, margin = { left: 14, right: 14, top: 8, bottom: 8 }, gap = 8 }) {
  const live = (blockers || []).filter((b) => b && b.right - b.left > 1 && b.bottom - b.top > 1);
  const at = (left, top, w = note.w) => box(left, top, w, note.h);
  const clear = (r) => !live.some((b) => hits(r, b, gap));
  if (clear(at(note.left, note.top))) return null;
  const inside = (r) => r.left >= margin.left - 0.5 && r.right <= vw - margin.right + 0.5 && r.top >= margin.top - 0.5 && r.bottom <= vh - margin.bottom + 0.5;
  const natural = at(note.left, note.top);

  // Lift: the nearest row (just above or just below a blocker) where the note's column is clear.
  const rows = () => live.flatMap((b) => [Math.round(b.top - gap - note.h), Math.round(b.bottom + gap)])
    .sort((x, y) => Math.abs(x - note.top) - Math.abs(y - note.top));
  const lift = () => {
    for (const top of rows()) {
      const r = at(note.left, top);
      if (inside(r) && clear(r)) return { left: note.left, top, maxWidth: note.w };
    }
    return null;
  };
  // Slide: along its own row to the free side of the blockers it crosses, narrowing to fit.
  const slide = () => {
    const row = live.filter((b) => b.top - gap < natural.bottom && b.bottom + gap > natural.top);
    const rightEdge = Math.max(margin.left, ...row.filter((b) => b.right <= vw / 2 + 1).map((b) => b.right + gap));
    const leftEdge = Math.min(vw - margin.right, ...row.filter((b) => b.left >= vw / 2 - 1).map((b) => b.left - gap));
    // Free span between the blockers on the left and the blockers on the right of this row.
    const span = leftEdge - rightEdge;
    if (span < 160) return null;
    const w = Math.min(note.w, span);
    const left = Math.round(Math.min(Math.max(note.left, rightEdge), leftEdge - w));
    const r = at(left, note.top, w);
    return inside(r) && clear(r) ? { left, top: note.top, maxWidth: Math.round(w) } : null;
  };
  const portrait = vh > vw;
  const order = portrait ? [lift, slide] : [slide, lift];
  for (const attempt of order) { const seat = attempt(); if (seat) return seat; }
  // Nothing clean: the row that covers the least key area, rather than sit on a key.
  const covered = (r) => live.reduce((sum, b) => sum + Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left))
    * Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)), 0);
  const best = rows().map((top) => at(note.left, top)).filter(inside).sort((x, y) => covered(x) - covered(y))[0];
  return best ? { left: best.left, top: best.top, maxWidth: note.w } : { left: note.left, top: Math.max(margin.top, note.top), maxWidth: note.w };
}
