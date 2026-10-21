// RC-32: rocks have names, not "AST-355". A miner's register — two short words hashed
// off the stable asteroid id, so the same rock reads the same name every session and
// no randomness or save key ever enters the picture. The id stays the canonical key
// everywhere else; this is only how the site HUD speaks the rock.

const FIRST = [
  'Grey', 'Iron', 'Hollow', 'Quiet', 'Sour', 'Old', 'Cold', 'Broken', 'Lucky', 'Red',
  'Pale', 'Bitter', 'Dry', 'Blind', 'Salt', 'Dull', 'Hard', 'Slow', 'Dead', 'Low',
];

const SECOND = [
  'Molar', 'Anvil', 'Widow', 'Crown', 'Debt', 'Tooth', 'Bell', 'Anchor', 'Spine', 'Knuckle',
  'Ledge', 'Prayer', 'Coffin', 'Hearth', 'Shard', 'Mule', 'Bishop', 'Lantern', 'Drum', 'Fist',
];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rockName(asteroidId) {
  if (asteroidId == null) return 'Nameless Rock';
  const h = fnv1a(String(asteroidId));
  return `${FIRST[h % FIRST.length]} ${SECOND[(h >>> 8) % SECOND.length]}`;
}
