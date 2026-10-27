/**
 * Packet 05 — the Pull collector: a fitted variant of the existing Pull emitter that gathers loose
 * matter into a physical knot at its deployed location and throws it, on request, from where it is.
 *
 * Real fields kernel + real Gyre (thrown-aggregate lifecycle) + real rapier-dynamic. Covers the
 * default-route grammar (fit -> Pull drops a collector -> mass piles in -> hold to aim -> release to
 * throw) and the lifecycle edges the packet names: second deploy never steals, replace/recall,
 * dry charge, out of reach, emitter expiry / shot down / cap replacement, sector change, protected
 * cargo, saturation, extreme mass ratios, two tools contesting one body, determinism, save.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS, FIELD_DEFS, FIELD_END_REASONS } from '../src/data/fields.js';
import { COLLECTOR_KNOT as K, COLLECTOR_MODULE_ID } from '../src/data/collectorKnot.js';
import { GYRE_SNARE as G } from '../src/data/gyreSnare.js';
import { MATTER_REFUSAL } from '../src/matter/aggregateMass.js';
import { powerPreviewPlan, powerHeld } from '../src/data/powerPreview.js';
import { setHeldPower } from '../src/systems/powerVerbs.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

async function boot({ seed = 61, fitted = true, cap = 100 } = {}) {
  const prevFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed, bus: createBus(), systems: [fields, gyreSnare, physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ps = sim.registry.get('physics');
  assert.equal(await ps.prepareBackend(state), true, 'rapier-dynamic backend initializes headless');
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200, flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', fittings: fitted ? [COLLECTOR_MODULE_ID] : [] },
  });
  state.playerId = player.id;
  player.cap = cap;
  const events = [];
  for (const name of ['fields:deployed', 'fields:ended', 'collector:snagged', 'collector:absorbed', 'collector:released',
    'collector:freed', 'collector:lost', 'matter:refused', 'gyre:launched', 'gyre:absorbed', 'toast']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  const rock = (x, z, mass = 12, radius = 6, type = 'asteroid', data = {}) => sim.spawn({
    type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true, hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data,
  });
  const t = {
    sim, state, player, events, rock, ps,
    fields: sim.registry.get('fields'), gyre: sim.registry.get('gyreSnare'),
    pub: () => state.fieldsRuntime && state.fieldsRuntime.collector,
    press: (aim) => { if (aim) state.input.aimWorld = aim; state.input.actions.deployWell = true; sim.step(); },
    steps: (n) => { for (let i = 0; i < n; i++) sim.step(); },
    deployed: () => Object.values(state.fields.deployed),
    cleanup: () => {
      if (typeof ps._disableSg02DynamicAuthority === 'function') ps._disableSg02DynamicAuthority();
      FIELD_FLAGS.enabled = prevFlag;
    },
  };
  return t;
}

const near = (a, b, eps) => Math.abs(a - b) <= eps;

test('a collector throw stops powering and disarms when cargo ownership adopts it, including after the burst', async () => {
  for (const edge of ['burst', 'flight', 'handed-back']) {
    const t = await boot();
    try {
      const core = t.rock(310, 20, 36, 7, 'wreck');
      t.press({ x: 300, z: 0 });
      t.steps(100);
      assert.equal(t.pub().coreId, core.id);
      t.press({ x: 700, z: 0 });
      assert.equal(core.data.gyreLaunched, true);
      if (edge === 'flight') t.steps(K.launchTicks + 1);
      if (edge === 'handed-back') t.gyre._handBack(core);
      else {
        core.data.missionPinned = true;
        core.data.despawnAt = 100;
        core.ttl = 77;
      }
      consumePhysicsCommand(core);
      // The collector runs before Gyre; it must stop at its own destructive boundary.
      t.fields._knots.tick(t.state, t.state.fields, 1 / 60);
      const command = consumePhysicsCommand(core);
      assert.ok(!command || command.impulses.length === 0, `${edge}: adoption cancels future burst impulse`);
      t.gyre.update(1 / 60, t.state);
      assert.equal(core.data.gyreLaunched, undefined, `${edge}: no projectile immunity remains`);
      assert.equal(core.data.gyreLaunchMeta, undefined, `${edge}: no weapon credit remains`);
      assert.equal(core.physicsBody.impactDamageScale ?? 1, 1, `${edge}: the ordinary collider is restored`);
      if (edge !== 'handed-back') {
        assert.equal(core.data.despawnAt, 100, 'the new owner keeps its deadline');
        assert.equal(core.ttl, 77, 'the new owner keeps its relative lifetime');
      }
      assert.equal(core.alive, true);
    } finally { t.cleanup(); }
  }
});

test('unfitted: Pull is the plain well it always was (no collector, no knot, nothing changes)', async () => {
  const t = await boot({ fitted: false });
  try {
    t.press({ x: 300, z: 0 });
    const [rec] = t.deployed();
    assert.ok(rec && rec.kind === 'well');
    assert.equal(rec.collector, undefined);
    assert.equal(t.state.entities.get(rec.emitterId).data.collector, undefined);
    assert.ok(near(rec.expireAt - rec.deployedAt, FIELD_DEFS.well.durationS, 1e-9));
    t.rock(300, 20);
    t.steps(180);
    assert.equal(t.pub().active, false, 'no knot without the Collector Maw');
    assert.equal(t.fields._knots.size, 0);
  } finally { t.cleanup(); }
});

test('fitted: Pull drops a collector — the same well field, a longer sturdier emitter, flagged', async () => {
  const t = await boot();
  try {
    t.press({ x: 300, z: 0 });
    const [rec] = t.deployed();
    assert.equal(rec.kind, 'well', 'a variant of the existing Pull emitter, not a second kernel');
    assert.equal(rec.collector, true);
    const emitter = t.state.entities.get(rec.emitterId);
    assert.equal(emitter.data.collector, true);
    assert.equal(emitter.hull, K.hull);
    assert.ok(near(rec.expireAt - rec.deployedAt, K.durationS, 1e-9));
    const field = t.fields._kernel.list().find((f) => f.sourceId === rec.emitterId);
    assert.equal(field.kind, FIELD_DEFS.well.kind, 'the kernel field is the Pull well');
    assert.equal(field.radius, FIELD_DEFS.well.radius);
    assert.equal(t.pub().phase, 'gathering');
    assert.equal(t.pub().next, 'REPLACE');
    assert.equal(t.events.find((e) => e.name === 'fields:deployed').p.collector, true);
  } finally { t.cleanup(); }
});

test('gather: a pile forms a physical knot AT the emitter; the ship is never involved', async () => {
  const t = await boot();
  try {
    const rocks = [t.rock(330, 60), t.rock(380, -50), t.rock(310, -80, 20, 8, 'wreck'), t.rock(420, 40, 8, 5), t.rock(360, 100, 15, 7, 'wreck')];
    const totalMass = rocks.reduce((s, r) => s + r.physicsBody.mass, 0);
    const r3 = rocks.reduce((s, r) => s + r.physicsBody.radius ** 3, 0);
    t.press({ x: 350, z: 0 });
    const [rec] = t.deployed();
    const emitter = t.state.entities.get(rec.emitterId);
    let core = null, maxFromEmitter = 0, minFromShip = Infinity;
    for (let i = 0; i < 480; i++) {
      t.sim.step();
      const id = t.pub().coreId;
      if (id != null) {
        core = t.state.entities.get(id);
        maxFromEmitter = Math.max(maxFromEmitter, Math.hypot(core.pos.x - emitter.pos.x, core.pos.z - emitter.pos.z));
        minFromShip = Math.min(minFromShip, Math.hypot(core.pos.x - t.player.pos.x, core.pos.z - t.player.pos.z));
      }
    }
    assert.ok(core, 'a knot formed');
    assert.equal(t.pub().phase, 'knot');
    assert.equal(t.pub().members, rocks.length - 1);
    assert.equal(core.physicsBody.mass, totalMass, 'collision mass is the sum of what was gathered');
    assert.ok(Math.abs(core.physicsBody.radius - Math.cbrt(r3)) < 1e-6, 'size from occupied volume');
    assert.equal(core.data.collectorCore, rec.fieldId);
    assert.equal(rocks.filter((r) => r !== core && r.alive !== false).length, 0, 'consumed members no longer exist');
    assert.ok(maxFromEmitter < 60, `the knot sits at the emitter (max ${maxFromEmitter.toFixed(1)} wu off)`);
    assert.ok(minFromShip > 250, 'the knot never travels to the ship');
    const merges = t.events.filter((e) => e.name === 'collector:absorbed');
    for (let i = 1; i < merges.length; i++) assert.ok(merges[i].tick - merges[i - 1].tick >= K.absorbGapTicks, 'merges are staggered');
    assert.equal(t.events.filter((e) => e.name === 'collector:snagged').length, 1);
    assert.equal(t.pub().next, 'RELEASE');
    assert.ok(t.pub().cost >= K.chargeBase, 'the throw has a published price');
  } finally { t.cleanup(); }
});

test('Gyre cannot steal a collector\'s knot: it is claimed, not a snag candidate, not a meal', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 30, 8);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core && core.data.collectorCore);
    // Fly the Gyre maw over the knot and hold the lash.
    t.player.pos.x = core.pos.x - G.mawDist;
    t.player.pos.z = core.pos.z;
    t.state.input.actions.gyreSnare = true;
    t.steps(40);
    assert.equal(t.gyre._rt.phase, 'beaming', 'a held knot is not a Gyre snag');
    assert.equal(t.gyre._rt.coreId, null);
    assert.equal(core.alive, true);
    assert.equal(core.data.collectorCore !== undefined, true);
    assert.ok(t.state.gyreSnare.refusals.claimed >= 1, 'and Gyre says why: claimed');
    assert.equal(t.gyre._absorb(t.state, t.gyre._rt, core, core, 0, 0, 0), false);
    t.state.input.actions.gyreSnare = false;
  } finally { t.cleanup(); }
});

test('a second Pull press with a knot is its focus: it releases, never deploys, never steals', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9); t.rock(345, -15, 25, 7);
    t.press({ x: 350, z: 0 });
    const first = t.deployed()[0].fieldId;
    t.steps(300);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core, 'knot ready');
    const before = { x: core.pos.x, z: core.pos.z, mass: core.physicsBody.mass };
    const capBefore = t.player.cap;
    // Aim down +z from the knot: the throw must leave from the knot toward the aim point.
    t.press({ x: before.x, z: before.z + 600 });
    assert.equal(t.deployed().length, 1, 'no second deployment');
    assert.equal(t.deployed()[0].fieldId, first, 'the first collector stays');
    const released = t.events.find((e) => e.name === 'collector:released');
    assert.ok(released, 'the press committed the release');
    assert.ok(near(released.p.origin.x, before.x, 3) && near(released.p.origin.z, before.z, 3), 'from where the knot physically is');
    assert.ok(near(released.p.dir.x, 0, 0.02) && near(released.p.dir.z, 1, 0.02), 'along the aim vector');
    assert.ok(t.player.cap < capBefore, 'the commit spends charge');
    assert.ok(near(capBefore - t.player.cap, released.p.cost, 1e-6));
    t.steps(14);
    assert.ok(core.vel.z > K.launchSpeed * 0.8, `thrown at speed (${core.vel.z.toFixed(0)})`);
    assert.ok(Math.abs(core.vel.x) < 25, 'no sideways surprise');
    assert.ok(core.pos.z > before.z + 20, 'it left the knot\'s position, not the ship\'s');
    // The throw is Gyre's thrown-aggregate lifecycle: watched, credited, armed.
    assert.equal(core.data.gyreLaunched, true);
    assert.equal(core.data.collectorCore, undefined);
    assert.equal(core.data.gyreLaunchMeta.weaponId, 'wpn_pull_collector');
    assert.equal(core.data.gyreLaunchMeta.actorId, t.player.id);
    assert.ok(t.gyre._rt.ballIds.includes(core.id));
    assert.equal(core.physicsBody.impactDamageScale > 1, true, 'armed as a weapon');
    assert.equal(t.state.gyreSnare.launchedId, core.id, 'the HUD mirror tracks the flying knot');
    // The emitter survives and starts a fresh knot.
    assert.equal(t.pub().phase, 'gathering');
    t.rock(core.pos.x, 0, 10, 5); // nothing to do with the old ball: new matter at the emitter
    void before.mass;
  } finally { t.cleanup(); }
});

test('an empty collector is replaced (recall), not duplicated: the cap of one holds', async () => {
  const t = await boot();
  try {
    t.press({ x: 300, z: 0 });
    const first = t.deployed()[0];
    t.steps(60 * 11); // past the deploy cooldown, still no matter
    t.press({ x: 200, z: 100 });
    assert.equal(t.deployed().length, 1);
    assert.notEqual(t.deployed()[0].fieldId, first.fieldId, 'a new emitter replaced the old');
    assert.equal(t.state.entities.get(first.emitterId)?.alive === true, false, 'the old emitter is gone');
    assert.ok(t.events.some((e) => e.name === 'fields:ended' && e.p.fieldId === first.fieldId && e.p.reason === FIELD_END_REASONS.replaced));
  } finally { t.cleanup(); }
});

test('dry charge: the throw is refused with its own code, and nothing is consumed', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 400, 14); // a heavy knot costs more
    t.press({ x: 350, z: 0 });
    t.steps(260);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    t.player.cap = 3;
    const need = t.pub().cost;
    assert.ok(need > 3);
    t.press({ x: 600, z: 0 });
    const refusal = t.events.filter((e) => e.name === 'matter:refused' && e.p.tool === 'collector' && e.p.code === 'dry-charge');
    assert.equal(refusal.length, 1);
    assert.ok(near(refusal[0].p.need, need, 1e-6) && refusal[0].p.have === 3);
    assert.equal(t.player.cap, 3, 'no charge taken');
    assert.equal(core.data.collectorCore !== undefined, true, 'the knot is still held');
    assert.equal(core.data.gyreLaunched, undefined);
    assert.equal(t.deployed().length, 1);
    assert.equal(t.events.filter((e) => e.name === 'collector:released').length, 0);
    // The held preview answers before the release does.
    setHeldPower(t.state, 'pull');
    const plan = powerPreviewPlan(t.state);
    assert.match(plan.blocked, /Needs \d+ charge/);
    setHeldPower(t.state, null);
  } finally { t.cleanup(); }
});

test('out of reach: a knot beyond the focus range is refused as out-of-range', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    assert.ok(t.pub().coreId != null);
    t.player.pos.x = -(K.focusRange + 200);
    t.press({ x: 500, z: 0 });
    const out = t.events.filter((e) => e.name === 'matter:refused' && e.p.code === MATTER_REFUSAL.OUT_OF_RANGE);
    assert.equal(out.length, 1);
    assert.equal(out[0].p.need, K.focusRange);
    assert.equal(t.events.filter((e) => e.name === 'collector:released').length, 0);
  } finally { t.cleanup(); }
});

test('the held key IS the focus: Pull held with a knot previews the throw from the knot', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    const core = t.state.entities.get(t.pub().coreId);
    t.state.input.aimWorld = { x: core.pos.x + 700, z: core.pos.z + 40 };
    setHeldPower(t.state, 'pull');
    assert.equal(powerHeld(t.state), 'pull');
    const plan = powerPreviewPlan(t.state);
    assert.equal(plan.power, 'pull');
    assert.match(plan.note, /^KNOT \d+ t · release to throw/);
    assert.equal(plan.areas[0].kind, 'route');
    assert.ok(near(plan.areas[0].points[0], core.pos.x, 0.01) && near(plan.areas[0].points[1], core.pos.z, 0.01), 'the line starts at the knot');
    assert.equal(plan.blocked, null, 'affordable and in reach');
    // Without a knot the same key previews the well it is about to drop.
    const empty = await boot();
    try {
      setHeldPower(empty.state, 'pull');
      empty.state.input.aimWorld = { x: 300, z: 0 };
      const dropPlan = powerPreviewPlan(empty.state);
      assert.equal(dropPlan.areas[0].kind, 'ring', 'no knot: the well ring');
    } finally { empty.cleanup(); }
    setHeldPower(t.state, null);
  } finally { t.cleanup(); }
});

test('emitter expiry sets the knot free: authored lifetime restored, matter kept, nothing deleted', async () => {
  const t = await boot();
  try {
    const wreck = t.rock(330, 20, 40, 9, 'wreck');
    wreck.data.despawnAt = 600;
    wreck.ttl = 900;
    t.rock(345, -10, 20, 6);
    t.press({ x: 350, z: 0 });
    t.steps(260);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    assert.equal(core.data.despawnAt, undefined, 'lifetime stashed while held');
    const mass = core.physicsBody.mass;
    t.state.simTime = t.deployed()[0].expireAt + 0.01; // the emitter's life is over
    t.steps(3);
    assert.equal(t.deployed().length, 0);
    assert.equal(core.alive, true, 'the knot is a free body, not a deletion');
    assert.equal(core.data.collectorCore, undefined);
    assert.equal(core.physicsBody.mass, mass, 'and it keeps everything it ate');
    assert.equal(core.data.gyrePrevDespawnAt, undefined);
    assert.ok(t.events.some((e) => e.name === 'collector:freed' && e.p.id === core.id));
    assert.equal(t.fields._knots.size, 0);
    assert.equal(t.pub().active, false);
  } finally { t.cleanup(); }
});

test('a shot-down emitter and a cap replacement both free the knot the same way', async () => {
  for (const how of [FIELD_END_REASONS.destroyed, FIELD_END_REASONS.replaced]) {
    const t = await boot({ seed: how === FIELD_END_REASONS.destroyed ? 62 : 63 });
    try {
      t.rock(330, 20, 40, 9);
      t.press({ x: 350, z: 0 });
      t.steps(240);
      const core = t.state.entities.get(t.pub().coreId);
      assert.ok(core);
      const [rec] = t.deployed();
      if (how === FIELD_END_REASONS.destroyed) {
        t.state.entities.get(rec.emitterId).alive = false;
        t.steps(2);
      } else {
        t.fields._retireDeployed(t.state, t.state.fields, rec, FIELD_END_REASONS.replaced);
      }
      assert.equal(core.alive, true);
      assert.equal(core.data.collectorCore, undefined);
      assert.ok(t.events.some((e) => e.name === 'collector:freed' && e.p.reason === how), how);
    } finally { t.cleanup(); }
  }
});

test('sector change and load set every knot free before the world is replaced', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    t.sim.bus.emit('sector:exit', {});
    assert.equal(core.data.collectorCore, undefined);
    assert.equal(t.fields._knots.size, 0);
    assert.equal(t.deployed().length, 0);
    assert.equal(t.pub().active, false);
  } finally { t.cleanup(); }
});

test('protected cargo at the maw is refused as protected and never eaten', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    const cargo = t.rock(331, 22, 12, 5, 'wreck', { salvagePool: { cmdty_ore_iron: 3 } });
    t.press({ x: 350, z: 0 });
    t.steps(300);
    assert.equal(cargo.alive, true);
    assert.deepEqual(cargo.data.salvagePool, { cmdty_ore_iron: 3 });
    assert.ok(t.events.some((e) => e.name === 'matter:refused' && e.p.tool === 'collector' && e.p.code === 'protected'));
  } finally { t.cleanup(); }
});

test('a full knot refuses more, says saturated, and loses nothing', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    const knot = t.fields._knots.get(t.deployed()[0].fieldId);
    assert.ok(knot && knot.coreRef);
    while (knot.members.length < K.maxMembers) knot.members.push({ type: 'asteroid', material: 'rock', typeId: null, mass: 1, radius: 1, nx: 0, nz: 0 });
    const core = t.state.entities.get(t.pub().coreId);
    const meal = t.rock(core.pos.x + knot.radius + 5, core.pos.z, 8, 4);
    const mass = knot.mass;
    t.steps(30);
    assert.equal(meal.alive, true, 'a full knot eats nothing more');
    assert.equal(knot.mass, mass);
    assert.ok(t.events.some((e) => e.name === 'matter:refused' && e.p.tool === 'collector' && e.p.code === 'saturated'));
    assert.equal(t.pub().refusal, 'saturated');
  } finally { t.cleanup(); }
});

test('extreme mass ratios stay finite and bounded: a pebble core eats moons, the envelope caps', async () => {
  const t = await boot();
  try {
    t.rock(335, 10, 0.5, 1.5); // the pebble that snags first (closest to the emitter)
    t.press({ x: 350, z: 0 });
    t.steps(30);
    for (let i = 0; i < 5; i++) t.rock(350 + 30 * Math.cos(i), 40 * Math.sin(i + 1), 900, 40 + i, 'asteroid');
    t.steps(900);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    for (const v of [core.pos.x, core.pos.z, core.vel.x, core.vel.z, core.physicsBody.mass, core.physicsBody.radius, core.physicsBody.inertiaY]) {
      assert.ok(Number.isFinite(v));
    }
    assert.ok(core.physicsBody.radius <= K.maxKnotRadius + 1e-9);
    assert.ok(core.physicsBody.mass >= 900, 'the moons were taken whole (mass keeps counting past the envelope cap)');
  } finally { t.cleanup(); }
});

test('two tools contest one body: it joins exactly one aggregate, mass is never counted twice', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    t.steps(240);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    // A meal inside the knot's skin AND inside Gyre's open basin.
    t.player.pos.x = core.pos.x - G.mawDist + 40;
    t.player.pos.z = core.pos.z;
    const meal = t.rock(core.pos.x + core.physicsBody.radius + 8, core.pos.z, 17, 5);
    const massBefore = core.physicsBody.mass;
    t.state.input.actions.gyreSnare = true;
    t.steps(40);
    t.state.input.actions.gyreSnare = false;
    const gyreEaten = t.events.filter((e) => e.name === 'gyre:absorbed' && e.p.victimId === meal.id).length;
    const knotEaten = t.events.filter((e) => e.name === 'collector:absorbed' && e.p.victimId === meal.id).length;
    assert.equal(gyreEaten + knotEaten <= 1, true, `taken by at most one tool (gyre ${gyreEaten}, knot ${knotEaten})`);
    if (knotEaten === 1) assert.equal(core.physicsBody.mass, massBefore + 17);
    assert.equal(meal.alive, gyreEaten + knotEaten === 0);
  } finally { t.cleanup(); }
});

test('the knot lifecycle is a pure function of the seed: two runs agree to the last digit', async () => {
  const run = async () => {
    const t = await boot({ seed: 77 });
    try {
      [t.rock(330, 60), t.rock(380, -50), t.rock(310, -80, 20, 8, 'wreck')];
      t.press({ x: 350, z: 0 });
      t.steps(420);
      const core = t.state.entities.get(t.pub().coreId);
      t.press({ x: core.pos.x, z: core.pos.z + 500 });
      t.steps(40);
      return [core.pos.x, core.pos.z, core.vel.x, core.vel.z, core.physicsBody.mass, t.player.cap, t.state.tick].join('|');
    } finally { t.cleanup(); }
  };
  assert.equal(await run(), await run());
});

test('save policy: the knot is physical, non-persistent matter; the emitter and knot leave no residue in a reload', async () => {
  const t = await boot();
  try {
    t.rock(330, 20, 40, 9); t.rock(345, -10, 20, 6);
    t.press({ x: 350, z: 0 });
    t.steps(300);
    const core = t.state.entities.get(t.pub().coreId);
    assert.ok(core);
    // A held core is never flagged persistent (so the entity serializer skips it) and its marks
    // are plain data on a body that regenerates with its sector — exactly Gyre's held-clump policy.
    assert.notEqual(core.flags && core.flags.persistent, true);
    const saved = t.fields.serialize();
    assert.equal(saved.deployed[t.deployed()[0].fieldId].collector, true);
    // Reload into a world where the (non-persistent) emitter and knot no longer exist.
    const fresh = await boot({ seed: 64 });
    try {
      fresh.fields.deserialize(JSON.parse(JSON.stringify(saved)));
      assert.equal(Object.keys(fresh.state.fields.deployed).length, 0, 'no emitter, so no orphan field');
      assert.equal(fresh.fields._knots.size, 0);
      fresh.steps(5);
      assert.ok(!fresh.pub() || fresh.pub().active === false, 'the mirror shows no collector');
    } finally { fresh.cleanup(); }
    // A ball in flight IS persistent state (Gyre's gyreLaunched ride): the throw's meta survives JSON.
    t.press({ x: core.pos.x + 400, z: core.pos.z });
    t.steps(10);
    const meta = JSON.parse(JSON.stringify(core.data.gyreLaunchMeta));
    assert.equal(meta.weaponId, 'wpn_pull_collector');
    assert.equal(meta.burst, true);
    assert.ok(Array.isArray(meta.members) && meta.members.length >= 1);
  } finally { t.cleanup(); }
});

test('idle: fitted but undeployed costs nothing and publishes nothing live', async () => {
  const t = await boot();
  try {
    t.steps(120);
    assert.equal(t.fields._knots.size, 0);
    assert.equal(t.deployed().length, 0);
    assert.equal(t.sim.registry.get('gyreSnare')._rt.phase, 'off');
  } finally { t.cleanup(); }
});

test('the rail names the current role and the next press, and only while the Maw is fitted', async () => {
  const { readRailModel } = await import('../src/ui/powerRail.js');
  const plain = await boot({ fitted: false });
  try {
    assert.equal(readRailModel(plain.state, 0)[1].name, undefined, 'unfitted: the Pull socket is untouched');
    assert.equal(readRailModel(plain.state, 0)[1].badge, undefined);
  } finally { plain.cleanup(); }
  const t = await boot();
  try {
    let slot = readRailModel(t.state, t.state.simTime)[1];
    assert.equal(slot.name, 'Collector');
    assert.equal(slot.badge, 'DROP', 'nothing deployed: the next press drops one');
    t.rock(330, 20, 40, 9);
    t.press({ x: 350, z: 0 });
    slot = readRailModel(t.state, t.state.simTime)[1];
    assert.equal(slot.badge, 'GATHERING');
    t.steps(300);
    slot = readRailModel(t.state, t.state.simTime)[1];
    assert.match(slot.badge, /^KNOT \d+t$/);
    assert.equal(slot.state, 'armed', 'a ready knot lights the socket even while the deploy cooldown runs');
    assert.match(slot.why, /hold to aim, release to throw \(\d+ charge\)/);
  } finally { t.cleanup(); }
});
