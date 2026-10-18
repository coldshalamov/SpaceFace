import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ensureCombatState } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { bountyHunt, makeBountyHunterSpec } from '../src/systems/bountyHunt.js';

let recoveryModule = null;
try {
  recoveryModule = await import('../src/systems/surrenderRecovery.js');
} catch {
  // Pre-change TDD run: the contest slice does not exist yet.
}

const surrenderRecovery = recoveryModule?.surrenderRecovery || recoveryModule?.default || null;
const SECURE_REEL_WU = recoveryModule?.SURRENDER_SECURE_REEL_WU || 60;

function boot({ seed = 4242, withHunters = false, withFlight = false } = {}) {
  const voices = [];
  const telemetry = new Map();
  const physics = {
    createAttachment: (input) => ({ id: input.attachmentId }),
    cutAttachment: () => true,
    setAttachmentReel: () => true,
    getAttachmentTelemetry: ({ attachmentId }) => telemetry.get(attachmentId) || null,
  };
  const combatOwner = { name: 'combat', init(ctx) { this.kernel = getCombatKernel(ctx); } };
  const sim = createSimulation({
    seed,
    systems: withHunters ? [combatOwner, surrenderRecovery, bountyHunt,
      ...(withFlight ? [aiPorts, flightV3] : [])] : [surrenderRecovery],
    helpers: { combatPhysics: physics, voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
    radius: 90,
    data: { stationId: 'station_custody_test', factionId: 'faction_scn', sectorId: 'sector_tethys_junction', size: 'M' },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1200, z: 0 }, hull: 200, hullMax: 200,
  });
  state.playerId = player.id;
  const hostile = sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 1240, z: 0 },
    hull: 12,
    hullMax: 100,
    mass: 80,
    data: {
      name: 'Reach Cutter',
      bountyCr: 300,
      ai: {
        squadId: 'sq_towline_contest',
        archetype: 'pirate_raider',
        fsm: 'surrender',
        passive: true,
        roe: 'hold_fire',
      },
      intent: { fire: false, fireGroup: null, moveX: 0, moveZ: 0 },
      combat: { targetId: null, lockTarget: null },
    },
  });
  const events = { contested: [], resolved: [], custody: [], recoveryLost: [], toasts: [], grants: [] };
  for (const [event, key] of [
    ['surrender:contested', 'contested'],
    ['surrender:contestResolved', 'resolved'],
    ['law:custodyTransfer', 'custody'],
    ['surrender:recoveryLost', 'recoveryLost'],
    ['toast', 'toasts'],
    ['economy:grantCredits', 'grants'],
  ]) bus.on(event, (payload) => events[key].push(structuredClone(payload)));
  return { sim, state, bus, station, player, hostile, events, voices, telemetry,
    kernel: sim.registry.get('combat')?.kernel };
}

function surrender(t) {
  t.bus.emit('combat:surrendered', {
    entityId: t.hostile.id,
    squadId: 'sq_towline_contest',
    reason: 'damage-critical',
    factionId: t.hostile.factionId,
    type: 'ship',
  });
}

function securePlayerLine(t, attachmentId = 'att_player_prize') {
  const combat = ensureCombatState(t.state);
  combat.attachments.byId[attachmentId] = {
    id: attachmentId,
    defId: 'tether_standard',
    ownerId: t.player.id,
    targetId: t.hostile.id,
    state: 'active',
    restLength: SECURE_REEL_WU,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.hostile.id, attachmentId });
  t.bus.emit('tether:reel', {
    actorId: t.player.id,
    targetId: t.hostile.id,
    attachmentId,
    before: SECURE_REEL_WU + 10,
    after: SECURE_REEL_WU,
  });
}

// A rival hunter latches the far end of the player's prize through the kernel
// attachment authority — the same path NPC tow lines use in live play.
function latchRivalLine(t, { attachmentId = 'att_rival_contest', rivalName = 'Red Kestrel' } = {}) {
  const rival = t.sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 1300, z: 40 },
    hull: 100,
    hullMax: 100,
    mass: 90,
    data: {
      name: rivalName,
      ai: { archetype: 'hunter', fsm: 'attack', passive: false },
      intent: { fire: false, fireGroup: null, moveX: 0, moveZ: 0 },
    },
  });
  const combat = ensureCombatState(t.state);
  combat.attachments.byId[attachmentId] = {
    id: attachmentId,
    defId: 'tether_standard',
    ownerId: rival.id,
    targetId: t.hostile.id,
    state: 'active',
    restLength: 120,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.bus.emit('tether:attached', {
    actorId: rival.id,
    targetId: t.hostile.id,
    attachmentId,
    attachmentDefId: 'tether_standard',
  });
  return rival;
}

// The kernel announces a line death as tether:broken with the attachment id —
// the same event a player cut, a rival cut, or a physics overload produces.
function breakRivalLine(t, attachmentId = 'att_rival_contest') {
  const combat = ensureCombatState(t.state);
  const attachment = combat.attachments.byId[attachmentId];
  const rivalId = attachment ? attachment.ownerId : null;
  if (attachment) attachment.state = 'broken';
  t.bus.emit('tether:broken', {
    actorId: rivalId,
    ownerId: rivalId,
    targetId: t.hostile.id,
    attachmentId,
    reason: 'cut',
  });
}

function towIntoRing(t) {
  t.player.pos.x = 100;
  t.hostile.pos.x = 140;
  t.sim.step();
}

test('a rival latch on the prize contests the tow and names the rival', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  securePlayerLine(t);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'secured');

  latchRivalLine(t);

  assert.equal(t.events.contested.length, 1, 'the rival latch must announce a contest');
  assert.equal(t.events.contested[0].entityId, t.hostile.id);
  assert.match(t.events.contested[0].text, /Red Kestrel/);
  assert.doesNotMatch(t.events.contested[0].text, /att_rival_contest|Red_Kestrel|surrender:/);
  assert.match(t.hostile.data.surrenderRecovery.instruction, /contest/i);
});

test('custody waits while the rival line holds, then transfers when it breaks', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  securePlayerLine(t);
  latchRivalLine(t);

  towIntoRing(t);
  assert.equal(t.events.custody.length, 0, 'a contested prize must not transfer custody');

  breakRivalLine(t);
  assert.equal(t.events.resolved.length, 1, 'the severed rival line must resolve the contest');

  towIntoRing(t);
  assert.equal(t.events.custody.length, 1, 'custody transfers through the single custody writer once clear');
});

test('a rival latch on any other hull stays quiet', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  securePlayerLine(t);
  const bystander = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 2000, z: 0 }, hull: 50, hullMax: 100,
    data: { name: 'Drifting Bystander', ai: { fsm: 'attack', passive: false } },
  });
  const combat = ensureCombatState(t.state);
  combat.attachments.byId.att_rival_elsewhere = {
    id: 'att_rival_elsewhere',
    defId: 'tether_standard',
    ownerId: t.player.id + 500,
    targetId: bystander.id,
    state: 'active',
    restLength: 100,
    lastTension: 0,
    lastImpulse: 0,
    physicsHandle: null,
  };
  t.bus.emit('tether:attached', {
    actorId: t.player.id + 500,
    targetId: bystander.id,
    attachmentId: 'att_rival_elsewhere',
    attachmentDefId: 'tether_standard',
  });

  assert.equal(t.events.contested.length, 0, 'a latch on another hull must not contest the prize');
  towIntoRing(t);
  assert.equal(t.events.custody.length, 1, 'an uncontested tow still transfers custody');
});

test('the player can always abandon a contested prize', { skip: !surrenderRecovery }, () => {
  const t = boot();
  surrender(t);
  securePlayerLine(t);
  latchRivalLine(t);
  assert.equal(t.events.contested.length, 1);

  const combat = ensureCombatState(t.state);
  combat.attachments.byId.att_player_prize.state = 'broken';
  t.bus.emit('tether:released', { targetId: t.hostile.id });

  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  towIntoRing(t);
  assert.equal(t.events.custody.length, 0, 'an abandoned prize transfers nothing');
});

function contractHunter(t, extra = {}) {
  const spec = makeBountyHunterSpec({
    contractId: 'tow-contract', contractTargetId: t.hostile.id,
    pos: { x: 1320, z: 0 },
  });
  return t.sim.spawn({ ...spec, mass: 90, rot: Math.PI,
    data: { ...spec.data, name: 'Red Kestrel', ...extra } });
}

function secureKernelLine(t) {
  surrender(t);
  const created = t.kernel.attachments.create({
    defId: 'tether_standard', ownerId: t.player.id, targetId: t.hostile.id,
    sourceWorld: t.player.pos, targetWorld: t.hostile.pos,
  });
  assert.equal(created.ok, true);
  t.bus.emit('tether:latched', { actorId: t.player.id, targetId: t.hostile.id,
    attachmentId: created.attachment.id });
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'secured');
  return created.attachment;
}

function startHunterContest(t) {
  const playerLine = secureKernelLine(t);
  const hunter = contractHunter(t);
  t.sim.runTicks(150);
  const rivalLine = t.kernel.attachments.listForEntity(hunter.id)
    .find((line) => line.ownerId === hunter.id && line.targetId === t.hostile.id);
  assert.ok(rivalLine, 'the real bounty-hunt owner must create the rival Massline');
  return { hunter, playerLine, rivalLine };
}

test('seed 4242: the real hunter owner latches, announces once, and a player cable cut settles custody once', () => {
  const t = boot({ withHunters: true });
  const { hunter, playerLine, rivalLine } = startHunterContest(t);
  assert.equal(rivalLine.controlMode, 'bounty_contest');
  assert.ok(rivalLine.physicsHandle, 'the kernel must create a physical joint');
  assert.equal(t.events.contested.length, 1);
  assert.equal(t.events.toasts.filter((p) => /TOW CONTESTED/.test(p.text)).length, 1,
    'the contest must emit a toast for the worker-to-main bridge');
  assert.match(t.events.contested[0].text, /Red Kestrel/);
  assert.ok(hunter.data.intent.moveZ > 0, 'the rival burns away from the player');
  assert.ok(Math.cos(hunter.data.intent.aimAngle) > 0.9);
  t.sim.runTicks(30);
  assert.equal(t.events.contested.length, 1);
  towIntoRing(t);
  assert.equal(t.events.custody.length, 0);
  // The public kernel cut authority used by the Monofilament cable-cut owner.
  assert.equal(t.kernel.attachments.breakAttachment(rivalLine, 'monofilament_sweep', t.player.id).ok, true);
  assert.equal(playerLine.state, 'active');
  assert.equal(t.events.resolved.length, 1);
  towIntoRing(t);
  t.sim.runTicks(30);
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.grants.length, 1);
  console.log('seed=4242 hunter-owned physical latch=1 contest toast=1 player cut=1 custody=1 payout=1');
});

test('seed 4242: hunter acquisition stays quiet outside a free secured contract', () => {
  const cases = [
    ['no hunter', () => null],
    ['out of range', (t, h) => { h.pos.x += 2000; }],
    ['busy hunter', (t, h) => { h.data.jobId = 'existing-job'; }],
    ['unsecured prize', (t, h, line) => {
      line.restLength = 120;
      const record = Object.values(t.state.surrenderRecovery.records)[0];
      record.phase = 'tethered'; t.hostile.data.surrenderRecovery.phase = 'tethered';
    }],
    ['player released', (t, h, line) => { t.kernel.attachments.cut(line.id, t.player.id); }],
    ['docked player', (t) => { t.player.flags.docked = true; }],
    ['lawful station ring', (t, h) => {
      t.player.pos.x = 100; t.hostile.pos.x = 140; h.pos.x = 220;
    }],
    ['another contract', (t, h) => { h.data.contractTargetId = t.player.id; }],
    ['declined opportunity', (t) => { t.state.rng(); }],
  ];
  for (const [name, setup] of cases) {
    const t = boot({ withHunters: true });
    const line = secureKernelLine(t);
    const hunter = name === 'no hunter' ? null : contractHunter(t);
    setup(t, hunter, line);
    t.sim.runTicks(180);
    assert.equal(t.events.contested.length, 0, name);
    assert.equal(t.kernel.attachments.listForEntity(t.hostile.id)
      .filter((a) => a.ownerId !== t.player.id).length, 0, name);
  }
});

test('seed 4242: breaking the player line lets the rival deliver without paying the player', () => {
  const t = boot({ withHunters: true });
  const { hunter, playerLine, rivalLine } = startHunterContest(t);
  assert.equal(t.kernel.attachments.cut(playerLine.id, t.player.id).ok, true);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'awaiting_tether');
  assert.equal(rivalLine.state, 'active');
  t.sim.step();
  assert.ok(Math.cos(hunter.data.intent.aimAngle) < -0.9, 'the sole holder tows toward lawful custody');
  hunter.pos.x = 180;
  towIntoRing(t);
  t.sim.runTicks(30);
  const receipts = t.state.surrenderRecovery.receipts;
  assert.equal(receipts.length, 1, 'the sole holder transfers custody once');
  assert.equal(receipts[0].holderId, hunter.id);
  assert.equal(receipts[0].credits, 0);
  assert.equal(t.hostile.data.surrenderRecovery.phase, 'custody');
  assert.equal(t.events.custody.length, 0, 'a rival arrest cannot enter the player capture/intel ledger');
  assert.equal(t.events.grants.length, 0, 'the rival delivery cannot award player credits');
});

test('seed 4242: a contest line can snap through the kernel overload rules without breaking the player line', () => {
  const t = boot({ withHunters: true });
  const { playerLine, rivalLine } = startHunterContest(t);
  const policy = t.kernel.attachments.breakPolicy(rivalLine.id);
  t.telemetry.set(rivalLine.id, { tension: policy.maxTension * 2,
    impulse: 0, relativeSpeed: 0, length: rivalLine.restLength });
  for (let n = 0; n < 120 && rivalLine.state === 'active'; n++) {
    t.state.tick += 1;
    t.kernel.attachments.updateTelemetryAndBreak(SIM_DT);
  }
  assert.equal(rivalLine.state, 'broken', 'physics overload must be allowed to snap the rival cable');
  assert.equal(playerLine.state, 'active', 'ordinary player durability stays unchanged');
  assert.equal(t.events.resolved.length, 1);
});


test('seed 4242: Flight V3 physically flies the hunter to latch range and tactical steering yields its helm', async () => {
  const t = boot({ withHunters: true, withFlight: true });
  const hunter = contractHunter(t);
  hunter.pos.x = 1540;
  t.hostile.data.bountyHunt = { role: 'quarry', contractId: 'tow-contract', surrendered: true };
  for (const entity of t.state.entityList) {
    entity.collides = true;
    entity.physicsBody = { schemaVersion: 1, dynamic: entity.type !== 'station',
      mass: entity.mass || 80, radius: entity.radius || 8, inertiaY: 240, ccd: true };
  }
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    owner.syncFromEntities(t.state.entityList);
    t.sim.helpers.combatPhysics = createSg02CombatPhysicsPort(owner);
    secureKernelLine(t);
    const startX = hunter.pos.x;
    for (let n = 0; n < 600 && !t.events.contested.length; n++) {
      t.sim.step();
      owner.step(SIM_DT);
    }
    assert.equal(t.events.contested.length, 1, 'the moving hunter must reach and physically attach');
    assert.ok(startX - hunter.pos.x > 100, 'real propulsion must close the 300 WU approach');
    const rivalLine = t.kernel.attachments.listForEntity(hunter.id)[0];
    assert.ok(rivalLine.restLength <= 120);
    assert.equal(t.sim.helpers.aiRoster.listSquads(t.state.tick)
      .some((squad) => squad.members.some((member) => member.id === hunter.id)), false,
    'the tactical motor planner must yield the hunter while Flight V3 steers the tow');
    console.log(`seed=4242 Flight V3 approach=${(startX-hunter.pos.x).toFixed(1)} WU latch=${rivalLine.restLength.toFixed(1)} WU`);
  } finally {
    t.kernel.dispose();
    owner.dispose();
  }
});


test('seed 4242: the real player Monofilament sweep severs the hunter cable and the prize can be reclaimed', () => {
  const t = boot({ withHunters: true });
  const { hunter, playerLine, rivalLine } = startHunterContest(t);
  t.kernel.attachments.cut(playerLine.id, t.player.id);
  t.player.pos = { x: 1200, z: -40 };
  hunter.pos = { x: 1320, z: 0 };
  const rock = t.sim.spawn({ type: 'asteroid', pos: { x: 1400, z: 40 }, mass: 800, radius: 10 });
  t.player.data = { ...t.player.data, derived: { masslineHeadId: 'monofilament_sweep' } };
  t.state.runtime = { profileId: 'production', features: PRODUCTION_FEATURES };
  t.state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0 };
  const blade = t.kernel.attachments.create({ defId: 'tether_standard',
    ownerId: t.player.id, targetId: rock.id, sourceWorld: t.player.pos, targetWorld: rock.pos });
  assert.equal(blade.ok, true);
  t.state.player.tether = { active: true, targetId: rock.id, attachmentId: blade.attachment.id,
    restLength: blade.attachment.restLength, phase: 'loaded', strain: 0, load: 0 };
  const tether = Object.create(tetherGameplay);
  tether.init({ state: t.state, bus: t.bus, helpers: t.sim.helpers, registry: t.sim.registry });
  try {
    tether.update(SIM_DT, t.state);
    assert.equal(rivalLine.state, 'broken', 'the public player cable sweep must cut the actual hunter line');
    assert.equal(rivalLine.breakReason, 'monofilament_sweep');
    assert.equal(t.events.resolved.length, 1);
    assert.ok(Object.values(t.state.surrenderRecovery.records)[0].escapeAt > t.state.simTime,
      'a freed unheld prize must resume its escape clock');
  } finally {
    for (const off of tether._acquisitionUnsubs || []) off();
  }
  t.kernel.attachments.cut(blade.attachment.id, t.player.id);
  secureKernelLine(t);
  towIntoRing(t);
  t.sim.runTicks(30);
  assert.equal(t.events.custody.length, 1);
  assert.equal(t.events.grants.length, 1);
});
