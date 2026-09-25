// Survival results owner (PQ-133 / CRU-018).
//
// Watches a run so the end of it can be EXPLAINED: how far it got, what it earned, and — when the
// player dies — what killed them, from the receipts combat already builds. It ends the run on the
// player's death, and assembles the summary the results surface reads.
//
// It never writes state.run (runSession owns that), never spawns, and never ticks.

import { runOwnsReward } from '../combat/rewardEligibility.js';
import { attackerLabel, weaponLabel } from '../combat/playerDefeat.js';
import { validateRunState } from '../core/runState.js';
import { SWARM_RULESET } from '../data/swarmMode.js';
import { SURVIVAL_ARC_LENGTH } from '../data/survivalActs.js';
import { settleCrucibleRun } from './survivalRecords.js';
import { challengeFromRun } from './survivalMutators.js';
import { currentStuntRunRules, stuntAssistProfile } from '../combat/stuntRunRules.js';
import { TRICK_DEFINITIONS } from '../combat/stuntRecognition.js';
import { captureKillReplay } from './killReplay.js';

/** How many recent hits on the player the summary keeps. Bounded: this is a ring, not a log. */
export const DAMAGE_TRAIL_LENGTH = 8;

/** How many telegraphed tells before a death the summary keeps. Bounded ring, same as damage. */
export const TELEGRAPH_TRAIL_LENGTH = 16;

/** How many story moments a result carries. Bounded: a column of sentences, not a log. */
export const DEATH_MOMENT_LIMIT = 5;

function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

// playerDefeat.impactDirection() speaks in enum words (FRONT, AFT, PORT, STARBOARD, CONTACT,
// UNKNOWN). The headline is the first line of the results screen, so it speaks the way a pilot
// does: "from astern", never "from AFT", and an unknown bearing is simply not mentioned.
const BEARING_WORDS = Object.freeze({
  FRONT: ' head-on', AFT: ' from astern', PORT: ' from port', STARBOARD: ' from starboard',
  CONTACT: ' at point-blank range', UNKNOWN: '',
});

function bearingPhrase(direction) {
  if (!direction) return '';
  const key = String(direction).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(BEARING_WORDS, key)) return BEARING_WORDS[key];
  return ` from ${String(direction).toLowerCase()}`;
}

/**
 * Turn the defeat receipt combat already builds into one plain sentence a player can act on.
 * Exported so a check can assert the wording without a DOM or a live run.
 */
export function deathSentence(receipt, context = {}) {
  if (!receipt) return 'The run ended.';
  const attacker = receipt.attacker || (receipt.source && receipt.source.label) || 'Something';
  const weapon = receipt.weapon ? ` with its ${receipt.weapon}` : '';
  const direction = bearingPhrase(receipt.direction);
  const layer = receipt.dominantLayer === 'hull'
    ? 'through the hull'
    : `through your ${receipt.dominantLayer || 'hull'}`;
  const wave = Number.isInteger(context.wave) && context.wave > 0 ? ` on wave ${context.wave}` : '';
  return `${attacker} killed you${wave}${direction}${weapon}, ${layer}.`;
}

/** Structured stop reason (PQ-133.02 shared-change #6): `aborted` alone cannot tell a
 * player quitting from the arena failing to build a wave. Resolved in two places: from
 * the `run:ended` payload in `_onRunEnded`, then again from `run.result.reason` in
 * `_publish` with the owner's latch as fallback — the publish-time resolution is what
 * survives a stale latch, and its tests pin the precedence.
 *
 * Returns null only when nothing recorded any cause (an ended run with no reason and no
 * prior latch). Null is legal: consumers must treat it as "ended, cause unrecorded",
 * never as a specific exit. A known specific cause (`wave_plan_failed`, `player_death`)
 * always wins over the generic 'player_exit' default, whether it arrives as `reason` or
 * as `fallback` — but a stale terminal latch (`victory`, `extracted`) never overrides a
 * contradictory outcome, and an unknown fallback string degrades to 'player_exit' rather
 * than leaking into the closed union. */
export function stopReasonFor(outcome, reason, fallback = null) {
  if (outcome === 'victory') return 'victory';
  if (outcome === 'extracted') return 'extracted';
  const specific = reason === 'wave_plan_failed' || reason === 'player_death' ? reason
    : (fallback === 'wave_plan_failed' || fallback === 'player_death' ? fallback : null);
  if (specific) return specific;
  // An 'extracted' reason on a defeat is a contradictory payload, not an extraction —
  // the outcome wins and the reason degrades to a generic exit.
  if (reason === 'extracted' && outcome !== 'defeat') return 'extracted';
  if (typeof reason === 'string' && reason.length > 0) return 'player_exit';
  if (typeof fallback === 'string' && fallback.length > 0) return 'player_exit';
  return null;
}

/** The one-line reason a run ended when nothing killed the player. */
export function outcomeSentence(outcome, context = {}) {
  const wave = Number.isInteger(context.wave) && context.wave > 0 ? context.wave : 0;
  if (outcome === 'victory') return `All ${wave || SURVIVAL_ARC_LENGTH} waves cleared. The arena is empty.`;
  if (outcome === 'extracted') {
    return wave
      ? `You extracted at wave ${wave} with the haul you had.`
      : 'You extracted with the haul you had.';
  }
  if (outcome === 'aborted') return 'You left the arena before the run finished.';
  return wave ? `The run ended on wave ${wave}.` : 'The run ended.';
}

/* --- PQ-174.06: death names its cause and the telegraph the player missed. ------------------
 *
 * A cause is a physical fact — WHAT hit the player, with WHAT, from WHERE, through WHICH
 * layer — never "you were killed by an Elite". A telegraph is the tell that preceded it
 * with its lead time in milliseconds. Both are pure builders over data the run already
 * recorded, so a check can assert them without a DOM or a live run.
 * ----------------------------------------------------------------------------------------- */

/** Player words for the telegraph kinds the sim actually emits. An unknown kind is humanised
 * from its id — never dropped to a generic fallback. */
export const TELEGRAPH_WORDS = Object.freeze({
  weapon_charge: 'Weapon charge',
  broadside_charge: 'Broadside charge',
  attach_spool: 'Attack spool-up',
  field_spool: 'Drag-field spool',
  wake_mines: 'Mine wake',
});

export function telegraphWord(kind) {
  if (typeof kind === 'string' && kind.length > 0) {
    const known = TELEGRAPH_WORDS[kind];
    if (known) return known;
    const words = String(kind).replace(/^(ai|doctrine)_/, '').split('_').filter(Boolean)
      .map((word) => (word.length === 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
      .join(' ');
    if (words) return words;
  }
  return 'Incoming fire';
}

/** A generic "you died" — the one phrase a death story is forbidden to fall back to. */
export function isGenericYouDied(text) {
  const line = String(text || '').trim();
  if (!line) return true;
  return /\byou died\b/i.test(line);
}

/**
 * Closing speed of the killer toward the player, in hull lengths per second.
 * Positive is approaching. Null when either hull is missing a position.
 */
export function hullClosingSpeed(player, killer) {
  if (!player || !killer || !player.pos || !killer.pos) return null;
  const dx = Number(killer.pos.x) - Number(player.pos.x);
  const dz = Number(killer.pos.z) - Number(player.pos.z);
  const dist = Math.hypot(dx, dz);
  const pvx = Number(player.vel && player.vel.x) || 0;
  const pvz = Number(player.vel && player.vel.z) || 0;
  const kvx = Number(killer.vel && killer.vel.x) || 0;
  const kvz = Number(killer.vel && killer.vel.z) || 0;
  const closingWu = dist > 1e-6 ? -((kvx - pvx) * dx + (kvz - pvz) * dz) / dist : 0;
  const hull = Math.max(1, (Number.isFinite(Number(player.radius)) ? Number(player.radius) : 2) * 2);
  return { wuPerS: closingWu, hullsPerS: closingWu / hull };
}

export function closingSpeedPhrase(receipt) {
  const hulls = Number(receipt && receipt.closingHullsPerS);
  if (!Number.isFinite(hulls)) return '';
  if (hulls <= 0.05) return ' · not closing';
  return ` · closing ${hulls.toFixed(1)} hulls/s`;
}

/**
 * The physical fact of a death, as one line. Never the generic "you died": with a receipt it
 * names attacker, weapon, bearing and layer; with only a damage trail it names the weapon fire
 * that took the ship apart; with nothing at all it says the fire was unidentified rather than
 * pretending a cause exists.
 */
export function deathCauseText(receipt, trail = []) {
  if (receipt && typeof receipt === 'object') {
    const attacker = receipt.attacker || (receipt.source && receipt.source.label) || 'Unidentified attacker';
    const weapon = receipt.weapon || 'unidentified weapon';
    const direction = receipt.direction || 'bearing unknown';
    const layer = receipt.dominantLayer || 'hull';
    return `${attacker} · ${weapon} · ${direction}${closingSpeedPhrase(receipt)} · ${layer} breach`;
  }
  const entries = Array.isArray(trail) ? trail.filter((e) => e && typeof e === 'object') : [];
  if (entries.length) {
    const byWeapon = new Map();
    for (const entry of entries) {
      const id = typeof entry.weaponId === 'string' && entry.weaponId ? entry.weaponId : null;
      byWeapon.set(id, (byWeapon.get(id) || 0) + 1);
    }
    const top = [...byWeapon.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return `${weaponLabel(top)} fire took you apart — no single hull to name.`;
  }
  return 'Unidentified fire took you apart — no single hull to name.';
}

/**
 * What the player could have done about it. Enumerated from the receipt's own fields — the
 * bearing decides the advice, and a death with no bearing falls back to the one true general
 * rule: the warning is the weapon, so move when a tell opens.
 */
export function counterplayFor(receipt) {
  const dir = String((receipt && receipt.direction) || '').toUpperCase();
  if (dir === 'AFT') return 'It killed from astern — clear your six before the next pass.';
  if (dir === 'PORT' || dir === 'STARBOARD') return 'It killed from the flank — keep turning so no lane sits still.';
  if (dir === 'FRONT') return 'It came off the bow — meet it head-on or break sideways early.';
  if (dir === 'CONTACT') return 'Point-blank kill — keep separation while the tell is open.';
  return 'Break line of sight the moment a tell opens — the warning is the weapon.';
}

/**
 * Resolve the telegraph a death names, with its lead time in milliseconds.
 *
 * Three sources, in order: (1) a witnessed tell from the killer — an `ai:telegraph` the run
 * recorded before the death; (2) the incoming fire itself — earlier hits in the damage trail
 * are the warning the player was already taking; (3) the wave inbound — the run's own start
 * of the current wave. One of the three always resolves, so no death ever falls back to a
 * generic "you died".
 */
export function resolveDeathTelegraph({
  receipt = null,
  damageTrail = [],
  telegraphTrail = [],
  wave = 0,
  waveStartSimTime = null,
  deathSimTime = 0,
} = {}) {
  const death = Number.isFinite(deathSimTime) ? deathSimTime : 0;
  const killerId = receipt && (receipt.killerId ?? receipt.attackerId
    ?? (receipt.source && receipt.source.entityId));
  const tells = Array.isArray(telegraphTrail) ? telegraphTrail : [];
  const matchTell = (onlyKiller) => {
    for (let i = tells.length - 1; i >= 0; i -= 1) {
      const tell = tells[i];
      if (!tell || typeof tell !== 'object') continue;
      if (!Number.isFinite(tell.simTime) || tell.simTime > death || death - tell.simTime > 6) continue;
      if (onlyKiller) {
        if (killerId == null) continue;
        if (tell.attackerId !== killerId) continue;
      }
      return tell;
    }
    return null;
  };
  // Known killer: their tell only. Any other ship's tell is not the miss that killed you.
  // Unknown killer: the most recent tell still names a warning rather than "you died".
  const witnessed = matchTell(true) || (killerId == null ? matchTell(false) : null);
  if (witnessed && Number.isFinite(witnessed.simTime)) {
    return {
      name: telegraphWord(witnessed.kind),
      leadTimeMs: Math.max(0, Math.round((death - witnessed.simTime) * 1000)),
      source: 'witnessed',
    };
  }
  const hits = Array.isArray(damageTrail) ? damageTrail.filter((e) => e && typeof e === 'object') : [];
  const timed = hits.filter((e) => Number.isFinite(e.simTime) && e.simTime < death
    && death - e.simTime <= 4 && (killerId == null || e.attackerId === killerId));
  const first = timed.length ? timed.reduce((a, b) => (a.simTime <= b.simTime ? a : b)) : null;
  if (first) {
    const counts = new Map();
    for (const hit of timed) {
      const id = typeof hit.weaponId === 'string' && hit.weaponId ? hit.weaponId : null;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return {
      name: `Taking ${weaponLabel(top)} fire`,
      leadTimeMs: Math.max(0, Math.round((death - first.simTime) * 1000)),
      source: 'incoming-fire',
    };
  }
  // A round announcement is not a warning for a particular attack. Absence of a matched
  // tell is useful information; do not invent thirty seconds of reaction time.
  return { name: null, leadTimeMs: null, source: 'unrecorded' };
}

/**
 * The run told as a story: sentences with numbers, each from tracked telemetry. Fixed priority
 * order, bounded length. A run with nothing tracked tells nothing — null-safe throughout.
 */
export function storyMomentsFor(summary = {}) {
  const input = summary && typeof summary === 'object' ? summary : {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const moments = [];
  // The swarm chain counts kills, not the combo meter's chained tricks — it is named for what
  // it counts, so the results plate's two "chain" figures never read as one number.
  const best = num(input.bestChain);
  if (best > 0) {
    const wave = Number.isInteger(input.chainWave) && input.chainWave > 0
      ? ` on wave ${input.chainWave}` : '';
    moments.push(`Best kill chain ${best}${wave}`);
  }
  const waves = Array.isArray(input.waveStats) ? input.waveStats : [];
  let top = null;
  for (const entry of waves) {
    if (!entry || typeof entry !== 'object') continue;
    if (num(entry.kills) > num(top && top.kills)) top = entry;
  }
  if (top && num(top.kills) > 0) {
    moments.push(`Wave ${num(top.wave)} did the heavy lifting — ${num(top.kills)} kills`);
  }
  const hit = input.heaviestHit;
  if (hit && typeof hit === 'object' && num(hit.amount) > 0) {
    moments.push(`Hardest hit: ${Math.round(num(hit.amount))} from ${hit.weapon || 'unidentified fire'}`);
  }
  const stunts = Array.isArray(input.stuntKills) ? input.stuntKills : [];
  if (stunts.length > 0) {
    const names = [];
    for (const stunt of stunts) {
      const stuntName = stunt && (stunt.name || stunt.trickId);
      if (stuntName && !names.includes(stuntName)) names.push(stuntName);
    }
    if (names.length) moments.push(`Stunt kills: ${names.join(', ')}`);
  }
  if (Number.isFinite(input.firstKillInS) && input.firstKillInS >= 0) {
    const seconds = Math.round(input.firstKillInS * 10) / 10;
    moments.push(`First kill ${seconds}s in`);
  }
  if (num(input.stylePeak) > 1) {
    moments.push(`Style peaked at ${num(input.stylePeak).toFixed(1)}x`);
  }
  return moments.slice(0, DEATH_MOMENT_LIMIT).map((text) => ({ text }));
}

/**
 * The build the player converged on: the last verb over the last armed weapon. From the picks
 * the run actually recorded — never a constant.
 */
export function buildNameFor(picks) {
  const entries = Array.isArray(picks) ? picks.filter((p) => p && typeof p === 'object') : [];
  if (!entries.length) return 'Starter loadout';
  let verb = null;
  let armed = null;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (!verb && typeof entries[i].verb === 'string' && entries[i].verb) verb = entries[i].verb;
    if (!armed && typeof entries[i].defId === 'string' && entries[i].defId) armed = entries[i].defId;
    if (verb && armed) break;
  }
  const weapon = armed ? weaponLabel(armed) : 'mixed guns';
  return verb ? `${verb} ${weapon}` : weapon;
}

/**
 * The shareable build code: the draft sequence wave-stamped, in the order taken. Two different
 * runs produce two different codes; a run with no draft is stock.
 */
export function buildCodeFor(picks) {
  const entries = Array.isArray(picks) ? picks.filter((p) => p && typeof p === 'object') : [];
  const steps = [];
  for (const pick of entries) {
    const verb = typeof pick.verb === 'string' && pick.verb
      ? pick.verb
      : (typeof pick.defId === 'string' && pick.defId ? weaponLabel(pick.defId) : '');
    if (!verb) continue;
    steps.push(Number.isInteger(pick.wave) && pick.wave > 0 ? `W${pick.wave}:${verb}` : verb);
  }
  return steps.length ? steps.join(' / ') : 'stock';
}

/* --- PQ-146 Phase 3: the finished round's named tricks, as rows. ------------------------------
 *
 * The stunt module (stuntGrammar, the single writer) already keeps the round's combo ledger:
 * settled banks (combo.banks[].acts[]), the still-open acts (combo.acts[]) and the last chain's
 * mirror (combo.lastTricks). These builders turn that snapshot into [label, value] rows the
 * results plate can print: the top named tricks with counts, the best chain, the banked total.
 * Pure and deterministic — same snapshot in, same rows out, ties settled by name. An act is
 * counted once per episodeId no matter which source it is met in, and an amendment rewrites its
 * episode rather than adding a row.
 * ------------------------------------------------------------------------------------------- */

/** How many named tricks a plate lists. Bounded: a column, not a log. */
export const STUNT_TRICK_ROW_LIMIT = 5;

function comboActSources(combo) {
  const c = combo && typeof combo === 'object' ? combo : {};
  return [
    ...((Array.isArray(c.banks) ? c.banks : []).flatMap((bank) => (bank && Array.isArray(bank.acts) ? bank.acts : []))),
    ...(Array.isArray(c.acts) ? c.acts : []),
    ...(Array.isArray(c.lastTricks) ? c.lastTricks : []),
  ];
}

/**
 * The round's top named tricks with counts, as [label, value] rows — e.g.
 * ['Wrecking Ball', '×2 · 180 style']. Sorted by count, then style, then name; capped at
 * `limit`. A combo with no named acts yields no rows (an honest empty, never a filler).
 */
export function trickCountRows(combo, { limit = STUNT_TRICK_ROW_LIMIT } = {}) {
  const byName = new Map();
  const seenEpisodes = new Set();
  for (const act of comboActSources(combo)) {
    if (!act || typeof act !== 'object') continue;
    const name = typeof act.name === 'string' && act.name ? act.name : null;
    if (!name) continue;
    const episode = act.episodeId != null ? String(act.episodeId) : null;
    if (episode != null) {
      if (seenEpisodes.has(episode)) continue;
      seenEpisodes.add(episode);
    }
    const points = Math.max(0, Number(act.points) || 0);
    const row = byName.get(name) || { name, count: 0, points: 0 };
    row.count += 1;
    row.points += points;
    byName.set(name, row);
  }
  return [...byName.values()]
    .sort((a, b) => (b.count - a.count) || (b.points - a.points)
      || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, Math.max(1, limit))
    .map((row) => [row.name, `×${row.count} · ${Math.floor(row.points)} style`]);
}

/**
 * The full named-trick/combo rows for the finished round: the top named tricks with counts, the
 * best chain (the combo's own chained-trick figure — the swarm kill chain is a different number
 * and keeps its own row), and the banked style total. Empty when the round scored nothing.
 */
export function stuntRoundRows(combo, options = {}) {
  const rows = trickCountRows(combo, options);
  const c = combo && typeof combo === 'object' ? combo : {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const bestChain = n(c.bestChain);
  if (bestChain > 0) {
    rows.push(['Best chain', `${bestChain} trick${bestChain === 1 ? '' : 's'} · ${n(c.bestChainPoints)} banked`]);
  }
  const banked = n(c.banked);
  if (banked > 0) rows.push(['Banked style', String(banked)]);
  return rows;
}

export const survivalResults = {
  name: 'survivalResults',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onEntityKilled(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:waveCleared', (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('combat:damage', (p) => this._onDamage(p)));
    this._unsubs.push(this.bus.on('stunt:trickDetected', (p) => this._onTrick(p)));
    this._unsubs.push(this.bus.on('stunt:trickAmended', (p) => this._onTrick(p)));
    // PQ-174.06: the tells before a death. A death the player could not have read is a bug
    // report, not a story beat — so every telegraph aimed at the player is kept with its time.
    this._unsubs.push(this.bus.on('ai:telegraph', (p) => this._onTelegraph(p)));
    this._unsubs.push(this.bus.on('encounter:telegraph', (p) => this._onEncounterTelegraph(p)));
    this._unsubs.push(this.bus.on('player:death', (p) => this._onPlayerDeath(p)));
    this._unsubs.push(this.bus.on('run:wavePlanFailed', (p) => this._onPlanFailed(p)));
    // The chain publishes its peak as it goes. Tracked live rather than read at the end, because
    // swarmChain drops its own state on run:ended and the two receipts race.
    this._unsubs.push(this.bus.on('swarm:chain', (p) => {
      const best = p && Number.isFinite(p.best) ? p.best : 0;
      if (best > this._bestChain) {
        this._bestChain = best;
        this._chainPeak = {
          best,
          wave: p && Number.isInteger(p.wave) && p.wave > 0 ? p.wave : this._deepestWave,
          simTime: this._simNow(),
        };
      }
    }));
    // swarmChain also publishes the peak as it drops state on run:ended. Latch it so a
    // race against that reset cannot zero the chain the results screen is about to name.
    this._unsubs.push(this.bus.on('swarm:chainBest', (p) => {
      const best = p && Number.isFinite(p.best) ? p.best : 0;
      if (best > this._bestChain) {
        this._bestChain = best;
        this._chainPeak = {
          best,
          wave: this._deepestWave,
          simTime: this._simNow(),
        };
      }
    }));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', (p) => this._onRunEnded(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
    this._result = null;
  },

  /** The finished run's summary, or null before one has ended. Read by the results surface. */
  lastResult() {
    return this._result ? JSON.parse(JSON.stringify(this._result)) : null;
  },

  _reset() {
    this._highestEntered=0;this._stuntRules=null;
    this._planFailure = null;
    this._stopReason = null;
    this._result = null;
    this._kills = 0;
    this._bestChain = 0;
    this._chainPeak = null;
    this._wavesCleared = 0;
    this._deepestWave = 0;
    this._damageTrail = [];
    this._telegraphTrail = [];
    this._waveStartSimTime = null;
    this._waveStartWave = 0;
    this._killsByWave = new Map();
    this._waveStats = [];
    this._firstKillSimTime = null;
    this._runStartSimTime = null;
    this._heaviestHit = null;
    this._stylePeak = 1;
    this._deathMark = null;
    this._defeatReceipt = null;
    this._stuntKills = [];
    this._lastKillReplay = null;
  },

  _simNow() {
    return this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
  },

  _tickNow() {
    return this.state && Number.isFinite(this.state.tick) ? this.state.tick | 0 : 0;
  },

  _onWaveStarted(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    this._highestEntered=Math.max(this._highestEntered,wave);
    if(!this._stuntRules)this._stuntRules=currentStuntRunRules(this.state,run.ruleset===SWARM_RULESET?'swarm':run.ruleset??'arc');
    else if(this._stuntRules.simulationAssistProfile!==stuntAssistProfile(this.state))this._stuntRules.simulationAssistProfile='mixed';
    this._waveStartSimTime = this._simNow();
    this._waveStartWave = Number.isInteger(wave) ? wave : 0;
    if (this._runStartSimTime == null) this._runStartSimTime = this._simNow();
  },

  _onTelegraph(payload) {
    if (!liveSurvivalRun(this.state)) return;
    if (!payload || typeof payload !== 'object') return;
    // NPC-on-NPC tells are not the miss the player is owed. A missing target still records —
    // mines and encounter wakes do not name a targetId.
    if (payload.targetId != null && this.state.playerId != null
      && payload.targetId !== this.state.playerId) return;
    const attackerId = payload.entityId == null ? null : payload.entityId;
    const closing = this._closingOf(attackerId);
    this._telegraphTrail.push({
      attackerId,
      kind: typeof payload.kind === 'string' ? payload.kind : null,
      simTime: this._simNow(),
      tick: this._tickNow(),
      closingHullsPerS: closing ? closing.hullsPerS : null,
    });
    if (this._telegraphTrail.length > TELEGRAPH_TRAIL_LENGTH) this._telegraphTrail.shift();
  },

  _onEncounterTelegraph(payload) {
    if (!liveSurvivalRun(this.state)) return;
    if (!payload || typeof payload !== 'object') return;
    this._telegraphTrail.push({
      attackerId: null,
      kind: typeof payload.kind === 'string' ? payload.kind : null,
      simTime: this._simNow(),
      tick: this._tickNow(),
    });
    if (this._telegraphTrail.length > TELEGRAPH_TRAIL_LENGTH) this._telegraphTrail.shift();
  },

  _onTrick(trick) {
    if (!liveSurvivalRun(this.state)) return;
    if (!trick || typeof trick !== 'object') return;
    if (this.state && this.state.playerId != null && trick.actorId != null && trick.actorId !== this.state.playerId) return;
    const isKill = !!(
      trick.consequence?.killed
      || (Array.isArray(trick.victimLives) && trick.victimLives.some((v) => v && v.dead))
    );
    if (!isKill) return;
    if (trick.targetId != null) {
      this._stuntKills = this._stuntKills.filter((row) => !(row && row.provisional === true && row.victimId === trick.targetId));
    }
    const name = trick.name || (trick.trickId && TRICK_DEFINITIONS[trick.trickId]?.name) || trick.trickId || 'Stunt';
    const existingIndex = trick.episodeId != null
      ? this._stuntKills.findIndex((s) => s.episodeId === trick.episodeId)
      : -1;
    const record = {
      name,
      trickId: trick.trickId || null,
      family: trick.family || (trick.trickId && TRICK_DEFINITIONS[trick.trickId]?.family) || null,
      points: Number.isFinite(Number(trick.baseScore || trick.points)) ? Number(trick.baseScore || trick.points) : 0,
      tick: this._tickNow(),
      simTime: this._simNow(),
      episodeId: trick.episodeId || null,
    };
    if (existingIndex >= 0) {
      this._stuntKills[existingIndex] = record;
    } else {
      this._stuntKills.push(record);
      if (this._stuntKills.length > 32) this._stuntKills.shift();
    }
  },

  _onEntityKilled(payload) {
    if (!liveSurvivalRun(this.state)) return;
    if (!payload || payload.killerId !== this.state.playerId) return;
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(payload.id)
      : null;
    if (!runOwnsReward(victim)) return;
    this._lastKillReplay = captureKillReplay(this.state, victim);
    this._kills += 1;
    if (this._runStartSimTime == null) this._runStartSimTime = this._simNow();
    if (this._firstKillSimTime == null) this._firstKillSimTime = this._simNow();
    const run = this.state.run;
    const wave = run && Number.isInteger(run.wave) ? run.wave : 0;
    this._killsByWave.set(wave, (this._killsByWave.get(wave) || 0) + 1);

    const stunt = payload.stunt || (payload.presentation && payload.presentation.stunt);
    const stuntName = payload.stuntName || (stunt && stunt.name);
    const cause = payload.cause || (payload.presentation && payload.presentation.cause);
    if (stuntName || stunt) {
      const name = stuntName || stunt.name || (stunt.trickId && TRICK_DEFINITIONS[stunt.trickId]?.name) || 'Stunt';
      this._stuntKills.push({
        name,
        trickId: (stunt && stunt.trickId) || null,
        family: (stunt && stunt.family) || (stunt?.trickId && TRICK_DEFINITIONS[stunt.trickId]?.family) || null,
        points: Number(stunt && (stunt.points || stunt.baseScore)) || 0,
        tick: this._tickNow(),
        simTime: this._simNow(),
      });
    } else if (cause === 'terrain_collision' || cause === 'shove') {
      this._pushProvisionalStunt(payload.id, {
        name: 'Rock Discovery',
        trickId: 'rock_discovery',
        family: 'impact',
        points: 50,
      });
    } else if (cause === 'ship_collision' || cause === 'slam') {
      this._pushProvisionalStunt(payload.id, {
        name: 'Wrecking Ball',
        trickId: 'wrecking_ball',
        family: 'tether',
        points: 90,
      });
    } else if (cause === 'throw') {
      this._pushProvisionalStunt(payload.id, {
        name: 'Bolas',
        trickId: 'bolas',
        family: 'tether',
        points: 90,
      });
    } else if (cause === 'field') {
      this._pushProvisionalStunt(payload.id, {
        name: 'Well Golf',
        trickId: 'well_golf',
        family: 'field',
        points: 140,
      });
    }
  },

  _pushProvisionalStunt(victimId, fields) {
    if (victimId != null && this._stuntKills.some((row) => row && row.victimId === victimId && row.provisional !== true)) return;
    this._stuntKills.push({
      ...fields,
      tick: this._tickNow(),
      simTime: this._simNow(),
      provisional: true,
      victimId: victimId ?? null,
    });
  },

  _onWaveCleared(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._wavesCleared += 1;
    const wave = payload && Number.isInteger(payload.wave) ? payload.wave : run.wave;
    if (wave > this._deepestWave) this._deepestWave = wave;
    const kills = this._killsByWave.get(wave) || 0;
    this._waveStats.push({ wave, kills, simTime: this._simNow() });
    const mult = run.style && Number.isFinite(run.style.multiplier) ? run.style.multiplier : 1;
    if (mult > this._stylePeak) this._stylePeak = mult;
  },

  _onDamage(payload) {
    if (!payload || payload.targetId !== this.state.playerId) return;
    if (!liveSurvivalRun(this.state)) return;
    // Best-effort annotation: attackerLabel is a pure function of the inputs it is
    // handed, but this is a bus handler and must never throw mid-dispatch — a label
    // failure must not cost the damage entry it annotates.
    let label = null;
    try {
      label = attackerLabel(this.state, payload.attackerId);
    } catch {
      label = null;
    }
    this._damageTrail.push({
      attackerId: payload.attackerId == null ? null : payload.attackerId,
      attackerLabel: typeof label === 'string' && label.length > 0 ? label : null,
      weaponId: payload.weaponId || null,
      amount: Number.isFinite(payload.applied) ? payload.applied : (Number(payload.amount) || 0),
      type: payload.type || null,
      simTime: this._simNow(),
      tick: this._tickNow(),
    });
    if (this._damageTrail.length > DAMAGE_TRAIL_LENGTH) this._damageTrail.shift();
    const applied = Number.isFinite(payload.applied) ? payload.applied : Number(payload.amount);
    if (Number.isFinite(applied) && applied > 0
      && (!this._heaviestHit || applied > this._heaviestHit.amount)) {
      this._heaviestHit = {
        amount: applied,
        weaponId: payload.weaponId || null,
        weapon: weaponLabel(payload.weaponId || null),
        simTime: this._simNow(),
      };
    }
  },

  _onPlayerDeath(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._defeatReceipt = payload || null;
    this._deathMark = { tick: this._tickNow(), simTime: this._simNow() };
    this._stopReason = 'player_death';
    // A Crucible death is the end of the run — there is no recovery berth in an arena.
    this._emit('run:endRequested', {
      outcome: 'defeat',
      reason: 'player_death',
      tick: Number.isFinite(this.state.tick) ? this.state.tick : 0,
    });
  },

  /**
   * The phase machine emits run:wavePlanFailed and then STOPS: it will not retry the plan and
   * nothing else was listening, so the player sat in an empty arena in phase `wave_intro` forever
   * — sim running, no enemies, no draft, no results, no message, exit-to-menu the only way out.
   *
   * The normal launch path cannot trip this today (the seed is normalised and every authored wave
   * validates), which is exactly why it needed an owner: it is a softlock armed by the next data
   * regression, and a regression that ends the run loudly is one somebody will notice and fix.
   */
  _onPlanFailed(payload) {
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._planFailure = {
      wave: payload && Number.isInteger(payload.wave) ? payload.wave : run.wave,
      error: (payload && payload.error) || 'invalid_input',
    };
    this._stopReason = 'wave_plan_failed';
    this._emit('run:endRequested', {
      outcome: 'aborted',
      reason: 'wave_plan_failed',
      tick: Number.isFinite(this.state.tick) ? this.state.tick : 0,
    });
  },

  _onTransitioned(payload) {
    // `victory` is a terminal phase reached by transition, so no run:ended follows it.
    if (payload && payload.phase === 'victory') {
      this._stopReason = 'victory';
      this._publish('victory');
    }
  },

  _onRunEnded(payload) {
    const reason = payload && payload.reason;
    const outcome = reason === 'extracted'
      ? 'extracted'
      : ((payload && payload.outcome) || 'defeat');
    this._stopReason = stopReasonFor(outcome, reason, this._stopReason);
    this._publish(outcome);
  },

  _publish(outcome) {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival') return;
    const wave = Number.isInteger(run.wave) ? run.wave : 0;
    const liveMult = run.style && Number.isFinite(run.style.multiplier) ? run.style.multiplier : 1;
    if (liveMult > this._stylePeak) this._stylePeak = liveMult;
    const receipt = this._defeatReceipt;
    if (this._stuntKills.length === 0 && this.state && this.state.stunts?.combo) {
      const combo = this.state.stunts.combo;
      const acts = Array.isArray(combo.acts) ? combo.acts : [];
      const lastTricks = Array.isArray(combo.lastTricks) ? combo.lastTricks : [];
      for (const act of [...acts, ...lastTricks]) {
        if (act && act.name) {
          this._stuntKills.push({
            name: act.name,
            trickId: act.trickId || null,
            family: act.family || null,
            points: Number(act.points) || 0,
            tick: this._tickNow(),
            simTime: this._simNow(),
          });
        }
      }
    }
    const pickEntries = Array.isArray(run.modifiers)
      ? run.modifiers.map((entry) => ({
        verb: (entry && entry.verb) || null,
        defId: (entry && entry.defId) || null,
        wave: Number.isInteger(entry && entry.wave) ? entry.wave : null,
      }))
      : [];
    const result = {
      outcome,
      seed: Number.isInteger(run.seed) ? run.seed : 0,
      arenaId: run.arenaId || null,
      wave,
      deepestWave: Math.max(this._deepestWave, wave),
      wavesCleared: this._wavesCleared,
      kills: this._kills,
      // The longest kill chain the run held. In a swarm run this is the figure the player was
      // actually playing for, so the plate has to carry it out.
      bestChain: this._bestChain,
      score: Number.isInteger(run.score) ? run.score : 0,
      credits: Number.isInteger(run.credits) ? run.credits : 0,
      xp: Number.isInteger(run.xp) ? run.xp : 0,
      level: Number.isInteger(run.level) ? run.level : 1,
      picks: pickEntries,
      headline: this._planFailure
        ? `The arena could not build wave ${this._planFailure.wave}. The run was stopped.`
        : (outcome === 'defeat' && receipt
          ? deathSentence(receipt, { wave })
          : outcomeSentence(outcome, { wave })),
      defeat: outcome === 'defeat' && receipt
        ? {
          attacker: receipt.attacker || null,
          faction: receipt.faction || null,
          weapon: receipt.weapon || null,
          direction: receipt.direction || null,
          dominantLayer: receipt.dominantLayer || null,
          cause: receipt.cause || null,
          fatalSummary: receipt.fatalSummary || null,
          vitalsPct: receipt.vitalsPct || null,
        }
        : null,
      // PQ-174.06: the death as a story beat — its physical cause, the telegraph the player
      // missed with its lead time, and what could have been done. Resolved from the tells and
      // hits the run recorded, so it is never a generic "you died".
      death: outcome === 'defeat'
        ? this._deathStory(receipt, wave)
        : null,
      // PQ-174.06: the run told back — best chain, the waves that did the work, the heaviest
      // hit ridden out, the first kill, the style peak — every line carrying its number.
      moments: storyMomentsFor({
        bestChain: this._bestChain,
        chainWave: this._chainPeak && this._chainPeak.wave,
        waveStats: this._waveStats,
        heaviestHit: this._heaviestHit,
        firstKillInS: this._firstKillSimTime != null && this._runStartSimTime != null
          ? Math.max(0, this._firstKillSimTime - this._runStartSimTime)
          : null,
        stylePeak: this._stylePeak,
        stuntKills: this._stuntKills,
      }),
      // PQ-174.06: the build the player converged on, and its shareable code — both read from
      // the draft the run recorded, never a constant.
      buildName: buildNameFor(pickEntries),
      buildCode: buildCodeFor(pickEntries),
      // PQ-174.06: when the run ended, so a retry can be measured from the death moment.
      endedAt: this._deathMark
        ? { tick: this._deathMark.tick, simTime: this._deathMark.simTime }
        : { tick: this._tickNow(), simTime: this._simNow() },
      // The last hits before the end, so "what actually took me apart" is answerable even when the
      // killing blow was not the interesting one.
      damageTrail: this._damageTrail.slice(),
      style: {
        multiplier: run.style && Number.isFinite(run.style.multiplier) ? run.style.multiplier : 1,
        recentCauses: run.style && Array.isArray(run.style.recentCauses) ? run.style.recentCauses.slice() : [],
      },
    };
    const challenge = challengeFromRun(run);
    result.ruleset = challenge.ruleset;
    result.trialId = challenge.trialId;
    result.mutators = challenge.mutators.slice();
    result.stopReason = stopReasonFor(
      outcome,
      run.result && run.result.reason,
      this._stopReason,
    );
    result.extracted = outcome === 'extracted';
    result.mode = challenge.ruleset === 'endless'
      || challenge.ruleset === 'boss_circuit'
      || challenge.ruleset === SWARM_RULESET
      ? challenge.ruleset
      : 'arc';
    result.unlocksEarned = [];
    result.highestRoundEntered=this._highestEntered;
    result.lastRoundCleared=this._deepestWave;
    result.roundThreatBudget=run.threatBudget;
    result.roundThreatResolved=run.resolvedThreat;
    result.remainingEnemies=Math.max(0,(run.threatBudget??0)-(run.resolvedThreat??0));
    result.recordRules=this._stuntRules;
    result.bestLine=this.state.stunts?.combo?.bestLine?structuredClone(this.state.stunts.combo.bestLine):null;
    result.stuntKills = this._stuntKills.map((s) => ({ ...s }));
    result.killReplay = this._lastKillReplay
      ? {
        ...this._lastKillReplay,
        body: { ...this._lastKillReplay.body },
        seed: Number.isInteger(run.seed) ? run.seed : this._lastKillReplay.seed,
      }
      : null;
    result.combo = this.state && this.state.stunts?.combo ? structuredClone(this.state.stunts.combo) : null;
    // PQ-146 Phase 3: the round's named tricks with counts, best chain and banked total, read
    // from the same combo snapshot — the results plate prints them beside the combo figures.
    result.stuntRoundRows = stuntRoundRows(result.combo);
    try {
      const settled = settleCrucibleRun({ result, run });
      result.unlocksEarned = settled.unlocksEarned.slice();
    } catch {
      // A local-record failure must not swallow the results the player is owed.
    }
    this._result = result;
    this._emit('run:resultsReady', result);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  _entityById(id) {
    if (id == null || !this.state || !this.state.entities || typeof this.state.entities.get !== 'function') {
      return null;
    }
    return this.state.entities.get(id) || null;
  },

  _closingOf(killerId) {
    const player = this._entityById(this.state && this.state.playerId);
    const killer = this._entityById(killerId);
    return hullClosingSpeed(player, killer);
  },

  /** The death story for a finished run: cause, missed telegraph with lead time, counterplay. */
  _deathStory(receipt, wave) {
    const deathSimTime = this._deathMark ? this._deathMark.simTime : this._simNow();
    const killerId = receipt && (receipt.killerId ?? receipt.attackerId
      ?? (receipt.source && receipt.source.entityId));
    const closing = this._closingOf(killerId);
    const enriched = receipt && typeof receipt === 'object'
      ? {
        ...receipt,
        closingHullsPerS: Number.isFinite(receipt.closingHullsPerS)
          ? receipt.closingHullsPerS
          : (closing ? closing.hullsPerS : null),
      }
      : receipt;
    const telegraph = resolveDeathTelegraph({
      receipt: enriched,
      damageTrail: this._damageTrail,
      telegraphTrail: this._telegraphTrail,
      wave,
      waveStartSimTime: this._waveStartWave === wave ? this._waveStartSimTime : null,
      deathSimTime,
    });
    return {
      causeText: deathCauseText(enriched, this._damageTrail),
      telegraphName: telegraph.name,
      telegraphLeadMs: telegraph.leadTimeMs,
      telegraphSource: telegraph.source,
      counterplay: counterplayFor(receipt),
      closingHullsPerS: enriched && Number.isFinite(enriched.closingHullsPerS)
        ? enriched.closingHullsPerS
        : null,
    };
  },
};
