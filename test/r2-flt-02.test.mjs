import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { wingmen } from '../src/systems/wingmen.js';
import { automation } from '../src/systems/automation.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { tetherGameplay, TWIN_BRIDLE_DEF_ID } from '../src/systems/tetherGameplay.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';

const combatOwner = { name: 'combat', init(ctx) { this.kernel = getCombatKernel(ctx); } };

async function scene({ order = 'attack', heavyDef = 'ship_warden', wingDef = 'ship_wasp', heavyTeam = 1, far = false, followUp = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [combatOwner, automation, wingmen, aiPorts, flightV3],
    // The production helm consumes last tick's wingman intent; the tactical port yields passive hulls.
    updateOrder: [flightV3, aiPorts, wingmen] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const playerDef = followUp ? 'ship_drifter' : 'ship_kestrel';
  const player = sim.spawn(makeShipEntitySpec(playerDef, { team: 0,
    fittings: followUp ? fittingsFromDefaultModules(playerDef, ['mod_twin_bridle_m']) : [],
    pos: { x: 0, z: followUp ? 0 : -300 } }));
  state.runtime = { features: PRODUCTION_FEATURES };
  state.playerId = player.id;
  const heavySpec = makeShipEntitySpec(heavyDef, { team: heavyTeam, factionId: 'faction_reach', pos: { x: followUp ? 375 : 400, z: 0 },
    ai: { archetype: 'brawler', hostileTeams: [0] } });
  heavySpec.vel = { x: 10, y: 0, z: 0 };
  heavySpec.data.intent = { moveX: 0, moveZ: 0.05, aimAngle: 0, fire: false };
  const heavy = sim.spawn(heavySpec);
  const fs = { id: 'fleet-brace', shipDefId: wingDef, order: 'escort', hullPct: 1,
    hp: 1, status: 'escort', customName: 'Mira' };
  state.automation.fleet.push(fs);
  const wings = sim.registry.get('wingmen');
  const wingSpec = wings._buildWingmanSpec(fs, player);
  wingSpec.pos = { x: far ? 70 : 300, z: 0 };
  wingSpec.rot = 0;
  const wing = sim.spawn(wingSpec);
  wing.data.wingmanOf = fs.id;
  fs._liveId = wing.id;
  const attached = [], broken = [], toasts = [];
  bus.on('tether:attached', p => attached.push(structuredClone(p)));
  bus.on('tether:broken', p => broken.push(structuredClone(p)));
  bus.on('toast', p => toasts.push(structuredClone(p)));
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.syncFromEntities(state.entityList);
  sim.helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
  const kernel = sim.registry.get('combat').kernel;
  bus.emit('ui:wingOrder', { order, targetId: heavy.id });
  return { sim, state, bus, player, heavy, wing, fs, wings, owner, kernel, attached, broken, toasts,
    run(n) {
      for (let i = 0; i < n; i++) {
        sim.step();
        owner.step(SIM_DT);
        kernel.attachments.breakOrphans();
        kernel.attachments.updateTelemetryAndBreak();
      }
    },
    close() { kernel.dispose(); owner.dispose(); sim.dispose(); },
  };
}

function braceLine(s) {
  return s.kernel.attachments.listForEntity(s.wing.id).find(a => a.ownerId === s.wing.id && a.targetId === s.heavy.id);
}

test('seed 4242: Attack physically flies a wingman into range and creates its own kernel Massline', async () => {
  const s = await scene({ far: true });
  try {
    const start = s.wing.pos.x;
    assert.equal(braceLine(s), undefined, 'a distant wingman must approach before latching');
    for (let i = 0; i < 600 && !braceLine(s); i++) s.run(1);
    const line = braceLine(s);
    assert.ok(line, 'Attack must create a real kernel attachment, not damping-only impulses');
    assert.ok(s.wing.pos.x - start > 100, 'Flight V3 propulsion closes the approach');
    assert.equal(line.defId, 'tether_standard');
    assert.ok(line.restLength <= 120, `latch range ${line.restLength}`);
    assert.equal(s.attached.length, 1, 'the kernel publishes one attachment receipt');
    assert.equal(s.attached[0].attachmentId, line.id);
    assert.equal(s.attached[0].actorId, s.wing.id);
    assert.ok(line.physicsHandle, 'the line has a real Rapier joint');
    s.run(2);
    assert.equal(s.sim.helpers.aiRoster.listSquads(s.state.tick)
      .some(squad => squad.members.some(member => member.id === s.wing.id)), false,
    'the tactical motor planner yields the brace helm');
    console.log(`seed=4242 approach=${(s.wing.pos.x - start).toFixed(1)} WU latch=${line.restLength.toFixed(1)} WU`);
  } finally { s.close(); }
});

test('seed 4242: real line tension steadies the heavy for the player follow-up', async () => {
  const braced = await scene();
  const free = await scene({ order: 'screen' });
  try {
    const origin = braced.heavy.pos.x;
    braced.run(240); free.run(240);
    const line = braceLine(braced);
    assert.ok(line, 'a physical brace must still hold during the follow-up window');
    const braceDrift = Math.abs(braced.heavy.pos.x - origin);
    const freeDrift = Math.abs(free.heavy.pos.x - origin);
    assert.ok(braceDrift < freeDrift * 0.8, `brace drift ${braceDrift}, unbraced drift ${freeDrift}`);
    assert.ok(line.lastTension > 0, 'the native joint carries the pull');
    console.log(`seed=4242 follow-up drift: braced=${braceDrift.toFixed(2)} WU free=${freeDrift.toFixed(2)} WU tension=${line.lastTension.toFixed(2)}`);
  } finally { braced.close(); free.close(); }
});

test('seed 4242: the same two player Massline presses land a Clothesline follow-up on the braced heavy', async () => {
  const held = await scene({ followUp: true });
  const free = await scene({ followUp: true, order: 'screen' });
  try {
    held.run(1080); free.run(1080);
    const attempt = s => {
      const source = s.sim.spawn({ type: 'asteroid', pos: { x: 100, z: 150 }, radius: 10,
        mass: 1000, physicsBody: { schemaVersion: 1, dynamic: false, mass: 1000, radius: 10 }, data: {} });
      s.owner.syncFromEntities(s.state.entityList);
      const tether = Object.create(tetherGameplay);
      tether.init({ state: s.state, bus: s.bus, helpers: s.sim.helpers, registry: s.sim.registry });
      const press = (target, latch) => {
        s.state.tick++; s.state.simTime += SIM_DT;
        s.state.input.aimIntentActive = true;
        s.state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
        s.state.input.aimAngle = Math.atan2(target.pos.z - s.player.pos.z, target.pos.x - s.player.pos.x);
        s.state.input.actions = { tetherFire: latch, tetherCut: false,
          massline: latch ? { latch: true, cut: false, lineControl: false, lineLength: 0 } : null };
        tether.update(SIM_DT, s.state);
      };
      press(source, false); press(source, true);
      assert.equal(s.state.masslineBridle?.sourceId, source.id, 'the first public press selects the terrain end');
      for (let i = 0; i < 6; i++) press(s.heavy, false);
      press(s.heavy, true);
      return s.kernel.attachments.listForEntity(s.heavy.id)
        .find(a => a.defId === TWIN_BRIDLE_DEF_ID && a.ownerId === source.id && a.controllerId === s.player.id);
    };
    assert.ok(attempt(held), 'the heavy held in reach receives the real player A-to-B Clothesline');
    assert.equal(attempt(free), undefined, 'the escaping unbraced heavy is outside the same fitted tool reach');
    console.log(`seed=4242 Clothesline: braced reach=${Math.hypot(held.heavy.pos.x, held.heavy.pos.z).toFixed(2)} WU, free=${Math.hypot(free.heavy.pos.x, free.heavy.pos.z).toFixed(2)} WU; actual bridle latches=1 vs 0`);
  } finally { held.close(); free.close(); }
});

test('seed 4242: overload snaps the kernel line and the same order cannot silently relatch or earn credit', async () => {
  const s = await scene();
  try {
    s.run(1);
    const line = braceLine(s);
    assert.ok(line, 'kernel line exists before overload');
    const policy = s.kernel.attachments.breakPolicy(line.id);
    const livePhysics = s.sim.helpers.combatPhysics;
    // The physics port is the load producer; keep the kernel controller, warning and cut authority real.
    s.sim.helpers.combatPhysics = { ...livePhysics,
      getAttachmentTelemetry() { return { tension: policy.maxTension * 2, impulse: 0,
        relativeSpeed: 0, length: line.restLength }; } };
    for (let i = 0; i < 120 && line.state === 'active'; i++) {
      s.state.tick++;
      s.kernel.attachments.updateTelemetryAndBreak();
    }
    assert.equal(line.state, 'broken', 'existing overload rules snap the brace');
    assert.ok(s.broken.some(p => p.attachmentId === line.id));
    s.sim.helpers.combatPhysics = livePhysics;
    s.run(3);
    assert.equal(braceLine(s), undefined, 'a failed brace gets one attempt per command');
    assert.equal(s.fs.braceTargetId, null);
    s.bus.emit('stunt:trickDetected', { trickId: 'one_two', actorId: s.player.id, witnessIds: [s.wing.id] });
    assert.equal(s.fs.callsign, undefined, 'a snapped brace earns nothing');
  } finally { s.close(); }
});

test('seed 4242: other orders, light hulls, equally heavy wingmen and friendly targets never latch', async () => {
  for (const setup of ['screen', 'hold', 'regroup', 'light', 'equal mass', 'friendly']) {
    const s = await scene({ order: ['screen', 'hold', 'regroup'].includes(setup) ? setup : 'attack',
      heavyDef: setup === 'light' ? 'ship_wasp' : 'ship_warden',
      wingDef: setup === 'equal mass' ? 'ship_warden' : 'ship_wasp', heavyTeam: setup === 'friendly' ? 0 : 1 });
    try {
      s.run(4);
      assert.equal(braceLine(s), undefined, setup);
      assert.equal(s.attached.length, 0, setup);
    } finally { s.close(); }
  }
});

test('seed 4242: releasing the order, either death, fleeing and hard sector exit clean up the real line', async () => {
  for (const end of ['release', 'mine', 'heavy death', 'wing death', 'flee', 'sector exit']) {
    const s = await scene();
    try {
      s.run(1);
      const line = braceLine(s);
      assert.ok(line, end);
      if (end === 'release') s.bus.emit('ui:wingOrder', { order: 'regroup' });
      if (end === 'mine') s.fs.order = 'mine';
      if (end === 'heavy death') s.heavy.alive = false;
      if (end === 'wing death') s.wing.alive = false;
      if (end === 'flee') s.wing.data.ai.forceFlee = true;
      if (end === 'sector exit') s.bus.emit('sector:exit', { continuous: false });
      s.run(1);
      assert.equal(line.state, 'broken', end);
      assert.equal(s.fs.braceTargetId, null, end);
      assert.equal(s.wing.data.ai.passive, undefined, 'prior tactical eligibility is restored');
      assert.equal(s.broken.filter(p => p.attachmentId === line.id).length, 1, 'one cleanup receipt');
    } finally { s.close(); }
  }
});

test('seed 4242: a witnessed shared stunt gives morale and a callsign that survives fleet save and rematerialization', async () => {
  const s = await scene();
  try {
    s.run(1);
    assert.equal(s.fs.braceTargetId, s.heavy.id);
    s.bus.emit('stunt:trickDetected', { trickId: 'clothesline', actorId: s.player.id, witnessIds: [] });
    assert.equal(s.fs.callsign, undefined, 'an unwitnessed stunt earns nothing');
    s.bus.emit('stunt:trickDetected', { trickId: 'clothesline', name: 'Clothesline',
      episodeId: 'brace-episode', actorId: s.player.id, witnessIds: [s.wing.id] });
    assert.equal(s.wing.data.ai.wingMorale.reason, 'brace_shared_stunt');
    assert.ok(s.wing.data.ai.wingMorale.until > s.state.simTime);
    assert.equal(s.wing.data.morale, 'steady');
    assert.match(s.fs.callsign, /^[A-Z][a-z]+$/);
    assert.doesNotMatch(s.fs.callsign, /clothesline|brace-episode|fleet-brace/i);
    assert.equal(s.wing.data.callsign, s.fs.callsign);
    const saved = JSON.parse(JSON.stringify(s.sim.registry.get('automation').serialize()));
    const restoredRow = saved.fleet.find(row => row.id === s.fs.id);
    assert.equal(restoredRow.callsign, s.fs.callsign, 'the fleet identity persists the callsign');
    const rebuilt = s.wings._buildWingmanSpec(restoredRow, s.player);
    assert.equal(rebuilt.data.callsign, s.fs.callsign, 'a new hull still answers to its earned callsign');
    assert.ok(s.toasts.some(p => p.text === `Mira earned the callsign ${s.fs.callsign}`));
  } finally { s.close(); }
});
