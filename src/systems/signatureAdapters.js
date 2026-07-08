// Additive signature adapters for BP-10.1 audio/caption surfaces.
// Pure helpers: no DOM/Web Audio, and scanner hostility remains the canonical predicate.

import { getSignatureRecipe } from '../presentation/cueRecipesSignatures.js';
import { isHostileToPlayer as scannerIsHostileToPlayer } from './scanner.js';

export const SENSOR_SIGNATURE_DEBOUNCE_MS = 1000;
export const CUSTOMS_SIGNATURE_DEBOUNCE_MS = 4000;

export const CUSTOMS_ZONE_TYPES = Object.freeze([
  'border_checkpoint',
  'patrol_corridor',
]);

export const SIGNATURE_TITLES = Object.freeze({
  'sensor.scan': 'SCAN SWEEP',
  'sensor.lock': 'WEAPONS LOCK',
  'customs.scan': 'CUSTOMS SWEEP',
});

export const SIGNATURE_CAPTIONS = Object.freeze({
  'sensor.scan': 'Scanned.',
  'sensor.lock': 'Weapons lock.',
  'customs.scan': 'Customs sweep.',
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

export function isCustomsZone(zone) {
  if (!zone || zone.factionId !== 'faction_scn') return false;
  if (!CUSTOMS_ZONE_TYPES.includes(zone.type)) return false;
  const text = `${zone.name || ''} ${zone.reason || ''} ${zone.type || ''}`.toLowerCase();
  return text.includes('customs') || text.includes('checkpoint') || text.includes('scanned');
}

export function isCustomsStation(station) {
  if (!station || station.factionId !== 'faction_scn') return false;
  const services = Array.isArray(station.services) ? station.services : [];
  const text = `${station.name || ''} ${station.type || ''} ${services.join(' ')}`.toLowerCase();
  return text.includes('customs') || services.includes('scan');
}

export function isCustomsContext(sample = {}) {
  if (isCustomsZone(sample.zone)) return true;
  if (isCustomsStation(sample.station)) return true;
  const stations = sample.sector && Array.isArray(sample.sector.stations) ? sample.sector.stations : [];
  return stations.some((station) => isCustomsStation(station));
}

export function resolveCustomsScanSignature(sample = {}) {
  if (sample.scanStarted === false) return null;
  if (sample.hasContraband && isCustomsContext(sample)) return 'customs.scan';
  return 'sensor.scan';
}

export function shouldDebounceCustomsSignature(previous, nowMs, debounceMs = CUSTOMS_SIGNATURE_DEBOUNCE_MS) {
  if (!previous) return false;
  const untilMs = finite(previous.untilMs, finite(previous.startedAtMs, 0) + debounceMs);
  return finite(nowMs, 0) < untilMs && (previous.id === 'customs.scan' || previous.id === 'sensor.scan');
}

export function buildCustomsScanCue(sample = {}) {
  const nowMs = Math.max(0, finite(sample.nowMs, 0));
  const id = resolveCustomsScanSignature(sample);
  if (!id) return null;
  if (shouldDebounceCustomsSignature(sample.previous, nowMs, sample.debounceMs)) return null;
  const recipe = getSignatureRecipe(id);
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
    hasContraband: !!sample.hasContraband,
    customsContext: isCustomsContext(sample),
    zoneId: sample.zone && sample.zone.id || null,
    stationId: sample.station && sample.station.id || null,
    startedAtMs: nowMs,
    untilMs: nowMs + Math.max(1, finite(sample.debounceMs, CUSTOMS_SIGNATURE_DEBOUNCE_MS)),
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
