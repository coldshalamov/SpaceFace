import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { deedRecord, deedsFor } from '../src/systems/deedRecord.js';
import { missions } from '../src/systems/missions.js';
import { buildAdventureOffer, createWreckCourtSystem } from '../src/systems/wreckCourt.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';

async function boot() {
  const rt = createAuthoritativeRuntime({ profileId: 'production', seed: 4242,
    systems: [physics, combat, economy, lawSecurity, bountyHunt, deedRecord, missions, createWreckCourtSystem()] });
  rt.state.mode = 'flight'; rt.state.world.currentSectorId = 'sector_ceres_belt';
  const { spec } = buildEntitySpawnSpec({ alias: 'player', profile: 'ship.starter', isPlayer: true,
    role: 'player', team: 0, pos: { x: 400, z: 200 }, vel: { x: 0, z: 0 }, heading: 0 }, rt.state);
  rt.state.playerId = rt.spawn(spec).id;
  assert.equal(await rt.getSystem('physics').prepareBackend(rt.state, {}), true);
  const offer = buildAdventureOffer(4242);
  rt.bus.emit('mission:offered', { ...offer, stationId: 'station_beltout', destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt', minRep: -1000 });
  assert.equal(rt.getSystem('missions').acceptMission(offer.id), true);
  const court = rt.getSystem('wreckCourt');
  const body = court.session.bodies.find(b => b.id === 'hauler_0');
  const wreck = rt.state.entities.get(body.entityId);
  // Fixture placement only: all evidence, hits, rulings, money and hunters use production owners.
  Object.assign(rt.state.entities.get(rt.state.playerId).pos, { x: wreck.pos.x + 35, z: wreck.pos.z });
  const rivalSpec = makeEnemySpawnSpec('patrol_lawman', 4, { x: wreck.pos.x - 120, z: wreck.pos.z }, { factionId: 'faction_scn' });
  rivalSpec.team = 1; rivalSpec.data.name = 'Captain Vale';
  const rival = rt.spawn(rivalSpec);
  const waves = [];
  rt.bus.on('warrant:waveSpawned', p => waves.push(p));
  return { rt, court, body, wreck, rival, waves };
}

function scorch(c, attacker = c.rival) {
  const hit = c.rt.getSystem('combat').onHit({ targetId: c.wreck.id, ownerId: attacker.id,
    pos: { ...c.wreck.pos }, damagePacket: { channels: { thermal: 1 },
      hit: { pos: { ...c.wreck.pos }, approach: { x: 1, z: 0 } } },
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s', weaponId: 'wpn_pulse_laser_s' } });
  assert.equal(hit.ok, true);
}

function readClaim(c) {
  for (const mode of ['thermal', 'spectro']) assert.equal(c.court.action({ verb: 'scan', targetId: c.body.id, mode }).ok, true);
  assert.equal(c.court.action({ verb: 'reconstructAll' }).ok, true);
  const claim = c.court.report().hypotheses.find(h => h.statement.includes('Captain Vale'));
  assert.ok(claim, 'a real rival weapon scar must offer a fileable insurance accusation');
  return claim;
}

test('seed 4242: a staged scar pays insurance and sends real warrant hunters after the framed rival', async () => {
  const c = await boot();
  try {
    const credits = c.rt.state.player.credits;
    c.rt.step(1 / 60);
    const attachments = c.rt.getSystem('combat').kernel.attachments;
    const line = attachments.create({ defId: 'tether_standard', ownerId: c.rt.state.playerId, targetId: c.wreck.id });
    assert.equal(line.ok, true, `the actual wreck accepts the normal Massline: ${line.reason}`);
    attachments.reel(line.attachment.id, -15);
    const start = { ...c.wreck.pos };
    queuePhysicsImpulse(c.rt.state.entities.get(c.rt.state.playerId), { x: 1500, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) c.rt.step(1 / 60);
    assert.ok(Math.hypot(c.wreck.pos.x - start.x, c.wreck.pos.z - start.z) > 1, 'native physics moves the towed wreck');
    attachments.cut(line.attachment.id, c.rt.state.playerId);
    scorch(c);
    for (let i = 0; i < 120; i++) c.rt.step(1 / 60);
    assert.equal(c.court.deserialize(JSON.parse(JSON.stringify(c.court.serialize()))), true);
    const claim = readClaim(c);
    const result = c.court.action({ verb: 'file', hypothesisId: claim.id });
    assert.equal(result.ruling.status, 'accepted');
    assert.ok(c.rt.state.player.credits > credits, 'economy pays the insurance recovery');
    c.rt.step(1 / 60);
    assert.equal(c.waves.length, 1);
    assert.equal(c.waves[0].targetId, c.rival.id);
    const hunter = c.rt.state.entities.get(c.waves[0].entityIds[0]);
    assert.equal(hunter.data.combat.targetId, c.rival.id);
    assert.equal(hunter.data.ai.forcePlayerTarget, false);
    assert.equal(hunter.data.ai.securityTargetId, c.rival.id);
    assert.equal(isHostileForAI(c.rt.state, hunter, c.rival), true);
    assert.equal(isHostileForAI(c.rt.state, hunter, c.rt.state.entities.get(c.rt.state.playerId)), false);
    const deed = deedsFor(c.rt.state, { kinds: ['stunt'] }).find(d => d.detail?.insurance);
    assert.equal(deed.subject, 'Captain Vale');
    assert.equal(deed.detail.accusedId, c.rival.id);
    assert.doesNotMatch(result.ruling.situation, /faction_|wpn_|hauler_/);
    assert.equal(c.court.action({ verb: 'file', hypothesisId: claim.id }).ok, false);
    c.rt.bus.emit('wreckCourt:ruled', { receiptId: c.court.session.receipt, ruling: result.ruling });
    c.rt.step(1 / 60);
    assert.equal(c.waves.length, 1, 'repeated ruling cannot post a second wave');
    assert.equal(deedsFor(c.rt.state, { kinds: ['stunt'] }).filter(d => d.detail?.insurance).length, 1);
    assert.equal(c.rt.state.player.credits, credits + result.ruling.intents.economy.amount);
    console.log(`seed 4242: insurance +${result.ruling.intents.economy.amount} cr; hunters target Captain Vale`);
  } finally { c.rt.dispose(); }
});

for (const defect of ['trajectory', 'temperature']) test(`seed 4242: conflicting ${defect} backfires on the filer without an insurance payout`, async () => {
  const c = await boot();
  try {
    scorch(c);
    for (let i = 0; i < 120; i++) c.rt.step(1 / 60);
    if (defect === 'trajectory') c.wreck.pos.z += 150;
    else scorch(c, c.rt.state.entities.get(c.rt.state.playerId));
    const claim = readClaim(c), credits = c.rt.state.player.credits;
    const fit = c.court.session.notebook.measurements[`reconstruct:ballistic:${claim.id}`].data;
    if (defect === 'trajectory') {
      assert.ok(fit.residual > c.body.radius / 2, 'the common ballistic fit detects the moved wreck');
      assert.ok(fit.thermalError < 0.75, 'its cooling age still fits');
    } else {
      assert.ok(fit.residual < c.body.radius / 2, 'the shot trajectory still fits');
      assert.ok(fit.thermalError > 1, 'the common cooling curve detects the later scorch');
    }
    const result = c.court.action({ verb: 'file', hypothesisId: claim.id });
    assert.equal(result.ruling.status, 'unaccepted');
    assert.equal(c.rt.state.player.credits, credits);
    c.rt.step(1 / 60);
    assert.equal(c.waves.length, 1);
    assert.equal(c.waves[0].targetId, c.rt.state.playerId);
    assert.equal(deedsFor(c.rt.state, { kinds: ['wanted_tier'] }).filter(d => d.detail?.insurance && d.detail.fraud).length, 1);
    assert.doesNotMatch(result.ruling.situation, /faction_|wpn_|hauler_/);
    console.log(`seed 4242: ${defect} rejected; no payout; hunters target filer`);
  } finally { c.rt.dispose(); }
});

test('seed 4242: quiet wreckage and an unverified ruling produce no insurance consequences', async () => {
  const c = await boot();
  try {
    assert.equal(c.court.report().hypotheses.some(h => h.statement.includes('Captain Vale')), false);
    scorch(c, c.rt.state.entities.get(c.rt.state.playerId));
    assert.equal(c.court.report().hypotheses.some(h => h.statement.includes('Captain Vale')), false, 'own fire cannot invent a rival signature');
    const credits = c.rt.state.player.credits;
    c.rt.bus.emit('wreckCourt:ruled', { receiptId: 'forged', ruling: { status: 'accepted', accusedId: c.rival.id, insurance: true } });
    c.rt.step(1 / 60);
    assert.equal(c.waves.length, 0);
    assert.equal(c.rt.state.player.credits, credits);
    assert.equal(deedsFor(c.rt.state).filter(d => d.detail?.insurance).length, 0);
  } finally { c.rt.dispose(); }
});
