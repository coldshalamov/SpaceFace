// THE RIVAL CUTTER — the wreck-field scavenger contest becomes a spoken, physical scene.
//
// Contract (deterministic, sim-time only):
//   1. pressing a laden rival cutter's hull jettisons HALF its cut as ordinary jettisoned
//      pods exactly once per life, and the lighter rival breaks for the lane;
//   2. the rivalry is voiced through the live bark owner: a claim on its first cut, the
//      yield when the pods drop, and a departure line that names the take — each once,
//      and only from an actual ecology scavenger.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { barkDirector } from '../src/systems/barkDirector.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [aftermathWrecks, barkDirector] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  return { sim, state: sim.state, bus: sim.bus, wrecks: sim.registry.get('aftermathWrecks'), barks: sim.registry.get('barkDirector') };
}

function rivalCutter(id, holdQty) {
  return {
    id, type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: { x: 500, z: -240 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 14, hull: 20, hullMax: 48,
    data: {
      factionId: 'faction_reach',
      wreckEcologyRole: 'scavenger',
      wreckFieldId: 'field_test',
      cargo: { items: { cmdty_alloy: holdQty } },
      scavengerWork: { state: 'work', holdQty, nextWorkAt: 0, announcedWreckId: null },
      ai: { passive: true },
    },
  };
}

test('rival cutter: pressing its hull drops half the cut as pods, once, and it runs', () => {
  const t = boot();
  const rows = [];
  t.bus.on('wreckEcology:rivalPressured', (p) => rows.push(p));

  const field = { fieldId: 'field_test', sectorId: 'sector_ceres_belt', zoneId: 'z_test', pos: { x: 520, z: -220 }, roster: [{ role: 'scavenger', status: 'live' }] };
  const cutter = rivalCutter('cutter_1', 6);
  t.state.entities.set('cutter_1', cutter);

  t.wrecks._driveScavenger(t.state, field, cutter);

  // Half of six dropped as physical pods; the rest stays in the hold.
  assert.equal(cutter.data.scavengerWork.pressured, true, 'the drop marks the cutter');
  assert.equal(cutter.data.scavengerWork.holdQty, 3, 'half the cut stays aboard');
  const held = cutter.data.cargo.items.cmdty_alloy;
  assert.equal(held, 3, 'the hold books the kept half');
  const pods = [...t.state.entities.values()].filter((e) => e
    && e.data && e.data.payloadType && e.data.salvagePool && e.data.salvagePool.cmdty_alloy);
  const podQty = pods.reduce((sum, p) => sum + (p.data.salvagePool.cmdty_alloy || 0), 0);
  assert.equal(podQty, 3, 'the dropped half is real, grabbable mass');
  assert.equal(pods.length >= 1, true, 'at least one pod body exists');
  assert.equal(cutter.data.scavengerWork.state, 'depart', 'the lighter rival breaks for the lane');
  assert.equal(rows.length, 1, 'the pressure drop is announced once');

  // A second lean on the same life has nothing left to scare out of it.
  cutter.data.scavengerWork.state = 'work';
  t.wrecks._driveScavenger(t.state, field, cutter);
  assert.equal(rows.length, 1, 'one drop per life');
  assert.equal(cutter.data.scavengerWork.holdQty, 3, 'the kept half is not re-taxed');
});

test('rival cutter: the race is voiced — claim on first cut, yield on the drop, exit with the take', () => {
  const t = boot();
  const said = [];
  t.barks.helpers = { voice: { say: (o) => { said.push(o); return true; } } };
  const cutter = rivalCutter('cutter_voice', 4);
  t.state.entities.set('cutter_voice', cutter);

  // First cut: the claim.
  t.bus.emit('wreckEcology:scavenged', { fieldId: 'f', entityId: 'cutter_voice', first: true });
  assert.equal(said.length, 1, 'the claim speaks on the first cut');
  assert.ok(said[0].text.includes('cut of this field') || said[0].text.includes('ledger') || said[0].text.includes('Rival cutter'),
    `claim line in the rival register: ${said[0].text}`);

  // A later cut is not a second claim.
  t.bus.emit('wreckEcology:scavenged', { fieldId: 'f', entityId: 'cutter_voice', first: false });
  assert.equal(said.length, 1, 'one claim per cutter');

  // The pressure drop: the yield.
  t.bus.emit('wreckEcology:rivalPressured', { entityId: 'cutter_voice', droppedQty: 2, heldQty: 2 });
  assert.equal(said.length, 2, 'the yield speaks when the pods drop');
  assert.ok(said[1].text.includes('Take it') || said[1].text.includes('DROPPING') || said[1].text.includes('Half'),
    `yield line in the rival register: ${said[1].text}`);

  // Departure: only a laden exit names the take; an empty exit stays quiet.
  t.bus.emit('wreckEcology:departed', { entityId: 'cutter_voice', holdQty: 0, hold: {} });
  assert.equal(said.length, 2, 'an empty hold does not brag');
  t.bus.emit('wreckEcology:departed', { entityId: 'cutter_voice', holdQty: 2, hold: { cmdty_alloy: 2 } });
  assert.equal(said.length, 3, 'a laden exit names the take');
  assert.ok(said[2].text.includes('Hold is full') || said[2].text.includes('take banked') || said[2].text.includes('scavenger tax'),
    `departure line in the rival register: ${said[2].text}`);

  // A non-scavenger hull cannot borrow the rivalry voice.
  const stranger = rivalCutter('stranger_1', 2);
  stranger.data.wreckEcologyRole = 'hauler';
  t.state.entities.set('stranger_1', stranger);
  t.bus.emit('wreckEcology:rivalPressured', { entityId: 'stranger_1', droppedQty: 1, heldQty: 1 });
  assert.equal(said.length, 3, 'the rivalry voice belongs to the ecology');
});
