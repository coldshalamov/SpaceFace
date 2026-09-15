// Survival score and salvage are separate entitlements. RunSession owns the wallet.
import { runOwnsReward } from '../combat/rewardEligibility.js';
import { admitStuntThreat, threatReward } from '../combat/stuntScoring.js';
import { bodyLife } from '../combat/stuntEvidence.js';
import { validateRunState } from '../core/runState.js';
import { CREDIT_CHIP_KIND } from '../data/killRewards.js';
import { bankActive, resetRound, settleCrash } from './stuntCombo.js';

export const KILL_XP_BASE = 2;
export const KILL_SCORE_PER_LEVEL = 100; // compatibility name; levels do not multiply immutable threat pay
export const WAVE_CLEAR_SCORE = 0;
export const RUN_WALLET = 'run';
export const killXpFor = level => KILL_XP_BASE + (Number.isInteger(level) && level >= 1 ? level : 1);
export const killScoreFor = (_level, threatClass = 'fodder') => threatReward(threatClass).baseScore;
export const chipValueForPlan = () => 10; // cohort lives use the threat table, never an infinite per-spawn purse
export function estimateBoardScore({ gunKills = 0, physicsKills = 0, stuntPoints = 0, playerPhysics = true, threatClass = 'fodder' } = {}) {
  return (Math.max(0, Math.trunc(gunKills)) + (playerPhysics ? Math.max(0, Math.trunc(physicsKills)) : 0)) * threatReward(threatClass).baseScore + Math.max(0, Math.floor(stuntPoints));
}
function liveRun(state) {
  const run = state?.run;
  return run?.kind === 'survival' && run.phase !== 'inactive' && validateRunState(run).ok ? run : null;
}
function freshRewards() {
  return { version: 2, wave: 0, deaths: {}, entitlements: {}, chips: {}, lastBankId: 0,
    baseCash: 0, roundStyle: 0, stipendPaid: 0, clearedWaves: {}, admissionCounter: 0 };
}
export const survivalRewards = {
  name: 'survivalRewards',
  init(ctx) {
    this.destroy(); this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this._unsubs = []; this._plan = null; this._planWave = 0;
    this._ensure();
    const handlers = {
      'run:wavePlanned': p => this._onWavePlanned(p),
      'entity:killed': p => this._onEntityKilled(p), 'combat:kill': p => this._onEntityKilled(p),
      'stunt:trickDetected': () => this._syncBanks(), 'stunt:styleBanked': () => this._syncBanks(),
      'run:waveCleared': p => this._onWaveCleared(p), 'entity:spawned': p => this._onEntitySpawned(p),
      'entity:destroyed': p => this._onEntityDestroyed(p), 'pickup:collected': p => this._onPickupCollected(p),
      'run:transitioned': p => this._onTransitioned(p), 'run:started': () => this._reset(),
      'player:death': () => this._onDeath(), 'run:ended': () => { this._onDeath(); this._discardChips(); },
    };
    for (const [event, fn] of Object.entries(handlers)) if (this.bus?.on) this._unsubs.push(this.bus.on(event, fn));
    // Rehydrated actors retain their original immutable admission; missing old-save metadata is
    // admitted conservatively, without claiming that old money or provenance has been recovered.
    for (const entity of this.state?.entities?.values?.() || []) if (entity.alive && runOwnsReward(entity)) this._admit(entity);
  },
  destroy() { for (const off of this._unsubs || []) if (typeof off === 'function') off(); this._unsubs = []; },
  newGame() { this._reset(); },
  _ensure() {
    this.state.stunts ||= {};
    if (this.state.stunts.rewards?.version !== 2) this.state.stunts.rewards = freshRewards();
    return this.state.stunts.rewards;
  },
  _reset() { if (this.state) { this.state.stunts ||= {}; this.state.stunts.rewards = freshRewards(); } },
  serialize() { return JSON.parse(JSON.stringify(this._ensure())); },
  deserialize(data) {
    if (data?.version === 2 && data.deaths && data.entitlements && data.chips) this.state.stunts.rewards = JSON.parse(JSON.stringify(data));
    else this._reset();
  },
  _admit(entity) {
    const run = liveRun(this.state);
    const r = this._ensure();
    const life = bodyLife(entity, this.state);
    if (life && entity?.data) entity.data.bodyLifeId = life.id;
    if (!entity?.data?.stuntThreat && entity?.id != null) r.admissionCounter++;
    return admitStuntThreat(entity, `${run?.seed ?? 'legacy'}:${entity?.data?.runWave ?? run?.wave ?? 0}:${r.admissionCounter}`);
  },
  _onWavePlanned(payload) {
    if (!payload?.plan || payload.plan.ok === false) return;
    this._plan = payload.plan; this._planWave = payload.wave || 0;
    const r = this._ensure();
    if (r.wave !== this._planWave) {
      r.wave = this._planWave; r.baseCash = 0; r.roundStyle = 0; r.stipendPaid = 0;
      // Old pickups are rendered harmless at clear before these bounded per-round ledgers reset.
      r.deaths = {}; r.entitlements = {}; r.chips = {};
    }
  },
  _onEntityKilled(payload) {
    const run = liveRun(this.state);
    if (!run) return;
    const id = payload?.id ?? payload?.targetId ?? payload?.victimId;
    const victim = this._entity(id);
    if (!runOwnsReward(victim) || victim.alive !== false) return;
    const threat = victim.data?.stuntThreat || this._admit(victim);
    if (!threat || !threat.credits) return;
    const r = this._ensure();
    const lifeId = threat.lifeId;
    if (r.deaths[lifeId]) return;
    r.deaths[lifeId] = true;
    const playerId = this.state.playerId;
    const killerId = payload.killerId ?? payload.provenance?.actorId;
    const playerOwned = playerId != null && killerId === playerId;
    this._emit('run:awardRequested', { xp: killXpFor(victim.data?.level), score: playerOwned ? threat.baseScore : 0, reason: 'kill', wave: run.wave });
    r.baseCash += threat.credits;
    r.entitlements[lifeId] = { credits: threat.credits, settled: false, wave: run.wave };
    this._dropRunChip(victim, payload, threat);
    this._payStipend();
  },
  _dropRunChip(victim, payload, threat) {
    const pos = victim.pos || payload.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return; // entitlement remains collectible at clear
    const vel = victim.vel || {};
    this._emit('loot:drop', { pos: { x: pos.x, z: pos.z }, vel: { x: Number(vel.x) || 0, z: Number(vel.z) || 0 }, source: 'kill_burst', items: [{
      kind: CREDIT_CHIP_KIND, credits: threat.credits, amount: threat.credits, wallet: RUN_WALLET,
      entitlementId: threat.lifeId, grantReason: `crucible:wave${this._planWave}:chip`,
    }] });
  },
  _onEntitySpawned(payload) {
    const entity = payload?.entity ?? this._entity(payload?.id);
    if (!entity) return;
    if (entity.alive && runOwnsReward(entity)) this._admit(entity);
    if (entity.type !== 'pickup' || entity.data?.wallet !== RUN_WALLET) return;
    const r = this._ensure();
    let entitlementId = entity.data.entitlementId;
    // Older pickup producers may not yet copy the optional receipt field. Match only one
    // outstanding equal-value entitlement, then stamp the binding on the actual pickup.
    if (entitlementId == null) entitlementId = Object.keys(r.entitlements).find(id => !r.entitlements[id].settled
      && r.entitlements[id].credits === entity.data.credits && !Object.values(r.chips).includes(id));
    if (entitlementId == null) return;
    entity.data.entitlementId = entitlementId;
    if (r.entitlements[entitlementId]?.settled) { entity.data.creditGranted = true; return; }
    r.chips[String(entity.id)] = entitlementId;
  },
  _settleEntitlement(entitlementId, reason) {
    const r = this._ensure();
    const row = r.entitlements[entitlementId];
    const run = liveRun(this.state);
    if (!row || row.settled || !run || run.phase === 'ended') return 0;
    row.settled = true;
    this._emit('run:awardRequested', { credits: row.credits, reason, wave: row.wave });
    return row.credits;
  },
  _settleChip(id, reason) {
    const r = this._ensure();
    const entitlementId = r.chips[String(id)];
    if (entitlementId == null) return 0;
    delete r.chips[String(id)];
    const entity = this._entity(id);
    if (entity?.data) entity.data.creditGranted = true;
    return this._settleEntitlement(entitlementId, reason);
  },
  _onPickupCollected(payload) { if (payload?.pickupId != null) this._settleChip(payload.pickupId, 'chip_scooped'); },
  _onEntityDestroyed(payload) {
    // Despawn is not collection. Preserve earned entitlement until a real round clear.
    if (payload?.id != null) delete this._ensure().chips[String(payload.id)];
  },
  sweepChips(reason = 'round_clear') {
    const r = this._ensure();
    let paid = 0;
    for (const id of Object.keys(r.entitlements)) paid += this._settleEntitlement(id, `sweep:${reason}`);
    for (const entity of this.state?.entities?.values?.() || []) if (entity.type === 'pickup' && entity.data?.wallet === RUN_WALLET && entity.data?.entitlementId != null) {
      const row = r.entitlements[entity.data.entitlementId];
      if (row?.settled) { entity.data.creditGranted = true; entity.alive = false; }
    }
    r.chips = {};
    return paid;
  },
  _discardChips() {
    const r = this._ensure();
    for (const row of Object.values(r.entitlements)) row.settled = true;
    for (const entity of this.state?.entities?.values?.() || []) if (entity.type === 'pickup' && entity.data?.wallet === RUN_WALLET) {
      entity.data.creditGranted = true; entity.alive = false;
    }
    r.chips = {};
  },
  _syncBanks() {
    const run = liveRun(this.state);
    if (!run) return;
    const r = this._ensure();
    for (const bank of this.state.stunts?.combo?.banks || []) if (bank.bankId > r.lastBankId) {
      r.lastBankId = bank.bankId;
      r.roundStyle += bank.points;
      this._emit('run:awardRequested', { score: bank.points, reason: 'stunt_bank', wave: run.wave });
    }
    this._payStipend();
  },
  _payStipend() {
    const r = this._ensure(); const run = liveRun(this.state);
    if (!run || run.phase === 'ended') return;
    const entitled = Math.min(Math.floor(.02 * r.roundStyle), Math.floor(.20 * r.baseCash));
    const delta = Math.max(0, entitled - r.stipendPaid);
    if (delta) { r.stipendPaid += delta; this._emit('run:awardRequested', { credits: delta, reason: 'style_stipend', wave: run.wave }); }
  },
  _onWaveCleared(payload) {
    const run = liveRun(this.state); if (!run) return;
    const r = this._ensure(); const wave = payload?.wave ?? run.wave;
    if (r.clearedWaves[wave]) return;
    r.clearedWaves[wave] = true;
    if (this.state.stunts?.combo) resetRound(this.state.stunts.combo, this.state.tick);
    this._syncBanks(); this.sweepChips('round_clear');
    this._emit('run:awardRequested', { xp: this._plan?.rewards?.xp || 0, reason: 'wave_cleared', wave });
  },
  _onDeath() {
    if (this.state.stunts?.combo) settleCrash(this.state.stunts.combo, { tick: this.state.tick, playerDeath: true });
    this._syncBanks(); this._discardChips();
  },
  _onTransitioned(payload) {
    const phase = payload?.phase ?? payload?.nextPhase;
    if (phase === 'active' && this.state.stunts?.combo) resetRound(this.state.stunts.combo, this.state.tick, { begin: true });
    if (phase === 'draft' || phase === 'refit') {
      if (this.state.stunts?.combo) bankActive(this.state.stunts.combo, { tick: this.state.tick, reason: 'shop' });
      this._syncBanks();
    }
    if (payload?.previousPhase === 'cleanup') this.sweepChips('cleanup');
  },
  _onStuntTrick() { this._syncBanks(); },
  _entity(id) { return this.state?.entities?.get?.(id) || null; },
  _emit(event, payload) { this.bus?.emit?.(event, payload); },
};
