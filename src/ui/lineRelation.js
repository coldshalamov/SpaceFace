// Ruling R12 (design/overhaul/03_COMBAT.md §2.1, owner 2026-11-18): the rope never refuses — the aim tag
// says who will move. "When you're small the tether makes you swing around THEM… when you play a huge
// ship… YOU PULL THEM." The physics owner (Rapier rope joint) already behaves this way; this word only
// makes it readable, and it is the one owner of that word for every presenter (the Massline bracket and
// the mouse hover tag).
//
//   TOW     the body is no heavier than you: it swings round you; drag it, whip it, throw it.
//   TUG     up to (not including) three times your mass: both move; the stronger thrust wins.
//   ANCHOR  three times your mass or more, or bolted down: you swing round it; reel in and you zip to it.
//
// Mass truth is the physics body's own (`physicsBody.mass`, or `bodyMassT` / `fixedBody` mirrored from the
// sim worker by scripts/lib/simWorkerHost.mjs → simReadModel.mjs), falling back to the nominal `mass`.

export const LINE_RELATION_ANCHOR_RATIO = 3;

function positive(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }

export function lineBodyMassT(entity) {
  if (!entity) return 0;
  const body = entity.physicsBody;
  return positive(body && body.mass) || positive(entity.bodyMassT) || positive(entity.mass);
}

export function lineBodyFixed(entity) {
  if (!entity) return false;
  // A live body's own dynamic flag outranks a mirrored fixedBody (a released body must stop reading ANCHOR).
  const body = entity.physicsBody;
  if (body && typeof body.dynamic === 'boolean') return body.dynamic === false;
  return entity.fixedBody === true;
}

/** The player's own body mass in tonnes, from the live entity (sim state or presentation row); 0 if unknown. */
export function linePlayerMassT(state) {
  const p = (state && state.entities && typeof state.entities.get === 'function' && state.entities.get(state.playerId))
    || (state && state.player) || null;
  return lineBodyMassT(p);
}

/** One short game-voice sentence for what a relation word means for handling; '' for no word.
 *  ANCHOR splits on the body: a fixed one never moves; a heavy loose one moves, slowly. */
export function lineHandlingAdvice(word, entity = null) {
  if (word === 'TOW') return 'It trails you: build speed under control, then release.';
  if (word === 'TUG') return 'It drags you as much as you drag it: build speed slowly, then release.';
  if (word === 'ANCHOR') {
    return lineBodyFixed(entity) ? 'It will not move: you swing round it.'
      : 'It outweighs you many times over: it moves slowly while you swing round it. Pull steadily, release early.';
  }
  return '';
}

/** 'TOW' | 'TUG' | 'ANCHOR', or '' when either mass is unknown. */
export function lineRelationWord(entity, playerMass) {
  const selfMass = positive(playerMass);
  if (!entity || !(selfMass > 0)) return '';
  if (lineBodyFixed(entity)) return 'ANCHOR';
  const targetMass = lineBodyMassT(entity);
  if (!(targetMass > 0)) return '';
  if (targetMass <= selfMass) return 'TOW';
  if (targetMass < selfMass * LINE_RELATION_ANCHOR_RATIO) return 'TUG';
  return 'ANCHOR';
}
