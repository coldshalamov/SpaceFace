import test from 'node:test';
import assert from 'node:assert/strict';
import { bootShift } from './fixtures/orchard-shift-recovery.mjs';
import { createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';

test('ordinary disabled receiver offer, STATUS and ROUTE expose real repair instead of sending the pilot to release a pod', () => {
  const t = bootShift(); try {
    t.disable(); assert.equal(t.state.combat.entities[t.receiver.id].capabilities.drive, false);
    const before = JSON.stringify({ hull: t.receiver.hull, cargo: t.receiver.data.cargoManifest, credits: t.state.player.credits });
    const offer = createContactHailOffer(t.state, { enabled: true, kind: 'worker', entity: t.receiver, targetId: t.receiver.id }, 'repair', 12);
    assert.match(offer.lines.join(' '), /DRIVE OFFLINE/);
    assert.ok(offer.actions.some(a => a.id === 'route'));
    assert.match(createContactHailResponse(t.state, offer, 'status').lines.join(' '), /DRIVE OFFLINE/);
    assert.match(createContactHailResponse(t.state, offer, 'route').lines.join(' '), /Massline.*taut/);
    assert.equal(JSON.stringify({ hull: t.receiver.hull, cargo: t.receiver.data.cargoManifest, credits: t.state.player.credits }), before);
  } finally { t.sim.dispose(); }
});

test('healthy eligible finite-pod recovery keeps its existing paid quote and risk prompt', async () => {
  const { orchardFrameBodySpec, orchardPodBodySpec, ORCHARD_GEOMETRY: G } = await import('../src/data/anvilOrchardBody.js');
  const { createOrchardRecord, normalizeOrchardRecord } = await import('../src/data/anvilOrchard.js');
  const t = bootShift(); try {
    const frame = t.sim.spawn({ type: 'wreck', hull: 300, radius: G.radius, pos: { x: 15600, z: 6000 },
      physicsBody: orchardFrameBodySpec(), data: { orchardId: 'anvil_storm_orchard', orchardKind: 'frame',
        worldRecordId: G.worldRecordId, placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId,
        authoredPayloadAssetId: G.assetId, masslineTetherable: false } });
    const body = orchardPodBodySpec({ dynamic: true, revision: 2 }), lotId = 'anvil_storm_orchard:0:1';
    t.sim.spawn({ type: 'payload', hull: 100, radius: body.radius, pos: { x: 15700, z: 6000 }, physicsBody: body,
      data: { orchardId: 'anvil_storm_orchard', orchardKind: 'pod', authoredAssetId: G.pod.assetId,
        authoredPayloadAssetId: G.pod.assetId, worldRecordId: lotId, identityKey: lotId, masslineTetherable: true, amount: 4 } });
    const row = createOrchardRecord(0); row.sourceRemaining = 44;
    row.lots = [{ id: lotId, socket: 0, cycle: 1, units: 4, outcome: 'retained' }];
    Object.assign(row.sockets[0], { cycle: 1, lotId, status: 'drifting', operation: 'open', progress: 30,
      handoff: 'ready', targetRevision: 2, acceptedTick: 0, completedTick: 30, openedTick: 30, readyTick: 30 });
    assert.ok(normalizeOrchardRecord(row)); (t.state.sites ||= {}).anvilOrchard = row;
    t.state.planet = { center: { x: 14000, z: 6000 }, orchardFrameId: frame.id };
    const offer = createContactHailOffer(t.state, { enabled: true, kind: 'worker', entity: t.receiver, targetId: t.receiver.id }, 'tow', 12);
    assert.equal(offer.orchardQuote?.amount, 4); assert.equal(offer.orchardQuote?.feeCr, 32);
    assert.match(offer.lines[0], /ORCHARD RETRIEVAL.*32CR on dispatch/);
    assert.match(offer.lines[1], /Risk of damage or loss; delivery not guaranteed/);
    assert.deepEqual(offer.actions.map(a => a.id), ['tow_assist', 'status']);
  } finally { t.sim.dispose(); }
});

test('unresolved damage is consistently unknown in offer, STATUS and ROUTE, never a repair promise', () => {
  const t = bootShift(); try {
    t.state.combat.entities[t.receiver.id].orchardDamageUnresolved = true;
    const offer = createContactHailOffer(t.state, { enabled: true, kind: 'worker', entity: t.receiver, targetId: t.receiver.id }, 'unknown', 12);
    assert.match(offer.lines[0], /DAMAGE RECORD UNAVAILABLE/);
    assert.match(createContactHailResponse(t.state, offer, 'status').lines[0], /DAMAGE RECORD UNAVAILABLE/);
    const route = createContactHailResponse(t.state, offer, 'route');
    assert.match(route.lines[0], /DAMAGE RECORD UNAVAILABLE/); assert.match(route.lines[1], /cannot be verified/);
    assert.doesNotMatch(route.lines.join(' '), /Keep the line until/);
  } finally { t.sim.dispose(); }
});
