// INF-045 — the world-space target-mark SUBJECT POLICY: who gets a mark in the world.
//
// This file owns the rule and nothing else. The art is `selectionSigil.js` (the ORRERY selection
// sigil), which supersedes INF-045's single flat ring. Keeping the rule here — rather than letting
// the new art module re-derive it — is what guarantees the world marker, the DOM lock bracket and
// the target panel can never start telling the player different stories about what is locked.
//
// The rule: the live SELECTION wins, because selection is also what aims a Massline throw. The
// engaged gun target only subjects when there is no live selection, so the guns never fire at a
// ship with no mark anywhere in the world. Dead or positionless bodies never subject.

import { isHostileToPlayer } from '../systems/scanner.js';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';

/**
 * The live subject entity, or null when nothing is marked. Consumers that must CLASSIFY the subject
 * — the selection sigil's emblem and palette — resolve here rather than re-deriving the rule.
 *
 * @returns {object|null} the live selection, else the engaged contact, else null.
 */
export function resolveTargetContourEntity(state) {
  const player = (state && state.player) || null;
  const entities = state && state.entities;
  if (!player || !entities || typeof entities.get !== 'function') return null;
  const selId = player.targetId != null ? player.targetId : null;
  const selection = selId != null ? resolveWorldPresentationEntity(state, selId) : null;
  const liveSelection = selection && selection.alive && selection.pos ? selection : null;
  if (liveSelection) return liveSelection;
  const gunId = player.gunTargetId != null && player.gunTargetId !== selId ? player.gunTargetId : null;
  const engagedCandidate = gunId != null ? entities.get(gunId) : null;
  return engagedCandidate && engagedCandidate.alive && engagedCandidate.pos ? engagedCandidate : null;
}

/**
 * Flat world-space subject, for callers that only need a position and a hostile read. Mirrors the
 * target panel's engagedContactReadout subject rule without touching the DOM.
 *
 * @returns {{id, x, z, radius, hostile}|null} world-space subject, or null when unmarked.
 */
export function resolveTargetContour(state) {
  const subject = resolveTargetContourEntity(state);
  if (!subject) return null;
  return {
    id: subject.id,
    x: subject.pos.x,
    z: subject.pos.z,
    radius: Math.max(2, Number(subject.radius) || 6),
    hostile: isHostileToPlayer(subject, state.player.team, state),
  };
}
