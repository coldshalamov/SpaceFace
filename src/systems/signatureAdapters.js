// Additive signature adapters for BP-10.1 audio/caption surfaces.
// Pure helpers: no DOM/Web Audio, and scanner hostility remains the canonical predicate.

import { getSignatureRecipe } from '../presentation/cueRecipesSignatures.js';
import { isHostileToPlayer as scannerIsHostileToPlayer } from './scanner.js';

export const SENSOR_SIGNATURE_DEBOUNCE_MS = 1000;

export const SIGNATURE_TITLES = Object.freeze({
  'sensor.scan': 'SCAN SWEEP',
  'sensor.lock': 'WEAPONS LOCK',
});

export const SIGNATURE_CAPTIONS = Object.freeze({
  'sensor.scan': 'Scanned.',
  'sensor.lock': 'Weapons lock.',
});

export function captionForSignature(id) {
  return SIGNATURE_CAPTIONS[id] || null;
}

export function titleForSignature(id) {
  return SIGNATURE_TITLES[id] || null;
}

export function resolveSensorSignature(contact, state, opts = {}) {
  const hostileFn = opts.isHostileToPlayer || scannerIsHostileToPlayer;
  const playerTeam = opts.playerTeam ?? playerTeamFromState(state);
  const hostile = !!hostileFn(contact, playerTeam, state);
  return hostile ? 'sensor.lock' : 'sensor.scan';
}

export function shouldDebounceSensorSignature(previous, nextId, nowMs, targetId, debounceMs = SENSOR_SIGNATURE_DEBOUNCE_MS) {
  if (!previous) return false;
  if (previous.targetId != null && targetId != null && previous.targetId !== targetId) return false;
  const untilMs = finite(previous.untilMs, finite(previous.startedAtMs, 0) + debounceMs);
  return finite(nowMs, 0) < untilMs && previous.id !== nextId;
}

export function buildSensorSignatureCue(sample = {}) {
  const contact = sample.contact || sample.entity || null;
  const state = sample.state || null;
  const nowMs = Math.max(0, finite(sample.nowMs, finite(state && state.simTime, 0) * 1000));
  const id = resolveSensorSignature(contact, state, sample);
  const targetId = contact && contact.id != null ? contact.id : sample.targetId ?? null;
  if (shouldDebounceSensorSignature(sample.previous, id, nowMs, targetId, sample.debounceMs)) return null;

  const recipe = getSignatureRecipe(id);
  const sourceId = sample.sourceId ?? (state && state.playerId) ?? null;
  return Object.freeze({
    id,
    audioId: recipe.audioId,
    sourceEvent: recipe.sourceEvent,
    material: recipe.material,
    mode: recipe.mode,
    title: titleForSignature(id),
    caption: captionForSignature(id),
    importance: recipe.importance,
    playerRelevance: recipe.playerRelevance,
    targetId,
    sourceId,
    hostile: id === 'sensor.lock',
    startedAtMs: nowMs,
    untilMs: nowMs + Math.max(1, finite(sample.debounceMs, SENSOR_SIGNATURE_DEBOUNCE_MS)),
    tags: recipe.tags,
    tones: recipe.tones,
  });
}

function playerTeamFromState(state) {
  const entities = state && state.entities;
  const player = entities && typeof entities.get === 'function' ? entities.get(state.playerId) : null;
  return player && Number.isFinite(player.team) ? player.team : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
