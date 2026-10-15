// Weapon clips for the armory reading pane.
//
// CONVENTION: a recorded firing pass for a fitting lands at
// `assets/weapons/clips/<defId>.mp4` (e.g. `wpn_autocannon_m.mp4`). A naming convention is not
// evidence that a recording shipped, so this release manifest is the admission point for media
// requests. The pane keeps its equipment schematic until an authored file and this entry land.
// No armory firing recording ships with the game today.
export const WEAPON_CLIP_MANIFEST = Object.freeze({});

export function weaponClipUrl(defId) {
  if (typeof defId !== 'string' || !defId) return null;
  if (!/^[a-z0-9_]+$/i.test(defId)) return null;
  const file = WEAPON_CLIP_MANIFEST[defId];
  if (typeof file !== 'string' || !file) return null;
  try {
    return new URL('../../assets/' + file, import.meta.url).href;
  } catch {
    return 'assets/' + file;
  }
}
