// PQ-146 scoring revision 2. Recognitions consume immutable victim-life budgets;
// only banked style joins personal score. Every clock is a simulation tick.
import { allocateStyle, candidateStyle, executionFactor, PRIMARY_SCORING, threatReward } from '../combat/stuntScoring.js';
import { TRICK_DEFINITIONS } from '../combat/stuntRecognition.js';

export const STUNT_COMBO_SCHEMA_VERSION = 2;
export const COMBO_WINDOW_TICKS = 300;
export const COMBO_BANK_QUIET_TICKS = 120;
export const MAX_CHAIN_MULT = 3;
export const CHAIN_STEP = 0.35;
export const GUN_KILL_SCORE = 100;
export const PULSE_KILL_SCORE = GUN_KILL_SCORE;
export const MASS_REFERENCE_TONNES = 20;
export const MAX_MASS_MULT = 1.5;
export const RARITY_MULT = Object.freeze({ common: 1, uncommon: 1.4, rare: 1.8, legendary: 2.2 });
export const PULSE_WEAPON_IDS = Object.freeze(['wpn_pulse_laser_s', 'wpn_pulse_laser_m', 'unique_mirrorjaw_pulse']);
export const STUNT_PAY_FACTION_ID = 'faction_pitborn';
// PQ-155.03 pay scale: a rated trick posts Pitborn standing plus a salvage-rights claim, never
// credits. Six mixed tricks on the receipt tape paid ~42 rep / ~9 rights; an uncommon trick is
// worth a small contract's standing, a legendary chit redeems near a heavy kill's chip line.
export const STUNT_REP_BY_RARITY = Object.freeze({ common: 3, uncommon: 7, rare: 12, legendary: 20 });
export const STUNT_SALVAGE_RIGHTS_BY_RARITY = Object.freeze({ common: 1, uncommon: 1, rare: 2, legendary: 4 });
const num = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const tickOf = x => Math.max(0, Math.floor(num(x)));
const keyOf = x => x == null ? null : String(x);
export const isPulseWeapon = id => PULSE_WEAPON_IDS.includes(id);
export const killPoints = (_weaponId, threatClass = 'fodder') => threatReward(threatClass).baseScore;
export const massFactor = executionFactor;
export const rarityFactor = trick => RARITY_MULT[trick?.rarity] || 1;
export const chainFactor = (n, d = 1, carry = 0) => Math.min(3, 1 + Math.min(.5, Math.max(0, carry)) + .35 * Math.max(0, Math.min(6, n) - 1) + .15 * Math.max(0, Math.min(6, d) - 1));
export const trickPoints = trick => candidateStyle(trick);
const ZERO_STUNT_PAY = Object.freeze({ reputation: 0, salvageRights: 0, credits: 0, factionId: STUNT_PAY_FACTION_ID });
/** Only an authoritative detector recognition is entitled — a bare name or rarity label pays nothing. */
export function trickPay(trick) {
  const def = trick && TRICK_DEFINITIONS[trick.trickId];
  if (!def || trick.schemaVersion !== 2 || trick.episodeId == null) return { ...ZERO_STUNT_PAY };
  const rarity = typeof trick.rarity === 'string' && RARITY_MULT[trick.rarity] ? trick.rarity : def.rarity;
  return {
    reputation: STUNT_REP_BY_RARITY[rarity] || 0,
    salvageRights: STUNT_SALVAGE_RIGHTS_BY_RARITY[rarity] || 0,
    credits: 0,
    factionId: STUNT_PAY_FACTION_ID,
  };
}
/** Aggregate pay for a settled bank ({ acts }) or a combo ledger ({ banks }). */
export function comboPay(record) {
  const acts = Array.isArray(record?.acts) ? record.acts
    : Array.isArray(record?.banks) ? record.banks.flatMap((b) => (Array.isArray(b?.acts) ? b.acts : []))
    : [];
  let reputation = 0, salvageRights = 0;
  for (const act of acts) {
    const def = TRICK_DEFINITIONS[act?.trickId];
    if (!def) continue;
    reputation += STUNT_REP_BY_RARITY[def.rarity] || 0;
    salvageRights += STUNT_SALVAGE_RIGHTS_BY_RARITY[def.rarity] || 0;
  }
  return { reputation, salvageRights, credits: 0, factionId: STUNT_PAY_FACTION_ID };
}

export function createComboState() {
  return { schemaVersion: 2, baseScore: 0, bankedStyle: 0, banked: 0, activePoints: 0, activeCount: 0,
    lastTrickTick: -1, deadlineTick: -1, quietSinceTick: -1, bestChain: 0, bestChainPoints: 0,
    trickKills: 0, gunKills: 0, pulseKills: 0, reputation: 0, salvageRights: 0, credits: 0,
    lastTricks: [], acts: [], victimBudgets: {}, escapeBudgets: {}, repetition: {}, settledDeaths: {},
    finalizedEpisodes: {}, bridges: [], carry: 0, carryUntilTick: 0, carryUpdatedTick: 0,
    nextRoundProtection: false, postmortem: false, postmortemUntilTick: -1, banks: [], nextBankId: 1, bestLine: null };
}
function ensureCombo(combo) {
  if (!combo || typeof combo !== 'object' || Array.isArray(combo)) return createComboState();
  if (combo.schemaVersion === 2 && Array.isArray(combo.acts) && Array.isArray(combo.banks)
    && combo.victimBudgets && combo.escapeBudgets && combo.finalizedEpisodes && combo.repetition) return combo;
  if (combo.schemaVersion !== 2) {
    // Historical score is retained; missing provenance never becomes a spendable budget.
    const oldBanked = Math.max(0, num(combo.banked));
    const old = { ...combo };
    Object.assign(combo, createComboState(), { banked: oldBanked, baseScore: oldBanked,
      gunKills: num(old.gunKills), pulseKills: num(old.pulseKills), trickKills: num(old.trickKills) });
  }
  const fresh = createComboState();
  for (const [key, value] of Object.entries(fresh)) if (combo[key] == null) combo[key] = value;
  return combo;
}
export function styleMultiplier(combo) { return multiplier(ensureCombo(combo)); }
function multiplier(combo) {
  const combat = combo.acts.filter(a => !a.pureEscape && a.points > 0);
  if (!combat.length) return 1;
  const paid = [...combat, ...combo.acts.filter(a => a.pureEscape && a.points > 0).slice(0, 1)];
  return chainFactor(new Set(paid.map(a => a.trickId)).size, new Set(paid.map(a => a.family)).size, combo.activeCarry || 0);
}
function recalc(combo) {
  combo.activePoints = combo.acts.reduce((n, a) => n + a.points, 0);
  combo.activeCount = combo.acts.filter(a => a.points > 0).length;
  combo.bestChain = Math.max(combo.bestChain, combo.activeCount);
}
function repetitionFor(combo, id) {
  const row = combo.repetition[id] || { uses: 0, others: [] };
  return [1, .5, .25, .1][Math.min(3, row.uses)];
}
function commitRepetition(combo, id) {
  for (const [other, row] of Object.entries(combo.repetition)) if (other !== id) {
    if (!row.others.includes(id)) row.others.push(id);
    if (row.others.length >= 2) { row.uses = 0; row.others = []; }
  }
  const row = combo.repetition[id] ||= { uses: 0, others: [] };
  row.uses += 1;
  row.others = [];
}
function availableVictims(combo, trick) {
  const seen = new Set();
  const result = [];
  for (const victim of (trick.victimLives || []).slice(0, 8)) {
    const key = keyOf(victim?.lifeId);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    const budget = threatReward(victim.threatClass).styleBudget;
    if (!budget) continue;
    let row = combo.victimBudgets[key];
    if (!row) row = combo.victimBudgets[key] = { budget, unlocked: 0, spent: 0, threatClass: victim.threatClass };
    // A later claimed class cannot change the admission budget.
    row.unlocked = Math.max(row.unlocked, row.budget * (victim.dead === true ? 1 : .5));
    result.push({ lifeId: key, available: Math.max(0, row.unlocked - row.spent) });
  }
  return result;
}
export function advanceCombo(comboState, nowTick, { paused = false, intermission = false } = {}) {
  const combo = ensureCombo(comboState);
  const tick = tickOf(nowTick);
  if (!paused && !intermission && combo.carry > 0) {
    const elapsed = Math.max(0, tick - Math.max(combo.carryUpdatedTick, combo.carryUntilTick));
    combo.carry = Math.max(0, combo.carry - elapsed / 60 * .25);
  }
  combo.carryUpdatedTick = tick;
}

/** Same episode updates an open act. Missing life evidence cannot create raw points. */
export function recordTrick(comboState, trick) {
  const combo = ensureCombo(comboState);
  const spec = PRIMARY_SCORING[trick?.trickId];
  const episodeId = keyOf(trick?.episodeId);
  if (!spec || episodeId == null || combo.finalizedEpisodes[episodeId]) return 0;
  const tick = tickOf(trick.tick);
  if (combo.postmortem && (tick > combo.postmortemUntilTick || num(trick.rootTick, Infinity) > combo.deathTick)) return 0;
  if (combo.activeCount > 0 && tick > combo.deadlineTick) bankActive(combo, { tick, reason: 'deadline' });
  if (combo.acts.length >= 32 && !combo.acts.some(a => a.episodeId === episodeId)) bankActive(combo, { tick, reason: 'capacity' });
  advanceCombo(combo, tick);
  let act = combo.acts.find(a => a.episodeId === episodeId);
  if (act && tick > act.amendmentDeadlineTick) return 0;
  const pureEscape = trick.pureEscape === true;
  const factor = act?.repetitionFactor ?? repetitionFor(combo, trick.trickId);
  const candidate = candidateStyle(trick, factor);
  let points = 0;
  let allocation = [];
  if (pureEscape) {
    const threat = keyOf(trick.threatEpisodeId);
    if (threat == null) return 0;
    const spent = combo.escapeBudgets[threat] || 0;
    points = Math.min(Math.max(0, candidate - (act?.points || 0)), Math.max(0, 40 - spent));
    combo.escapeBudgets[threat] = spent + points;
  } else {
    allocation = allocateStyle(Math.max(0, candidate - (act?.points || 0)), availableVictims(combo, trick));
    points = allocation.reduce((n, a) => n + a.points, 0);
    for (const a of allocation) combo.victimBudgets[a.lifeId].spent += a.points;
  }
  if (!act && !(points > 0)) return 0;
  if (!act) {
    if (!combo.activeCount) { combo.activeCarry = combo.postmortem ? 0 : combo.carry; combo.carry = 0; }
    act = { episodeId, trickId: trick.trickId, name: trick.name || trick.trickId, family: spec[0],
      pureEscape, points: 0, tick, repetitionFactor: factor, allocation: [],
      rootId: trick.rootId ?? null, rootTick: trick.rootTick ?? tick,
      amendmentDeadlineTick: Math.min(tick + 180, num(trick.rootTick, tick) + 480),
      evidence: (trick.causeChain || []).slice(0, 8), modifiers: trick.modifiers || {} };
    combo.acts.push(act);
    commitRepetition(combo, trick.trickId);
    combo.lastTrickTick = tick;
    combo.deadlineTick = tick + 300;
    combo.quietSinceTick = -1;
    combo.bridges = [];
  } else {
    // Reclassification updates the name/family without adding another act or paid timer.
    act.trickId = trick.trickId; act.name = trick.name || trick.trickId; act.family = spec[0];
    act.modifiers = trick.modifiers || act.modifiers;
  }
  act.points += points;
  for (const share of allocation) {
    const previous = act.allocation.find(a => a.lifeId === share.lifeId);
    if (previous) previous.points += share.points;
    else act.allocation.push(share);
  }
  combo.lastTricks = combo.acts.slice(-8).map(a => ({ ...a, allocation: [...a.allocation] }));
  recalc(combo);
  return points;
}

export function recordKill(comboState, kill = {}) {
  const combo = ensureCombo(comboState);
  const deathId = keyOf(kill.lifeId ?? kill.deathId);
  if (deathId != null && combo.settledDeaths[deathId]) return 0;
  if (kill.playerOwned === false) return 0;
  const points = killPoints(kill.weaponId, kill.threatClass || 'fodder');
  if (deathId != null) combo.settledDeaths[deathId] = true;
  combo.baseScore += points; combo.banked += points;
  if (kill.trickKill) combo.trickKills += 1;
  else if (isPulseWeapon(kill.weaponId)) combo.pulseKills += 1;
  else combo.gunKills += 1;
  return points;
}
export function recordTrickKill(combo, kill = {}) { return recordKill(combo, { ...kill, trickKill: true }); }

export function recordBridge(comboState, bridge = {}) {
  const combo = ensureCombo(comboState);
  const tick = tickOf(bridge.tick);
  const id = keyOf(bridge.setupId ?? bridge.threatEpisodeId);
  if (!combo.activeCount || tick > combo.deadlineTick || id == null || combo.bridges.includes(id) || combo.bridges.length >= 2) return false;
  const valid = bridge.kind === 'close_shave' && bridge.preventedInterception === true
    || bridge.kind === 'loaded_constraint' && bridge.liveHostile === true && (bridge.displacementLengths >= 1 || bridge.usefulDeltaVCruise >= .15)
    || bridge.kind === 'bank_contact' && bridge.liveDescendant === true && bridge.validTarget === true;
  if (!valid) return false;
  combo.bridges.push(id);
  combo.deadlineTick = Math.min(combo.deadlineTick + 90, combo.lastTrickTick + 480);
  return true;
}

export function bankActive(comboState, { tick = undefined, reason = 'safe', multiplierOverride = null } = {}) {
  const combo = ensureCombo(comboState);
  if (!combo.activeCount) return 0;
  const now = tickOf(tick ?? combo.lastTrickTick);
  const combat = combo.acts.filter(a => !a.pureEscape).reduce((n, a) => n + a.points, 0);
  const escape = combo.acts.filter(a => a.pureEscape).reduce((n, a) => n + a.points, 0);
  const raw = combat + Math.min(escape, combat > 0 ? combat * .25 : 40);
  const mult = combo.postmortem ? 1 : multiplierOverride ?? multiplier(combo);
  const amount = Math.floor(raw * mult + 1e-9);
  combo.banked += amount; combo.bankedStyle += amount;
  const bank = { bankId: combo.nextBankId++, tick: now, reason, points: amount, raw, multiplier: mult,
    acts: combo.acts.map(a => ({ ...a, allocation: a.allocation.map(x => ({ ...x })) })) };
  const pay = comboPay(bank);
  bank.pay = pay;
  combo.reputation += pay.reputation; combo.salvageRights += pay.salvageRights;
  combo.banks.push(bank);
  // Consumers acknowledge bank IDs; keep bounded lightweight history for save/results.
  if (combo.banks.length > 8) combo.banks.shift();
  if (amount > combo.bestChainPoints) { combo.bestChainPoints = amount; combo.bestLine = bank; }
  for (const a of combo.acts) combo.finalizedEpisodes[a.episodeId] = a.amendmentDeadlineTick;
  for (const [id, deadline] of Object.entries(combo.finalizedEpisodes)) if (now > deadline + 480) delete combo.finalizedEpisodes[id];
  const safe = !combo.postmortem && multiplierOverride == null;
  combo.carry = safe ? Math.min(.5, mult - 1) : 0;
  combo.carryUntilTick = now + 60; combo.carryUpdatedTick = now;
  combo.acts = []; combo.activeCount = 0; combo.activePoints = 0; combo.activeCarry = 0; combo.bridges = []; combo.quietSinceTick = -1;
  return amount;
}
export function bankIfQuiet(comboState, nowTick, context = {}) {
  const combo = ensureCombo(comboState);
  const now = tickOf(nowTick);
  advanceCombo(combo, now, context);
  if (!combo.activeCount || context.paused || context.intermission) return 0;
  // Every provisional act gets its specified three-second amendment window. A known
  // descendant can additionally wait up to the enclosing eight-second root horizon.
  const amendmentUntil = Math.max(...combo.acts.map(a => a.amendmentDeadlineTick));
  const rootUntil = Math.max(...combo.acts.map(a => a.rootTick + 480));
  const pendingUntil = Math.max(amendmentUntil, Math.min(num(context.pendingUntilTick, -1), rootUntil));
  const pending = pendingUntil > now;
  const pressured = context.incomingInterception !== false || context.loadedManipulation !== false;
  if (pressured || pending) combo.quietSinceTick = -1;
  else if (combo.quietSinceTick < 0) combo.quietSinceTick = now;
  if (now >= combo.deadlineTick && !pending) return bankActive(combo, { tick: now, reason: 'deadline' });
  if (now >= Math.max(combo.deadlineTick, pendingUntil)) return bankActive(combo, { tick: now, reason: 'deadline' });
  if (combo.quietSinceTick >= 0 && now - combo.quietSinceTick >= 120) return bankActive(combo, { tick: now, reason: 'quiet' });
  return 0;
}
export function settleCrash(comboState, impact = {}) {
  const combo = ensureCombo(comboState);
  const hard = impact.playerDeath === true || impact.deltaVCruise >= .30 && (impact.helmLossSeconds >= 1 || impact.entryHullLossFraction >= .20);
  if (!hard) return 0;
  const tick = tickOf(impact.tick);
  const amount = bankActive(combo, { tick, reason: impact.playerDeath ? 'death' : 'hard_crash', multiplierOverride: 1 });
  combo.carry = 0;
  if (impact.playerDeath) { combo.postmortem = true; combo.deathTick = tick; combo.postmortemUntilTick = tick + 480; }
  return amount;
}
export function resetRound(comboState, nowTick, { begin = false } = {}) {
  const combo = ensureCombo(comboState);
  const tick = tickOf(nowTick);
  if (begin) {
    if (combo.nextRoundProtection) { combo.carryUntilTick = tick + 300; combo.carryUpdatedTick = tick; combo.nextRoundProtection = false; }
    combo.repetition = {};
    // Finite previous-round victim budgets are settled; new bodies must have new life IDs.
    combo.victimBudgets = {}; combo.escapeBudgets = {}; combo.settledDeaths = {};
    return 0;
  }
  const amount = bankActive(combo, { tick, reason: 'round_clear' });
  combo.nextRoundProtection = true;
  return amount;
}
export function comboTotal(comboState) { return ensureCombo(comboState).banked; }
export function comboKills(comboState) { const c = ensureCombo(comboState); return c.trickKills + c.gunKills + c.pulseKills; }
export function comboSummary(comboState) {
  if (!comboState) return null;
  const c = ensureCombo(JSON.parse(JSON.stringify(comboState)));
  if (c.banked <= 0 && c.activeCount <= 0 && c.bestChain <= 0 && comboKills(c) <= 0) return null;
  return { ...c, totalScore: c.banked, totalKills: comboKills(c), activeMultiplier: multiplier(c), credits: 0 };
}
