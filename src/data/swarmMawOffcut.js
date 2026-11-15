// PRI-11c — what the Maw leaves. When the round-five champion dies, ONE of the ordinary
// boss chunks the aftermath owner already spawns is re-authored as a hand-sized offcut:
// small enough to be a wall you can hide behind and light enough to throw. It is an
// ordinary dynamic wreck body in every other way — the arena's own cull owns its life.
// `keepThroughWave` is the whole promise: the wave cull skips it while the authored
// round-six room runs, then it releases through the same despawnAt sweep as every wreck.
export const SWARM_MAW_OFFCUT = Object.freeze({
  radius: 7,
  mass: 35,
  keepThroughWave: 6,
});
export const SWARM_MAW_OFFCUT_TAG = 'swarmMawOffcut';
