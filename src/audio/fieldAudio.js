// SF-230 — a field heard through its force direction. Player-deployed emitters, NPC snares,
// and held cone/sheet volumes get one sustained loop each, panned/attenuated from the source
// the force leans toward, with gain and pitch riding the kernel's enforced lifecycle strength
// (winding spins up, dissipating sags). Presentation only: reads state.fields.active — the
// same published mirror VFX/HUD consume — never touches the kernel or sim state.

import { FIELD_DEFS } from '../data/fields.js';
import { TABLE_HEARING_FAR_WU } from '../render/tabletopPolicy.js';

export const FIELD_LOOP_PREFIX = 'fieldLoop_';
export const FIELD_LOOP_CAP = 6;

const HEARING_FAR2 = TABLE_HEARING_FAR_WU * TABLE_HEARING_FAR_WU;

// Sustained voices match the deploy one-shots' identity: the well keeps dragging inward,
// the repulsor keeps pressing out, the cone/sheet keep shearing ahead of the nose.
export const FIELD_LOOP_RECIPES = Object.freeze({
  well: Object.freeze({ recipeId: 'sfx_field_loop_well', gain: 0.34 }),
  repulsor: Object.freeze({ recipeId: 'sfx_field_loop_repulsor', gain: 0.32 }),
  cone: Object.freeze({ recipeId: 'sfx_field_loop_cone', gain: 0.22 }),
  sheet: Object.freeze({ recipeId: 'sfx_field_loop_sheet', gain: 0.2 }),
});

// Nominal strengths the kernel's lifecycle multiplier is normalized against. `skim` is the
// FIELD_DEFS key for the sheet kind; anchorSnare reuses the well recipe at its own strength.
const KIND_NOMINAL_STRENGTH = Object.freeze({ sheet: FIELD_DEFS.skim.strength });

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function playerPos(state) {
  const entities = state && state.entities;
  const player = entities && typeof entities.get === 'function' && state.playerId != null
    ? entities.get(state.playerId)
    : null;
  const pos = player && player.pos;
  return pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? pos : null;
}

/** Continuous 0..1 loudness from the record's enforced strength; 0 for force-less rings. */
export function fieldLoopEnvelope(rec) {
  if (!rec || !(rec.strength > 0)) return 0;
  const nominal = KIND_NOMINAL_STRENGTH[rec.kind] || (FIELD_DEFS[rec.kind] && FIELD_DEFS[rec.kind].strength);
  if (!(nominal > 0)) return 1;
  return clamp(rec.strength / nominal, 0, 1);
}

/** Pitch rides the same envelope: a winding field spins up, a dissipating one sags flat. */
export function fieldLoopPitch(envelope) {
  return 0.8 + 0.4 * clamp(envelope, 0, 1);
}

export function fieldLoopKey(fieldId) {
  return FIELD_LOOP_PREFIX + String(fieldId);
}

export function isFieldLoopKey(key) {
  return typeof key === 'string' && key.startsWith(FIELD_LOOP_PREFIX);
}

export function collectFieldLoopSpecs(state, out = []) {
  out.length = 0;
  const active = state && state.fields && state.fields.active;
  if (!Array.isArray(active) || !active.length) return out;
  const entities = state.entities;
  const player = playerPos(state);
  const px = player ? player.x : 0;
  const pz = player ? player.z : 0;
  for (const rec of active) {
    if (!rec || rec.id == null) continue;
    const spec = FIELD_LOOP_RECIPES[rec.kind];
    if (!spec) continue;
    const envelope = fieldLoopEnvelope(rec);
    if (!(envelope > 0)) continue;
    const source = rec.sourceId != null && entities && typeof entities.get === 'function'
      ? entities.get(rec.sourceId)
      : null;
    const pos = (source && source.alive !== false && source.pos) || rec.center || null;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) continue;
    const dx = pos.x - px, dz = pos.z - pz;
    if (dx * dx + dz * dz > HEARING_FAR2) continue;
    out.push({
      key: fieldLoopKey(rec.id),
      fieldId: rec.id,
      kind: rec.kind,
      recipeId: spec.recipeId,
      gain: spec.gain,
      trackId: source && source.alive !== false ? rec.sourceId : null,
      envelope,
      phase: rec.phase || 'active',
      position: pos,
    });
    if (out.length >= FIELD_LOOP_CAP) break;
  }
  return out;
}

function stopLoop(host, key) {
  const rt = host && host.rt;
  if (!rt || !rt.loops) return false;
  const voice = rt.loops[key];
  if (!voice) return false;
  if (typeof host._endLoopVoice === 'function') host._endLoopVoice(voice);
  delete rt.loops[key];
  return true;
}

function startFieldLoop(host, spec) {
  const rt = host && host.rt;
  if (!rt || !rt.loops || spec == null || spec.key == null) return null;
  if (rt.loops[spec.key]) return rt.loops[spec.key];
  if (typeof host._startLoopVoice !== 'function') return null;
  const entity = spec.trackId != null && host.state && host.state.entities && typeof host.state.entities.get === 'function'
    ? host.state.entities.get(spec.trackId)
    : null;
  const voice = host._startLoopVoice(spec.recipeId, spec.position, spec.gain, {
    entity,
    follow: true,
    trackId: spec.trackId,
    busName: 'combat',
  });
  if (!voice) return null;
  voice.trackId = spec.trackId;
  voice.loop = true;
  voice.busName = 'combat';
  voice.role = 'combat';
  voice._fieldKey = spec.key;
  voice._fieldEnvelope = spec.envelope;
  voice._fieldPitch = fieldLoopPitch(spec.envelope) * (rt._bulletTimePitch || 1);
  voice._statusScale = 1;
  rt.loops[spec.key] = voice;
  if (typeof host._setVoiceRate === 'function') host._setVoiceRate(voice, voice._fieldPitch);
  if (typeof host._markLoopPositionDirty === 'function') host._markLoopPositionDirty();
  return voice;
}

export function stopAllFieldLoops(host) {
  const rt = host && host.rt;
  if (!rt || !rt.loops) return 0;
  let n = 0;
  for (const key of Object.keys(rt.loops)) {
    if (isFieldLoopKey(key) && stopLoop(host, key)) n++;
  }
  return n;
}

const _wanted = [];

export function syncFieldAudioLoops(host) {
  if (!host || !host.state || !host.rt) return;
  const rt = host.rt;
  if (!rt.loops) return;
  const wanted = collectFieldLoopSpecs(host.state, _wanted);
  const keep = new Set(wanted.map((row) => row.key));
  for (const key of Object.keys(rt.loops)) {
    if (isFieldLoopKey(key) && !keep.has(key)) stopLoop(host, key);
  }
  for (const spec of wanted) {
    const existing = rt.loops[spec.key];
    if (existing) {
      existing._fieldEnvelope = spec.envelope;
      existing._statusScale = 1;
      const pitch = fieldLoopPitch(spec.envelope) * (rt._bulletTimePitch || 1);
      if (Math.abs((existing._fieldPitch || 1) - pitch) > 0.02 && typeof host._setVoiceRate === 'function') {
        host._setVoiceRate(existing, pitch);
        existing._fieldPitch = pitch;
      }
      continue;
    }
    startFieldLoop(host, spec);
  }
}

export function bindFieldAudio(host, bus) {
  if (!host || !bus || typeof bus.on !== 'function') return;
  bus.on('fields:ended', (payload) => {
    if (payload && payload.fieldId != null) stopLoop(host, fieldLoopKey(payload.fieldId));
  });
  bus.on('fields:cleared', () => stopAllFieldLoops(host));
  bus.on('fields:specialistDisrupt', () => stopAllFieldLoops(host));
  bus.on('sector:exit', () => stopAllFieldLoops(host));
  bus.on('sector:enter', () => stopAllFieldLoops(host));
  bus.on('game:new', () => stopAllFieldLoops(host));
  bus.on('game:newGame', () => stopAllFieldLoops(host));
  bus.on('save:loaded', () => stopAllFieldLoops(host));
  // Pause must be quiet: kill field loops now; the next sync pass re-arms fields still live.
  bus.on('sim:pause', () => stopAllFieldLoops(host));
  host._syncFieldAudio = () => syncFieldAudioLoops(host);
}
