// Decode-runway candidate selection. kickDecodeRunwayAssets used to copy and fully sort the
// whole presentation list every poll with a comparator that recomputed the wave-runway match
// and the decode seconds for both sides, then walked the sorted copy until its start cap was
// reached. Only the first K in that order can ever start, so this keeps the K best while
// walking the list once: identical ordering (wave-matched first, then smaller decode
// seconds, ties keep the earlier list position the stable sort gave) with one evaluation per
// surviving candidate and no per-call allocation on the list.
//
// evaluate(entity, key) returns true when the entity is a start-eligible candidate and writes
// key.wave (0 wave-matched / 1 not) plus key.seconds (decode seconds); it returns false for
// anything the old loop would have skipped, in the old skip order.
//
// Same-id duplicates resolve exactly like the old pending-set walk: the sorted walk starts the
// first-sorted eligible occurrence and later occurrences hit the pending id. Per id only the
// lexicographically smallest (wave, seconds, position) occurrence may claim a slot — a better
// later occurrence supersedes a worse earlier claim, a worse-or-equal one is skipped.
//
// The returned array is shared scratch: consume it before the next call.

const _key = { wave: 0, seconds: 0 };
const _picks = [];
const _claims = new Map();
const _top = [];

export function pickDecodeRunwayCandidates(list, evaluate, maxPicks = 2) {
  _picks.length = 0;
  if (!Array.isArray(list) || list.length === 0 || !(maxPicks > 0)) return _picks;
  _claims.clear();
  _top.length = 0;
  const cap = Math.floor(maxPicks);
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!evaluate(entity, _key)) continue;
    const w = _key.wave;
    const d = _key.seconds;
    const claim = _claims.get(entity.id);
    if (claim) {
      const earlier = w < claim.w || (w === claim.w && d < claim.d);
      if (!earlier) continue;
      // The superseded occurrence drops out of the picked prefix entirely: in the old
      // walk it sorted behind this occurrence and was filtered by the pending id.
      const held = topIndexOf(_top, claim.entity);
      if (held !== -1) _top.splice(held, 1);
      claim.entity = entity;
      claim.w = w;
      claim.d = d;
    } else {
      _claims.set(entity.id, { entity, w, d });
    }
    // Bounded insertion into the top-K prefix — strictly-better comparison so equal
    // keys keep the earlier list position the stable sort gave.
    let pos = _top.length;
    while (pos > 0) {
      const t = _top[pos - 1];
      if (w < t.w || (w === t.w && d < t.d)) pos -= 1;
      else break;
    }
    if (pos < cap) {
      _top.splice(pos, 0, { entity, w, d });
      if (_top.length > cap) _top.length = cap;
    }
  }
  for (let i = 0; i < _top.length; i++) _picks.push(_top[i].entity);
  return _picks;
}

function topIndexOf(top, entity) {
  for (let i = 0; i < top.length; i++) {
    if (top[i].entity === entity) return i;
  }
  return -1;
}
