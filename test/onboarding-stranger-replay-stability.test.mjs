// RESIDUALS_LEDGER §D onboarding residual — replay stability of the stranger swing→release.
//
// The recorded blocker (design/program/roadmap/receipts/onboarding/2026-09-19-thesis-first-
// first-hour.md lines 72-77): "Identical code + seed gives different swing/raid tow outcomes
// across sessions (the async backend's impulse resolution is not replay-stable), so the blind
// stranger still fails some runs at the swing-release roll." The far-field-demotion theory in
// the same receipt was disproven (d313b4db4) and is not under test here.
//
// This fixture pins (or honestly disproves) the claim IN-PROCESS: the seeded stranger
// archetype drives the real production runtime (rapier-dynamic async backend) through the
// opening rail — attach → rescue swing (release the rock at the derelict) → raid tow — TWICE,
// each on a fresh state/physics world, and the two outcome records must be identical:
// same victims, same times, same phases (the fields the receipt names).
//
// Vehicle: the A6/B10 opening-slice foundation (createAuthoritativeRuntime, production
// profile, no-op input system) driving the stranger pilot THE PUBLIC PLAYTHROUGH DRIVER
// RIDES — scripts/run-actual-game-playthrough.mjs imports createStrangerPilot from
// scripts/lib/bench/playthroughPilots.mjs, so that is the copy measured here. (The unit-named
// scripts/lib/bench/playthroughStrangerPilot.mjs is an extracted, since-diverged evolving
// copy of the same archetype.)
//
// HONEST LIMITS: both runs share this process and its module-singleton systems (each run
// re-inits them against a fresh state; dispose frees the Rapier world between runs). A green
// result pins IN-PROCESS determinism only — the receipt's cross-session (separate process)
// claim stays open unless a red appears here. A red here (run A ≠ run B on identical
// code+seed) IS the instability reproduced in-process, with numbers.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { BEATS } from '../src/systems/onboarding.js';
import { createStrangerPilot, createServices } from '../scripts/lib/bench/playthroughPilots.mjs';

const DT = 1 / 60;
const SEED = Number(process.env.SPACEFACE_STRANGER_REPLAY_SEED) || 4242;
// Sim-seconds per run. The receipt's best run hit momentum-kill at 144.65 s; the raid window
// below observes the tow for RAID_WINDOW_S after the swing release before the cap, without
// running stranger completion.
const CAP_S = Number(process.env.SPACEFACE_STRANGER_REPLAY_CAP_S) || 240;
// The raid tow window: the receipt's best run landed momentum-kill at 144.65 s (swing done at
// ~14.5 s), so the tow gets 150 sim-s after the swing release before the window closes. This
// pushes a capped run past the unit's ~300 s wall aim on a loaded box — accepted, because the
// raid tow outcome is half of what the receipt names; a resolved kill stops early instead.
const RAID_WINDOW_S = Number(process.env.SPACEFACE_STRANGER_REPLAY_RAID_WINDOW_S) || 150;
// The pilot's ledger seam is write-only instrumentation (playthroughLedger "never mutates
// gameplay state"), so the fixture passes a no-op recorder instead of the full hour-by-hour
// ledger: identical sim behavior, no per-event accounting cost.
const STUB_LEDGER = {
  recordTrade() {}, recordCreditsNoSale() {}, recordDecision() {}, recordNote() {}, sampleVerbs() {},
};
const VERBOSE = !!process.env.SPACEFACE_STRANGER_REPLAY_VERBOSE;

const round3 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1000) / 1000 : null);
const round1 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);

const LINE_EVENTS = [
  'tether:attached', 'tether:latched', 'tether:released', 'tether:cut',
  'tether:cutPlayer', 'tether:broke', 'tether:broken', 'tether:nearBreak',
];

/**
 * Boot the production runtime headless, put the blind stranger pilot in the hull, and play
 * the opening rail until the swing→release beat has resolved AND the raid tow has been
 * observed (momentum-kill + 2 s settle, or RAID_WINDOW_S of raid attempts after the release),
 * the sim-time cap, or player death. Returns { record, wallS }.
 */
async function runStrangerOpening({ seed = SEED, capS = CAP_S } = {}) {
  const wall0 = Date.now();
  const lookup = getNodeSystemFactoryTable();
  // The DOM input adapter is a no-op headless: the pilot publishes the same normalized
  // axes/actions/massline packet the input grammar would (A6/B10 convention).
  lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
  const runtime = await createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed, systemLookup: lookup,
    exclusions: ['input:no-op-headless'],
  });
  const { state, bus } = runtime;

  // ── observation taps (the receipt's proof points) ────────────────────────────────────────
  const milestones = [];   // firsthour:milestone — attach / momentumKill(cause)
  const lineEvents = [];   // the tether line's own lifecycle: attach → reel → release/cut/break
  const whipImpacts = [];  // tether:whipImpact — victim, relSpeed, rating (the tow/throw proof)
  const kills = [];        // entity:killed — victims and killers
  const rescueBeats = [];  // rescue:beat — swing done/fail funnel with reasons
  bus.on('firsthour:milestone', (p) => milestones.push({
    milestone: String(p && p.milestone),
    atS: round3(p && p.atS),
    cause: (p && p.cause) ?? null,
    rating: (p && p.rating) ?? null,
    beat: (p && p.beat) ?? null,
  }));
  for (const ev of LINE_EVENTS) {
    bus.on(ev, (p) => lineEvents.push({ ev, t: round3(state.simTime), targetId: (p && p.targetId) != null ? p.targetId : null }));
  }
  bus.on('tether:whipImpact', (p) => whipImpacts.push({
    t: round3(state.simTime), targetId: (p && p.targetId) ?? null, victimId: (p && p.victimId) ?? null,
    relSpeed: round1(p && p.relSpeed), rating: (p && p.rating) ?? null, severity: (p && p.severity) ?? null,
  }));
  bus.on('entity:killed', (p) => kills.push({ t: round3(state.simTime), id: p && p.id, killerId: (p && p.killerId) ?? null }));
  bus.on('rescue:beat', (p) => rescueBeats.push({
    beat: p && p.beat, result: p && p.result, atS: round3(p && p.atS),
    fails: (p && p.fails) ?? 0, reason: (p && p.reason) ?? null,
  }));

  // ── boot to flight (the A6 opening-slice route: same spawn, same newGame order) ──────────
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic'; // the blamed async backend
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  // The stranger follows the rail, so tutorial hints stay ON (CLI harness stranger path).
  state.settings.gameplay.tutorialHints = true;
  if (!state.input.actions) state.input.actions = {};
  state.player.credits = NEW_GAME.credits;
  const shipsSys = runtime.getSystem('ships');
  shipsSys.newGame();
  const player0 = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 }, rot: 0,
  }));
  state.playerId = player0.id;
  if (typeof shipsSys.recomputeActiveShip === 'function') shipsSys.recomputeActiveShip();
  const world = runtime.getSystem('world');
  if (typeof world.newGame === 'function') world.newGame();
  const econ = runtime.getSystem('economy');
  if (econ && typeof econ.newGame === 'function') econ.newGame();
  world.enterSector('sector_helios_prime', {});
  bus.emit('game:started', {});
  await runtime.getSystem('physics').prepareBackend(state, { reset: true });
  runtime.runTicks(60, DT);

  // ── the stranger archetype, exactly as the public playthrough driver builds it ───────────
  const services = createServices({
    state, bus, ledger: STUB_LEDGER, econ,
    clock: { tick: () => state.tick, undockCooldownUntil: () => 0 },
  });
  const pilot = createStrangerPilot({ state, bus, ledger: STUB_LEDGER, services });

  // ── play the opening rail, bounded ────────────────────────────────────────────────────────
  const maxTicks = Math.round(capS * 60);
  const startedTick = state.tick;
  let stopReason = 'cap';
  let settleTicks = -1;
  let swingDoneAtTick = -1;
  const raidWindowTicks = Math.round(RAID_WINDOW_S * 60);
  for (let i = 0; i < maxTicks; i++) {
    pilot.step(DT, state.tick);
    // input.js contract: acts.tetherFire mirrors masslineCommand.latch AFTER the packet is built.
    const acts = state.input.actions;
    if (acts && acts.massline) acts.tetherFire = !!acts.massline.latch;
    runtime.runTicks(1, DT);

    if (VERBOSE && (state.tick % 600) === 0) {
      const p = state.entities.get(state.playerId);
      const ob = state.onboarding || {};
      console.log(`  [run t=${Math.round(state.simTime)}] beat=${ob.currentBeat}/${BEATS[ob.currentBeat] ? BEATS[ob.currentBeat].key : '?'}`
        + ` resc=${ob.rescue ? ob.rescue.current : '-'} v=${p ? Math.round(Math.hypot(p.vel.x, p.vel.z)) : '?'}`
        + ` milestones=${milestones.map((m) => m.milestone).join('|') || 'none'}`);
    }
    for (const m of milestones) {
      if (m.atS != null && !m._logged && VERBOSE) { m._logged = true; console.log(`  [milestone] ${m.milestone} @${m.atS} ${m.cause || ''}`); }
    }

    const p = state.entities.get(state.playerId);
    if (!p || p.alive === false) { stopReason = 'player_dead'; break; }

    const ob = state.onboarding || {};
    const rescue = ob.rescue || {};
    const swingDone = !!(rescue.beats && rescue.beats.swing && rescue.beats.swing.state === 'done');
    if (swingDone && swingDoneAtTick < 0) swingDoneAtTick = state.tick;
    const raidKilled = milestones.some((m) => m.milestone === 'momentumKill');
    if (swingDone && raidKilled && settleTicks < 0) settleTicks = 120; // 2 s settle for the tow aftermath
    if (settleTicks >= 0) {
      settleTicks -= 1;
      if (settleTicks <= 0) { stopReason = 'resolved'; break; }
    }
    // Swing released but no kill yet: hold a bounded window on the raid tow, then stop —
    // the tow's whip impacts and phase are observed even when the kill never lands.
    if (swingDoneAtTick >= 0 && settleTicks < 0 && state.tick - swingDoneAtTick >= raidWindowTicks) {
      stopReason = 'raid_window';
      break;
    }
  }

  // ── the outcome record (identical code + seed must reproduce it identically) ─────────────
  const ob = state.onboarding || {};
  const rescue = ob.rescue || {};
  const record = {
    seed, capS, raidWindowS: RAID_WINDOW_S,
    stop: { reason: stopReason, simTime: round3(state.simTime), ticksPlayed: state.tick - startedTick },
    attachAtS: (milestones.find((m) => m.milestone === 'attach') || {}).atS ?? null,
    milestones: milestones.map(({ milestone, atS, cause, rating, beat }) => ({ milestone, atS, cause, rating, beat })),
    lineEvents, whipImpacts, kills, rescueBeats,
    onboarding: {
      currentBeat: ob.currentBeat ?? null,
      beatKey: BEATS[ob.currentBeat] ? BEATS[ob.currentBeat].key : null,
      finished: !!ob.finished,
      beatDoneAtRaid: ob.beatDoneAt && ob.beatDoneAt.raid != null ? round3(ob.beatDoneAt.raid) : null,
      rescue: {
        current: rescue.current ?? null,
        completed: !!rescue.completed,
        swing: rescue.beats && rescue.beats.swing
          ? {
              state: rescue.beats.swing.state,
              doneAt: rescue.beats.swing.doneAt != null ? round3(rescue.beats.swing.doneAt) : null,
              fails: rescue.beats.swing.fails || 0,
            }
          : null,
        ids: rescue.ids ? { rock: rescue.ids.rock ?? null, derelict: rescue.ids.derelict ?? null } : null,
      },
      raidIds: ob.raid && ob.raid.ids
        ? { raider: ob.raid.ids.raider ?? null, throwRock: ob.raid.ids.throwRock ?? null }
        : null,
    },
    playerId: state.playerId,
  };
  // Free the Rapier world + release module-singleton systems so the next run inits cleanly
  // (the same in-process reuse contract the A6 driver established).
  runtime.dispose();
  return { record, wallS: Math.round((Date.now() - wall0) / 1000) };
}

function summarize({ record, wallS }) {
  const kill = record.milestones.find((m) => m.milestone === 'momentumKill');
  const latches = record.lineEvents.filter((e) => e.ev === 'tether:attached').length;
  return `stop=${record.stop.reason}@${record.stop.simTime}s wall=${wallS}s`
    + ` attach=${record.attachAtS}s`
    + ` momentumKill=${kill ? `${kill.cause}@${kill.atS}s` : 'none'}`
    + ` swing=${record.onboarding.rescue.swing ? `${record.onboarding.rescue.swing.state}/fails=${record.onboarding.rescue.swing.fails}/doneAt=${record.onboarding.rescue.swing.doneAt}` : 'null'}`
    + ` latches=${latches} whipImpacts=${record.whipImpacts.length} kills=${record.kills.length}`
    + ` beat=${record.onboarding.beatKey} raidDoneAt=${record.onboarding.beatDoneAtRaid}`
    + ` raider=${record.onboarding.raidIds ? record.onboarding.raidIds.raider : '?'}`;
}

test(`stranger swing→release replays identically in-process (seed ${SEED}, ${CAP_S}s cap, two fresh runs)`, { timeout: 1_200_000 }, async () => {
  const a = await runStrangerOpening({ seed: SEED });
  const b = await runStrangerOpening({ seed: SEED });
  console.log(`run A: ${summarize(a)}`);
  console.log(`run B: ${summarize(b)}`);
  assert.notEqual(a.record.stop.reason, 'player_dead', `run A died before the swing beat: ${summarize(a)}`);
  assert.notEqual(b.record.stop.reason, 'player_dead', `run B died before the swing beat: ${summarize(b)}`);
  // The pin: identical code + seed → identical victims, times, and phases.
  assert.deepStrictEqual(b.record, a.record, 'the two in-process seeded runs diverged (replay instability reproduced)');
  // Green pin — name the numbers the receipt could not claim.
  const kill = a.record.milestones.find((m) => m.milestone === 'momentumKill');
  console.log(`PINNED in-process replay stability (seed ${SEED}): attach=${a.record.attachAtS}s`
    + ` swing=${a.record.onboarding.rescue.swing ? a.record.onboarding.rescue.swing.state : 'null'}`
    + `${a.record.onboarding.rescue.swing && a.record.onboarding.rescue.swing.doneAt != null ? `@${a.record.onboarding.rescue.swing.doneAt}s` : ''}`
    + ` momentumKill=${kill ? `${kill.cause}@${kill.atS}s` : 'none'}`
    + ` both runs identical (stop=${a.record.stop.reason}@${a.record.stop.simTime}s).`
    + ' Cross-session (separate process) replay stability stays open — this pin is in-process only.');
});
