// PQ-205.01 — drift-bomb audio catalog and status-owned loops.
// Presentation only: never writes sim state, never owns a wall-clock timer. Field loops follow
// the live bomb entity and die on bombs:fieldEnded / spent / missing owner. Burn and goo loops
// follow combat.entities[*].statuses and die when that bag says they expired.

import { bombDef } from '../data/bombs.js';
import { bombFieldEnvelope } from '../combat/bombDynamics.js';

export const BOMB_FIELD_LOOP_PREFIX = 'bombField_';
export const BOMB_STATUS_LOOP_PREFIX = 'bombStatus_';
export const BOMB_STATUS_LOOP_CAP = 8;
export const BOMB_AUDIO_TICK_HZ = 60;

export const BOMB_AUDIO_CUES = Object.freeze({
  bomb_frag: Object.freeze({ detonate: 'bombs.frag.burst', recipeId: 'sfx_bomb_frag_burst' }),
  bomb_concussion: Object.freeze({ detonate: 'bombs.concussion.shove', recipeId: 'sfx_bomb_concussion_shove' }),
  bomb_singularity: Object.freeze({
    detonate: 'bombs.slug.inhale',
    recipeId: 'sfx_bomb_slug_inhale',
    fieldLoop: 'bombs.slug.inhale',
    fieldLoopRecipeId: 'sfx_bomb_slug_inhale',
    collapse: 'bombs.slug.collapse',
    collapseRecipeId: 'sfx_bomb_slug_collapse',
  }),
  bomb_goo: Object.freeze({ detonate: 'bombs.goo.burst', recipeId: 'sfx_bomb_goo_burst' }),
  bomb_emp: Object.freeze({ detonate: 'bombs.emp.pulse', recipeId: 'sfx_bomb_emp_pulse' }),
  bomb_thermite: Object.freeze({ detonate: 'bombs.thermite.ignite', recipeId: 'sfx_bomb_thermite_ignite' }),
  bomb_scrambler: Object.freeze({ detonate: 'bombs.scrambler.spin', recipeId: 'sfx_bomb_scrambler_spin' }),
  bomb_anchor: Object.freeze({ detonate: 'bombs.anchor.settle', recipeId: 'sfx_bomb_anchor_settle' }),
});

export const BOMB_STATUS_AUDIO = Object.freeze({
  status_burning: Object.freeze({
    cueId: 'combat.status.burning',
    recipeId: 'sfx_bomb_thermite_burn',
    gain: 0.38,
  }),
  status_goo: Object.freeze({
    cueId: 'combat.status.goo',
    recipeId: 'sfx_bomb_goo_residue',
    gain: 0.28,
  }),
});

export const BOMB_CUE_TO_RECIPE = Object.freeze({
  'bombs.frag.burst': 'sfx_bomb_frag_burst',
  'bombs.concussion.shove': 'sfx_bomb_concussion_shove',
  'bombs.slug.inhale': 'sfx_bomb_slug_inhale',
  'bombs.slug.collapse': 'sfx_bomb_slug_collapse',
  'bombs.goo.burst': 'sfx_bomb_goo_burst',
  'bombs.emp.pulse': 'sfx_bomb_emp_pulse',
  'bombs.thermite.ignite': 'sfx_bomb_thermite_ignite',
  'bombs.scrambler.spin': 'sfx_bomb_scrambler_spin',
  'bombs.anchor.settle': 'sfx_bomb_anchor_settle',
  'combat.status.burning': 'sfx_bomb_thermite_burn',
  'combat.status.goo': 'sfx_bomb_goo_residue',
});

const FIELD_LOOP_CUES = new Set(
  Object.values(BOMB_AUDIO_CUES).map((row) => row.fieldLoop).filter(Boolean),
);
const FIELD_LOOP_RECIPES = new Set(
  Object.values(BOMB_AUDIO_CUES).map((row) => row.fieldLoopRecipeId).filter(Boolean),
);

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

export function bombAudioCatalog(payloadId) {
  return BOMB_AUDIO_CUES[payloadId] || BOMB_AUDIO_CUES.bomb_frag;
}

export function resolveBombDetonationCue(payloadId, trigger) {
  const row = bombAudioCatalog(payloadId);
  if (trigger === 'collapse' && row.collapse) return row.collapse;
  return row.detonate;
}

export function isBombFieldLoopCue(cueId) {
  return typeof cueId === 'string' && FIELD_LOOP_CUES.has(cueId);
}

export function isBombFieldLoopRecipe(recipeId) {
  return typeof recipeId === 'string' && FIELD_LOOP_RECIPES.has(recipeId);
}

export function bombFieldLoopKey(bombId) {
  if (bombId == null) return null;
  return BOMB_FIELD_LOOP_PREFIX + String(bombId);
}

export function bombStatusLoopKey(targetId, statusId) {
  if (targetId == null || !statusId) return null;
  return BOMB_STATUS_LOOP_PREFIX + String(statusId) + '_' + String(targetId);
}

export function bombFieldLoopRecipeId(payloadId) {
  const row = bombAudioCatalog(payloadId);
  return row.fieldLoopRecipeId || null;
}

const STATUS_LOOP_CUES = new Set(
  Object.values(BOMB_STATUS_AUDIO).map((row) => row.cueId),
);

/** True for the continuous status cue ids — these ride tracked loops, never a one-shot voice. */
export function isBombStatusLoopCue(cueId) {
  return typeof cueId === 'string' && STATUS_LOOP_CUES.has(cueId);
}

export function authoredBombPeak(recipe) {
  if (!recipe) return 0;
  const peak = Number(recipe.gainEnvelope && recipe.gainEnvelope.peak);
  if (Number.isFinite(peak) && peak > 0) return peak;
  return recipe.category === 'explosion' ? 0.85 : 0.4;
}

/** Live field strength 1→endStrength, then 0. Audio reads the sim envelope; it does not clock itself. */
export function bombFieldLoopEnvelope(state, bomb) {
  const data = bomb && bomb.data;
  const def = bombDef(data && data.bombId);
  const field = def && def.field;
  if (!field || data.phase !== 'field') return 0;
  const now = Number.isFinite(state && state.simTime)
    ? state.simTime
    : (Number(state && state.tick) || 0) / BOMB_AUDIO_TICK_HZ;
  return bombFieldEnvelope(now, data.fieldStartedAt, field.durationS, field.endStrength ?? 1);
}

export function gooResidueGain(stacks, baseGain = BOMB_STATUS_AUDIO.status_goo.gain) {
  return clamp(baseGain * (0.55 + 0.45 * clamp(Number(stacks) || 1, 1, 3) / 3), 0.08, 0.7);
}

function liveBombList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)) {
    return index.bombs;
  }
  return (state && state.entityList) || [];
}

export function collectBombFieldLoopSpecs(state, out = []) {
  out.length = 0;
  if (!state) return out;
  for (const bomb of liveBombList(state)) {
    if (!bomb || bomb.alive === false || bomb.type !== 'bomb') continue;
    const data = bomb.data;
    if (!data || data.phase !== 'field') continue;
    const recipeId = bombFieldLoopRecipeId(data.bombId);
    if (!recipeId) continue;
    const envelope = bombFieldLoopEnvelope(state, bomb);
    if (!(envelope > 0)) continue;
    out.push({
      key: bombFieldLoopKey(bomb.id),
      bombId: bomb.id,
      payloadId: data.bombId,
      recipeId,
      trackId: bomb.id,
      envelope,
      position: bomb.pos || null,
    });
  }
  return out;
}

export function collectBombStatusLoopSpecs(state, out = []) {
  out.length = 0;
  const table = state && state.combat && state.combat.entities;
  const entities = state && state.entities;
  if (!table || typeof table !== 'object' || !entities || typeof entities.get !== 'function') return out;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const player = state.playerId != null ? entities.get(state.playerId) : null;
  const px = player && player.pos ? player.pos.x : 0;
  const pz = player && player.pos ? player.pos.z : 0;
  const ranked = [];
  for (const key of Object.keys(table)) {
    const runtime = table[key];
    const statuses = runtime && runtime.statuses;
    if (!statuses) continue;
    const entity = entities.get(key) || entities.get(Number(key));
    if (!entity || entity.alive === false || !entity.pos) continue;
    for (const statusId of Object.keys(BOMB_STATUS_AUDIO)) {
      const active = statuses[statusId];
      if (!active || !Number.isFinite(active.expiresTick) || !(active.expiresTick > tick)) continue;
      const spec = BOMB_STATUS_AUDIO[statusId];
      const stacks = Math.max(1, Number(active.stacks) || 1);
      const dx = entity.pos.x - px;
      const dz = entity.pos.z - pz;
      ranked.push({
        key: bombStatusLoopKey(entity.id, statusId),
        targetId: entity.id,
        statusId,
        recipeId: spec.recipeId,
        trackId: entity.id,
        stacks,
        remainingTicks: active.expiresTick - tick,
        gain: statusId === 'status_goo' ? gooResidueGain(stacks, spec.gain) : spec.gain,
        dist2: dx * dx + dz * dz,
        position: entity.pos,
      });
    }
  }
  ranked.sort((a, b) => a.dist2 - b.dist2 || String(a.key).localeCompare(String(b.key)));
  const cap = Math.min(BOMB_STATUS_LOOP_CAP, ranked.length);
  for (let i = 0; i < cap; i++) out.push(ranked[i]);
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

function startTrackedLoop(host, spec, gain) {
  const rt = host && host.rt;
  if (!rt || !rt.loops || spec == null || spec.key == null) return null;
  if (rt.loops[spec.key]) return rt.loops[spec.key];
  if (typeof host._startLoopVoice !== 'function') return null;
  const entity = spec.trackId != null && host.state && host.state.entities && typeof host.state.entities.get === 'function'
    ? host.state.entities.get(spec.trackId)
    : null;
  const voice = host._startLoopVoice(spec.recipeId, spec.position || (entity && entity.pos) || null, gain, {
    entity,
    follow: true,
    trackId: spec.trackId,
  });
  if (!voice) return null;
  voice.trackId = spec.trackId;
  voice.loop = true;
  voice.busName = 'combat';
  voice.role = 'combat';
  voice._bombKey = spec.key;
  if (Number.isFinite(spec.envelope)) voice._fieldEnvelope = spec.envelope;
  else voice._fieldEnvelope = 1;
  if (Number.isFinite(spec.gain)) voice._baseGain = spec.gain;
  voice._statusScale = 1;
  rt.loops[spec.key] = voice;
  if (typeof host._markLoopPositionDirty === 'function') host._markLoopPositionDirty();
  return voice;
}

export function startBombFieldLoop(host, payload) {
  if (!payload) return null;
  const bombId = payload.bombId != null ? payload.bombId : payload.trackId;
  const payloadId = payload.payloadId || (payload.bomb && payload.bomb.data && payload.bomb.data.bombId);
  const recipeId = bombFieldLoopRecipeId(payloadId);
  if (bombId == null || !recipeId) return null;
  if (payload.trigger === 'collapse') return null;
  return startTrackedLoop(host, {
    key: bombFieldLoopKey(bombId),
    recipeId,
    trackId: bombId,
    position: payload.pos || payload.position || null,
    envelope: 1,
  }, 0.55);
}

export function stopBombFieldLoop(host, bombId) {
  return stopLoop(host, bombFieldLoopKey(bombId));
}

export function stopAllBombAudioLoops(host) {
  const rt = host && host.rt;
  if (!rt || !rt.loops) return 0;
  let n = 0;
  for (const key of Object.keys(rt.loops)) {
    if (key.startsWith(BOMB_FIELD_LOOP_PREFIX) || key.startsWith(BOMB_STATUS_LOOP_PREFIX)) {
      if (stopLoop(host, key)) n++;
    }
  }
  return n;
}

function reconcileLoops(host, wanted, kind) {
  const rt = host && host.rt;
  if (!rt || !rt.loops) return;
  const prefix = kind === 'field' ? BOMB_FIELD_LOOP_PREFIX : BOMB_STATUS_LOOP_PREFIX;
  const keep = new Set(wanted.map((row) => row.key));
  for (const key of Object.keys(rt.loops)) {
    if (!key.startsWith(prefix)) continue;
    if (!keep.has(key)) stopLoop(host, key);
  }
  for (const spec of wanted) {
    const existing = rt.loops[spec.key];
    if (existing) {
      if (Number.isFinite(spec.envelope)) existing._fieldEnvelope = spec.envelope;
      if (kind === 'status' && Number.isFinite(spec.gain)) existing._baseGain = spec.gain;
      existing._statusScale = 1;
      continue;
    }
    startTrackedLoop(host, spec, spec.gain == null ? 0.55 : spec.gain);
  }
}

const _fieldWanted = [];
const _statusWanted = [];

export function syncBombAudioLoops(host) {
  if (!host || !host.state || !host.rt) return;
  reconcileLoops(host, collectBombFieldLoopSpecs(host.state, _fieldWanted), 'field');
  reconcileLoops(host, collectBombStatusLoopSpecs(host.state, _statusWanted), 'status');
}

export function bindBombAudio(host, bus) {
  if (!host || !bus || typeof bus.on !== 'function') return;
  bus.on('bombs:detonated', (payload) => {
    if (!payload) return;
    if (payload.trigger === 'collapse') {
      stopBombFieldLoop(host, payload.bombId);
      return;
    }
    startBombFieldLoop(host, payload);
  });
  bus.on('bombs:fieldEnded', (payload) => {
    stopBombFieldLoop(host, payload && payload.bombId);
  });
  bus.on('bombs:released', () => stopAllBombAudioLoops(host));
  bus.on('sector:exit', () => stopAllBombAudioLoops(host));
  bus.on('sector:enter', () => stopAllBombAudioLoops(host));
  bus.on('game:new', () => stopAllBombAudioLoops(host));
  bus.on('game:newGame', () => stopAllBombAudioLoops(host));
  bus.on('save:loaded', () => stopAllBombAudioLoops(host));
  bus.on('combat:statusExpired', (payload) => {
    if (!payload) return;
    stopLoop(host, bombStatusLoopKey(payload.targetId, payload.statusId));
  });
  host._syncBombAudio = () => syncBombAudioLoops(host);
}
