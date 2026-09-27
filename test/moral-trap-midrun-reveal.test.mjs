// The moment of truth lands mid-run. Before this unit the trap's only reveal cue was
// sector:enter — so the fork popped at the destination-sector threshold (at the door, where
// both options are free) or never fired at all on same-sector runs. Now: dock:undocked is
// the guaranteed mid-run cue, and a live law sweep (patrol:proximity) steals the reveal and
// makes it witnessed — the trap's patrol line speaks with the cutter alongside.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { MORAL_TRAPS } from '../src/data/moralTraps.js';
import { missions } from '../src/systems/missions.js';
import { moralTrapSystem } from '../src/systems/moralTrap.js';
import { moralTrapPrompt } from '../src/ui/moralTrapPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

const SEED = 4242;
const NON_HELIOS_STATIONS = Object.freeze([
  'station_beltout',
  'station_forge',
  'station_veil',
  'station_smuggler',
  'station_coalition',
  'station_tethys',
  'station_drift',
  'station_customs',
]);

function unitBoot(trapMission) {
  const bus = createBus();
  const state = { simTime: 12, tick: 5, ui: {}, missions: { active: [trapMission] } };
  const spoken = [];
  const helpers = { voice: { say: (p) => { spoken.push(p); return true; } } };
  // Production init order: adapter before the system.
  const adapter = Object.assign({}, moralTrapPrompt);
  adapter.init({ state, bus, helpers });
  const trap = Object.assign({}, moralTrapSystem);
  trap.init({ state, bus, helpers });
  const specs = [];
  setPromptDeck({
    offerDecision: (spec) => { specs.push(spec); return true; },
    resolveDecision: () => true,
  });
  return { bus, state, spoken, specs, mission: trapMission };
}

function trapMission(id = 'm1', extra = {}) {
  return {
    id, type: 'cargo_delivery', stationId: 'station_tethys', status: 'active',
    reward_cr: 900, params: {},
    trap: {
      id: MORAL_TRAPS.cargo_is_weapons.id,
      revealAt: 'mid_run',
      revealLine: MORAL_TRAPS.cargo_is_weapons.revealLine,
      patrolRevealLine: MORAL_TRAPS.cargo_is_weapons.patrolRevealLine,
      choice: MORAL_TRAPS.cargo_is_weapons.choice,
    },
    ...extra,
  };
}

test('a same-sector run reveals on undock — no sector crossing ever happens', () => {
  const h = unitBoot(trapMission());
  const revealed = [];
  h.bus.on('moralTrap:revealed', (p) => revealed.push(p));
  // The whole flight stays inside the origin sector: undock → deliver. No sector:enter.
  h.bus.emit('dock:undocked', {});
  assert.equal(revealed.length, 1, 'the fork presents on leaving the dock');
  assert.equal(h.mission._trapRevealed, true);
  assert.ok(h.state.ui.moralTrap, 'the fork is stashed for the deck');
  assert.equal(h.specs.length, 1, 'the deck carries the decision');
  h.bus.emit('dock:undocked', {});
  assert.equal(revealed.length, 1, 'undock is a cue, not a re-roll');
});

test('a live law sweep steals the reveal and makes it witnessed', () => {
  const h = unitBoot(trapMission());
  const revealed = [];
  h.bus.on('moralTrap:revealed', (p) => revealed.push(p));
  h.bus.emit('patrol:proximity', { factionId: 'faction_scn', security: 0.8 });
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0].witnessed, true, 'the payload names the witness');
  assert.equal(h.mission._trapWitnessedByPatrol, true, 'the mission remembers the sweep');
  assert.equal(h.state.ui.moralTrap.witnessed, true);
  assert.equal(h.spoken.length, 1, 'the witnessed line speaks once');
  assert.equal(h.spoken[0].text, MORAL_TRAPS.cargo_is_weapons.patrolRevealLine,
    'the cutter is inside the fiction, not the bare reveal');
  // The witnessed sweep wins the race: the later undock must not re-reveal.
  h.bus.emit('dock:undocked', {});
  assert.equal(revealed.length, 1);
});

test('the reveal fires exactly once across every cue', () => {
  const h = unitBoot(trapMission());
  let revealed = 0;
  h.bus.on('moralTrap:revealed', () => { revealed += 1; });
  h.bus.emit('patrol:proximity', {});
  h.bus.emit('dock:undocked', {});
  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  h.bus.emit('patrol:proximity', {});
  assert.equal(revealed, 1, 'first cue wins; every later cue is silent');
});

test('a legacy trap overlay without a patrol line still reveals witnessed, speaking the base line', () => {
  const legacy = trapMission('m_legacy');
  delete legacy.trap.patrolRevealLine; // an in-flight save from before this unit
  const h = unitBoot(legacy);
  h.bus.emit('patrol:proximity', {});
  assert.equal(legacy._trapWitnessedByPatrol, true);
  assert.equal(h.spoken.length, 1);
  assert.equal(h.spoken[0].text, MORAL_TRAPS.cargo_is_weapons.revealLine,
    'the reveal falls back to the base line instead of going silent');
});

test('the Helios teaching beat presents its fork on undock without repeating the accept line', () => {
  const h = unitBoot(trapMission('m_helios', { stationId: 'station_helios', _acceptLineSpoken: true }));
  let revealed = 0;
  h.bus.on('moralTrap:revealed', () => { revealed += 1; });
  h.bus.emit('dock:undocked', {});
  assert.equal(revealed, 1, 'the fork finally presents after the line said at accept');
  assert.equal(h.spoken.length, 0, 'the line is not spoken twice');
  assert.ok(h.specs.length === 1, 'the choice still reaches the deck');
});

test('dead missions stay silent on the new cues', () => {
  const h = unitBoot(trapMission('m_dead', { status: 'failed' }));
  let revealed = 0;
  h.bus.on('moralTrap:revealed', () => { revealed += 1; });
  h.bus.emit('dock:undocked', {});
  h.bus.emit('patrol:proximity', {});
  assert.equal(revealed, 0);
  assert.equal(h.mission._trapRevealed, undefined);
});

// ── live route on seed 4242: a real board, a real accepted offer, a real undock ─────────────

function routeHarness(stationId, epoch) {
  const sim = createSimulation({ seed: SEED, systems: [missions, moralTrapSystem] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  state.simTime = epoch * 600;
  return { sim, state };
}

test('seed 4242 live route: accepted trapped contracts reveal on undock and carry the witnessed line', () => {
  let boardsScanned = 0;
  let offersScanned = 0;
  let accepted = 0;
  let refused = 0;
  let revealedOnUndock = 0;
  for (const stationId of NON_HELIOS_STATIONS) {
    for (let epoch = 0; epoch < 8; epoch += 1) {
      const { sim, state } = routeHarness(stationId, epoch);
      const board = sim.registry.get('missions').ensureBoard(stationId);
      const slots = (board && Array.isArray(board.slots)) ? board.slots : [];
      boardsScanned += 1;
      const trappedOffer = slots.find((o) => o && o.trap);
      for (const o of slots) { if (o) offersScanned += 1; }
      if (!trappedOffer) continue;
      // Accept refusals are board-economy gates (hold size, collateral) that predate this unit —
      // the claim is about accepted runs, not about what the board will let you sign.
      if (sim.registry.get('missions').acceptMission(trappedOffer.id) !== true) { refused += 1; continue; }
      accepted += 1;
      const mission = state.missions.active.find((m) => m && m.sourceOfferId === trappedOffer.id);
      assert.ok(mission, 'the accepted offer becomes an active mission');
      assert.equal(typeof mission.trap.patrolRevealLine, 'string',
        'procedural overlays carry the witnessed line');
      assert.ok(mission.trap.patrolRevealLine.length > 0);
      // The short-haul case: the job completes inside one sector. Only undock fires.
      sim.bus.emit('dock:undocked', {});
      if (mission._trapRevealed) revealedOnUndock += 1;
    }
  }
  assert.ok(accepted > 0, 'the route must actually accept trapped contracts');
  assert.equal(revealedOnUndock, accepted,
    'every accepted trapped contract now reveals on the guaranteed mid-run cue');
  console.log(`[moral-trap-midrun-reveal] seed ${SEED}: ${boardsScanned} boards, ` +
    `${offersScanned} offers, ${accepted} accepted (${refused} refused by board gates) — ` +
    `${revealedOnUndock}/${accepted} reveal on undock alone (no sector crossing)`);
});
