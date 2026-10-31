// Survival run voice (PQ-133 / CRU-019).
//
// A ten-wave Survival run used to happen in total silence: waves opened with no word, the wave-10
// boss arrived unremarked, and a pile of authored warning copy never reached anybody. This system
// is the run's combat net. It says what is coming and from where, gives the boss a real arrival,
// teaches an archetype's counter the first time the player meets it, names an elite's affix trick
// the first time a marked hull carries it, and marks a wave cleared —
// or says plainly when the spawn cap starved a wave so the player never mistakes it for a clear.
// It also names the watchdog's stall release, so a room that resumes spawning after a starved
// hold never reads as the sim quietly glitching back to life.
//
// It is READ-ONLY over the run. It never writes state.run (runSession owns that), never spawns,
// and uses no RNG at all — every line is a pure function of the plan and the receipts. FB-025
// added the one tick it keeps: update() counts the intro windows down and emits
// run:arenaIntroComplete / run:waveIntroComplete when the beat it spoke has played.
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
import { SURVIVAL_TEMPLATE_BLOCK } from '../data/survivalActs.js';
import { physicalProblemFromPackages, shippedQuestionFor } from '../data/survivalWaves.js';
import { SWARM_CHAMPION_LEAD_WAVES, SWARM_RULESET, swarmNextBossFor } from '../data/swarmMode.js';
import { SWARM_AFFIX_BY_ID } from '../data/swarmThreats.js';
import { validateRunState } from '../core/runState.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
} from './survivalRun.js';
import { playerBearingName } from '../core/playerCompass.js';
import { CRYO_ARENA_ID } from './cryoDriftArena.js';
import { GATE_BEARINGS } from './waveMaterialization.js';
import { verbBindingLabel } from '../onboarding/verbSpeech.js';
import { isHostileToPlayer } from './scanner.js';
import { occupantGenerationOf } from '../core/entity.js';

/**
 * Hard ceiling on player-facing lines per wave. Counts voice:say AND alert, because alerts.js
 * turns a finite-ttl alert into a voice:say. Worst authored case is the arc boss wave:
 * opener + question (PQ-140) + arrival + cleared + levelUp = 5. Nothing can exceed it.
 */
export const MAX_LINES_PER_WAVE = 5;
// Above story, below a life-critical danger line, so the named kill speaks over whatever is up.
export const NAMED_KILL_PRIORITY = 105;

/** At most one counter-hint per wave. Teaching two archetypes at once teaches neither. */
export const MAX_HINTS_PER_WAVE = 1;

/**
 * A brood family tell is a beat, not a sermon. Many cells commit in the same breath, so the
 * voice keeps at most this many telegraph lines a wave — each still counted against
 * MAX_LINES_PER_WAVE through _alert, because the bound is hard.
 */
export const MAX_BROOD_TELEGRAPH_LINES_PER_WAVE = 2;
/** Sim seconds before the same family may speak its tell again inside one wave. */
export const BROOD_TELEGRAPH_GAP_S = 8;
/** Reading time for a tell — short, since the attack lands a breath behind it. */
const BROOD_TELEGRAPH_TTL_S = 3;

/**
 * An affix first-sight tell is a vocabulary lesson, not a chorus: a whole wave stamping the same
 * trick is one spoken line, and a wave that debuts several tricks still paces them — at most
 * this many affix tells a wave, each counted against MAX_LINES_PER_WAVE through _alert, because
 * the bound is hard. A type crowded out of one wave stays unmarked and speaks on a later stamp.
 */
export const MAX_AFFIX_LINES_PER_WAVE = 2;
/** Reading time for an affix tell — it teaches a trick, not an imminent attack. */
const AFFIX_TELL_TTL_S = 5;

/**
 * Gate id → world bearing, in words.
 *
 * These are WORLD directions, not player-relative ones: waveMaterialization.js:117-118 takes the
 * gate's unit vector straight to `atan2(bearing.z, bearing.x)` and never rotates it by the player's
 * heading, so "ahead" would be a lie. Compass words are permanently true here because camera.js:1
 * is explicit that the chase camera "follows player POSITION only (never yaw)" — north is always
 * the same direction on screen.
 *
 * The words are derived from GATE_BEARINGS through playerCompass (+z is north, screen up).
 * A hand-written table here is how a second north gets back in. The old −z-is-north
 * reading pointed every callout at the bottom of the flight view.
 */
const BEARING_WORD = Object.freeze(Object.fromEntries(
  Object.keys(GATE_BEARINGS).map((gateGroup) => {
    const bearing = GATE_BEARINGS[gateGroup];
    return [gateGroup, `the ${playerBearingName(bearing.x, bearing.z)}`];
  }),
));

/**
 * Player-facing prose for the authored counterHint tokens in src/data/enemies.js.
 *
 * Twelve authored hints are snake_case tokens ('cut_tether_or_clear_wake'), not sentences — they
 * were written for a consumer that never got built. This is that consumer, so the tokens get
 * their words here. dreadnought_boss authored real prose and is used verbatim (see hintTextFor).
 * An unknown token prints NOTHING rather than leaking a raw identifier at the player.
 */
const HINT_PROSE = Object.freeze({
  cut_tether_or_clear_wake: 'Salts your wake. Do not fly a straight line back through it.',
  hold_missiles_use_kinetics_peel_escort: 'Eats missiles. Guns only, and peel it off the pack first.',
  break_lock_close_under_cover: 'Shoots from long range. Break its lock and close under cover.',
  displace_break_anchor_or_outmass: 'Contests your Massline. Displace, break the anchor, or outmass it.',
  kill_or_massline_displace_anchor_leave_radius: 'Holds you inside its field. Kill it, displace it, or leave the radius.',
  low_mass_shove_tether_or_kill_at_range_blast_hits_everyone: 'Light hull. Shove it with the line or stay outside the blast — it hits everyone.',
  cross_the_pass_shoot_the_stern_while_it_turns_back: 'Cross its pass and shoot the stern while it swings back.',
  bank_shots_off_room_plate_or_attack_the_flanks: 'Its face sheds shots. Bank one off the plate or take the flanks.',
  outrange_or_ignore_until_pack_commits: 'Outrange it, or ignore it until the pack commits.',
  move_line_or_throw_cutter: 'Opens a fixed crossing. Move off the line, or throw the cutter off it.',
  finite_coolant_directional_heat: 'Charges a narrow heat lane. Cross its nose, break a cask, or tow it into its own heat.',
  physical_decoys_true_iris: 'Its lamps are decoys. Watch the six-petal iris — that is the real gun.',
  break_flank_banks_cross_locked_spine_use_cover: 'Break the flank battery banks, cross the locked spine cannon, and use cover between sweeps.',
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
 * PQ-140 — the wave's physical question, as one player-facing sentence, or null.
 *
 * Act I arc waves read the question the shipped recipe carries (shippedQuestionFor — the one
 * authority for the PQ-133.04 Foundry boss override). Everywhere the arc composer or a mutator
 * swaps bodies in — act II/III, endless overlays, heavies_only, and every generated swarm wave —
 * the row is read from the packages the plan ACTUALLY fields instead
 * (physicalProblemFromPackages). A combat net that names a hull that is not coming teaches the
 * player to ignore the net. The boss circuit is silent on purpose: its step number is not a
 * template wave, and the boss arrival line names itself.
 */
function questionClauseFor(wave, plan, arenaId) {
  if (!plan || plan.mode === 'boss_circuit') return null;
  const derived = Boolean(plan.swarm) || plan.heaviesOnly === true || plan.mode === 'endless'
    || !Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_TEMPLATE_BLOCK;
  const row = derived
    ? physicalProblemFromPackages(packagesOf(plan))
    : shippedQuestionFor(arenaId, wave);
  return row && typeof row.question === 'string' && row.question.length > 0 ? row.question : null;
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
 *   "Wave 1. Six hostiles from the south. Clear the arena."
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
  // announcing "nine hostiles" would be a promise the wave immediately breaks. The wave ends on a
  // sixty-second clock. Kills buy score; they do not close the wave.
  const swarm = plan && plan.swarm;
  if (swarm) {
    const bearings = [];
    for (const pkg of packages) {
      const word = BEARING_WORD[pkg && pkg.gateGroup];
      if (word && !bearings.includes(word)) bearings.push(word);
    }
    const where = joinBearings(bearings);
    const arrival = where ? `Contact ${where}.` : 'Contact on every bearing.';
    const newcomer = swarm.newcomer && swarm.newcomer.name ? swarm.newcomer.name : null;
    // SF-072: when the plan bent its roster toward the run's dominant build family, the banner
    // says what the room brought — the player should SEE the room answering their habit.
    const pressure = typeof swarm.pressureLine === 'string' && swarm.pressureLine
      ? ` ${swarm.pressureLine}`
      : '';
    // SF-062: a mass-gap wave names its lesson — the wall is the room, the gaps are the route.
    const wall = typeof swarm.wallLine === 'string' && swarm.wallLine
      ? ` ${swarm.wallLine}`
      : '';
    // NXB-017: an act round names its question — the physical decision, not the answer.
    const actLine = swarm.act && typeof swarm.act.question === 'string'
      ? ` ${swarm.act.question}`
      : '';
    // SWARM-08 B5 — the finite Circuit names its place in the journey and the rule that closes
    // the round. A survive round must never promise cohort elimination: its clock is the door.
    const circuit = swarm.circuit && typeof swarm.circuit === 'object' ? swarm.circuit : null;
    const stageLine = circuit
      ? `Stage ${circuit.stage}, round ${circuit.localRound}. `
      : '';
    const closing = !circuit ? 'Break the pack.'
      : circuit.kind === 'survive' ? 'Survive sixty seconds.'
        : circuit.kind === 'defend' ? 'Defend the beacon.'
        : circuit.kind === 'escort' ? 'Escort the freighter.'
        : circuit.kind === 'nodes' ? 'Destroy the hive nodes.'
          : circuit.kind === 'hold' ? 'Hold the zone.'
            : circuit.kind === 'collect' ? 'Collect the cores.'
              : circuit.kind === 'commander' ? `Assassinate ${circuit.commanderName || 'the commander'}.`
                : circuit.kind === 'reach' ? 'Reach the gate.'
                  : 'Break the pack.';
    // Explicit scout Training names what is on the field, not the held pack: one hull, one rock
    // available as an optional weapon, and the pack still on its way.
    if (plan.openingLesson) {
      return `Wave ${wave}. One hostile on the field — the rest are holding. Use fitted guns or swing debris into it — releasing the line is optional.`;
    }
    if (swarm.boss) {
      // The champion NAMES ITSELF. A boss wave can be one Dreadnought or a wing of three raiders,
      // and "Corsair Raider leads" would describe the second one as if it were the first.
      const label = swarm.bossLabel || 'A capital signature';
      const line = swarm.bossLine ? ` ${swarm.bossLine}` : '';
      return `Wave ${wave}. ${stageLine}${arrival} ${label}.${line}${pressure}${wall}${actLine} ${closing}`;
    }
    const namecheck = newcomer ? ` ${newcomer} is new.` : '';
    return `Wave ${wave}. ${stageLine}${arrival}${namecheck}${pressure}${wall}${actLine} ${closing}`;
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
    // Per-session defeat keys — a durable boss record may re-emit on demote/reload replays and
    // each defeat deserves exactly one announcement, so this set survives _reset.
    this._bossDefeatedKeys = new Set();
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:started', () => this._reset()));
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
    this._unsubs.push(this.bus.on('run:waveStarted', (p) => this._onWaveStarted(p)));
    this._unsubs.push(this.bus.on('run:waveMaterialized', (p) => this._onWaveMaterialized(p)));
    this._unsubs.push(this.bus.on('swarm:pressureTelegraph', (p) => this._onPressureTelegraph(p)));
    this._unsubs.push(this.bus.on('swarm:broodTelegraph', (p) => this._onBroodTelegraph(p)));
    this._unsubs.push(this.bus.on('swarm:affix', (p) => this._onAffix(p)));
    this._unsubs.push(this.bus.on('swarm:stallReleased', (p) => this._onStallReleased(p)));
    this._unsubs.push(this.bus.on('run:openingLessonReleased', (p) => this._onOpeningLessonReleased(p)));
    this._unsubs.push(this.bus.on('tether:latched', (p) => this._onOpeningThrowLatch(p)));
    this._unsubs.push(this.bus.on('tether:cut', (p) => this._onOpeningThrowCut(p)));
    this._unsubs.push(this.bus.on('tether:released', (p) => this._onOpeningThrowReleased(p)));
    this._unsubs.push(this.bus.on('tether:whipImpact', (p) => this._onOpeningThrowImpact(p)));
    this._unsubs.push(this.bus.on('entity:destroyed', () => this._updateOpeningThrow()));
    this._unsubs.push(this.bus.on('run:waveCleared', (p) => this._onWaveCleared(p)));
    this._unsubs.push(this.bus.on('run:levelUp', (p) => this._onLevelUp(p)));
    this._unsubs.push(this.bus.on('run:transitioned', (p) => this._onTransitioned(p)));
    this._unsubs.push(this.bus.on('run:ended', () => { this._muted = true; }));
    this._unsubs.push(this.bus.on('boss:defeated', (p) => this._onBossDefeated(p || {})));
    this._unsubs.push(this.bus.on('survivalArena:installed', (p) => this._onArenaInstalled(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._openingThrow = null;
  },

  newGame() {
    this._reset();
  },

  _reset() {
    // Archetypes already taught this run. Marked on ANNOUNCE, not on sight, so a hint crowded out
    // by this wave's budget still gets its turn next wave instead of being lost forever.
    this._hintedEnemyIds = new Set();
    // Affix types already taught this run — the same announce-not-sight law as the hints.
    this._seenAffixIds = new Set();
    this._plan = null;
    this._planWave = 0;
    this._muted = false;
    this._arenaIntroArmed = false;
    this._arenaIntroTicks = 0;
    this._resetWave(0);
  },

  _resetWave(wave) {
    this._wave = Number.isInteger(wave) ? wave : 0;
    this._linesThisWave = 0;
    this._hintsThisWave = 0;
    this._openedWave = 0;
    this._bossAnnouncedWave = 0;
    this._closedWave = 0;
    this._waveIntroArmed = 0;
    this._waveIntroTicks = 0;
    this._compassWave = 0;
    this._broodTeleAt = new Map(); // family id -> simTime it last spoke a tell
    this._broodTeleLines = 0;      // telegraph lines spent this wave
    this._affixLines = 0;          // affix first-sight lines spent this wave
    this._stallSpokeWave = 0;      // the wave the stall release last spoke on
    this._openingThrow = null;
    this._openingPack = null;
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
  _say(channel, id, text, ttl, opts = null) {
    const forced = !!(opts && opts.force);
    if (!text) return false;
    if (forced) {
      if (this._muted || !liveSurvivalRun(this.state)) return false;
      if (!this.bus || typeof this.bus.emit !== 'function') return false;
    } else if (!this._canSpeak()) return false;
    // A forced line is the round's result. It does not spend the warning budget, and a
    // spent warning budget cannot swallow it.
    if (!forced) this._linesThisWave += 1;
    this.bus.emit('voice:say', forced
      ? { channel, id, text, ttl, priority: NAMED_KILL_PRIORITY }
      : { channel, id, text, ttl });
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

  /**
   * FB-025 — the intro window's one timed job: count the beat the machine authored and emit the
   * completion when it has played. Everything else in this voice stays event-driven. The phase
   * machine's own tick floor is the same constant, so a muted or absent announce can never stall
   * a wave; the emit is the announce's receipt that the line went out inside the window.
   */
  update() {
    if (this._muted) return;
    const run = liveSurvivalRun(this.state);
    if (!run) return;
    this._updateOpeningThrow();
    if (run.phase === 'arena_intro') {
      if (this._arenaIntroArmed) {
        this._arenaIntroTicks += 1;
        if (this._arenaIntroTicks >= SURVIVAL_ARENA_INTRO_TICKS) {
          this._arenaIntroArmed = false;
          this._emitComplete('run:arenaIntroComplete', {});
        }
      }
    } else {
      this._arenaIntroArmed = false;
    }
    if (run.phase === 'wave_intro') {
      if (this._waveIntroArmed > 0) {
        this._waveIntroTicks += 1;
        if (this._waveIntroTicks >= SURVIVAL_WAVE_INTRO_TICKS) {
          const wave = this._waveIntroArmed;
          this._waveIntroArmed = 0;
          this._emitComplete('run:waveIntroComplete', { wave });
        }
      }
    } else {
      this._waveIntroArmed = 0;
    }
  },

  _emitComplete(event, payload) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit(event, payload);
  },

  _onWavePlanned(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    // Keyed by wave: run:waveStarted carries only {wave, tick}, so a stale plan must never be
    // allowed to describe the wrong wave.
    this._plan = payload.plan || null;
    this._planWave = wave;
    // FB-025 — the opening line IS the intro window's content: it is spoken when the plan lands
    // (window start), so it has already been read by the time the first body spawns. The window's
    // completion emit is armed at the same moment.
    if (this._openedWave !== wave) {
      this._resetWave(wave);
      this._openedWave = wave;
      if (wave === 1 && this.state.run.ruleset === 'swarm' && this._plan?.openingLesson
        && !this._plan?.swarm?.circuit) {
        const player = this.state.entities?.get(this.state.playerId);
        this._openingPack = { seed: this.state.run.seed, player,
          generation: occupantGenerationOf(player), spoken: false };
      }
      if (wave === 1 && this.state.run.ruleset === 'swarm' && this._plan?.openingLesson
        && !this._plan?.swarm?.circuit) {
        this._openingThrow = { seed: this.state.run.seed, player: this.state.entities?.get(this.state.playerId),
          stage: 'offered', rock: null, startedAt: null, spokeLatch: false };
        this._openingThrow.playerGeneration = occupantGenerationOf(this._openingThrow.player);
      }
      this._speakOpening(wave);
    }
    this._waveIntroTicks = 0;
    this._waveIntroArmed = wave;
  },

  _speakOpening(wave) {
    const teach = this._openingThrow && this.state.settings?.gameplay?.tutorialHints !== false;
    const latch = teach ? verbBindingLabel(this.state, 'tether') : '';
    const fire = teach ? verbBindingLabel(this.state, 'fire') : '';
    const gunOption = fire ? `Fire fitted primary guns with ${fire}` : 'Fire fitted primary guns';
    const line = teach
      ? latch
        ? `Wave ${wave}. One hostile — the pack is holding. ${gunOption}, or aim at the small rock and tap ${latch} to latch it.`
        : `Wave ${wave}. One hostile — the pack is holding. ${gunOption}. Defeat it to bring the pack in.`
      : waveOpeningLine(wave, this._plan);
    // 'objective' (60) — this IS the objective nudge: it yields to danger and story, and outranks
    // enemy chatter. voiceArbiter.js:41.
    const spoke = this._say('objective', `survival:w${wave}:open`, line, 6);
    if (spoke && teach && latch) {
      // The lesson's one teaching focus replaces this hull's generic counter-hint too.
      // Otherwise its materialization spends the slot the real throw payoff needs.
      const lessonHull = this._plan?.packages?.find((pkg) => pkg?.lesson === true);
      if (lessonHull?.enemyId) this._hintedEnemyIds.add(lessonHull.enemyId);
    }
    // PQ-140 — then the wave names the PHYSICAL problem it poses, as its own one-sentence beat
    // on the same channel. One line, inside the per-wave budget (the arc boss wave is the worst
    // authored case at five). A wave that cannot open cannot spend a second line.
    if (spoke) {
      const arenaId = this.state && this.state.run ? this.state.run.arenaId : null;
      const question = questionClauseFor(wave, this._plan, arenaId);
      // This room's question is the optional live throw. Its two causal lines replace the
      // abstract question, leaving the existing pack-arrival and clear inside the five-line cap.
      if (question && !teach) this._say('objective', `survival:w${wave}:why`, question, 6);
      this._speakChampionApproach(wave);
    }
  },

  /**
   * The next champion is a named goal, not a rumor. At exactly the authored lead the net
   * speaks the rotation row the ladder will field — its label, the wave it waits on, and
   * its authored line — once, then stays quiet: no countdown, and nothing on the boss wave
   * itself, which names itself on arrival. A Circuit round carries its own boss contract,
   * so the cadence preview would lie there; mutator runs keep it because the cadence
   * champion still lands.
   */
  _speakChampionApproach(wave) {
    const swarm = this._plan && this._plan.swarm;
    if (!swarm || swarm.circuit) return;
    const next = swarmNextBossFor(wave);
    if (!next || next.distance !== SWARM_CHAMPION_LEAD_WAVES) return;
    const line = typeof next.line === 'string' && next.line ? ` ${next.line}` : '';
    this._say('objective', `survival:w${wave}:champion`, `${next.label} waits at wave ${next.wave}.${line}`, 6);
  },

  /**
   * Cryo halves that name north or south. The install note is already in the player compass;
   * this is the line the combat net speaks so the pilot hears the same north as the wave callout.
   * East/west halves already matched and stay on the install payload alone.
   */
  _onArenaInstalled(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    if (!payload || payload.arenaId !== CRYO_ARENA_ID) return;
    const note = typeof payload.note === 'string' ? payload.note : '';
    if (!/\b(north|south)\b/.test(note)) return;
    const wave = payload.wave;
    if (!Number.isInteger(wave) || wave < 1 || this._compassWave === wave) return;
    this._compassWave = wave;
    this._say('objective', `survival:w${wave}:compass`, note, 6);
  },

  _onWaveStarted(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    if (wave === 1 && this._openingThrow && this._openingThrow.startedAt == null
      && Number.isFinite(this.state.simTime)) this._openingThrow.startedAt = this.state.simTime;
    if (this._openedWave === wave) return;

    // Fallback for a wave whose plan this voice never saw (e.g. a direct waveStarted): it still
    // opens on time, and only a plan for THIS wave may name it.
    this._resetWave(wave);
    this._openedWave = wave;
    if (this._planWave !== wave) return;
    this._speakOpening(wave);
  },

  _onWaveMaterialized(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const rec = payload || {};
    const wave = rec.wave;
    if (!Number.isInteger(wave) || wave !== this._wave) return;
    // Nothing was admitted, so nothing arrived. Do not announce a body that does not exist.
    if (!Number.isInteger(rec.admitted) || rec.admitted <= 0) return;
    this._tryOpeningPackArrival(rec);
    const enemyId = rec.enemyId;
    if (typeof enemyId !== 'string' || !ENEMY_BY_ID.has(enemyId)) return;

    if (this._tryBossArrival(wave, enemyId)) return;
    this._tryCounterHint(enemyId);
  },

  _onPressureTelegraph(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    const stored = payload && Number.isInteger(payload.stored) ? payload.stored : 0;
    const countText = stored > 0
      ? `${capitalize(countWord(stored))} ${stored === 1 ? 'hostile' : 'hostiles'}`
      : 'Hostile reinforcement';
    this._say('objective', `survival:w${wave}:surge:${payload && payload.tick != null ? payload.tick : 0}`, `Inbound surge. ${countText} on approach.`, 4);
  },

  /**
   * D195 — the stall watchdog's release, heard. A pressure hold that froze an owed quota is
   * lifted after nine suppressed seconds and the stream's own law resumes the round — the room
   * visibly refills after a dead lull with no other word for it, so the net says why, once per
   * wave and counted in the same budget. 'objective' like the surge telegraph: a state of the
   * round, not a danger beat. Marked on a successful speak, so a line crowded out of this wave's
   * budget can still be said by a later release instead of being lost silently.
   */
  _onStallReleased(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave < 1) return;
    if (this._stallSpokeWave === wave) return;
    const spoke = this._say('objective', `survival:w${wave}:stall`,
      'The room breathes again — the pack is inbound.', 5);
    if (spoke) this._stallSpokeWave = wave;
  },

  /**
   * SWARM-07 B2 — a brood family's tell, heard. The engine emits once per cell that commits
   * to the attack language (a buried family cracking out of the rock, the mother's first
   * birth, a splitter's break), each carrying the family's authored {bark,line}. A burst of
   * cells is one warning, never a chorus: one line per family per gap, a small count per
   * wave, and the shared per-wave bound through _alert. Warn-sev on the alert lane — above
   * the chatter it must beat to be useful, below a danger line.
   */
  _onBroodTelegraph(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const familyId = payload && payload.familyId;
    const line = payload && payload.line;
    if (typeof familyId !== 'string' || !familyId) return;
    if (typeof line !== 'string' || !line) return;
    if (this._broodTeleLines >= MAX_BROOD_TELEGRAPH_LINES_PER_WAVE) return;
    const now = Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
    const last = this._broodTeleAt.get(familyId);
    if (last != null && now - last < BROOD_TELEGRAPH_GAP_S) return;
    // Finite ttl is the alerts.js law — a persistent pill has no bus seam to clear it. The
    // stable key also coalesces a repeated tell in the arbiter instead of stacking it.
    const sev = payload.bark === 'danger' ? 'danger' : 'warn';
    if (!this._alert(`brood-telegraph:${familyId}`, sev, line, BROOD_TELEGRAPH_TTL_S)) return;
    this._broodTeleAt.set(familyId, now);
    this._broodTeleLines += 1;
  },

  /**
   * SWARM-06 §6.4 — an elite trick's first sight, named. swarmElites stamps a marked hull and
   * emits the receipt (affixes[] carries the primary plus a veteran's second), and nobody
   * listened: a shielded or volatile hostile arrived with no vocabulary for what made it
   * different. The combat net speaks the affix's own authored blurb once per run per type —
   * marked on ANNOUNCE, the same law as the counter-hints, so a wave whose budget is spent
   * defers the lesson to a later stamp instead of losing it. A veteran's two tricks are two
   * lessons: one line per affix type, never per body. Warn-sev on the alert lane, and the
   * stable key coalesces a repeated tell in the arbiter instead of stacking it.
   */
  _onAffix(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const list = payload && Array.isArray(payload.affixes) && payload.affixes.length > 0
      ? payload.affixes
      : [payload && payload.affix, payload && payload.affix2].filter((a) => typeof a === 'string');
    for (const id of list.slice(0, 4)) {
      if (this._seenAffixIds.has(id)) continue;
      if (this._affixLines >= MAX_AFFIX_LINES_PER_WAVE) return;
      const row = SWARM_AFFIX_BY_ID[id];
      // An unrecognised id is silence, never a raw identifier on the player's screen.
      if (!row) continue;
      const text = typeof row.blurb === 'string' && row.blurb
        ? `${row.name}: ${row.blurb}`
        : `${row.name} is on the field.`;
      if (!this._alert(`swarm-affix:${id}`, 'warn', text, AFFIX_TELL_TTL_S)) return;
      this._seenAffixIds.add(id);
      this._affixLines += 1;
    }
  },

  /** End scout coaching on release; the pack speaks only when a held body is admitted. */
  _onOpeningLessonReleased(payload) {
    if (this._muted) return;
    if (!liveSurvivalRun(this.state)) return;
    const wave = payload && payload.wave;
    if (!Number.isInteger(wave) || wave !== this._wave) return;
    this._openingThrow = null;
    // Release is intent, not admission. The existing pack line waits for an actual held body.
  },

  /** One existing voice slot, on real admission for both early release and hold expiry. */
  _tryOpeningPackArrival(rec) {
    const watch = this._openingPack;
    const run = this.state.run;
    const fact = rec.openingPack;
    const player = this.state.entities?.get(this.state.playerId);
    if (!watch || watch.spoken || !fact || run.ruleset !== 'swarm' || run.phase !== 'active'
      || run.wave !== 1 || rec.wave !== this._planWave || watch.seed !== run.seed || fact.seed !== run.seed
      || fact.lesson !== this._plan?.openingLesson || !player || player.alive === false
      || player !== watch.player || occupantGenerationOf(player) !== watch.generation) return false;
    const pkg = this._plan.packages?.[fact.packageIndex];
    if (!Number.isInteger(fact.packageIndex) || !pkg || pkg.lesson === true || !(pkg.count > 0)
      || pkg.enemyId !== rec.enemyId || pkg.gateGroup !== (rec.sourceGateGroup || rec.gateGroup)) return false;
    const name = ENEMY_BY_ID.get(rec.enemyId)?.name;
    const arrival = fact.arrivals?.find(item => {
      const e = this.state.entities.get(item?.entityId);
      return e && e.alive !== false && item.generation != null
        && occupantGenerationOf(e) === item.generation && e.data?.runCohort === 'survival'
        && e.data?.runWave === rec.wave && e.data?.lootTableId === rec.enemyId && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z);
    });
    if (!name || !arrival || !Number.isFinite(player.pos?.x) || !Number.isFinite(player.pos?.z)) return false;
    // Clearance can move a spawn away from its scheduled gate. Speak its actual admitted body.
    const entity = this.state.entities.get(arrival.entityId);
    const dx = entity.pos.x - player.pos.x, dz = entity.pos.z - player.pos.z;
    if (dx === 0 && dz === 0) return false;
    const bearing = `the ${playerBearingName(dx, dz)}`;
    // If the scout was refused, its archetype hint has not had a turn. Fold that same useful
    // counter into this one line rather than let tutorial priority hide the arrival behind it.
    const counter = !this._hintedEnemyIds.has(rec.enemyId) && this._hintsThisWave < MAX_HINTS_PER_WAVE
      ? hintTextFor(rec.enemyId) : null;
    const line = `The pack is arriving — ${name} from ${bearing}. ${counter || 'Use fitted guns or swing debris.'} Break the pack.`;
    if (!this._say('objective', `survival:w${rec.wave}:pack`, line, 6)) return false;
    watch.spoken = true;
    if (counter) {
      this._hintedEnemyIds.add(rec.enemyId);
      this._hintsThisWave += 1;
    }
    this._openingThrow = null;
    return true;
  },

  // An explicit Training opportunity, not a new objective or persistent tutorial. The
  // launch owner alone decides whether openingLesson exists; kills, quota, timers and input stay theirs.
  _openingThrowActive() {
    const st = this.state;
    const lesson = this._openingThrow;
    const run = liveSurvivalRun(st);
    if (!lesson || this._muted || !run || run.seed !== lesson.seed || run.ruleset !== 'swarm'
      || run.wave !== 1 || run.phase !== 'active' || st.mode !== 'flight'
      || st.ui?.screenStack?.length || st.settings?.gameplay?.tutorialHints === false
      || !verbBindingLabel(st, 'tether')) return null;
    const player = st.entities?.get(st.playerId);
    if (!player || player !== lesson.player || player.alive === false
      || occupantGenerationOf(player) !== lesson.playerGeneration) return null;
    const hold = this._plan?.openingLesson?.holdTicks;
    if (!Number.isFinite(hold) || hold <= 0 || !Number.isFinite(st.simTime)) return null;
    if (lesson.startedAt == null) lesson.startedAt = st.simTime;
    if (st.simTime - lesson.startedAt >= hold / 60) {
      this._openingThrow = null;
      return null;
    }
    return lesson;
  },

  _sayOpeningThrow(id, text, ttl) {
    // Coaching yields its slot before the pack/clear, and never raises the shared cap.
    if (this._linesThisWave >= MAX_LINES_PER_WAVE - 2) return false;
    return this._say('objective', id, text, ttl);
  },

  _updateOpeningThrow() {
    const lesson = this._openingThrowActive();
    if (!lesson || !lesson.rock || lesson.stage === 'hit' || lesson.stage === 'lost') return;
    if (this._openingThrowRockLive(lesson)) return;
    lesson.stage = 'lost';
    // Loss is not a successful throw, and never advances the actual lesson/pack.
    this._sayOpeningThrow('survival:w1:throw-lost', 'That rock is gone. Keep fighting; the pack is still coming.', 4);
  },

  _openingThrowRockLive(lesson) {
    const rock = lesson?.rock;
    return !!rock && rock.alive !== false && this.state.entities?.get(rock.id) === rock
      && occupantGenerationOf(rock) === lesson.rockGeneration
      && rock.type === 'asteroid' && rock.data?.openingLesson === true && rock.data?.swarmArenaDebris === true;
  },

  _onOpeningThrowLatch(payload) {
    const lesson = this._openingThrowActive();
    if (!lesson || !payload || payload.sourceId !== this.state.playerId
      || lesson.stage === 'hit' || lesson.stage === 'lost') return;
    const rock = this.state.entities?.get(payload.targetId);
    if (!rock || rock.alive === false || rock.type !== 'asteroid'
      || rock.data?.openingLesson !== true || rock.data?.swarmArenaDebris !== true) return;
    lesson.rock = rock; // reference identity rejects a later entity reusing its numeric id
    lesson.rockGeneration = occupantGenerationOf(rock);
    lesson.stage = 'held';
    if (lesson.spokeLatch) return;
    const latch = verbBindingLabel(this.state, 'tether');
    // This ordinary asteroid keeps RMB as mining. Manual cut is the truthful throw route;
    // do not teach the chunk-only auto-release/white-diamond control here.
    lesson.spokeLatch = this._sayOpeningThrow('survival:w1:throw-held',
      `Fly an arc to swing the held rock into the hostile. Tap ${latch} again if you want to sling it free.`, 6);
  },

  _onOpeningThrowCut(payload) {
    const lesson = this._openingThrowActive();
    const tether = this.state?.player?.tether;
    if (!lesson || lesson.stage !== 'held' || !payload || payload.targetId !== lesson.rock?.id
      || !this._openingThrowRockLive(lesson)
      || tether?.active !== true || tether.targetId !== payload.targetId) return;
    // A cut receipt has no owner field. The earlier player latch plus their still-active
    // mirror binds it to this body. A release/break alone is never a deliberate throw.
    lesson.stage = 'released';
    lesson.cutAt = this.state.simTime;
    lesson.priorImpacts = new Set(this.state.player?.masslineImpacts?.impacts || []);
  },

  _onOpeningThrowReleased(payload) {
    const lesson = this._openingThrowActive();
    if (!lesson || lesson.stage !== 'held' || payload?.targetId !== lesson.rock?.id) return;
    lesson.stage = 'offered';
    lesson.rock = null;
  },

  _onOpeningThrowImpact(payload) {
    const lesson = this._openingThrowActive();
    if (!lesson || lesson.stage !== 'released' || !payload || payload.slung !== true
      || payload.targetId !== lesson.rock?.id || !this._openingThrowRockLive(lesson)
      || !Number.isFinite(payload.time) || payload.time < lesson.cutAt
      || payload.time !== this.state.simTime || payload.tick !== this.state.tick
      || lesson.priorImpacts?.has(payload)) return;
    const receipt = this.state.player?.masslineImpacts;
    // The production player-only observer mirrors the exact record before emitting it.
    // A generic same-body contact or a made-up bus payload must not earn the response.
    if (receipt?.latest !== payload && !receipt?.impacts?.includes(payload)) return;
    const victim = this.state.entities?.get(payload.victimId);
    if (!victim || (victim.type !== 'ship' && victim.type !== 'drone')
      || victim.id === this.state.playerId || !isHostileToPlayer(victim, lesson.player.team, this.state)
      || victim.data?.runCohort !== 'survival' || victim.data?.runWave !== 1) return;
    if (this._sayOpeningThrow('survival:w1:throw-hit', 'Direct hit. The room is ammunition.', 4)) lesson.stage = 'hit';
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
    // Swarm's legacy `killed` receipt field counts resolved cohort slots, including a hull that
    // fled or surrendered. It is not a kill count. Admissions are even less specific, so never
    // infer a Swarm tally from them; report only how many threats left the fight. Other modes
    // keep their established wording and receipt fallback.
    // Timed Swarm waves end on the clock: "survived", not "clear"; cohort rounds clear on resolution.
    // The commander round already wrote the named kill line. Say that, not a generic clear.
    const namedDown = typeof rec.killWord === 'string' ? rec.killWord.trim() : '';
    if (namedDown) {
      this._say('objective', `survival:w${wave}:down`, namedDown, 12, { force: true });
      return;
    }
    const resolved = Number.isInteger(rec.killed) && rec.killed >= 0 ? rec.killed : null;
    const admitted = Number.isInteger(rec.admitted) && rec.admitted > 0 ? rec.admitted : 0;
    const swarm = this.state.run.ruleset === SWARM_RULESET;
    const tallyCount = resolved != null ? resolved : (swarm ? 0 : admitted);
    const survived = rec.completionKind === 'duration';
    const verb = survived ? 'survived' : 'clear';
    const tally = tallyCount > 0
      ? swarm
        ? ` ${capitalize(countWord(tallyCount))} ${tallyCount === 1 ? 'threat' : 'threats'} out of the fight.`
        : ` ${capitalize(countWord(tallyCount))} down.`
      : '';
    this._say('objective', `survival:w${wave}:clear`, `Wave ${wave} ${verb}.${tally}`, 4);
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
    if (phase && !['loadout', 'arena_intro', 'wave_intro', 'active'].includes(phase)) this._openingThrow = null;
    // 'victory' is a TERMINAL phase that emits no run:ended (uiRoot.js:1003), so run:ended alone
    // would leave a won run's announcer live. Both terminal phases mute.
    if (phase === 'victory' || phase === 'ended') {
      this._muted = true;
      return;
    }
    // A fresh wave_intro means the previous wave's line budget is spent and gone.
    if (phase === 'wave_intro') this._hintsThisWave = 0;
    // FB-025 — the arena intro beat is armed on entry and its completion emitted from update()
    // at the authored window end. The machine's floor covers a muted or absent announce.
    if (phase === 'arena_intro') {
      this._arenaIntroArmed = true;
      this._arenaIntroTicks = 0;
    }
  },

  /**
   * FIGHT-02 — the world's capital-boss defeat is announced by this same voice. The dreadnought
   * POI fight happens outside a survival run, so this path bypasses the run gate and the
   * per-wave budget on purpose; it is still one line, deduped per defeat record, and only when
   * the player's own kill produced it.
   */
  _onBossDefeated(payload) {
    if (this._muted || !payload) return;
    if (payload.killerId !== (this.state && this.state.playerId)) return;
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    const key = `${payload.sectorId || '?'}:${payload.poiId || '?'}`;
    if (this._bossDefeatedKeys.has(key)) return;
    this._bossDefeatedKeys.add(key);
    const name = typeof payload.poiName === 'string' && payload.poiName ? payload.poiName : 'The capital signature';
    this.bus.emit('voice:say', {
      channel: 'objective',
      id: `boss:defeated:${key}`,
      text: `${name} is down.`,
      ttl: 6,
    });
  },
};

export default survivalAnnounce;
