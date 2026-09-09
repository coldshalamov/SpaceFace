// Survival run voice (PQ-133 / CRU-019).
//
// A ten-wave Survival run used to happen in total silence: waves opened with no word, the wave-10
// boss arrived unremarked, and a pile of authored warning copy never reached anybody. This system
// is the run's combat net. It says what is coming and from where, gives the boss a real arrival,
// teaches an archetype's counter the first time the player meets it, and marks a wave cleared —
// or says plainly when the spawn cap starved a wave so the player never mistakes it for a clear.
//
// It is READ-ONLY over the run. It never writes state.run (runSession owns that), never spawns,
// never ticks, and uses no RNG at all — every line is a pure function of the plan and the receipts.
//
// Seams used, all pre-existing and public:
//   voice:say    src/ui/voiceArbiter.js:316 — the one-voice authority. Channels/priorities at :38.
//   alert        src/ui/alerts.js:251       — finite ttl routes to announce() → voice:say at
//                                             priority 110 (danger). Infinity would be a status
//                                             pill, and there is NO bus seam to clear a pill by
//                                             key (clear() is internal, reached only by
//                                             dock:docked / gate:range), so a persistent pill here
//                                             would stick forever. Finite ttl only.
//   camera:shake src/render/renderer.js:3537 — single chokepoint. A payload WITHOUT `position` is
//                                             player-scoped by construction, which is what a
//                                             scripted arrival beat wants.
//
// Budget: CUE_LANE_BUDGETS (src/presentation/cueArbitration.js:34) exists for a reason. Every line
// this system can produce is counted against MAX_LINES_PER_WAVE, including the boss `alert` —
// because a finite-ttl alert BECOMES a voice line downstream. The bound is hard, not advisory.

import { ENEMY_TYPES } from '../data/enemies.js';
import { validateRunState } from '../core/runState.js';

/**
 * Hard ceiling on player-facing lines per wave. Counts voice:say AND alert, because alerts.js
 * turns a finite-ttl alert into a voice:say. Worst authored case is the boss wave:
 * opener + arrival + cleared + levelUp = 4. The fifth slot is headroom for a build-pressure
 * substitution that puts a second unseen archetype on the board; nothing can exceed it.
 */
export const MAX_LINES_PER_WAVE = 5;

/** At most one counter-hint per wave. Teaching two archetypes at once teaches neither. */
export const MAX_HINTS_PER_WAVE = 1;

/**
 * Gate id → world bearing, in words.
 *
 * These are WORLD directions, not player-relative ones: waveMaterialization.js:117-118 takes the
 * gate's unit vector straight to `atan2(bearing.z, bearing.x)` and never rotates it by the player's
 * heading, so "ahead" would be a lie. Compass words are permanently true here because camera.js:1
 * is explicit that the chase camera "follows player POSITION only (never yaw)" — north is always
 * the same direction on screen.
 *
 * The convention is proved by the data itself: GATE_BEARINGS.nw is {x:-R2, z:-R2}
 * (waveMaterialization.js:35), which is only "northwest" if -z is north and -x is west. front/rear/
 * diagonal_a/diagonal_b fall out of that as north/south/west/east.
 */
const BEARING_WORD = Object.freeze({
  front: 'the north',
  ne: 'the northeast',
  diagonal_b: 'the east',
  se: 'the southeast',
  rear: 'the south',
  sw: 'the southwest',
  diagonal_a: 'the west',
  nw: 'the northwest',
});

/**
 * Player-facing prose for the authored counterHint tokens in src/data/enemies.js.
 *
 * Four of the six authored hints are snake_case tokens ('cut_tether_or_clear_wake'), not sentences —
 * they were written for a consumer that never got built. This is that consumer, so the tokens get
 * their words here. dreadnought_boss authored real prose and is used verbatim (see hintTextFor).
 * An unknown token prints NOTHING rather than leaking a raw identifier at the player.
 */
const HINT_PROSE = Object.freeze({
  cut_tether_or_clear_wake: 'Salts your wake. Do not fly a straight line back through it.',
  hold_missiles_use_kinetics_peel_escort: 'Eats missiles. Guns only, and peel it off the pack first.',
  break_lock_close_under_cover: 'Shoots from long range. Break its lock and close under cover.',
  displace_break_anchor_or_outmass: 'Contests your Massline. Displace, break the anchor, or outmass it.',
  kill_or_massline_displace_anchor_leave_radius: 'Holds you inside its field. Kill it, displace it, or leave the radius.',
});

const NUMBER_WORD = Object.freeze([
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
]);

/**
 * Which non-mass package earns the name-check in a wave opener. One only — a manifest is not a
 * combat net. Highest priority wins; 'mass' is deliberately absent (it is the default body).
 */
const SPECIALIST_RANK = Object.freeze(['elite', 'control', 'anchor', 'disruptor', 'support', 'reach', 'pressure']);

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((def) => [def.id, def]));

/** Live-run guard, mirroring survivalRun.js / survivalResults.js exactly. */
function liveSurvivalRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

/** Spell small counts; fall back to digits past twenty so a flood wave never reads as a paragraph. */
export function countWord(n) {
  const i = Number.isInteger(n) && n >= 0 ? n : 0;
  return i < NUMBER_WORD.length ? NUMBER_WORD[i] : String(i);
}

function capitalize(text) {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Join up to three bearing phrases. Beyond three, say how many rather than listing. */
function joinBearings(words) {
  if (words.length === 0) return '';
  if (words.length === 1) return `from ${words[0]}`;
  if (words.length === 2) return `from ${words[0]} and ${words[1]}`;
  if (words.length === 3) return `from ${words[0]}, ${words[1]} and ${words[2]}`;
  return `from ${countWord(words.length)} bearings`;
}

function packagesOf(plan) {
  return plan && Array.isArray(plan.packages) ? plan.packages : [];
}

/**
 * The one specialist worth naming in the opener, or null when the wave is undifferentiated mass.
 * Ties break on package order so the same plan always names the same body — no RNG, no Set order.
 */
function leadPackage(packages) {
  let best = null;
  let bestRank = Infinity;
  for (const pkg of packages) {
    if (!pkg || typeof pkg.role !== 'string') continue;
    const rank = SPECIALIST_RANK.indexOf(pkg.role);
    if (rank < 0 || rank >= bestRank) continue;
    bestRank = rank;
    best = pkg;
  }
  return best;
}

function displayName(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  return def && def.name ? def.name : null;
}

/**
 * The opening line for a wave. Pure: same plan → same string, forever.
 *
 * Shape: what is coming, from where, and what closes the wave. Every clause is checked against the
 * plan, so it can never promise a body the plan does not contain.
 *
 *   "Wave 1. Six hostiles from the north. Clear the arena."
 *   "Wave 5. Seven hostiles from the north and the south. Corsair Raider leads. Kill the elite and
 *    clear the rest."
 *   "Wave 10. Seven hostiles from the northwest and the east. Dreadnought 'Iron Maw' leads. Kill it
 *    and clear the rest."
 */
export function waveOpeningLine(wave, plan) {
  const packages = packagesOf(plan);
  if (!Number.isInteger(wave) || wave < 1 || packages.length === 0) return null;

  // A SWARM WAVE IS NOT A BODY COUNT.
  //
  // The arc's line names how many hostiles arrive, because on the arc that number is the whole
  // wave. In a swarm wave the arrivals are only the opening burst — the room keeps refilling — so
  // announcing "nine hostiles" would be a promise the wave immediately breaks. What the player
  // actually needs is the number that ENDS the wave (the kill quota) and, on the wave that
  // introduces one, the name of the silhouette they have not seen before.
  const swarm = plan && plan.swarm;
  if (swarm && Number.isInteger(swarm.quota) && swarm.quota > 0) {
    const bearings = [];
    for (const pkg of packages) {
      const word = BEARING_WORD[pkg && pkg.gateGroup];
      if (word && !bearings.includes(word)) bearings.push(word);
    }
    const where = joinBearings(bearings);
    const arrival = where ? `Contact ${where}.` : 'Contact on every bearing.';
    const newcomer = swarm.newcomer && swarm.newcomer.name ? swarm.newcomer.name : null;
    if (swarm.boss) {
      // The champion NAMES ITSELF. A boss wave can be one Dreadnought or a wing of three raiders,
      // and "Corsair Raider leads" would describe the second one as if it were the first.
      const label = swarm.bossLabel || 'A capital signature';
      const line = swarm.bossLine ? ` ${swarm.bossLine}` : '';
      return `Wave ${wave}. ${arrival} ${label}.${line} Put them down, and ${swarm.quota} with them.`;
    }
    const namecheck = newcomer ? ` ${newcomer} is new.` : '';
    return `Wave ${wave}. ${arrival}${namecheck} Put down ${swarm.quota}.`;
  }

  let bodies = 0;
  const bearings = [];
  for (const pkg of packages) {
    const count = Number.isInteger(pkg && pkg.count) && pkg.count > 0 ? pkg.count : 0;
    bodies += count;
    const word = BEARING_WORD[pkg && pkg.gateGroup];
    if (word && !bearings.includes(word)) bearings.push(word);
  }
  if (bodies <= 0) return null;

  const noun = bodies === 1 ? 'hostile' : 'hostiles';
  const where = joinBearings(bearings);
  const arrival = where ? `${capitalize(countWord(bodies))} ${noun} ${where}.` : `${capitalize(countWord(bodies))} ${noun} inbound.`;

  const kind = plan && plan.objective && plan.objective.kind;
  const lead = leadPackage(packages);
  const leadName = lead ? displayName(lead.enemyId) : null;

  let namecheck = '';
  let objective = 'Clear the arena.';
  if (kind === 'boss') {
    objective = 'Kill it and clear the rest.';
    namecheck = leadName ? ` ${leadName} leads.` : ' Capital signature leading.';
  } else if (kind === 'elite_hunt') {
    objective = 'Kill the elite and clear the rest.';
    namecheck = leadName ? ` ${leadName} leads.` : '';
  } else if (kind === 'system_event') {
    objective = 'Steal the plate. Kill it and clear the rest.';
    namecheck = leadName ? ` ${leadName} holds the plate.` : ' A plate-theft signature.';
  } else if (leadName) {
    namecheck = ` ${leadName} on the board.`;
  }

  return `Wave ${wave}. ${arrival}${namecheck} ${objective}`;
}

/**
 * The authored counter-hint for an archetype, as a player-facing sentence — or null when there is
 * none and nothing should be said.
 *
 * dreadnought_boss authored real prose; the other five authored snake_case tokens. Prose is
 * detected structurally (it contains a space) and used VERBATIM — authored copy is not paraphrased.
 */
export function hintTextFor(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  if (!def || typeof def.counterHint !== 'string' || def.counterHint.length === 0) return null;
  const name = def.name || 'Contact';
  const authored = def.counterHint;
  if (authored.includes(' ')) return `${name}: ${authored}`;
  const prose = HINT_PROSE[authored];
  // An unrecognised token is silence, never a raw identifier on the player's screen.
  return prose ? `${name}: ${prose}` : null;
}

/** The boss's authored arrival copy — the telegraph line combat.js:195 has always written and nobody read. */
export function bossArrivalLine(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  const line = def && def.telegraph && typeof def.telegraph.line === 'string' ? def.telegraph.line : null;
  if (line) return line;
  const name = def && def.name ? def.name : 'A capital hull';
  return `${name} is on the field.`;
}

export const survivalAnnounce = {
  name: 'survivalAnnounce',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:waveMaterialized', (p) => this._onWaveMaterialized(p)));
    this._unsubs.push(this.bus.on('run:waveCleared', (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('run:levelUp', (p) => this._onLevelUp(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => { this._muted = true; }));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },

  newGame() {
    this._reset();
  },

  _reset() {
    // Archetypes already taught this run. Marked on ANNOUNCE, not on sight, so a hint crowded out
    // by this wave's budget still gets its turn next wave instead of being lost forever.
    this._hintedEnemyIds = new Set();
    this._plan = null;
    this._planWave = 0;
    this._muted = false;
    this._resetWave(0);
  },

  _resetWave(wave) {
    this._wave = Number.isInteger(wave) ? wave : 0;
    this._linesThisWave = 0;
    this._hintsThisWave = 0;
    this._openedWave = 0;
    this._bossAnnouncedWave = 0;
    this._closedWave = 0;
  },

  // ── emit helpers ──────────────────────────────────────────────────────────────────────────────
  // Every player-facing line goes through _say or _alert so the per-wave bound cannot be dodged.

  /** True when a line may be spoken at all: live run, not muted, budget left. */
  _canSpeak() {
    if (this._muted) return false;
    if (!liveSurvivalRun(this.state)) return false;
    if (!this.bus || typeof this.bus.emit !== 'function') return false;
    return this._linesThisWave < MAX_LINES_PER_WAVE;
  },

  /**
   * One voice line. `id` is DISTINCT per line on purpose: voiceArbiter treats a repeated id on the
   * live floor as a REPLACEMENT (voiceArbiter.js:296-300), so a single stable id would silently
   * collapse a wave's whole announcement into one.
   */
  _say(channel, id, text, ttl) {
    if (!text || !this._canSpeak()) return false;
    this._linesThisWave += 1;
    this.bus.emit('voice:say', { channel, id, text, ttl });
    return true;
  },

  /**
   * One danger alert. Finite ttl only — alerts.js:251-256 sends anything with ttl Infinity or null
   * to the persistent pill path, and there is no bus seam to clear that pill by key.
   */
  _alert(key, sev, text, ttl) {
    if (!text || !this._canSpeak()) return false;
    this._linesThisWave += 1;
    this.bus.emit('alert', { key, sev, text, ttl });
    return true;
  },

  // ── run events ────────────────────────────────────────────────────────────────────────────────

  _onWavePlanned(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    // Keyed by wave: run:waveStarted carries only {wave, tick}, so a stale plan must never be
    // allowed to describe the wrong wave.
    this._plan = payload.plan || null;
    this._planWave = wave;
  },

  _onWaveStarted(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    if (this._openedWave === wave) return;

    this._resetWave(wave);
    this._openedWave = wave;
    if (this._planWave !== wave) return;

    const line = waveOpeningLine(wave, this._plan);
    // 'objective' (60) — this IS the objective nudge: it yields to danger and story, and outranks
    // enemy chatter. voiceArbiter.js:41.
    this._say('objective', `survival:w${wave}:open`, line, 6);
  },

  _onWaveMaterialized(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const rec = payload || {};
    const wave = rec.wave;
    if (!Number.isInteger(wave) || wave !== this._wave) return;
    // Nothing was admitted, so nothing arrived. Do not announce a body that does not exist.
    if (!Number.isInteger(rec.admitted) || rec.admitted <= 0) return;
    const enemyId = rec.enemyId;
    if (typeof enemyId !== 'string' || !ENEMY_BY_ID.has(enemyId)) return;

    if (this._tryBossArrival(wave, enemyId)) return;
    this._tryCounterHint(enemyId);
  },

  /**
   * The wave-10 boss gets a real arrival: its own authored telegraph, a camera beat, and a danger
   * alert — fired when the hull actually exists, not when the wave nominally opens.
   *
   * Gated on the PLAN objective being 'boss' as well as the hull being capital-class, so an ordinary
   * wave that happens to field something heavy never borrows the boss beat.
   */
  _tryBossArrival(wave, enemyId) {
    if (this._bossAnnouncedWave === wave) return false;
    if (this._planWave !== wave) return false;
    const plan = this._plan;
    if (!plan || !plan.objective || plan.objective.kind !== 'boss') return false;
    const def = ENEMY_BY_ID.get(enemyId);
    if (!def || def.shipClass !== 'capital') return false;

    this._bossAnnouncedWave = wave;
    // The boss's counterHint is a near-restatement of its telegraph ("cross the bow"), so the
    // arrival CONSUMES the hint. Two lines saying one thing is the wall of text this system exists
    // to avoid.
    this._hintedEnemyIds.add(enemyId);

    // sev 'danger' → alerts.js announce() at priority 110, above every other channel. One line.
    const spoke = this._alert('survival_boss', 'danger', bossArrivalLine(enemyId), 5);
    if (!spoke) return true;
    // No `position`: renderer.js:3537 treats a positionless payload as player-scoped by
    // construction, which is right for a scripted arrival beat. 0.55 sits inside the 0.2-0.9
    // range combat already uses. Not counted against the line budget — a shake is not a line.
    this.bus.emit('camera:shake', { amount: 0.55 });
    return true;
  },

  /** Teach an archetype's counter the first time it is really on the field, once per run. */
  _tryCounterHint(enemyId) {
    if (this._hintedEnemyIds.has(enemyId)) return;
    if (this._hintsThisWave >= MAX_HINTS_PER_WAVE) return;
    const text = hintTextFor(enemyId);
    if (!text) return;
    // 'tutorial' (70) — voiceArbiter.js:40 calls this channel "first-hour teaching", which is
    // exactly what a counter-hint is. It preempts objective and chatter, yields to danger.
    if (!this._say('tutorial', `survival:hint:${enemyId}`, text, 7)) return;
    this._hintedEnemyIds.add(enemyId);
    this._hintsThisWave += 1;
  },

  _onWaveCleared(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const rec = payload || {};
    const wave = rec.wave;
    if (!Number.isInteger(wave) || wave !== this._wave) return;
    if (this._closedWave === wave) return;
    this._closedWave = wave;

    if (rec.starved === true) {
      // The cap admitted nothing, so the wave resolved without a fight. Saying "clear" here would
      // be a lie the player has no way to catch.
      this._say('alert', `survival:w${wave}:starved`, `Wave ${wave} closed empty. Nothing reached the field. That was not a clear.`, 6);
      return;
    }
    const admitted = Number.isInteger(rec.admitted) && rec.admitted > 0 ? rec.admitted : 0;
    const tally = admitted > 0 ? ` ${capitalize(countWord(admitted))} down.` : '';
    this._say('objective', `survival:w${wave}:clear`, `Wave ${wave} clear.${tally}`, 4);
  },

  _onLevelUp(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const level = payload && payload.level;
    if (!Number.isInteger(level) || level < 1) return;
    // 'info' (10) — good news that must never out-shout a threat. It surfaces when the net is quiet.
    this._say('info', `survival:level:${level}`, `Level ${level}.`, 3);
  },

  _onTransitioned(payload) {
    const phase = payload && payload.phase;
    // 'victory' is a TERMINAL phase that emits no run:ended (uiRoot.js:1003), so run:ended alone
    // would leave a won run's announcer live. Both terminal phases mute.
    if (phase === 'victory' || phase === 'ended') {
      this._muted = true;
      return;
    }
    // A fresh wave_intro means the previous wave's line budget is spent and gone.
    if (phase === 'wave_intro') this._hintsThisWave = 0;
  },
};

export default survivalAnnounce;
