#!/usr/bin/env node
// check-first-hour.mjs — authored first-hour route and pacing contracts.
//
// The first 15 minutes must be PACED: one beat → one verb → ≥4s silence → next beat. This check
// audits the authored pacing engine in src/systems/onboarding.js against the first-hour
// assertions:
//   1. Beats fire in order; no beat text before predecessor DONE + 4s silence.
//   2. Text overlap count == 0 across the full scripted first-15 (one-voice audit).
//   3. Every tutorial line is authored, inline-safe, and routed through the paced one-voice path.
//   4. Training actors are inert, invulnerable, non-colliding with ships, and physically reachable.
//   5. §4 difficulty ramp: telemetry funnel milestones exist (first kill/1000cr/module/jump).
//
// This check reads the authored beat table, drives the production entry clock in isolation, and
// verifies the one-voice, trainer safety and telemetry source contracts. It does not boot a game.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { SECTORS } from '../src/data/sectors.js';
import { planZoneSpawns } from '../src/data/sectorZones.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { BEATS, onboarding, taughtVerbLine } from '../src/systems/onboarding.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const onboardingSrc = read('src/systems/onboarding.js');
const flightDrillSrc = read('src/onboarding/flightDrill.js');
const authoredOnboardingSrc = `${onboardingSrc}\n${flightDrillSrc}`;
const storySrc = read('src/systems/story.js');
const missionsSrc = ['missions', 'missionBoardOps', 'missionObjectiveOps', 'missionSpawningOps', 'missionStoryOps']
  .map((f) => read(`src/systems/${f}.js`)).join('\n');
const telemetrySrc = read('src/systems/telemetry.js');
const newGameSrc = read('src/ui/screens/newGame.js');
const mainMenuSrc = read('src/ui/screens/mainMenu.js');
const contractsScreenSrc = read('src/ui/station/screens/contracts.js');

// ── B1 control truth: massline verb + production tether:reel ─────────────────────────────────
assert.doesNotMatch(authoredOnboardingSrc, /Latch it\. G\./, 'B1 must not teach Latch it. G. (G is combat computer)');
assert.doesNotMatch(authoredOnboardingSrc, /tether:reelMax/, 'B1 must not listen for dead tether:reelMax');
assert.match(flightDrillSrc, /Latch it\. Massline\./, 'B1 entry must teach massline (control prompt authority)');
assert.match(flightDrillSrc, /on:\s*'tether:reel'/, 'B1 cut follow-up must use production tether:reel');
assert.match(onboardingSrc, /_onTetherReel/, 'B1 must gate reel follow-up on tether:reel payload');

// OPENING-1: movement first, the story through the first berth, then optional flight drills.
const EXPECTED_KEYS = ['thrust', 'brake', 'tether', 'raid', 'claimed', 'seam', 'dock',
  'marker', 'focus', 'burst', 'disengage', 'choice'];
assert.deepEqual(
  BEATS.map((b) => b.key),
  EXPECTED_KEYS,
  'the story opening must reach seam and dock before staging the optional flight drills',
);

// ── Assertion 3: tutorial copy is authored and safe for an inline localized UI surface ──
const allLines = [];
for (const b of BEATS) {
  allLines.push({ beat: b.key, line: b.line });
  for (const fu of b.followups || []) allLines.push({ beat: b.key + ':' + fu.on, line: fu.line });
}
assert.ok(allLines.length >= 8, 'beats must author entry lines + in-beat followups');
for (const { beat, line } of allLines) {
  assert.equal(typeof line, 'string', `tutorial line must be a string — beat "${beat}"`);
  assert.ok(line.trim(), `tutorial line must contain player-facing copy — beat "${beat}"`);
  assert.doesNotMatch(line, /[\r\n\u2028\u2029]/u, `tutorial line must fit the inline surface — beat "${beat}"`);
  assert.doesNotMatch(line, /[\u0000-\u001f\u007f\ufffd]/u, `tutorial line contains an unsafe control/replacement character — beat "${beat}"`);
}

// Run the production beat advance function with an isolated clock and observe its entry lines.
// Use DONE facts as inputs. The focused rescue and docking tests exercise their gameplay writers.
function openingClock(previousKey, lastLineAt = 10) {
  const currentBeat = BEATS.findIndex(beat => beat.key === previousKey);
  const state = { simTime: 10, onboarding: { active: true, currentBeat, beatDoneAt: {} } };
  const lines = [];
  const owner = Object.assign(Object.create(onboarding), {
    state, _lastTextAtS: lastLineAt,
    _enterBeat() {},
    _sayTutorial(text) { this._lastTextAtS = state.simTime; lines.push({ text, at: state.simTime }); },
    _refreshBeatPanel() {},
  });
  return { state, owner, lines };
}

for (const [index, previous] of BEATS.slice(0, -1).entries()) {
  const { state, owner, lines } = openingClock(previous.key);
  const next = BEATS[index + 1];
  owner._tryAdvanceBeat();
  assert.equal(lines.length, 0, `${next.key} waits for ${previous.key} to finish`);
  state.onboarding.beatDoneAt[previous.key] = 11;
  state.simTime = 14.99;
  owner._tryAdvanceBeat();
  assert.equal(lines.length, 0, `${next.key} waits four seconds after DONE`);
  state.simTime = 15;
  owner._tryAdvanceBeat();
  owner._tryAdvanceBeat();
  assert.deepEqual(lines, [{ text: taughtVerbLine(state, next.key, next.line), at: 15 }],
    `${next.key} speaks once at entry`);
}

{
  const { state, owner, lines } = openingClock('dock', 11);
  state.onboarding.beatDoneAt.dock = 10;
  state.simTime = 15;
  owner._tryAdvanceBeat({ atBerth: true });
  assert.deepEqual(lines, [], 'the station cannot start a flight drill even after the silence window');
  state.simTime = 14.99;
  owner._tryAdvanceBeat();
  assert.deepEqual(lines, [], 'the departure waits for silence after the last tutorial line');
  state.simTime = 15;
  owner._tryAdvanceBeat();
  assert.equal(BEATS[state.onboarding.currentBeat].key, 'marker');
}

{
  const { state, owner, lines } = openingClock('dock');
  state.onboarding.beatDoneAt = { dock: 10, marker: 1, focus: 2, burst: 3, disengage: 4 };
  owner._tryAdvanceBeat({ atBerth: true });
  assert.equal(BEATS[state.onboarding.currentBeat].key, 'choice', 'a pilot who already drilled can choose at the berth');
  assert.deepEqual(lines, [{ text: BEATS.at(-1).line, at: 10 }]);
}

// ── Assertion 2: the tutorial speaks through one arbiter slot ─────────────────────────────────
assert.match(
  onboardingSrc,
  /voice\.say\(\{\s*channel:\s*'tutorial',[^}]*id:\s*'tutorial:beat'/,
  'the tutorial must use the arbiter’s stable slot so followups replace the current line',
);

// ── The intro modal must be GONE (spec2/03 B0: "no modal") ────────────────────────────────────
assert.doesNotMatch(onboardingSrc, /_showIntro/, 'the intro modal (_showIntro) must be removed (spec2/03 B0: no modal)');
assert.doesNotMatch(onboardingSrc, /sf-ob-intro/, 'the intro modal CSS/DOM (.sf-ob-intro) must be removed');
assert.match(onboardingSrc, /_sayTutorial\(COLD_OPEN_PREMISE, \{ visual: false, trackerCaptionId: 'premise' \}\)/,
  'the manifest premise must use the tracker caption without a second visual line');

// ── COLD_START must be gated during onboarding (one-voice: no parallel t=0 comms) ─────────────
assert.match(storySrc, /_onboardingActive\(\)/, 'story.js must check onboarding-active before firing cold-start');
assert.match(storySrc, /_tutorialOwnsOpening\(\)/, 'story.js must defer cold-start before onboarding init when tutorial hints are on');
assert.match(storySrc, /_coldStartDeferred/, 'story.js must defer cold-start while the tutorial owns the channel');
assert.match(storySrc, /tutorial:finished/, 'story.js must release the deferred cold-start on tutorial:finished');
assert.match(storySrc, /_recentTutorialLine/, 'story.js must suppress ambient comms near a tutorial line');
assert.match(storySrc, /p\.captionId === 'premise'\) this\._scheduleColdStartKesslerLine\(\)/,
  'the premise receipt queues Kessler’s line through the existing story owner');
assert.match(missionsSrc, /tutorial:finished.*_releaseStoryNavigationAfterTutorial/s,
  'missions.js must release the story waypoint only after the tutorial finishes');
assert.match(missionsSrc, /_onboardingOwnsOpeningNav\(\)/,
  'missions.js must not force story waypoint/toast over the tutorial opening');
assert.match(onboardingSrc, /beat\.key === 'marker'[\s\S]*_setObjectiveWaypoint\(true\)/,
  'marker lesson must force its distinctive onboarding waypoint on beat entry');

// ── First-flight safety: training actors can teach Focus/fire without harming or ramming ─────
assert.match(onboardingSrc, /onboardingTraining = true/, 'trainer must carry an explicit onboarding identity');
assert.match(onboardingSrc, /trainingFocusEligible = true/, 'only the trainer opts into friendly Focus');
assert.match(onboardingSrc, /passive:\s*true/, 'trainer must be excluded from tactical AI');
assert.match(onboardingSrc, /roe:\s*'hold_fire'/, 'trainer rules of engagement must forbid fire');
assert.match(onboardingSrc, /spec\.data\.weapons = \[\]/, 'trainer must be physically unarmed');
assert.match(onboardingSrc, /invuln:\s*true/, 'trainer must survive the gunnery lesson');
assert.match(onboardingSrc, /spec\.type = 'drone'/, 'trainer uses a non-ship collision identity');
assert.match(onboardingSrc, /collisionMask = Masks\.PROJECTILE/, 'trainer collides with projectiles only');
assert.match(onboardingSrc, /material: 'projectile'/, 'trainer uses zero-contact Rapier material');
assert.doesNotMatch(onboardingSrc, /_spawnPirate|tutorial_pirate|PIRATE_HULL_FLEE_FRAC/,
  'the first-session drill must not spawn an armed tutorial pirate');
assert.match(onboardingSrc, /maxWeaponHeatFraction/, 'burst lesson must read live per-weapon heat');
assert.match(onboardingSrc, /FLIGHT_DRILL_DISENGAGE_RANGE_WU/, 'disengagement must require physical separation');

// ── B1 derelict + B5 choice must be wired ─────────────────────────────────────────────────────
assert.match(onboardingSrc, /_spawnDerelict/, 'B1 must spawn a derelict wreck for the tether trio');
assert.match(onboardingSrc, /_spawnTrainer/, 'flight drill must spawn an inert trainer');
assert.match(onboardingSrc, /_openChoice/, 'B5 must surface three side-by-side offers');
assert.match(onboardingSrc, /choiceStationId/, 'B4 resolves at the berth: the choice opens at the station the pilot is standing in, not after Ceres');
assert.match(missionsSrc, /ensureOnboardingChoiceOffers/, 'missions authority must post the B5 choice offers');
assert.match(missionsSrc, /choiceOfferTypes/, 'B5 must persist the three loop types on tutorial state');
assert.match(missionsSrc, /bulk_trade.*bounty_hunt.*recon_scan/s, 'B5 must offer haul (trade) / bounty / survey');
assert.match(contractsScreenSrc, /FIRST FLIGHT \/ PICK ONE · HAUL \/ BOUNTY \/ SURVEY/,
  'the live Station OS rail must label the three B5 choices');

// ── Assertion 5: §4 difficulty ramp — telemetry funnel milestones exist ───────────────────────
assert.match(telemetrySrc, /first1000crAt/, 'telemetry funnel must track first 1000cr (spec2/03 §4)');
assert.match(telemetrySrc, /firstModuleAt/, 'telemetry funnel must track first module (spec2/03 §4)');
assert.match(telemetrySrc, /credits\.earned >= 1000/, 'first1000cr must gate on cumulative earnings ≥1000');
assert.match(telemetrySrc, /module:equipped/, 'firstModule must fire on module:equipped');
assert.match(telemetrySrc, /\['first1000cr', f\.first1000crAt\]/, 'first1000cr must surface in getFunnel()');
assert.match(telemetrySrc, /\['firstModule', f\.firstModuleAt\]/, 'firstModule must surface in getFunnel()');

// The three ordinary first-hop destinations are the player's practical first-hour neighborhood.
// Their ambient world squads stay basic and small; authored elite/multi-squad encounters resume in
// tier-2 space rather than springing on a pilot immediately after the first Helios contract.
const helios = SECTORS.find((sector) => sector.id === 'sector_helios_prime');
assert.ok(helios, 'Helios starter sector must exist');
const starterNeighbors = (helios.neighbors || [])
  .map((id) => SECTORS.find((sector) => sector.id === id))
  .filter(Boolean);
assert.deepEqual(
  starterNeighbors.map((sector) => sector.id).sort(),
  ['sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
  'the first-hour combat ramp must cover every ordinary first-hop Helios destination',
);
// The Ceres belt-shadow ambush is the first fight a new pilot goes LOOKING for: its authored
// pack (3–4 bodies, detonator_dart weighted in) replaces the old duet so the flying bomb's
// shove/tether lesson lands on the starter ring. Tethys/Vesta ambient hostiles stay basic
// pirates, solo or pair.
const STARTER_HOSTILE_CONTRACT = {
  sector_ceres_belt: { archetypes: new Set(['reaver_pirate', 'wasp_swarmer', 'detonator_dart']), maxSquad: 4 },
  sector_tethys_junction: { archetypes: new Set(['reaver_pirate', 'wasp_swarmer']), maxSquad: 2 },
  sector_vesta_forge: { archetypes: new Set(['reaver_pirate', 'wasp_swarmer']), maxSquad: 2 },
};
for (const sector of starterNeighbors) {
  assert.deepEqual(sector.enemyLevel, [1, 2], `${sector.id} ambient enemies must stay level 1–2`);
  const contract = STARTER_HOSTILE_CONTRACT[sector.id];
  assert.ok(contract, `${sector.id} must declare its first-hour hostile contract`);
  for (let seed = 1; seed <= 128; seed++) {
    const intents = planZoneSpawns(
      sector.id,
      8,
      sector.enemyLevel,
      mulberry32(hash32(seed, sector.id, 'first-hour-ambient-ramp')),
    ).filter((intent) => intent.context === 'zone_hostile');
    const squads = new Map();
    for (const intent of intents) {
      assert.ok(
        contract.archetypes.has(intent.archetypeId),
        `${sector.id} starter hostile ${intent.archetypeId} is outside its authored roster`,
      );
      assert.ok(intent.level >= 1 && intent.level <= 2,
        `${sector.id} starter hostile level ${intent.level} must stay within 1–2`);
      squads.set(intent.squadId, (squads.get(intent.squadId) || 0) + 1);
    }
    for (const [squadId, count] of squads) {
      assert.ok(count <= contract.maxSquad,
        `${sector.id}/${squadId} starter hostile squad must stay within its authored size`);
    }
  }
}

for (const id of [
  'pirate_toll',
  'ambush_snare',
  'named_hunter',
  'distress_call',
  'depth_h6_patrol_ambush',
  'minefield_wake',
  'curtain_convoy',
]) {
  assert.ok((ENCOUNTERS[id]?.gates?.minSectorTier || 0) >= 2,
    `${id} must not admit an elite or multi-squad encounter into the starter neighborhood`);
}

// ── §3 menu polish ───────────────────────────────────────────────────────────────────────────
assert.match(mainMenuSrc, /_startIdleAttract/, 'main menu must start an idle attract (spec2/03 §3)');
assert.match(mainMenuSrc, /ATTRACT_IDLE_MS = 6_000/, 'idle attract must trigger after the tuned 6s idle window');
assert.match(mainMenuSrc, /stamp\(words, \{ gap: 60/, 'main menu items must stamp in on a per-item delay on first show (kit motion; was sf-stagger/90 ms pre-ORRERY)');
assert.match(mainMenuSrc, /sf-continue-fade/, 'CONTINUE must fade to game with a location label');
assert.match(newGameSrc, /showFirstRunSplash/, 'NEW GAME first-run must show the splash line');
// The manifest-is-wrong hook now lives in onboarding's COLD_OPEN_PREMISE (B0); the splash
// carries the location stamp as re-authored in the ORRERY sweep.
assert.match(newGameSrc, /Helios System · Third Shift Arrival/, 'first-run splash line must be verbatim');
assert.match(newGameSrc, /launch\.disabled = launching/, 'START must disable itself while the launch hand-off covers the screen (was warmup veil after 300 ms pre-ORRERY)');

// Difficulty copy must remain authored and safe for the inline option-card surface.
const diffMatches = newGameSrc.match(/DIFFICULTIES\s*=\s*\[([\s\S]*?)\];/);
assert.ok(diffMatches, 'DIFFICULTIES table must exist');
const diffDescs = [...diffMatches[1].matchAll(/,\s*'([^']+)'\s*\]/g)].map((m) => m[1]);
assert.equal(diffDescs.length, 4, 'there must be 4 difficulty descriptions');
for (const desc of diffDescs) {
  assert.ok(desc.trim(), 'difficulty description must contain player-facing copy');
  assert.doesNotMatch(desc, /[\r\n\u2028\u2029]/u, `difficulty description must fit the inline option card: "${desc}"`);
  assert.doesNotMatch(desc, /[\u0000-\u001f\u007f\ufffd]/u, `difficulty description contains an unsafe control/replacement character: "${desc}"`);
}

// ── B0 one-verb exclusivity (UIUX-B0-ONE-VERB / SPEC2/03 §1–2) ─────────────────
// During active B0: no simultaneous visible onboarding-panel objective AND
// HUD tracker command. firstFlight control wall defers until B0 DONE + silence.
// Mission Log stays optional on-demand context (not a second always-on teacher).
// Source/headless contract — deterministic even when the browser runtime probe is
// blocked by the authored-asset startup gate.
{
  const hudSrc = read('src/ui/hud.js');
  const missionLogSrc = read('src/ui/screens/missionLog.js');

  // Primary persistent command surface remains the HUD mission tracker (onboarding waypoint branch).
  // Match the class token without requiring a CSS-leading '.' — live mount is className = 'sf-mission-tracker'.
  assert.match(hudSrc, /sf-mission-tracker/,
    'HUD mission tracker (sf-mission-tracker) must exist as the primary B0 command surface');
  assert.match(hudSrc, /const navWaypoint = state\.nav && state\.nav\.waypoint/,
    'HUD tracker must consume the active navigation waypoint during B0');
  assert.match(hudSrc, /navWaypoint && navWaypoint\.reason/,
    'HUD tracker must surface the onboarding waypoint verb during B0');
  assert.match(hudSrc, /mtObj|sf-mt-obj/,
    'HUD tracker must expose an objective line (sf-mt-obj / mtObj) for the single B0 verb');

  // The one-teacher contract. The staged rail absorbed the old firstFlight pending-timer hint;
  // "no second instruction while B0 speaks" is now openingInstructionSolo — secondary text
  // surfaces retire while an objective is pending inside the opening window (hudAttention.js).
  const hudAttentionSrc = read('src/ui/hudAttention.js');
  assert.match(hudAttentionSrc, /ob\.active && !ob\.finished/,
    'hudAttention must treat the unfinished rail as a pending objective');
  assert.match(hudAttentionSrc, /export function openingInstructionSolo/,
    'the single-instruction gate (openingInstructionSolo) must exist');
  assert.match(hudAttentionSrc, /openingWindowActive\(state\) && openingObjectivePending\(state\)/,
    'the solo gate must hold while an objective is pending inside the opening window');

  const attributes = new Map();
  const title = { style: {}, textContent: '',
    getAttribute: key => attributes.get(key),
    setAttribute: (key, value) => attributes.set(key, value),
    hasAttribute: key => attributes.has(key),
    removeAttribute: key => attributes.delete(key),
  };
  const state = { nav: { waypoint: { onboarding: true, reason: BEATS[0].line } },
    onboarding: { active: true, currentBeat: 0, beatDoneAt: {} } };
  const owner = Object.assign(Object.create(onboarding), { state, _panel: {}, _titleEl: title });
  owner._refreshBeatPanel();
  assert.equal(title.style.display, 'none', 'the panel yields when the HUD owns the opening waypoint');
  assert.equal(title.getAttribute('aria-hidden'), 'true', 'assistive readers get a single objective');
  state.nav.waypoint = null;
  owner._refreshBeatPanel();
  assert.equal(title.style.display, '', 'the panel can teach a non-spatial opening beat');
  assert.equal(title.hasAttribute('aria-hidden'), false);

  // Mission Log remains optional context — onboarding must not force-push it as a B0 teacher.
  assert.doesNotMatch(onboardingSrc, /pushScreen\(\s*['"]missionLog['"]\s*\)/,
    'onboarding must not force-open Mission Log during B0 (optional context only)');
  // Mission Log may still document the route when the player opens it — that is fine; it must not
  // be required by the first-hour pacing engine as a second always-on command surface.
  assert.match(missionLogSrc, /RECOMMENDED NEXT|recommendedNext|recommended next/i,
    'Mission Log may still expose optional RECOMMENDED NEXT context when opened on demand');
}

console.log(`First-hour OK — ${BEATS.length} beats in order, ${allLines.length} authored inline-safe tutorial lines, ` +
  'entry timing, one-voice routing, nonlethal trainers and funnel milestones checked.');
