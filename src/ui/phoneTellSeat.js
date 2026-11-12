// Phone seating for the doctrine tell chips (MOB-08). On a phone the full chip (icon, kind word,
// hint, arrow) is wide and the deck leaves little open field, so a tell that cannot be seated clear
// of the keys, vitals, radar and callouts shrinks to its kind word, and if even that has no clear
// seat it hides: the owner's rule is nothing overlaps. Pure: the HUD passes in the placer.

export const TELL_COMPACT_SIZE = Object.freeze({ width: 84, height: 24 });

/** True when the chip rect {x,y,width,height} (centre-anchored placement) touches any rect. */
export function placementHits(placement, rects, pad = 2) {
  if (!placement) return true;
  const x = placement.x - placement.width / 2;
  const y = placement.y - placement.height / 2;
  for (const r of rects) {
    if (!r) continue;
    const w = r.width != null ? r.width : r.w;
    const h = r.height != null ? r.height : r.h;
    const rx = r.left != null ? r.left : r.x;
    const ry = r.top != null ? r.top : r.y;
    if (!(w > 1 && h > 1)) continue;
    if (x < rx + w + pad && x + placement.width > rx - pad && y < ry + h + pad && y + placement.height > ry - pad) return true;
  }
  return false;
}

/**
 * @param {(dims: {width:number,height:number}) => (object|null)} place  resolves a seat for a chip of that size
 * @param {Array} blockers  measured rects ({x,y,width,height} or {x,y,w,h})
 * @param {{width:number,height:number}} fullDims
 * @returns {{ placement: object, compact: boolean } | null}  null = no clear seat, hide the chip
 */
export function seatPhoneTell(place, blockers, fullDims) {
  const full = place(fullDims);
  if (full && !placementHits(full, blockers)) return { placement: full, compact: false };
  const small = place(TELL_COMPACT_SIZE);
  if (small && !placementHits(small, blockers)) return { placement: small, compact: true };
  return null;
}
