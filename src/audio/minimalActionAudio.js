// PQ-158.06 — the action sounds that teach response timing on the first playable.
// Audio is presentation: this module never writes sim state. Each row is one source event
// that must request a voice within 0.1 s (6 ticks) of the receipt. Bind only the gaps;
// shield, boost, vent, purchase, and Massline attach already speak on the default route.

export const MINIMAL_ACTION_AUDIO_MAX_DELAY_TICKS = 6;

export const MINIMAL_ACTION_AUDIO = Object.freeze([
  Object.freeze({
    id: 'attachment',
    sourceEvent: 'tether:attached',
    recipeId: 'sfx.tetherLatch',
    importance: 0.78,
    cooldownTicks: 5,
    bind: false,
    via: 'presentation.tether.attach',
  }),
  Object.freeze({
    id: 'loadedLine',
    sourceEvent: 'tether:strain',
    recipeId: 'sfx_tether_strain_creak',
    importance: 0.72,
    cooldownTicks: 36,
    bind: true,
    when: loadedLineWhen,
  }),
  Object.freeze({
    id: 'release',
    sourceEvent: 'tether:releaseRated',
    recipeId: 'sfx.tetherSnap',
    importance: 0.92,
    cooldownTicks: 8,
    bind: true,
    when: (payload) => {
      const klass = payload && payload.classification;
      return !klass || klass === 'messy';
    },
  }),
  Object.freeze({
    id: 'drillValid',
    sourceEvent: 'drill:spark',
    recipeId: 'sfx_mining_drill_contact',
    importance: 0.55,
    cooldownTicks: 8,
    bind: true,
    skipWhenMineOwnsEar: true,
    when: (payload) => !!(payload && payload.bite),
  }),
  Object.freeze({
    id: 'drillInvalid',
    sourceEvent: 'drill:warn',
    recipeId: 'sfx_mining_drill_abort',
    importance: 0.7,
    cooldownTicks: 20,
    bind: true,
    skipWhenMineOwnsEar: true,
  }),
  Object.freeze({
    id: 'shieldBreak',
    sourceEvent: 'shieldDown',
    recipeId: 'sfx.shieldBreak',
    importance: 0.94,
    cooldownTicks: 0,
    bind: false,
  }),
  Object.freeze({
    id: 'weaponVent',
    sourceEvent: 'weapons:vent',
    recipeId: 'sfx_vent_chime',
    importance: 0.8,
    cooldownTicks: 12,
    bind: false,
    when: (payload) => payload && payload.phase === 'end',
  }),
  Object.freeze({
    id: 'engineMode',
    sourceEvent: 'ship:boostStart',
    recipeId: 'sfx_boost_whoosh',
    importance: 0.6,
    cooldownTicks: 18,
    bind: false,
  }),
  Object.freeze({
    id: 'purchase',
    sourceEvent: 'economy:tradeCompleted',
    recipeId: 'sfx_ui_confirm',
    importance: 0.65,
    cooldownTicks: 4,
    bind: false,
  }),
  Object.freeze({
    id: 'blockedProduction',
    sourceEvent: 'site:machineStatus',
    recipeId: 'sfx_ui_error',
    importance: 0.75,
    cooldownTicks: 45,
    bind: true,
    skipWhenMineOwnsEar: true,
    when: (payload) => {
      const state = payload && payload.state;
      return state === 'no-power' || state === 'no-geology'
        || state === 'no-network' || state === 'starved';
    },
  }),
]);

const BY_ID = new Map(MINIMAL_ACTION_AUDIO.map((row) => [row.id, row]));

function loadedLineWhen(payload, host) {
  const tether = host && host.state && host.state.player && host.state.player.tether;
  const phase = tether && tether.phase;
  if (phase === 'loaded' || phase === 'overload') return true;
  const load = tether && Number(tether.load);
  if (Number.isFinite(load) && load >= 0.55) return true;
  const payloadPhase = payload && payload.phase;
  if (payloadPhase === 'loaded' || payloadPhase === 'overload') return true;
  const payloadLoad = payload && Number(payload.load);
  return Number.isFinite(payloadLoad) && payloadLoad >= 0.55;
}

export function minimalActionAudioSpec(id) {
  return BY_ID.get(id) || null;
}

export function requestMinimalActionAudio(host, id, payload, tick) {
  const spec = BY_ID.get(id);
  if (!spec) return null;
  if (typeof spec.when === 'function' && !spec.when(payload, host)) return null;
  if (spec.skipWhenMineOwnsEar && typeof host._mineOwnsEar === 'function' && host._mineOwnsEar()) {
    return null;
  }
  const nowTick = Number.isFinite(tick) ? tick : Number(host && host.state && host.state.tick);
  const last = host._minimalActionLastTick && host._minimalActionLastTick[spec.id];
  if (Number.isFinite(last) && Number.isFinite(nowTick) && (nowTick - last) < spec.cooldownTicks) {
    return null;
  }
  if (!host._minimalActionLastTick) host._minimalActionLastTick = Object.create(null);
  if (Number.isFinite(nowTick)) host._minimalActionLastTick[spec.id] = nowTick;
  if (typeof host._applyPriorityCue === 'function') {
    host._applyPriorityCue({
      id: `minimal.${spec.id}`,
      importance: spec.importance,
      playerRelevance: 1,
    });
  }
  const position = payload && payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z)
    ? payload.pos
    : null;
  if (typeof host.play !== 'function') return { spec, tick: nowTick, played: false };
  host.play(spec.recipeId, {
    gain: spec.importance,
    critical: spec.importance >= 0.8,
    reducedMotionKept: true,
    position,
  });
  if (!host._minimalActionLog) host._minimalActionLog = [];
  host._minimalActionLog.push({ id: spec.id, recipeId: spec.recipeId, tick: nowTick });
  return { spec, tick: nowTick, played: true };
}

export function bindMinimalActionAudio(host, bus) {
  if (!host || !bus || typeof bus.on !== 'function') return;
  for (const spec of MINIMAL_ACTION_AUDIO) {
    if (spec.bind !== true) continue;
    bus.on(spec.sourceEvent, (payload) => {
      const tick = host.state && host.state.tick;
      requestMinimalActionAudio(host, spec.id, payload, tick);
    });
  }
}
