// starter-seam-haulable-core — WF-06 tutorial loop-lock (GDD_2_0 §5.5 "mining teaches the
// tether; the tether feeds mining").
//
// The deficit this pins: f_helios_starter's scatter is 100% ast_common_rock whose yield table
// tops at 22u, while a haulable fracture core needs round(parentYield * BULK_CORE_YIELD_FRAC)
// > BULK_HAUL_MIN_U — so nothing at the taught seam was ever too big to scoop and the whole
// tow-for-pay loop was unreachable from the tutorial claim. The repair authors three heavy
// metallic boulders INTO the seam (src/data/sectors.js) which world.js materializes beside the
// scatter with zero rng draws.
//
// Proven here on seed 4242 against the live owners:
//   data/sectors.js        the authored boulder rows and their arithmetic
//   systems/world.js       enterSector materializes them beside the untouched common scatter
//   systems/mining.js      cutting the largest to fracture spawns the core chunk
//   ui/prompts/bulkHaulTag.js  the tag arms on that chunk and routes it to Ceres Refinery
//
// Run: node --test test/starter-seam-haulable-core.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { ASTEROIDS } from '../src/data/mining.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { mining, BULK_HAUL_MIN_U, BULK_CORE_YIELD_FRAC } from '../src/systems/mining.js';
import { promoteAsteroidFieldRock } from '../src/world/asteroidField.js';
import { globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { isBulkHaulTagArmed, buildBulkHaulTag } from '../src/ui/prompts/bulkHaulTag.js';
import { STARTER_FIELD_MACHINE } from '../src/data/environmentalMachinery.js';

const HELIOS = 'sector_helios_prime';
const STARTER_FIELD = 'f_helios_starter';
const SEED = 4242;

function starterFieldDef() {
  const sector = SECTORS.find((row) => row.id === HELIOS);
  return (sector.fields || []).find((row) => row.id === STARTER_FIELD);
}

function bootHelios(seed = SEED) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics, world, mining] });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(HELIOS);
  return { sim, state, helpers: sim.registry.ctx.helpers };
}

function starterFieldRocks(state) {
  const field = state.world.asteroidField;
  return field.rocks.filter((rec) => rec.data && rec.data.fieldId === STARTER_FIELD);
}

test('the claim authors exactly three heavy boulders whose yields each fracture a haulable core', () => {
  const fdef = starterFieldDef();
  assert.ok(fdef, 'f_helios_starter exists');
  assert.equal(fdef.type, 'ast_common_rock', 'the scatter stays common rock — the seam is not re-priced');
  const boulders = fdef.boulders || [];
  assert.equal(boulders.length, 3, 'three authored boulders pin the tether lesson into the seam');
  const metallic = ASTEROIDS.find((row) => row.id === 'ast_metallic');
  const cracker = STARTER_FIELD_MACHINE.localPos;
  for (const b of boulders) {
    assert.equal(b.type, 'ast_metallic', `${b.id} is a metallic mass`);
    assert.ok(b.oreHP >= metallic.hp[0] && b.oreHP <= metallic.hp[1],
      `${b.id} oreHP ${b.oreHP} sits inside ast_metallic's own hp table`);
    assert.ok(b.yieldU >= metallic.yieldU[0] && b.yieldU <= metallic.yieldU[1],
      `${b.id} yieldU ${b.yieldU} sits inside ast_metallic's own yield table`);
    const coreYield = Math.round(b.yieldU * BULK_CORE_YIELD_FRAC);
    assert.ok(coreYield > BULK_HAUL_MIN_U,
      `${b.id} yield ${b.yieldU}u fractures a ${coreYield}u core — above the ${BULK_HAUL_MIN_U}u haul floor`);
    const offCenter = Math.hypot(b.pos.x - fdef.center.x, b.pos.z - fdef.center.z);
    assert.ok(offCenter <= fdef.clusterRadius,
      `${b.id} sits ${offCenter.toFixed(0)} WU out — inside the claim's ${fdef.clusterRadius} WU radius`);
    const offCracker = Math.hypot(b.pos.x - cracker.x, b.pos.z - cracker.z);
    assert.ok(offCracker >= 150,
      `${b.id} stays ${offCracker.toFixed(0)} WU clear of the Claim Cracker mouth`);
    assert.equal(b.material, 'rock',
      `${b.id} pins a plain surface — a metal surface stamp makes the beam refuse the body`);
  }
});

test('entering Helios on seed 4242 materializes the boulders beside the untouched common scatter', () => {
  const { state } = bootHelios();
  const rocks = starterFieldRocks(state);
  const boulders = rocks.filter((rec) => rec.data.authoredBoulderId);
  const scatter = rocks.filter((rec) => !rec.data.authoredBoulderId);

  assert.equal(boulders.length, 3, 'every authored boulder materializes with the sector');
  const fdef = starterFieldDef();
  for (const rec of boulders) {
    const authored = fdef.boulders.find((row) => row.id === rec.data.authoredBoulderId);
    assert.ok(authored, `record ${rec.id} names its authored row`);
    assert.equal(rec.data.typeId, 'ast_metallic');
    assert.equal(rec.data.yieldU, authored.yieldU, 'authored yield survives materialization exactly');
    assert.equal(rec.data.oreHP, authored.oreHP, 'authored hp survives materialization exactly');
    const local = globalToSectorLocalForSector(rec.pos, HELIOS);
    assert.ok(Math.abs(local.x - authored.pos.x) < 1e-6 && Math.abs(local.z - authored.pos.z) < 1e-6,
      `${authored.id} lands at its authored sector-local position`);
    assert.ok(!rec.data.opticMaterial, 'the boulder carries no optic surface tag — the beam can take it');
  }

  assert.ok(scatter.length > 0, 'the common scatter still populates the claim');
  for (const rec of scatter) {
    assert.equal(rec.data.typeId, 'ast_common_rock', 'the scatter stays 100% common rock');
    const coreYield = Math.round(rec.data.yieldU * BULK_CORE_YIELD_FRAC);
    assert.ok(coreYield <= BULK_HAUL_MIN_U,
      `scatter rock yield ${rec.data.yieldU}u must stay under the haul floor — the boulders own the lesson`);
  }
});

test('cutting the largest boulder fractures a core the tag arms, routed to Ceres Refinery', () => {
  const { sim, state, helpers } = bootHelios();
  const boulders = starterFieldRocks(state).filter((rec) => rec.data.authoredBoulderId);
  const largest = boulders.reduce((best, rec) => ((rec.radius || 0) > (best.radius || 0) ? rec : best));
  assert.equal(largest.data.authoredBoulderId, 'helios_boulder_mass', 'the largest is the authored mass');

  // The ordinary route: fly at the rock, the beam's target acquisition promotes it, the beam
  // cuts it to destruction. promoteAsteroidFieldRock is the exact call _acquireTarget makes;
  // the cut is a held beam (an industrial-scale dps held across several seam-tick calls, since
  // an off-seam contact bites at a fraction of full speed).
  const live = promoteAsteroidFieldRock(state, largest.id, helpers, 'mine');
  assert.ok(live && live.alive !== false, 'the boulder promotes to a live body');
  const miningSystem = sim.registry.get('mining');

  let released = 0;
  for (let i = 0; i < 12 && live.alive !== false; i++) {
    released += miningSystem.applyMining(live.id, 900, 1, state.playerId);
  }
  assert.ok(released > 0, `the cut pays ore as it kills the boulder (released ${released}u)`);
  assert.equal(live.alive, false, 'the boulder is destroyed');

  const chunks = state.entityList.filter((e) => e && e.data && e.data.isChunk
    && e.data.fieldId === STARTER_FIELD && e.alive !== false);
  assert.ok(chunks.length >= 2, 'fracture leaves chunk bodies beside the core');
  const core = chunks.find((e) => e.data.bulkCore);
  assert.ok(core, 'one chunk is the core');
  assert.ok(core.data.bulkMassU > BULK_HAUL_MIN_U,
    `the core carries ${core.data.bulkMassU}u — too big to scoop against the ${BULK_HAUL_MIN_U}u floor`);
  assert.equal(core.data.commodityId, 'cmdty_ore_iron', 'the core is iron — the seam shortage story');
  for (const chunk of chunks) {
    if (chunk === core) continue;
    assert.ok(!isBulkHaulTagArmed(chunk), 'sibling shards stay scoopable — only the core tows');
  }

  assert.equal(isBulkHaulTagArmed(core), true, 'the bulk-haul tag arms on the core');
  const tag = buildBulkHaulTag(core, state);
  assert.ok(tag, 'the tag builds');
  assert.equal(tag.routeHint.stationName, 'Ceres Refinery', 'the nearest paying berth is Ceres Refinery');
  assert.equal(tag.routeHint.local, false, 'Helios still pays no refine — the haul is a plotted route');
  assert.equal(tag.routeHint.text, 'Plot refinery route to Ceres Refinery.');
  sim.dispose();
});
