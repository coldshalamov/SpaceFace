// Decode-runway candidate selection. kickDecodeRunwayAssets used to copy and fully sort the
// whole presentation list every poll with a comparator that recomputed the wave-runway match
// and the decode seconds for both sides, then walked the sorted copy until two eligible
// entities had started. Only the first two in that order can ever start, so this keeps the two
// best while walking the list once: identical ordering (wave-matched first, then smaller decode
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

export function pickDecodeRunwayCandidates(list, evaluate) {
  _picks.length = 0;
  if (!Array.isArray(list) || list.length === 0) return _picks;
  _claims.clear();
  let e0 = null;
  let w0 = 0;
  let d0 = 0;
  let e1 = null;
  let w1 = 0;
  let d1 = 0;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!evaluate(entity, _key)) continue;
    const w = _key.wave;
    const d = _key.seconds;
    const claim = _claims.get(entity.id);
    if (claim) {
      const earlier = w < claim.w || (w === claim.w && d < claim.d);
      if (!earlier) continue;
      // The superseded occurrence drops out of the picked pair entirely: in the old walk it
      // sorted behind this occurrence and was filtered by the pending id.
      if (claim.entity === e0) {
        e0 = e1; w0 = w1; d0 = d1;
        e1 = null;
      } else if (claim.entity === e1) {
        e1 = null;
      }
      claim.entity = entity;
      claim.w = w;
      claim.d = d;
    } else {
      _claims.set(entity.id, { entity, w, d });
    }
    if (e0 === null || w < w0 || (w === w0 && d < d0)) {
      e1 = e0; w1 = w0; d1 = d0;
      e0 = entity; w0 = w; d0 = d;
    } else if (e1 === null || w < w1 || (w === w1 && d < d1)) {
      e1 = entity; w1 = w; d1 = d;
    }
  }
  if (e0) _picks.push(e0);
  if (e1) _picks.push(e1);
  return _picks;
}
