// PQ-205.02 — the mine-layer wake is the pursuit-lane bomb doctrine.
// Policy only: the doctrine owns WHEN (wake_mines telegraph, then mine_drop). This module calls
// the existing bombs.drop / commandDetonate verbs. It does not copy fuze, cooldown, blast, or
// field code. Ammunition stays with the bombs owner (NPC drops bypass the player rack).

export const NPC_BOMB_PAYLOAD_ID = 'bomb_frag';
export const NPC_BOMB_DROP_PHASE = 'mine_drop';

function liveOwnedBomb(state, ownerId) {
  if (!state || ownerId == null) return null;
  const index = state.entityIndex;
  const list = index?.__spacefaceEntityIndexV1 && Array.isArray(index.bombs)
    ? index.bombs
    : state.entityList;
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.alive === false || e.type !== 'bomb' || !e.data) continue;
    if (e.data.ownerId !== ownerId) continue;
    if (e.data.phase === 'spent') continue;
    return e;
  }
  return null;
}

/**
 * One telegraphed pass: drop a frag cassette across the chase lane, then command its fuze
 * once it has armed. Returns the verb that landed this call, or null.
 */
export function applyNpcBombMirror({ state, entity, doctrinePhase, bombs } = {}) {
  if (!state || !entity || entity.alive === false) return null;
  if (doctrinePhase !== NPC_BOMB_DROP_PHASE) return null;
  if (!bombs || typeof bombs.drop !== 'function' || typeof bombs.commandDetonate !== 'function') {
    return null;
  }
  const owned = liveOwnedBomb(state, entity.id);
  if (!owned) {
    const bomb = bombs.drop(entity, NPC_BOMB_PAYLOAD_ID, state);
    if (bomb) {
      return Object.freeze({
        verb: 'drop',
        bombId: bomb.id,
        payloadId: NPC_BOMB_PAYLOAD_ID,
        ownerId: entity.id,
      });
    }
  }
  const count = bombs.commandDetonate(entity.id, state);
  if (count > 0) {
    return Object.freeze({
      verb: 'command',
      count,
      ownerId: entity.id,
    });
  }
  return null;
}
