// Row 490 (CRAFT-READ): each enemy silhouette family owns one engine-glow colour, so a stranger
// reads the role at burn distance — not through a red ring. Keys are the `silhouette` ids carried
// on enemy defs (src/data/enemies.js) and consumed by ENEMY_FAMILY_BUILDERS
// (src/render/visualFactory.js). Hull paint stays faction; only the drive glow carries the role.
export const ENEMY_SILHOUETTE_ENGINE_GLOW = Object.freeze({
  drone_swarm: '#ffb340',        // pack burn — hot amber
  sniper_lance: '#b78cff',       // standoff lance — cold violet
  bruiser_armor: '#ff5a3c',      // armor mass — ember red
  trader_haul: '#8fd48a',        // cargo — worklight green
  pirate_swoop: '#d8c84a',       // raider — grimy yellow
  corsair_blade: '#ff4a6e',      // blade — hot magenta
  patrol_interdict: '#7fb4ff',   // law — patrol blue
  dreadnought_enemy: '#d63b2f',  // capital — deep red
  detonator_dart: '#ff8a2a',     // the fuse — lit orange
  last_argument: '#d63b2f',
  kilnback: '#ff6a3d',
  mothlight: '#cfe8a0',
  pallet_jack: '#e8c46a',
  iron_kraken: '#85d0da',       // siphon drive — cold machine teal, not a burn
});

export function engineGlowForSilhouette(id) {
  if (id == null) return null;
  return ENEMY_SILHOUETTE_ENGINE_GLOW[String(id)] || null;
}
