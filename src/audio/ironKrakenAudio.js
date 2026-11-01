// Score receipts own the timing. This adapter only asks the existing audio owner for a voice.
// Finite phrases, bounded dedupe, no scheduler, context, gameplay mutation or catch-up playback.
const SCORES = new Set(['capital_boss_iron_kraken', 'capital_boss_iron_kraken_colossus']);
const ATTACKS = Object.freeze({ arm_rake: 'sfx_kraken_rake', siphon_jet: 'sfx_kraken_jet', ink_ring: 'sfx_kraken_ink' });
const CHARGE_RATE = Object.freeze({ arm_rake: .95, siphon_jet: .78, ink_ring: 1.18 });
export const IRON_KRAKEN_AUDIO_MEMORY_LIMIT = 64;
const finitePosition = pos => Number.isFinite(pos?.x) && Number.isFinite(pos?.z);

/** Pure routing. A stale producer receipt cannot restart a removed cast or announce a fake hit. */
export function resolveIronKrakenAudioCue(state, event, payload) {
  if (!payload || !SCORES.has(payload.encounterId) || typeof payload.fightId !== 'string') return null;
  const fight = state?.capitalBossEncounters?.fights?.[payload.fightId];
  if (!fight || fight.encounterId !== payload.encounterId || fight.suspended || fight.terminal) return null;
  const boss = state.entities?.get?.(fight.bossId);
  if (!boss || boss.alive === false || (Number.isFinite(boss.hull) && boss.hull <= 0) || !finitePosition(boss.pos)) return null;
  if (!Object.hasOwn(ATTACKS, payload.beatId)) return null;
  let stage, recipeId, gain, rate = 1, warning = false;
  if (event === 'capitalBoss:telegraph' || event === 'capitalBoss:attack') {
    const cast = fight.cast;
    if (!cast || cast.id !== payload.castId || cast.beatId !== payload.beatId) return null;
    if (event === 'capitalBoss:telegraph') {
      if (fight.phase !== 'tell') return null;
      stage = 'tell'; recipeId = 'sfx_kraken_charge'; gain = .62;
      rate = CHARGE_RATE[payload.beatId]; warning = true;
    } else {
      if (fight.phase !== 'active' || cast.fired !== true) return null;
      stage = 'attack'; recipeId = ATTACKS[payload.beatId]; gain = payload.beatId === 'siphon_jet' ? .82 : .72;
    }
  } else if (event === 'capitalBoss:recovery' || event === 'capitalBoss:countered') {
    const recovery = fight.recovery;
    if (fight.phase !== 'recovery' || !recovery || recovery.beatId !== payload.beatId) return null;
    if (event === 'capitalBoss:recovery' && recovery.cancelled) return null;
    if (event === 'capitalBoss:countered' && !recovery.cancelled) return null;
    stage = 'vent'; recipeId = 'sfx_kraken_vent'; gain = recovery.cancelled ? .35 : .50;
  } else return null;
  const generation = stage === 'vent' ? `recovery:${fight.recovery.startedAt}` : payload.castId;
  return { recipeId, stage, key: `${payload.fightId}:${generation}:${stage}`,
    fightId: payload.fightId, bossId: boss.id, castId: payload.castId || null,
    gain, rate: rate * (payload.encounterId.endsWith('_colossus') ? .88 : 1), warning,
    position: { x: boss.pos.x, z: boss.pos.z } };
}

export function bindIronKrakenAudio(owner) {
  const seen = new Map(), playing = new Map(), offs = [];
  let disposed = false, lastTick = null;
  const on = (event, handler) => {
    const off = owner.bus.on(event, handler);
    offs.push(typeof off === 'function' ? off : () => owner.bus.off?.(event, handler));
  };
  function prune() {
    const voices = owner.rt?.voices, now = owner.rt?.ctx?.currentTime;
    for (const [voice] of playing) if (!voices?.includes(voice) || voice._stopped
      || (Number.isFinite(now) && Number.isFinite(voice.stopAt) && voice.stopAt <= now)) playing.delete(voice);
  }
  function stop(fightId = null, castId = null) {
    prune();
    for (const [voice, record] of playing) {
      if (fightId !== null && record.fightId !== fightId) continue;
      if (castId !== null && record.castId !== castId) continue;
      const index = owner.rt?.voices?.indexOf(voice) ?? -1;
      // Let the canonical voice owner release/disconnect its nodes and repair its own pool.
      if (index >= 0 && typeof owner._dropVoiceAt === 'function') owner._dropVoiceAt(index);
      playing.delete(voice);
    }
  }
  function reset() { stop(); seen.clear(); lastTick = null; }
  function forgetFight(fightId) {
    stop(fightId);
    for (const [key, id] of seen) if (id === fightId) seen.delete(key);
  }
  function play(event, payload) {
    if (disposed) return;
    const tick = owner.state?.tick;
    if (Number.isSafeInteger(tick)) {
      if (lastTick !== null && tick < lastTick) reset();
      lastTick = tick;
    }
    const cue = resolveIronKrakenAudioCue(owner.state, event, payload);
    if (!cue) return;
    const rt = owner.rt;
    if (!rt || rt._paused || rt._destroyed || rt._lifecycleSuspended || rt.ctx?.state !== 'running') return;
    if (typeof owner._isMuted === 'function' && owner._isMuted()) return;
    prune();
    // Score clock/identity, never wall-clock cooldowns. Tracking and lock re-emits are one tell.
    if (seen.has(cue.key)) return;
    seen.set(cue.key, cue.fightId);
    if (seen.size > IRON_KRAKEN_AUDIO_MEMORY_LIMIT) seen.delete(seen.keys().next().value);
    // The attack replaces its charging mechanism, and recovery cannot retain a live discharge.
    if (cue.stage !== 'tell') stop(cue.fightId);
    const voice = owner.play(cue.recipeId, { position: cue.position, entityId: cue.bossId,
      gain: cue.gain, rate: cue.rate, lockRate: true, warning: cue.warning,
      critical: cue.warning, captionOwned: true, trackId: `kraken:${cue.key}` });
    if (voice) playing.set(voice, { fightId: cue.fightId, castId: cue.castId });
  }
  for (const event of ['capitalBoss:telegraph', 'capitalBoss:attack', 'capitalBoss:recovery', 'capitalBoss:countered']) {
    on(event, payload => play(event, payload));
  }
  on('capitalBoss:telegraphEnd', payload => {
    if (typeof payload?.fightId === 'string' && typeof payload?.castId === 'string') stop(payload.fightId, payload.castId);
  });
  for (const event of ['capitalBoss:suspended', 'capitalBoss:ended', 'capitalBoss:detach']) {
    on(event, payload => { if (typeof payload?.fightId === 'string') stop(payload.fightId); });
  }
  on('capitalBoss:actRetried', payload => {
    if (typeof payload?.fightId === 'string') forgetFight(payload.fightId);
  });
  on('sim:pause', () => stop());
  for (const event of ['save:restoring', 'save:loaded', 'game:new', 'game:newGame', 'game:exitToMenu']) on(event, reset);
  const dispose = () => {
    if (disposed) return;
    reset(); disposed = true;
    for (const off of offs) off();
    offs.length = 0;
  };
  return dispose;
}
