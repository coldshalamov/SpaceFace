// Rock regrowth — the one tunable table (WORLD slice 3, owner 2026-11-20).
//
// "When I mine asteroids they don't respawn materials instantly, but I don't want the whole galaxy
// to depopulate. Things should respawn at logical times — not like games where you move a bit to
// the left and anything that went off-screen respawns brand new." Asteroids the player has built
// in persist forever; the rest return to stock after a while, never immediately.
//
// All times are PLAY time (state.simTime seconds). Nothing regrows while the game is closed, so a
// Continue is exact. Every rule is evaluated in closed form from the ledger row's timestamps when
// the rock is next read — never ticked per rock, never re-rolled on unload.
export const ROCK_REGROWTH = Object.freeze({
  // A worked (partly mined) rock rests this long after the last cut before it starts to heal…
  quietS: 20 * 60,
  // …then refills its ore linearly over this long, back to its stock body.
  recoverS: 2 * 60 * 60,
  // A mined-out rock leaves a spent core at its slot; after this long the slot restocks to its
  // exact stock rock — applied only where the player cannot see it happen.
  restockS: 4 * 60 * 60,
  // A field never sits below this share of its stock rocks: when it would, its oldest spent
  // slots restock early (still only off-screen). The guarantee against a depopulated galaxy.
  beltFloor: 0.4,
  // The spent core is the stock body shrunk to this share of its radius: dark, worked-out, a
  // few vein glints from the fracture read — never a solid body with nothing drawn.
  coreScale: 0.42,
  // "Off-screen" for an in-sector restock or a fresh seam rock: the flight camera shows ~150 WU to
  // each side and ~100 WU ahead (measured 2026-11-21), ~250 WU during the widest flight framing;
  // 600 WU from the pilot is out of frame with margin.
  offscreenWu: 600,
});

export const ROCK_REGROWTH_POLICY_ID = 'rock.regrowth.v1';
