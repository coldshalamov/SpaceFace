import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { MOTHLIGHT as C, MOTH_ENEMY as E, mothlightAllowsFire, mothlightStock,
  mothlightActiveLampIds, mothlightPointPose } from '../src/data/mothlight.js';
import { mothlightPhysicalBody, mothlightLampSocket } from '../src/data/mothlightBody.js';
import { mothlight, mothlightPresentation } from '../src/systems/mothlight.js';
import { weapons } from '../src/systems/weapons.js';
import { scanner } from '../src/systems/scanner.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { lootShards } from '../src/systems/lootShards.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { mothlightPrompt } from '../src/ui/mothlightPrompt.js';
import { setPromptDeck, routeDigit } from '../src/ui/promptDeck.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

function fixture(native = null) {
  const sim = createSimulation({ seed: 810, systems: [
    { name: 'physics', init() { this._sg02 = native; } }, mothlight, weapons, scanner, combat, lootShards, aftermathWrecks] });
  const s = sim.state, helpers = sim.registry.ctx.helpers;
  s.mode = 'flight'; s.tick = 120; s.simTime = 2; s.world.currentSectorId = C.sectorId;
  s.input.actions = {};
  s.settings.gameplay.physicsBackend = native ? 'rapier-dynamic' : 'legacy';
  const player = helpers.spawnEntity({ type: 'ship', team: 0, hull: 1000, hullMax: 1000,
    pos: { x: 400, z: 0 }, radius: 4, mass: 40, physicsBody: {
      schemaVersion: 1, dynamic: true, shape: 'ball', radius: 4, mass: 40, inertiaY: 80 }, data: {} });
  s.playerId = player.id; player.isPlayer = true;
  const spec = makeShipEntitySpec(E.shipId, { team: 1, factionId: E.factionId, pos: { x: 0, z: 0 } });
  Object.assign(spec, { hull: E.hull, hullMax: E.hull, cap: E.cap, capMax: E.cap,
    shield: 0, mass: E.mass, physicsBody: mothlightPhysicalBody() });
  Object.assign(spec.data, { lootTableId: C.enemyId, weapons: [{ defId: C.weaponId, slotIndex: 0, _cooldown: 0 }],
    fittings: [], miningBeam: null, combat: { targetId: player.id },
    intent: { fire: true, aimAngle: 0, targetId: player.id },
    ai: { archetype: E.aiArchetype, combatDoctrineId: E.combatDoctrineId,
      activity: normalizeActivity({ kind: 'attack_run', startedTick: 0 }), roe: 'weapons_free',
      motive: 'industrial_interdiction', engagementTrigger: 'mothlight_lane', zoneId: 'fixture:mothlight',
      approachTelegraph: E.telegraph.line, noFireResponseWindowS: 1 } });
  const tender = helpers.spawnEntity(spec), owner = sim.registry.get('mothlight');
  tender.data.encounter = { id: 'fixture:mothlight' }; const row = owner.bind(tender, 'fixture');
  const shots = [], drops = [], credits = []; sim.bus.on('combat:fire', p => { if (p.ownerId === tender.id) shots.push(p); });
  sim.bus.on('loot:drop', p => drops.push(p)); sim.bus.on('economy:grantCredits', p => credits.push(p));
  native?.syncFromEntities(s.entityList); native?.step(1 / 60, s.tick);
  const tick = () => { s.tick++; s.simTime = s.tick / 60; owner.update(1 / 60, s);
    sim.registry.get('weapons').update(1 / 60, s);
    if (native) { native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick); }
  };
  const until = (condition, cap = 600) => { let n = 0; while (!condition() && n++ < cap) tick();
    assert.ok(condition(), `bounded phase ${row.phase} did not reach requested state`); };
  const damage = e => getCombatKernel(sim.registry.ctx).routeDamage({ attackerId: player.id, targetId: e.id,
    packet: scalarHitToDamagePacket({ damage: 8, damageType: 'energy', pos: { ...e.pos } }) });
  return { sim, s, helpers, player, tender, owner, row, shots, drops, credits, tick, until, damage,
    close() { sim.dispose(); native?.dispose(); } };
}

test('one true gun earns a full iris warning; missed fire cannot become a delayed burst', () => {
  const spawned = makeEnemySpawnSpec(C.enemyId, 5, { x: 0, z: 0 });
  assert.deepEqual(spawned.data.weapons.map(w => [w.defId, w.slotIndex]), [[C.weaponId, 0]],
    'the ordinary enemy factory binds exactly one real iris weapon');
  const h = fixture(); try {
    h.until(() => h.row.phase === 'true_charge'); const start = h.s.tick, due = h.row.nextAttackTick;
    assert.equal(due - start, C.chargeTicks); assert.equal(h.shots.length, 0);
    h.until(() => h.s.tick === due - 1); assert.equal(h.shots.length, 0); assert.equal(mothlightAllowsFire(h.s, h.tender), false);
    h.tick(); assert.equal(h.shots.length, 1); assert.equal(h.row.phase, 'reload');
    assert.equal(mothlightAllowsFire(h.s, h.tender), false); const accepted = h.row.acceptedAttack.receiptId;
    h.owner._acceptedFire(h.shots[0]); assert.equal(h.row.acceptedAttack.receiptId, accepted);
    h.until(() => h.row.phase === 'true_charge'); const missed = h.row.nextAttackTick;
    h.tender.cap = 0; h.until(() => h.s.tick === missed); assert.equal(h.shots.length, 1);
    h.tender.cap = E.cap; h.tick(); assert.equal(h.row.phase, 'reload'); assert.equal(h.shots.length, 1);
    h.until(() => h.row.phase === 'true_charge'); assert.equal(h.row.nextAttackTick - h.s.tick, C.chargeTicks);
    h.tender.data.weapons.push({ defId: C.weaponId, slotIndex: 1 });
    h.until(() => h.s.tick === h.row.nextAttackTick); assert.equal(h.shots.length, 1, 'changed multi-gun bank is denied');
  } finally { h.close(); }
});

test('real cover and stale source life deny the exact attack without carrying the old charge', () => {
  const h = fixture(); try {
    h.until(() => h.row.phase === 'true_charge');
    h.helpers.spawnEntity({ type: 'asteroid', hull: 300, radius: 20, pos: { x: 200, z: 0 },
      physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 20, mass: 500 }, data: {} });
    h.until(() => h.s.tick === h.row.nextAttackTick); assert.equal(h.shots.length, 0);
    h.tick(); assert.equal(h.row.phase, 'reload');
    const old = h.tender.occupantGeneration; h.tender.occupantGeneration++;
    assert.equal(mothlightPresentation(h.s, h.tender), null); assert.equal(mothlightAllowsFire(h.s, h.tender), false);
    h.tender.occupantGeneration = old;
  } finally { h.close(); }
});

test('native original release conserves mass and point velocity; scanner and normal hit resolve one lamp without loot', async () => {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false }), h = fixture(native);
  try {
    h.tender.vel.x = 8; h.tender.vel.z = -3; h.tender.angVel = .25;
    native.syncFromEntities(h.s.entityList); native.step(1 / 60, h.s.tick);
    h.row.phase = 'deploy'; h.row.phaseStartTick = h.s.tick - C.deployTicks;
    const p = mothlightPointPose(h.tender, mothlightLampSocket(0), h.owner._native(h.tender).body);
    const momentum = entities => entities.reduce((out, e) => {
      out.x += e.mass * e.vel.x; out.z += e.mass * e.vel.z;
      out.angular += e.physicsBody.inertiaY * e.angVel + e.mass * (e.pos.x * e.vel.z - e.pos.z * e.vel.x);
      return out;
    }, { x: 0, z: 0, angular: 0 });
    const initialMomentum = momentum([h.tender]);
    h.tick(); assert.equal(mothlightStock(h.row), 3); assert.equal(h.tender.mass, 58);
    assert.equal(h.row.lamps.lamp_1.status, 'releasing'); h.tick();
    const lamp = h.owner._find(h.row.key, 'lamp_1'); assert.ok(lamp);
    assert.equal(lamp.mass, 2); assert.equal(h.tender.mass + lamp.mass, 60);
    assert.ok(Math.abs(lamp.vel.x - p.vx) < .3); assert.ok(Math.abs(lamp.vel.z - p.vz) < .3);
    const releasedMomentum = momentum([h.tender, lamp]);
    assert.ok(Math.abs(releasedMomentum.x - initialMomentum.x) < .02, 'spinning release conserves linear x momentum');
    assert.ok(Math.abs(releasedMomentum.z - initialMomentum.z) < .02, 'spinning release conserves linear z momentum');
    assert.ok(Math.abs(releasedMomentum.angular - initialMomentum.angular) < .5, 'orbital and intrinsic angular momentum remain finite and conserved');
    const before = lamp.vel.x; queuePhysicsImpulse(lamp, { x: 4, z: 0 }); native.syncFromEntities(h.s.entityList); native.step(1 / 60, h.s.tick);
    assert.ok(lamp.vel.x > before + 1, 'a physical shove changes the ballistic original');
    let identified = 0, scanResults; h.sim.bus.on('mothlight:identified', () => identified++);
    h.sim.bus.on('signal:scanResults', p => { scanResults = p; });
    h.s.input.actions.scanPulse = true; h.sim.registry.get('scanner').update(1 / 60, h.s);
    assert.equal(h.row.lamps.lamp_1.scanned, true); assert.match(lamp.data.scanLabel, /DECOY/); assert.equal(identified, 1);
    assert.match(scanResults?.signals.find(r => r.entityId === lamp.id)?.classification || '', /DECOY/);
    h.sim.bus.emit('scan:pulse', { source: 'player-scanner', scannerId: h.player.id,
      seq: h.sim.registry.get('scanner')._pulseSeq, simTime: h.s.simTime, pos: h.player.pos, radius: 1200 }); assert.equal(identified, 1);
    assert.equal(h.damage(lamp).ok, true); assert.equal(lamp.alive, false); assert.equal(h.row.lamps.lamp_1.status, 'destroyed');
    assert.equal(h.drops.length, 0); assert.equal(h.credits.length, 0);
    assert.equal(h.s.aftermathWrecks.bySector[C.sectorId]?.length || 0, 0);
  } finally { h.close(); }
});

test('four original lamps are finite across repeated Continue; missing/dead lamps never remint', () => {
  const h = fixture(); try {
    for (let n = 0; n < 4; n++) {
      h.row.phase = 'deploy'; h.row.phaseStartTick = h.s.tick - C.deployTicks; h.tick(); h.tick();
      const id = `lamp_${n + 1}`, lamp = h.owner._find(h.row.key, id); assert.ok(lamp);
      assert.ok(mothlightActiveLampIds(h.row).length <= 2); h.damage(lamp);
    }
    assert.equal(mothlightStock(h.row), 0); assert.equal(h.tender.mass, C.dryMass);
    const saved = h.owner.serialize();
    for (let n = 0; n < 2; n++) { h.owner.deserialize(saved); h.owner.afterContinue();
      const row = h.owner._actors.get(h.row.key); assert.equal(mothlightStock(row), 0);
      assert.equal(mothlightActiveLampIds(row).length, 0); assert.equal(row.nextAttackTick, null);
      assert.equal(row.phase, 'reload'); for (const id of Object.keys(row.lamps)) assert.equal(h.owner._find(row.key, id), null);
    }
    const row = h.owner._actors.get(h.row.key); row.phase = 'reposition'; row.phaseStartTick = h.s.tick - C.repositionTicks;
    h.tick(); assert.equal(row.phase, 'retreat'); assert.equal(h.tender.data.ai.roe, 'hold_fire');
    h.sim.bus.emit('entity:killed', { id: h.tender.id }); h.owner.afterContinue();
    assert.equal(row.phase, 'lost'); assert.equal(mothlightAllowsFire(h.s, h.tender), false);
  } finally { h.close(); }
});

test('the scanner lesson uses the existing deck; its only choice and lifecycle close immediately', () => {
  const listeners = new Map(); let offered, closed = 0;
  const bus = { on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); } };
  setPromptDeck({ offerDecision(spec) { offered = spec; return true; }, resolveDecision() { closed++; } });
  const ui = Object.create(mothlightPrompt); ui.init({ bus });
  try {
    assert.equal(ui.offer({ sourceKey: 'original', lampId: 'lamp_1' }), true);
    assert.equal(offered.choices.length, 1); assert.equal(offered.choices[0].cancel, true);
    assert.deepEqual(routeDigit([{ ...offered, seq: 1 }], offered.id, '1'),
      { type: 'choose', id: offered.id, choiceId: 'close' });
    offered.onChoose('close'); assert.equal(closed, 1);
    for (const event of ['save:restoring', 'dock:docked', 'sector:exit']) { listeners.get(event)(); }
    assert.equal(closed, 4); ui.newGame(); assert.equal(closed, 5);
  } finally { ui.destroy(); setPromptDeck(null); }
});

async function productionRoute(pursue) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 810 });
  let restoredRuntime = null;
  try {
    const s = runtime.state, world = runtime.getSystem('world'), owner = runtime.getSystem('mothlight'), physics = runtime.getSystem('physics');
    assert.ok(owner, 'the normal production registry owns Mothlight');
    s.mode = 'flight'; s.ui.screenStack = []; runtime.getSystem('ships').newGame();
    // This bounded route starts after the prerequisite cutter encounter and the first story beat.
    // Admission still uses the real director's chart, sector, pacing and actor-budget gates.
    runtime.getSystem('scissorwake').deserialize({ introduced: true, lineUse: 0 });
    s.story.beatIndex = 1; s.tick = Math.ceil(C.earliestSeconds * 60) + 60; s.simTime = s.tick / 60;
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, fittings: [] })); s.playerId = player.id;
    world.enterSector(C.sectorId); world.relocatePlayerInSector(sectorLocalToGlobalForSector({ x: 2000, z: 1600 }, C.sectorId),
      { reason: 'mothlight-charted-fringe-fixture' });
    assert.equal(await physics.prepareBackend(s), true);
    // Fly toward the tender with ordinary pilot keys, then brake in sensor range.
    // No position/velocity writes, aim override, hostile suppression or firing grants.
    const flyTicks = n => {
      for (let i = 0; i < n; i++) {
        const tender = [...owner._actors.values()].map(r => owner._find(r.key)).find(Boolean);
        const keys = runtime.getSystem('input')._keys;
        if (tender && pursue) {
          const dx = tender.pos.x - player.pos.x, dz = tender.pos.z - player.pos.z;
          const range = Math.hypot(dx, dz), heading = Math.atan2(dz, dx);
          const error = Math.atan2(Math.sin(heading - player.rot), Math.cos(heading - player.rot));
          const turn = error - (player.angVel || 0) * .5;
          keys.KeyA = turn < -.06; keys.KeyD = turn > .06;
          const speed = Math.hypot(player.vel.x, player.vel.z);
          keys.KeyW = range > 500 && Math.abs(error) < .5 && speed < 45;
          keys.Digit0 = range < 480 || speed > 48;
        }
        runtime.runTicks(1);
      }
    };
    const director = runtime.getSystem('encounterDirector'), requests = [];
    const request = director.requestAuthoredEncounter.bind(director);
    director.requestAuthoredEncounter = payload => {
      if (payload.shapeId === C.encounterId) {
        assert.equal(payload.respectPacing, true); assert.notEqual(payload.force, true);
      }
      const result = request(payload); if (payload.shapeId === C.encounterId) requests.push(result); return result;
    };
    let count = 0;
    // Cold runtime pacing starts with a 65–85-second quiet chapter and 20-second reentry grace.
    // Allow one capped two-minute window through those existing gates.
    while (count++ < 7200 && !owner._introduced && s.mode === 'flight') flyTicks(1);
    assert.equal(owner._introduced, true, `normal director admission: ${JSON.stringify({ requests,
      eligible: owner._eligible(), mode: s.mode, sectorId: s.world.currentSectorId,
      discovery: s.world.discovery[C.sectorId], storyBeat: s.story.beatIndex,
      prerequisite: runtime.getSystem('scissorwake').serialize(), rhythm: s.encounterDirector?.sessionRhythm,
      tensionPhase: s.tensionDirector?.phase, tensionGoalS: s.tensionDirector?.phaseGoalS,
      lastMeaningfulAt: s.encounterDirector?.lastMeaningfulAt })}`);
    const row = [...owner._actors.values()][0]; assert.ok(row);
    count = 0; while (count++ < 300 && !owner._find(row.key, 'lamp_1')) flyTicks(1);
    const original = owner._find(row.key, 'lamp_1'), tender = owner._find(row.key); assert.ok(original); assert.ok(tender);
    assert.equal(original.physicsBody.mass, 2); assert.equal(tender.physicsBody.mass, 58);
    assert.equal(owner._nativeSolved(original), true); assert.equal(owner._nativeSolved(tender), true);
    let scanResults; runtime.bus.on('signal:scanResults', p => { scanResults = p; });
    // The production input reducer owns actions; exercise its ordinary C-key edge.
    runtime.getSystem('input')._keys.KeyC = true; flyTicks(1);
    runtime.getSystem('input')._keys.KeyC = false;
    assert.match(scanResults?.signals.find(r => r.entityId === original.id)?.classification || '', /DECOY/);
    const credits = s.player.credits;
    const hit = getCombatKernel(owner.ctx).routeDamage({ attackerId: player.id, targetId: original.id,
      packet: scalarHitToDamagePacket({ damage: 8, damageType: 'energy', pos: { ...original.pos } }) });
    assert.equal(hit.ok, true); assert.equal(row.lamps.lamp_1.status, 'destroyed'); assert.equal(s.player.credits, credits);
    const fireWindows = [], shots = [], warnings = new Map();
    runtime.bus.on('mothlight:phase', p => {
      if (p.sourceKey === row.key && p.phase === 'true_charge') warnings.set(p.attack, { ...p });
    });
    runtime.bus.on('combat:fire', p => { if (p.ownerId === tender.id) shots.push({ ...p }); });
    count = 0; while (count++ < (pursue ? 3600 : 600) && !row.acceptedAttack && s.mode === 'flight') {
      flyTicks(1);
      if (row.nextAttackTick === s.tick) fireWindows.push({ phase: row.phase, tick: s.tick, ready: owner._nativeSolved(tender),
        allowed: owner.allowsFire(tender), targetId: row.targetId, targetLife: row.targetLife,
        target: owner._target(tender)?.id, range: Math.hypot(player.pos.x - tender.pos.x, player.pos.z - tender.pos.z),
        rot: tender.rot, intent: { ...tender.data.intent }, cap: tender.cap,
        mind: structuredClone(runtime.getSystem('tacticalAI').stack.lastResult.decisions.find(d => d.entityId === tender.id)?.enemyMind),
        contact: structuredClone(runtime.getSystem('tacticalAI').stack.memory.snapshot(tender.id).contacts.find(c => c.id === player.id)) });
    }
    if (!pursue) {
      assert.ok(fireWindows.length >= 1);
      assert.equal(row.acceptedAttack, null); assert.equal(shots.length, 0);
      for (const window of fireWindows) {
        assert.equal(window.intent.fireBlockReason, 'enemy_mind_hold');
        assert.equal(window.mind.reason, 'contact_not_current');
        assert.ok(window.contact.confidence < .45);
      }
      return;
    }
    assert.ok(row.acceptedAttack, `normal AI accepted gun action: ${JSON.stringify({ fireWindows, phase: row.phase,
      mode: s.mode, tenderAlive: tender.alive, playerAlive: player.alive, targetLife: player.occupantGeneration })}`);
    assert.equal(shots.length, 1, 'one real weapon event confirms the ordinary accepted action');
    const warning = warnings.get(row.acceptedAttack.attack); assert.ok(warning);
    assert.equal(row.acceptedAttack.tick, warning.nextAttackTick);
    assert.ok(warning.nextAttackTick - warning.phaseStartTick >= C.chargeTicks);
    assert.ok(warning.nextAttackTick - warning.phaseStartTick < C.chargeTicks + runtime.getSystem('tacticalAI').decisionIntervalTicks);
    const stock = mothlightStock(row), key = row.key;
    let saved = structuredClone(runtime.getSystem('save').serialize('quick'));
    runtime.dispose();
    for (let pass = 0; pass < 2; pass++) {
      restoredRuntime?.dispose();
      restoredRuntime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 811 + pass });
      const rs = restoredRuntime.state, resumedOwner = restoredRuntime.getSystem('mothlight');
      assert.equal(await restoredRuntime.getSystem('save').loadEnvelope(saved, 'quick'), true);
      rs.mode = 'flight'; rs.ui.screenStack = []; rs.ui.docked = false;
      assert.equal(await restoredRuntime.getSystem('physics').prepareBackend(rs), true);
      let resumedShots = 0;
      restoredRuntime.bus.on('combat:fire', p => { if (p.ownerId === resumedOwner._find(key)?.id) resumedShots++; });
      restoredRuntime.runTicks(60);
      const resumed = resumedOwner._actors.get(key); assert.ok(resumed);
      assert.equal(mothlightStock(resumed), stock); assert.equal(resumed.lamps.lamp_1.status, 'destroyed');
      assert.equal(resumedOwner._find(key, 'lamp_1'), null); assert.equal(resumed.nextAttackTick, null);
      assert.equal(resumed.acceptedAttack, null); assert.equal(resumedShots, 0, 'Continue cannot spend the prior warning');
      assert.equal(resumedOwner._nativeSolved(resumedOwner._find(key)), true);
      assert.equal(mothlightPresentation(rs, tender), null, 'old source identity is not the restored actor');
      saved = structuredClone(restoredRuntime.getSystem('save').serialize('quick'));
    }
    console.log(JSON.stringify({ mothlightProduction: { seed: 810, sourceKey: key,
      stockRemaining: stock, destroyedLamp: 'lamp_1', acceptedShot: row.acceptedAttack.receiptId,
      warningTicks: warning.nextAttackTick - warning.phaseStartTick, coldContinues: 2 } }));
  } finally { restoredRuntime?.dispose(); runtime.dispose(); }
}

test('idle ordinary Moth route preserves the low-confidence enemy-mind firing refusal', () => productionRoute(false));
test('ordinary input pursuit earns a true Moth gun shot; scanner and repeated cold Continue retain finite lamps', () => productionRoute(true));
