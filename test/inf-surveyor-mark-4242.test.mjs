// Scanning the seam surveyor points at the mark that ship is working. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';

const SEED = 4242;
const MARK_A = { x: 400, z: 20 };
const MARK_B = { x: 80, z: 360 };

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [scanner, scanReveal] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.activeSector = { id: 'sector_ceres_belt', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const courses = [];
  const results = [];
  bus.on('ui:setCourse', (payload) => courses.push(payload));
  bus.on('signal:scanResults', (payload) => results.push(payload));
  return { sim, state, bus, courses, results };
}

function pulse(host) {
  host.state.input.actions.scanPulse = true;
  host.sim.runTicks(2);
}

function surveyorSignal(host) {
  const batch = host.results.at(-1);
  const signals = batch ? batch.signals : [];
  return signals.find((signal) => signal.discovery && signal.discovery.parts && signal.discovery.parts['SF-175']);
}

test('4242: scanning the seam surveyor points at the mark that ship is working', () => {
  const host = boot();
  assert.equal(host.state.meta.seed, SEED);
  const surveyor = host.sim.spawn({
    type: 'ship', team: 2, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 40, hullMax: 40, collides: true,
    data: {
      trafficRole: 'surveyor',
      jobId: 'job:seam-survey',
      sectorId: 'sector_ceres_belt',
      homeSectorId: 'sector_ceres_belt',
    },
  });
  host.state.npcJobs = {
    byId: {
      'job:seam-survey': {
        entityId: surveyor.id,
        job: {
          routeIndex: 1,
          route: [
            { id: 'seam_survey_mark_a', targetRef: 'activity:scan-mark-a', pos: MARK_A },
            { id: 'seam_survey_mark_b', targetRef: 'activity:scan-mark-b', pos: MARK_B },
          ],
        },
      },
    },
  };
  pulse(host);
  const signal = surveyorSignal(host);
  assert.ok(signal);
  const part = signal.discovery.parts['SF-175'];
  assert.match(part.sentence, /surveyor working toward the seam scan/);
  assert.match(part.sentence, /berth remains/);
  assert.equal(part.sentence.includes('Ceres Refinery'), false);
  assert.equal(part.sentence.includes('seam_survey_mark'), false);
  assert.equal(part.pos.x, MARK_B.x);
  assert.equal(part.pos.z, MARK_B.z);
  host.bus.emit('signal:track', { signalId: signal.id });
  assert.equal(host.courses[0].pos.x, MARK_B.x);
  assert.equal(host.courses[0].pos.z, MARK_B.z);

  const parked = boot();
  parked.sim.spawn({
    type: 'ship', team: 2, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 40, hullMax: 40, collides: true,
    data: { trafficRole: 'hauler', destPos: { x: 200, z: 40 }, sectorId: 'sector_ceres_belt' },
  });
  pulse(parked);
  const hauled = surveyorSignal(parked);
  assert.equal(hauled.discovery.parts['SF-175'].pos.x, 200);
  assert.equal(hauled.discovery.parts['SF-175'].pos.z, 40);
  assert.match(hauled.discovery.parts['SF-175'].sentence, /working toward a berth/);
});
