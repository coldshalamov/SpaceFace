import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  advanceCircuit,
  circuitGateLitState,
  circuitUpcomingGate,
  gateApproach,
} from '../src/systems/racingGeometry.js';
import { createRacingCourseView } from '../src/render/racingCourseView.js';
import { racingOfferFor } from '../src/data/raceLevels.js';
import { mulberry32 } from '../src/core/rng.js';

function courseHarness({ seed = 4242, laps = 1, boostGateIndex } = {}) {
  const rng = mulberry32(seed);
  // Deterministic 4-gate course with fixed seed 4242
  const gates = [
    { x: 0, z: 0 },
    { x: 300, z: 100 },
    { x: 600, z: -50 },
    { x: 900, z: 200 },
  ];
  const params = {
    racingContractId: 'contract_pic33_seed4242',
    courseSectorId: 'sector_test',
    closedCircuit: false,
    raceStartSimS: 0,
    gateRadiusWU: 80,
    gates,
    nextGate: 0,
    lap: 0,
    laps,
    boostGateIndex,
  };
  const mission = { id: 'race-pic33', type: 'race', status: 'active', params };
  const state = {
    mode: 'flight',
    seed,
    rng,
    simTime: 1,
    world: { currentSectorId: 'sector_test', frameOrigin: { x: 0, z: 0 } },
    missions: { active: [mission] },
    ui: {},
  };
  return { gates, params, mission, state, rng };
}

test('PIC-33: circuit upcoming gate and lit state sequence advance on pass and never light a passed gate on seed 4242', () => {
  const { params, gates } = courseHarness({ seed: 4242, laps: 1, boostGateIndex: 2 });

  // Initial: gate 0 is upcoming
  assert.equal(circuitUpcomingGate(params), 0, 'gate 0 is upcoming at start');
  assert.equal(circuitGateLitState(params, 0), 'upcoming', 'gate 0 has upcoming lit state');
  assert.equal(circuitGateLitState(params, 1), 'base', 'future gate 1 is base');
  assert.equal(circuitGateLitState(params, 2), 'boost', 'unreached boost gate is boost');
  assert.equal(circuitGateLitState(params, 3), 'base', 'future gate 3 is base');

  // Advance through gate 0
  let now = 1;
  const sample0 = {
    prev: { x: -10, z: 0 },
    pos: { x: 10, z: 0 },
    vel: { x: 100, z: 0 },
    gates,
    previousTime: 0,
    now: now++,
  };
  const events0 = advanceCircuit(params, sample0);
  assert.equal(events0.length, 1);
  assert.equal(params.nextGate, 1);

  // After passing gate 0: upcoming advances to 1, gate 0 is cleared and never lit
  assert.equal(circuitUpcomingGate(params), 1, 'upcoming advances to gate 1');
  assert.equal(circuitGateLitState(params, 0), 'cleared', 'passed gate 0 is cleared');
  assert.notEqual(circuitGateLitState(params, 0), 'upcoming', 'passed gate 0 is never lit');
  assert.equal(circuitGateLitState(params, 1), 'upcoming', 'gate 1 has upcoming lit state');
  assert.equal(circuitGateLitState(params, 2), 'boost', 'gate 2 is boost');

  // Advance through gate 1
  const from1 = gateApproach(gates, 1);
  const sample1 = {
    prev: { x: gates[1].x - from1.nx * 10, z: gates[1].z - from1.nz * 10 },
    pos: { x: gates[1].x + from1.nx * 10, z: gates[1].z + from1.nz * 10 },
    vel: { x: from1.nx * 100, z: from1.nz * 100 },
    gates,
    previousTime: now - 1,
    now: now++,
  };
  const events1 = advanceCircuit(params, sample1);
  assert.equal(events1.length, 1);
  assert.equal(params.nextGate, 2);

  // Gate 2 is the boost gate AND now the upcoming gate
  assert.equal(circuitUpcomingGate(params), 2, 'upcoming advances to gate 2');
  assert.equal(circuitGateLitState(params, 0), 'cleared', 'gate 0 remains cleared');
  assert.equal(circuitGateLitState(params, 1), 'cleared', 'gate 1 is cleared');
  assert.equal(circuitGateLitState(params, 2), 'upcoming', 'upcoming gate 2 carries upcoming lit state');

  // Advance through gate 2 (boost gate)
  const from2 = gateApproach(gates, 2);
  const sample2 = {
    prev: { x: gates[2].x - from2.nx * 10, z: gates[2].z - from2.nz * 10 },
    pos: { x: gates[2].x + from2.nx * 10, z: gates[2].z + from2.nz * 10 },
    vel: { x: from2.nx * 100, z: from2.nz * 100 },
    gates,
    previousTime: now - 1,
    now: now++,
  };
  const events2 = advanceCircuit(params, sample2);
  assert.equal(events2.length, 1);
  assert.equal(params.nextGate, 3);

  // Gate 2 (passed boost gate) must NEVER remain lit as boost or upcoming
  assert.equal(circuitUpcomingGate(params), 3, 'upcoming advances to gate 3');
  assert.equal(circuitGateLitState(params, 2), 'cleared', 'passed boost gate becomes cleared and never lit');
  assert.notEqual(circuitGateLitState(params, 2), 'boost', 'passed boost gate does not retain boost lit state');
  assert.equal(circuitGateLitState(params, 3), 'upcoming', 'gate 3 is upcoming');

  // Advance through final gate 3 -> race completes
  const from3 = gateApproach(gates, 3);
  const sample3 = {
    prev: { x: gates[3].x - from3.nx * 10, z: gates[3].z - from3.nz * 10 },
    pos: { x: gates[3].x + from3.nx * 10, z: gates[3].z + from3.nz * 10 },
    vel: { x: from3.nx * 100, z: from3.nz * 100 },
    gates,
    previousTime: now - 1,
    now: now++,
  };
  const events3 = advanceCircuit(params, sample3);
  assert.equal(events3.length, 1);
  assert.equal(events3[0].finished, true);

  // Finished course: no upcoming gate, every gate is cleared, never lights any passed gate
  assert.equal(circuitUpcomingGate(params), null, 'no upcoming gate when finished');
  for (let i = 0; i < gates.length; i++) {
    assert.equal(circuitGateLitState(params, i), 'cleared', `gate ${i} is cleared when finished`);
  }
});

test('PIC-33: racingCourseView presents distinct lit state on the upcoming gate and clears target on finish', () => {
  const { state, params } = courseHarness({ seed: 4242, laps: 1 });
  const scene = new THREE.Scene();
  const view = createRacingCourseView(scene, state);
  view.frame();

  const rings = view.root.getObjectByName('Checkpoint apertures');
  const target = view.root.getObjectByName('Next checkpoint');
  assert.ok(rings, 'checkpoint apertures exist');
  assert.ok(target, 'target checkpoint exists');

  // Colors: base is 0x90b2c8, cleared is 0x3c515c, lit is 0xffe4a8
  const LIT_HEX = 0xffe4a8;
  const CLEARED_HEX = 0x3c515c;
  const BASE_HEX = 0x90b2c8;

  const colorAt = (mesh, index) => {
    const c = new THREE.Color();
    mesh.getColorAt(index, c);
    return c.getHex();
  };

  // Initial: gate 0 is upcoming, should have lit color in rings
  assert.equal(target.visible, true, 'target is visible for upcoming gate 0');
  assert.equal(colorAt(rings, 0), LIT_HEX, 'upcoming gate 0 has distinct lit color in rings');
  assert.equal(colorAt(rings, 1), BASE_HEX, 'future gate 1 has base color');
  assert.equal(colorAt(rings, 2), BASE_HEX, 'future gate 2 has base color');

  // Advance nextGate to 1
  params.nextGate = 1;
  view.frame();

  // Gate 0 is now passed: rings[0] must be CLEARED, rings[1] must be LIT
  assert.equal(colorAt(rings, 0), CLEARED_HEX, 'passed gate 0 is cleared in rings');
  assert.notEqual(colorAt(rings, 0), LIT_HEX, 'passed gate 0 is never lit');
  assert.equal(colorAt(rings, 1), LIT_HEX, 'upcoming gate 1 is lit in rings');
  assert.equal(target.visible, true);
  assert.ok(Math.abs(target.position.x - params.gates[1].x) < 1e-4, 'target moved to gate 1');

  // Complete the race (all gates passed, nextGate >= gates.length, finished)
  params.nextGate = params.gates.length;
  params.finished = true;
  view.frame();

  // Target must NOT light the passed final gate
  assert.equal(target.visible, false, 'target ring is hidden when race is finished');
  for (let i = 0; i < rings.count; i++) {
    assert.equal(colorAt(rings, i), CLEARED_HEX, `ring ${i} is cleared when finished`);
    assert.notEqual(colorAt(rings, i), LIT_HEX, `ring ${i} is not lit when finished`);
  }

  view.dispose();
});

test('PIC-33: multi-lap closed circuit on seed 4242 advances across laps and never lights passed finish', () => {
  const offer = racingOfferFor('contract_veil_laps');
  assert.ok(offer);
  offer.status = 'active';
  const p = offer.params;
  const count = p.gates.length - 1;
  assert.equal(p.closedCircuit, true);
  assert.equal(p.laps, 3);

  // Lap 0 start: gate 0 is upcoming
  assert.equal(circuitUpcomingGate(p), 0);
  assert.equal(circuitGateLitState(p, 0), 'upcoming');

  // Approaching last gate of lap 0 (finish line)
  p.nextGate = p.gates.length - 1;
  assert.equal(circuitUpcomingGate(p), p.gates.length - 1);
  assert.equal(circuitGateLitState(p, 0), 'upcoming', 'aperture 0 represents the finish line for closed circuit');

  // Lap 0 completed -> advances to lap 1, nextGate = 1
  p.lap = 1;
  p.nextGate = 1;
  assert.equal(circuitUpcomingGate(p), 1);
  assert.equal(circuitGateLitState(p, 0), 'cleared', 'start gate crossed for lap 1 is cleared');
  assert.equal(circuitGateLitState(p, 1), 'upcoming');

  // Final lap (lap 2) completed -> all finished
  p.lap = 2;
  p.nextGate = p.gates.length;
  p.finished = true;
  assert.equal(circuitUpcomingGate(p), null, 'upcoming is null on finish');
  for (let i = 0; i < count; i++) {
    assert.equal(circuitGateLitState(p, i), 'cleared', `aperture ${i} is cleared on finish`);
    assert.notEqual(circuitGateLitState(p, i), 'upcoming');
  }
});
