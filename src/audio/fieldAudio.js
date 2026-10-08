// SF-230 — a field heard through its force direction. Player-deployed emitters, NPC snares,
// and held cone/sheet volumes get one sustained loop each, panned/attenuated from the source
// the force leans toward, with gain and pitch riding the kernel's enforced lifecycle strength
// (winding spins up, dissipating sags). Presentation only: reads state.fields.active — the
// same published mirror VFX/HUD consume — never touches the kernel or sim state.

import { FIELD_DEFS } from '../data/fields.js';
import { GYRE_SNARE } from '../data/gyreSnare.js';
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
  const player = playerPos(state);
  const px = player ? player.x : 0;
  const pz = player ? player.z : 0;
  // The early-out covers the field-record scan only — the Gyre Snare spec below must
  // still evaluate on an empty belt, or the beam hum is silent until another field
  // loop happens to be running.
  if (Array.isArray(active) && active.length) {
  const entities = state.entities;
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
  }
  // The Gyre Snare lash isn't a field record, but it owns the same sustained-voice
  // contract: a live beam gets one quiet glassy loop anchored on the maw, envelope
  // riding strain01 so the hum tightens as the clump nears the slip point.
  const gyre = state && state.gyreSnare;
  if (gyre && gyre.phase && gyre.phase !== 'off' && out.length < FIELD_LOOP_CAP) {
    const strain = Number.isFinite(gyre.strain01) ? gyre.strain01 : 0;
    // Katamari escalation arc: the loop's envelope (which also drives its pitch — a
    // winding field spins up) rides clump mass, so the hum swells and sharpens as
    // the ball grows instead of mass staying ear-invisible until the FULL chime.
    const massFrac = Number.isFinite(gyre.clumpMass) && Number.isFinite(gyre.maxClumpMass) && gyre.maxClumpMass > 0
      ? Math.min(1, gyre.clumpMass / gyre.maxClumpMass) : 0;
    // The coil's own term: strain01 publishes 0 through LAUNCH, so without this
    // the hum sags to its mass floor through the ~183 ms pull-back — exactly the
    // beat the visuals tense hardest for. It crests into the crack instead.
    const windup = Number.isFinite(gyre.launchWindup01)
      ? Math.min(1, Math.max(0, gyre.launchWindup01)) : 0;
    // The countdown joins the voice too: the hum thins inside the same fuseWarnVisS
    // window the HUD ·Ns/bar and the glass's fuseDim already telegraph — the file's
    // own countdown-in-the-voice contract (see the ball rumble's pTtlWarn sag below).
    // A pad-and-ears player feels the fuse dying instead of only seeing it.
    const fuseS = Number.isFinite(gyre.fuseS) ? gyre.fuseS : 0;
    const fuseTerm = fuseS > 0 && fuseS < GYRE_SNARE.fuseWarnVisS
      ? 0.55 + 0.45 * (fuseS / GYRE_SNARE.fuseWarnVisS) : 1;
    const pos = gyre.maw && Number.isFinite(gyre.maw.x) ? gyre.maw : null;
    if (pos) {
      out.push({
        key: FIELD_LOOP_PREFIX + 'gyre',
        fieldId: -1,
        kind: 'gyre',
        recipeId: 'sfx_field_loop_gyre',
        gain: 0.2,
        // Track the ship, not the maw: an untracked positional loop freezes its pan at
        // beam-on heading (the maw rides ~200 wu out, exactly the pan-radius boundary),
        // so a 90° turn would leave the hum in the wrong ear. A nose-mounted lash hums
        // centered on the hull — honest, and it dies with the player like any track.
        trackId: state.playerId,
        envelope: Math.min(1, 0.35 + 0.65 * strain + 0.22 * massFrac + 0.25 * windup) * fuseTerm,
        phase: 'active',
        position: pos,
      });
    }
  }
  // A launched ball keeps its own voice after the beam closes: a low rumble tracked to
  // the flying entity, so the arc reads at range for its whole TTL and dies with the
  // body (the grave burst covers the death moment itself).
  if (gyre && gyre.launchedId != null && gyre.ballPos && Number.isFinite(gyre.ballPos.x)
      && Number.isFinite(gyre.ballPos.z) && out.length < FIELD_LOOP_CAP) {
    // Past-hearing balls attenuate to silence on every mix term — never want a floored
    // rumble (same law as the field-record scan above and the bomb precedent): reconcile
    // releases the drifted-out voice, and re-arms it if the ball crosses back in range.
    const dx = gyre.ballPos.x - px, dz = gyre.ballPos.z - pz;
    if (dx * dx + dz * dz <= HEARING_FAR2) {
      const mass = Number.isFinite(gyre.ballMass) ? gyre.ballMass : 0;
      // The loop telegraphs the grave too — inside ballTtlWarnS the rumble sags
      // toward silence like the ribbon fade and the ·Ns countdown it sits beside.
      const pTtlWarn = GYRE_SNARE.ballTtlWarnS > 0 && Number.isFinite(gyre.ballTtlLeftS)
        ? Math.min(1, gyre.ballTtlLeftS / GYRE_SNARE.ballTtlWarnS) : 1;
      // It's a FLIGHT voice — a ricochet-stalled ball (the ribbon stall-hides
      // under ~5 wu/s) sags to a whisper too instead of groaning parked for 9 s.
      const pVl = Math.hypot(gyre.ballVx || 0, gyre.ballVz || 0);
      const pSpeed = 0.2 + 0.8 * Math.min(1, Math.max(0, pVl / 40));
      out.push({
        key: FIELD_LOOP_PREFIX + 'gyreBall',
        fieldId: -2,
        kind: 'gyreBall',
        recipeId: 'sfx_field_loop_gyre_ball',
        gain: 0.24,
        trackId: gyre.launchedId,
        envelope: Math.min(1, 0.5 + mass / 2400) * (0.55 + 0.45 * pTtlWarn) * pSpeed,
        phase: 'active',
        position: gyre.ballPos,
      });
    }
  }
  // Secondary bowls get the same flight voice, keyed by entity id so each rumble
  // dies with its own ball — a second launch was silent for its whole flight.
  if (gyre && Array.isArray(gyre.balls)) {
    for (let i = 0; i < gyre.balls.length && out.length < FIELD_LOOP_CAP; i++) {
      const b = gyre.balls[i];
      if (!b || b.id == null || b.id === gyre.launchedId || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
      // Same hearing law as the primary ball above: a secondary past the table holds no voice.
      const dx = b.x - px, dz = b.z - pz;
      if (dx * dx + dz * dz > HEARING_FAR2) continue;
      const mass = Number.isFinite(b.mass) ? b.mass : 0;
      // Same grave sag as the primary, keyed on the secondary's own countdown.
      const sTtlWarn = GYRE_SNARE.ballTtlWarnS > 0 && Number.isFinite(b.ttlS)
        ? Math.min(1, b.ttlS / GYRE_SNARE.ballTtlWarnS) : 1;
      // Same stall sag as the primary — a parked secondary whispers, not groans.
      const sVl = Math.hypot(b.vx || 0, b.vz || 0);
      const sSpeed = 0.2 + 0.8 * Math.min(1, Math.max(0, sVl / 40));
      out.push({
        key: FIELD_LOOP_PREFIX + 'gyreBall' + String(b.id),
        fieldId: -2,
        kind: 'gyreBall',
        recipeId: 'sfx_field_loop_gyre_ball',
        gain: 0.2,
        trackId: b.id,
        envelope: Math.min(1, 0.45 + mass / 2400) * (0.55 + 0.45 * sTtlWarn) * sSpeed,
        phase: 'active',
        position: { x: b.x, z: b.z },
      });
    }
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
