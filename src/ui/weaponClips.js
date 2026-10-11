// Weapon clips for the armory reading pane.
//
// CONVENTION: a recorded firing pass for a fitting lands at
// `assets/weapons/clips/<defId>.mp4` (e.g. `wpn_autocannon_m.mp4`). The reader tries the
// clip and falls back to the equipment schematic when no file is there yet, so clips light
// up the moment they land with no further UI work. No clip ships with the game today — the
// pane reads exactly as before until the recordings arrive.
export function weaponClipUrl(defId) {
  if (typeof defId !== 'string' || !defId) return null;
  if (!/^[a-z0-9_]+$/i.test(defId)) return null;
  const file = 'weapons/clips/' + defId + '.mp4';
  try {
    return new URL('../../assets/' + file, import.meta.url).href;
  } catch {
    return 'assets/' + file;
  }
}
