// Severed relay: swarm reaction time and heading lock follow the strain's relay prior.
// Live lineages are veil_glass (high dependency) and ashfall_choir (low). The packet's
// strain_veil / strain_ashfall ids are not in the catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES, ALIEN_STRAINS } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { tickAlienEcology } from '../src/systems/alienEcology.js';
import { mulberry32 } from '../src/core/rng.js';

const VEIL = ALIEN_SITES.shepherds_ring;
const ASH = ALIEN_SITES.towed_moonlet;
const NEEDLE = FAUNA_SPECIES.needle_swarm;
const DT = 0.1;

function angleLerp(a, b, t) {
  const twoPi = Math.PI * 2;
  let d = (b - a) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d += twoPi;
  return a + d * Math.min(1, Math.max(0, t));
}

function makeWorld(site, { severed, phase = 0, playerOffset = 240, shepherdRot = null } = {}) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    tick: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    rng: mulberry32(4242),
    player: { cargo: { items: {} } },
    world: { currentSectorId: site.sectorId, sectors: {}, rng: mulberry32(4242) },
  };
  const world = {
    state,
    registry: { get: () => null },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit() {} },
    helpers: { mulberry32 },
  };
  const player = {
    id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10,
    pos: { x: site.center.x + playerOffset, z: site.center.z },
    vel: { x: 0, z: 0 }, rot: 0,
    homeSectorId: site.sectorId,
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 3;
  ae.sites[site.siteId] = {
    state: 'dormant',
    relaySevered: severed === true,
    deadFauna: {},
    signals: [],
    beats: { long: true, mid: true, close: true },
    offersEmitted: {},
  };
  let next = 10;
  function spawn(speciesId, at) {
    const species = FAUNA_SPECIES[speciesId];
    const e = {
      id: next++,
      type: 'fauna',
      alive: true,
      occupantGeneration: 1,
      pos: { x: at.x, z: at.z },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: species.radius,
      hull: 100,
      homeSectorId: site.sectorId,
      data: {
        ecology: {
          speciesId,
          siteId: site.siteId,
          faunaKey: `b123:${site.siteId}:${speciesId}`,
          anchor: { x: site.center.x, z: site.center.z },
          driveState: species.drives.idle,
          phase,
          stim: {},
          driveT: 0,
        },
      },
    };
    state.entities.set(e.id, e);
    state.entityList.push(e);
    return e;
  }
  const swarm = spawn('needle_swarm', site.center);
  let shepherd = null;
  if (shepherdRot != null) {
    shepherd = spawn('blind_shepherd', { x: site.center.x, z: site.center.z + 400 });
    shepherd.rot = shepherdRot;
  }
  return {
    state, world, player, swarm, shepherd,
    tick(dt = DT) { state.simTime += dt; tickAlienEcology(world, dt); },
  };
}

function sampleRots(site, opts, ticks) {
  const run = makeWorld(site, opts);
  const rots = [];
  for (let i = 0; i < ticks; i += 1) {
    run.tick();
    rots.push(run.swarm.rot);
  }
  return { run, rots };
}

function reaction(site) {
  const run = makeWorld(site, { severed: true, phase: 0, playerOffset: 240 });
  const start = { x: run.swarm.pos.x, z: run.swarm.pos.z };
  for (let i = 0; i < 80; i += 1) {
    run.tick();
    const drive = run.swarm.data.ecology.driveState;
    if (drive !== 'drift') {
      return {
        run,
        drive,
        stimulusT: run.swarm.data.ecology.stimulusT,
        moved: Math.hypot(run.swarm.pos.x - start.x, run.swarm.pos.z - start.z),
      };
    }
  }
  return { run, drive: run.swarm.data.ecology.driveState, stimulusT: null, moved: 0 };
}

test('a severed high-dependency swarm waits longer and wobbles more than a low-dependency swarm', () => {
  assert.equal(VEIL.strainId, 'veil_glass');
  assert.equal(ASH.strainId, 'ashfall_choir');

  const highHead = sampleRots(VEIL, { severed: true, phase: 0, playerOffset: 240 }, 20);
  const lowHead = sampleRots(ASH, { severed: true, phase: 0, playerOffset: 240 }, 20);
  const again = sampleRots(VEIL, { severed: true, phase: 0, playerOffset: 240 }, 20);
  assert.ok(Math.abs(highHead.rots[19] - lowHead.rots[19]) > 0.02,
    `severed headings should diverge with dependency, high ${highHead.rots[19]} low ${lowHead.rots[19]}`);
  assert.deepEqual(again.rots, highHead.rots);

  const high = reaction(VEIL);
  const low = reaction(ASH);
  assert.equal(low.drive, 'investigate');
  assert.equal(high.drive, 'investigate');
  assert.ok(high.moved > 1 && low.moved > 1, 'severed swarms keep flying on their own drives');
  assert.ok(Number.isFinite(high.stimulusT) && Number.isFinite(low.stimulusT));
  assert.ok(high.stimulusT > low.stimulusT + 0.5,
    `high dependency should need a longer stimulus, high ${high.stimulusT} low ${low.stimulusT}`);

  for (const seen of [high, low]) {
    seen.run.player.pos.x = seen.run.swarm.pos.x + 40;
    seen.run.player.pos.z = seen.run.swarm.pos.z;
    seen.run.tick();
    assert.equal(seen.run.swarm.data.ecology.driveState, 'flee');
  }

  assert.equal(ALIEN_STRAINS.veil_glass.memoryPriors.relayDependency, 0.85);
  assert.equal(ALIEN_STRAINS.ashfall_choir.memoryPriors.relayDependency, 0.45);
});

test('an intact relay reacts at once and holds a clean heading toward the relay organism', () => {
  const shepherdRot = Math.PI / 2;
  const phaseA = sampleRots(VEIL, {
    severed: false, phase: 0, playerOffset: 280, shepherdRot,
  }, 1);
  const phaseB = sampleRots(VEIL, {
    severed: false, phase: Math.PI / 3.1, playerOffset: 280, shepherdRot,
  }, 1);
  const noRelay = sampleRots(VEIL, {
    severed: false, phase: 0, playerOffset: 280, shepherdRot: null,
  }, 1);

  assert.equal(phaseA.run.swarm.data.ecology.driveState, 'investigate');
  assert.ok(phaseA.run.swarm.data.ecology.stimulusT < NEEDLE.coherenceLoss.latency,
    'an intact relay does not wait out coherence-loss latency');
  assert.equal(phaseA.rots[0], phaseB.rots[0]);

  const desired = 0;
  const blended = angleLerp(desired, shepherdRot, NEEDLE.relayAffinity * 0.25);
  const expected = angleLerp(0, blended, Math.min(1, NEEDLE.turnRate * DT));
  assert.ok(Math.abs(phaseA.rots[0] - expected) < 1e-6,
    `heading ${phaseA.rots[0]} should match the relay blend ${expected}`);
  assert.ok(Math.abs(shepherdRot - phaseA.rots[0]) < Math.abs(shepherdRot - noRelay.rots[0]));

  const wobble = Math.sin(DT * 1.7) * NEEDLE.relayAffinity * 0.85 * 0.35;
  const wobbleRot = angleLerp(0, desired + wobble, Math.min(1, NEEDLE.turnRate * DT));
  assert.ok(Math.abs(phaseA.rots[0] - wobbleRot) > 0.02);
});
