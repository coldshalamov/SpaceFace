import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCombatKernel } from '../src/combat/kernel.js';
import { legacyHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { validateCombatCatalog } from '../src/combat/validate.js';
import { ACTION_DEFS } from '../src/data/combatDefs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

run('all authored combat definitions validate', checkCatalogValidation);
run('dash→attach→reel→sling→cut→burst has the exact golden tick trace', checkMasteryTrace);
run('player and AI invoke the same ActionDef path', checkSharedPlayerAiPath);
run('drive/weapon/sensor/tether-spool disablement becomes functional on tick + 1', checkSubsystemNextTickEffects);
run('legacy, action, and status damage converge on damage.routed', checkSingleDamageRoute);
run('health, capacitor, heat, and cooldown invariants hold under generated inputs', checkProperties);
run('combat is renderer/UI independent and source-neutral', checkOwnershipBoundaries);

console.log(`\nSG-03 combat grammar: ${checks.length} checks passed.`);

function run(name, fn) {
  fn();
  checks.push(name);
  console.log(`ok   ${name}`);
}

function checkCatalogValidation() {
  const catalog = createCombatCatalog();
  const valid = validateCombatCatalog(catalog);
  assert.equal(valid.ok, true, valid.errors.join('\n'));

  const negative = clone(ACTION_DEFS);
  negative[0].phases.startupTicks = -1;
  assertValidationError(negative, 'startupTicks');

  const unreachable = clone(ACTION_DEFS);
  const burst = unreachable.find((item) => item.id === 'action_burst');
  burst.phases.activeTicks = 0;
  assertValidationError(unreachable, 'unreachable');

  const impossible = clone(ACTION_DEFS);
  impossible[0].cancelWindows[0].intoTags = ['does_not_exist'];
  assertValidationError(impossible, 'impossible');

  const cue = clone(ACTION_DEFS);
  cue[0].cues.active = 'combat.cue.missing';
  assertValidationError(cue, 'missing cue ID');
}

function checkMasteryTrace() {
  const first = runMasterySequence();
  const second = runMasterySequence();
  assert.equal(first.digest, second.digest, 'same commands must produce the same CombatTrace digest');
  assert.deepEqual(first.compact, second.compact, 'same commands must produce byte-equivalent compact trace');

  const expected = [
    '0:request:action_dash',
    '0:start:action_dash',
    '0:phase:action_dash:startup',
    '1:phase:action_dash:active',
    '1:impulse:action_dash',
    '2:request:action_attach',
    '2:cancel:action_dash',
    '2:start:action_attach',
    '2:phase:action_attach:startup',
    '3:phase:action_attach:active',
    '3:attachment:create',
    '3:effect:action_attach:createAttachment',
    '4:request:action_reel',
    '4:cancel:action_attach',
    '4:start:action_reel',
    '4:phase:action_reel:active',
    '4:attachment:reel',
    '4:effect:action_reel:reelAttachment',
    '5:attachment:reel',
    '5:effect:action_reel:reelAttachment',
    '6:request:action_sling',
    '6:cancel:action_reel',
    '6:start:action_sling',
    '6:phase:action_sling:startup',
    '7:phase:action_sling:active',
    '7:impulse:action_sling',
    '8:request:action_cut',
    '8:cancel:action_sling',
    '8:start:action_cut',
    '8:phase:action_cut:active',
    '8:attachment:break',
    '8:effect:action_cut:cutAttachment',
    '9:request:action_burst',
    '9:cancel:action_cut',
    '9:start:action_burst',
    '9:phase:action_burst:startup',
    '10:phase:action_burst:active',
    '10:damage:action_burst',
    '10:effect:action_burst:damage',
    '11:phase:action_burst:recovery',
    '13:complete:action_burst',
  ];
  assert.deepEqual(first.compact, expected);
  assert.ok(first.target.hull < first.target.hullMax, 'burst must route real hull/subsystem damage');
  assert.equal(first.attachment.state, 'broken', 'cut must break the authored attachment');
  assert.deepEqual(first.actor.vel, { x: 18, z: 22 }, 'dash and sling impulses must be delegated to the physics port');
}

function checkSharedPlayerAiPath() {
  const fixture = makeFixture([
    makeShip(1, 0, 0), makeShip(2, 1, 100),
    makeShip(3, 1, 0), makeShip(4, 0, 100),
  ]);
  requestAt(fixture, 0, { actorId: 1, actionId: 'action_burst', targetId: 2, source: { kind: 'player', controllerId: 'local' } });
  fixture.kernel.actions.requestAction({ actorId: 3, actionId: 'action_burst', targetId: 4, source: { kind: 'ai', controllerId: 'npc-3' } });
  step(fixture, 0);
  step(fixture, 1);

  const playerTarget = fixture.state.entities.get(2);
  const aiTarget = fixture.state.entities.get(4);
  assert.equal(playerTarget.shield, aiTarget.shield);
  assert.equal(playerTarget.armorHp, aiTarget.armorHp);
  assert.equal(playerTarget.hull, aiTarget.hull);
  assert.equal(fixture.state.entities.get(1).cap, fixture.state.entities.get(3).cap);

  const starts = fixture.state.combat.trace.events.filter((event) => event.kind === 'action.started' && event.actionId === 'action_burst');
  assert.equal(starts.length, 2);
  assert.deepEqual(starts.map((event) => event.actionId), ['action_burst', 'action_burst']);
  const source = fs.readFileSync(path.join(ROOT, 'src/combat/actions.js'), 'utf8');
  assert.doesNotMatch(source, /source\s*(?:\.|\[).*?(?:===|!==)\s*['"]ai['"]/s, 'action execution must not branch on AI identity');
}

function checkSubsystemNextTickEffects() {
  const cases = [
    ['subsystem_drive', 'drive', 'dash'],
    ['subsystem_weapon', 'weapon', 'burst'],
    ['subsystem_sensor', 'sensor', 'sensor'],
    ['subsystem_tether_spool', 'tether', 'attach'],
  ];
  for (const [subsystemId, capability, blockedTag] of cases) {
    const fixture = makeFixture([makeShip(1, 0, 0), makeShip(2, 1, 40, { hull: 1000, hullMax: 1000, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0 })]);
    fixture.state.tick = 20;
    const target = fixture.state.entities.get(2);
    const runtime = ensureCombatant(fixture.state, target, fixture.kernel.catalog);
    assert.notEqual(runtime.capabilities[capability], false);
    const result = fixture.kernel.routeDamage({
      attackerId: 1,
      targetId: 2,
      packet: {
        channels: { kinetic: 0, thermal: 0, ion: 0, plasma: 0, phase: 100 },
        penetration: 1,
        subsystemShare: 1,
        heat: 0,
        statuses: [],
        hit: { subsystemId },
      },
      origin: { kind: 'test', id: 'subsystem_disable' },
    });
    assert.equal(result.ok, true);
    assert.equal(runtime.subsystems[subsystemId].health, 0);
    assert.notEqual(runtime.capabilities[capability], false, `${subsystemId} must remain functional for the damage tick`);

    step(fixture, 21);
    assert.equal(runtime.capabilities[capability], false, `${subsystemId} must disable ${capability} on the next tick`);
    assert.ok(runtime.blockedActionTags.includes(blockedTag), `${subsystemId} must block ${blockedTag}`);
  }
}

function checkSingleDamageRoute() {
  const fixture = makeFixture([makeShip(1, 0, 0), makeShip(2, 1, 80, { hull: 1000, hullMax: 1000 })]);
  fixture.state.tick = 1;
  fixture.kernel.routeDamage({
    attackerId: 1,
    targetId: 2,
    packet: legacyHitToDamagePacket({ damage: 10, damageType: 'energy', pos: { x: 80, z: 0 } }),
    origin: { kind: 'legacy', id: 'projectile:hit' },
  });

  requestAt(fixture, 2, { actorId: 1, actionId: 'action_burst', targetId: 2, source: { kind: 'player' } });
  step(fixture, 2);
  step(fixture, 3);

  fixture.state.tick = 4;
  fixture.kernel.routeDamage({
    attackerId: 1,
    targetId: 2,
    packet: {
      channels: { kinetic: 1, thermal: 0, ion: 0, plasma: 0, phase: 0 },
      penetration: 0,
      heat: 0,
      statuses: [{ id: 'status_burning', stacks: 1 }],
      hit: { pos: { x: 80, z: 0 } },
    },
    origin: { kind: 'test', id: 'burn_apply' },
  });
  step(fixture, 5); // burning becomes active on tick + 1
  for (let tick = 6; tick <= 35; tick++) step(fixture, tick);

  const routed = fixture.state.combat.trace.events.filter((event) => event.kind === 'damage.routed');
  assert.ok(routed.some((event) => event.origin && event.origin.kind === 'legacy'));
  assert.ok(routed.some((event) => event.origin && event.origin.kind === 'action'));
  assert.ok(routed.some((event) => event.origin && event.origin.kind === 'status'));

  const actionDamage = fs.readFileSync(path.join(ROOT, 'src/combat/actions.js'), 'utf8');
  const statuses = fs.readFileSync(path.join(ROOT, 'src/combat/statuses.js'), 'utf8');
  assert.match(actionDamage, /routeDamage\s*\(/);
  assert.match(statuses, /routeDamage\s*\(/);
}

function checkProperties() {
  const fixture = makeFixture([makeShip(1, 0, 0), makeShip(2, 1, 50, {
    hull: 1_000_000, hullMax: 1_000_000,
    shield: 5000, shieldMax: 5000,
    armorHp: 5000, armorMax: 5000,
  })]);
  const target = fixture.state.entities.get(2);
  const random = lcg(0x5f3759df);
  let previousHull = target.hull;
  for (let i = 0; i < 2000; i++) {
    fixture.state.tick = i;
    const channels = {
      kinetic: random() * 12,
      thermal: random() * 12,
      ion: random() * 6,
      plasma: random() * 8,
      phase: random() * 4,
    };
    fixture.kernel.routeDamage({
      attackerId: 1,
      targetId: 2,
      packet: { channels, penetration: random(), heat: random() * 2, statuses: [], hit: { pos: { x: target.pos.x, z: target.pos.z } } },
      origin: { kind: 'property', id: i },
    });
    const runtime = ensureCombatant(fixture.state, target, fixture.kernel.catalog);
    assert.ok(target.hull >= 0 && target.hull <= target.hullMax && Number.isFinite(target.hull));
    assert.ok(target.shield >= 0 && target.shield <= target.shieldMax && Number.isFinite(target.shield));
    assert.ok(target.armorHp >= 0 && target.armorHp <= target.armorMax && Number.isFinite(target.armorHp));
    assert.ok(runtime.heat >= 0 && runtime.heat <= runtime.heatMax && Number.isFinite(runtime.heat));
    assert.ok(target.hull <= previousHull + 1e-9, 'damage cannot heal hull');
    previousHull = target.hull;
  }

  const actionFixture = makeFixture([makeShip(1, 0, 0), makeShip(2, 1, 80)]);
  requestAt(actionFixture, 0, { actorId: 1, actionId: 'action_burst', targetId: 2, source: { kind: 'player' } });
  for (let tick = 0; tick <= 4; tick++) step(actionFixture, tick);
  const actor = actionFixture.state.entities.get(1);
  const runtime = ensureCombatant(actionFixture.state, actor, actionFixture.kernel.catalog);
  assert.ok(actor.cap >= 0 && actor.cap <= actor.capMax);
  assert.ok(runtime.heat >= 0 && runtime.heat <= runtime.heatMax);
  actionFixture.state.tick = 4;
  const rejected = actionFixture.kernel.actions.requestAction({ actorId: 1, actionId: 'action_burst', targetId: 2, source: { kind: 'ai' } });
  assert.equal(rejected.ok, true, 'request enqueue is source-neutral');
  step(actionFixture, 4);
  const cooldownReject = [...actionFixture.state.combat.trace.events].reverse().find((event) => event.kind === 'action.rejected');
  assert.match(cooldownReject.reason, /^cooldown:/);
  const cooldowns = actionFixture.state.combat.actions.cooldownReadyTickByActor['1'];
  assert.ok(Number.isInteger(cooldowns.action_burst) && cooldowns.action_burst >= 0);
}

function checkOwnershipBoundaries() {
  const combatFiles = walkFiles(path.join(ROOT, 'src/combat')).filter((file) => file.endsWith('.js'));
  combatFiles.push(path.join(ROOT, 'src/systems/actions.js'));
  for (const file of combatFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*(?:render|ui)\//, `${path.relative(ROOT, file)} imports presentation code`);
    assert.doesNotMatch(source, /\bdocument\s*\.|\brequestAnimationFrame\s*\(|\bwindow\s*\.\s*(?:addEventListener|removeEventListener|document|location)/, `${path.relative(ROOT, file)} uses browser presentation globals`);
  }

  for (const dir of ['src/render', 'src/ui']) {
    const absolute = path.join(ROOT, dir);
    if (!fs.existsSync(absolute)) continue;
    for (const file of walkFiles(absolute).filter((item) => item.endsWith('.js'))) {
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      assert.doesNotMatch(source, /(?:\bstate|this\.state)\.combat(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*(?:=|\+=|-=|\+\+|--)/, `${path.relative(ROOT, file)} mutates authoritative combat state`);
    }
  }
}

function runMasterySequence() {
  const fixture = makeFixture([makeShip(1, 0, 0), makeShip(2, 1, 100)]);
  requestAt(fixture, 0, { actorId: 1, actionId: 'action_dash', source: { kind: 'player' } });
  step(fixture, 0);
  step(fixture, 1);
  requestAt(fixture, 2, { actorId: 1, actionId: 'action_attach', targetId: 2, source: { kind: 'player' } });
  step(fixture, 2);
  step(fixture, 3);
  const attachmentId = Object.keys(fixture.state.combat.attachments.byId)[0];
  assert.ok(attachmentId);
  requestAt(fixture, 4, { actorId: 1, actionId: 'action_reel', attachmentId, source: { kind: 'player' } });
  step(fixture, 4);
  step(fixture, 5);
  requestAt(fixture, 6, { actorId: 1, actionId: 'action_sling', attachmentId, source: { kind: 'player' } });
  step(fixture, 6);
  step(fixture, 7);
  requestAt(fixture, 8, { actorId: 1, actionId: 'action_cut', attachmentId, source: { kind: 'player' } });
  step(fixture, 8);
  requestAt(fixture, 9, { actorId: 1, actionId: 'action_burst', targetId: 2, source: { kind: 'player' } });
  for (let tick = 9; tick <= 13; tick++) step(fixture, tick);

  const compact = fixture.state.combat.trace.events.map(compactEvent).filter(Boolean);
  return {
    digest: fixture.state.combat.trace.digest,
    compact,
    actor: fixture.state.entities.get(1),
    target: fixture.state.entities.get(2),
    attachment: fixture.state.combat.attachments.byId[attachmentId],
  };
}

function compactEvent(event) {
  switch (event.kind) {
    case 'action.requested': return `${event.tick}:request:${event.actionId}`;
    case 'action.started': return `${event.tick}:start:${event.actionId}`;
    case 'action.phase': return `${event.tick}:phase:${event.actionId}:${event.phase}`;
    case 'action.cancelled': return `${event.tick}:cancel:${event.actionId}`;
    case 'action.completed': return `${event.tick}:complete:${event.actionId}`;
    case 'action.effect': return `${event.tick}:effect:${event.actionId}:${event.effectType}`;
    case 'physics.impulse': return event.reason === 'action' ? `${event.tick}:impulse:${event.actionId}` : null;
    case 'attachment.created': return `${event.tick}:attachment:create`;
    case 'attachment.reel': return `${event.tick}:attachment:reel`;
    case 'attachment.broken': return `${event.tick}:attachment:break`;
    case 'damage.routed': return event.origin && event.origin.kind === 'action' ? `${event.tick}:damage:${event.origin.id}` : null;
    default: return null;
  }
}

function makeFixture(entities) {
  const state = {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    entities: new Map(),
    entityList: [],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 0x12345678 },
  };
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  const bus = createBus();
  const constraints = new Map();
  const physics = {
    applyImpulse({ entityId, impulse }) {
      const entity = state.entities.get(entityId);
      if (!entity || !entity.alive) return false;
      entity.vel.x += impulse.x;
      entity.vel.z += impulse.z;
      return true;
    },
    createAttachment(spec) {
      constraints.set(spec.attachmentId, { ...spec });
      return spec.attachmentId;
    },
    setAttachmentReel(spec) {
      const constraint = constraints.get(spec.attachmentId);
      if (!constraint) return false;
      Object.assign(constraint, spec);
      return true;
    },
    cutAttachment({ attachmentId }) {
      constraints.delete(attachmentId);
      return true;
    },
    getAttachmentTelemetry({ attachmentId }) {
      return constraints.has(attachmentId) ? { tension: 0, impulse: 0 } : null;
    },
  };
  const ctx = { state, bus, helpers: { combatPhysics: physics }, registry: { get: () => null } };
  const kernel = createCombatKernel(ctx);
  return { state, bus, physics, constraints, kernel };
}

function makeShip(id, team, x, overrides = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: `faction_test_${team}`,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    mass: 10,
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 50,
    shieldMax: 50,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
    },
    ...overrides,
  };
}

function requestAt(fixture, tick, request) {
  fixture.state.tick = tick;
  fixture.state.simTime = tick / 60;
  return fixture.kernel.actions.requestAction(request);
}

function step(fixture, tick) {
  fixture.state.tick = tick;
  fixture.state.simTime = tick / 60;
  fixture.kernel.prePhysics(1 / 60);
  fixture.kernel.postPhysics(1 / 60);
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
  };
}

function assertValidationError(actions, needle) {
  const base = createCombatCatalog();
  const catalog = createCombatCatalog({
    actions,
    statuses: base.statusDefs,
    subsystems: base.subsystemDefs,
    attachments: base.attachmentDefs,
    profiles: base.combatProfiles,
  });
  const result = validateCombatCatalog(catalog);
  assert.equal(result.ok, false, `expected validation failure containing ${needle}`);
  assert.ok(result.errors.some((error) => error.includes(needle)), result.errors.join('\n'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function lcg(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(file));
    else out.push(file);
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
