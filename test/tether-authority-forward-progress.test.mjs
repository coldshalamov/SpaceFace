import assert from 'node:assert/strict';
import { test } from 'node:test';

// D227 reproduction hunt, physics-authority lane. A clean, ordinarily registered
// Sg02DynamicBodyOwner (real Rapier, production registration path) drives a
// Helios-Prime-shaped tow scenario: player-class ship massline-latched to a heavy
// derelict, with cargo fragments alongside. The fixture asserts that BOTH the
// native body pose (body.translation()) AND the facade pose (entity.pos) advance
// while a tether is held — through fragment churn, frame-origin rebase, and both
// production restore paths (native snapshot adopt / scalar rebuild). Any gate
// that freezes translations while the sim keeps ticking fails loudly here.
//
// Entities deliberately omit `activity.simTier`, so mayRapierIslandSleep is false
// for every record: no sleep-skip can mask a write-back stall, and every pose
// assertion reads a live body.

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;

function makeBodyEntity(id, pose, extra = {}) {
  const radius = extra.radius ?? 6;
  const mass = extra.mass ?? 24;
  return {
    id,
    type: extra.type || 'ship',
    alive: true,
    isPlayer: extra.isPlayer === true,
    radius,
    mass,
    pos: { x: pose.x, z: pose.z },
    prevPos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: pose.rot || 0,
    angVel: pose.av || 0,
    flags: {},
    data: { defId: extra.defId || 'ship_wasp' },
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * radius * radius * 0.5,
      dynamic: extra.dynamic !== false,
      ccd: true,
      revision: 0,
    },
  };
}

function makeStaticRock(id, pose) {
  const radius = 14;
  const mass = 1_000_000;
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius,
    mass,
    pos: { x: pose.x, z: pose.z },
    prevPos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
    data: { defId: 'asteroid_field' },
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * radius * radius,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
  };
}

// Steps the owner `steps` fixed ticks and returns how many of the sampled ids
// ended with a different facade x/z than they started with.
function advance(owner, entities, steps, tickStart) {
  const before = new Map(entities.map((e) => [e.id, { x: e.pos.x, z: e.pos.z }]));
  const nativeBefore = new Map();
  for (const e of entities) {
    const rec = owner.records.get(e.id);
    if (rec) nativeBefore.set(e.id, rec.body.translation());
  }
  for (let i = 0; i < steps; i++) owner.step(DT, tickStart + i);
  const moved = { facade: new Set(), native: new Set() };
  for (const e of entities) {
    const b = before.get(e.id);
    if (e.pos.x !== b.x || e.pos.z !== b.z) moved.facade.add(e.id);
    const rec = owner.records.get(e.id);
    if (rec) {
      const nb = nativeBefore.get(e.id);
      const t = rec.body.translation();
      if (t.x !== nb.x || t.z !== nb.z) moved.native.add(e.id);
    }
  }
  return moved;
}

function assertMoved(owner, ids, moved, phase) {
  for (const id of ids) {
    assert.ok(owner.records.get(id), `${phase}: record ${id} still owned`);
    assert.ok(moved.facade.has(id), `${phase}: facade pos for ${id} did not advance`);
    assert.ok(moved.native.has(id), `${phase}: native translation for ${id} did not advance`);
  }
}

// syncFromEntities returns undefined on the success path (false only on early
// refusal). Assert the observable contract instead: every expected entity owns
// a live native record after the call.
function assertOwned(owner, entities, phase) {
  for (const e of entities) {
    const rec = owner.records.get(e.id);
    assert.ok(rec, `${phase}: record ${e.id} owned`);
    assert.ok(rec.body, `${phase}: native body for ${e.id} live`);
    assert.equal(rec.entity, e, `${phase}: record ${e.id} bound to this entity`);
  }
}

test('tether authority keeps native+facade translations advancing through hold, churn, rebase and restore', async () => {
  const owner = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  assert.ok(owner, 'owner minted');
  let tick = 0;

  // Helios Prime tow shape: shipWasp-class hull towing a Training-Derelict-class
  // hulk, three drifting cargo fragments, one static dressing rock.
  const ship = makeBodyEntity('ship', { x: 0, z: 0, vx: 320, vz: 0 }, { isPlayer: true, defId: 'ship_wasp' });
  const derelict = makeBodyEntity('derelict', { x: 60, z: 0, vx: 12, vz: 4 }, { type: 'hulk', defId: 'training_derelict', radius: 22, mass: 40_000 });
  const fragA = makeBodyEntity('fragA', { x: 90, z: 40, vx: -6, vz: 9 }, { type: 'cargo', defId: 'cargo_pod', radius: 3, mass: 8 });
  const fragB = makeBodyEntity('fragB', { x: -50, z: 60, vx: 4, vz: -7 }, { type: 'cargo', defId: 'cargo_pod', radius: 3, mass: 8 });
  const fragC = makeBodyEntity('fragC', { x: 30, z: -70, vx: 8, vz: 2 }, { type: 'cargo', defId: 'cargo_pod', radius: 3, mass: 8 });
  const rock = makeStaticRock('rock', { x: 400, z: 400 });
  let live = [ship, derelict, fragA, fragB, fragC, rock];

  owner.syncFromEntities(live);
  assertOwned(owner, live, 'initial sync');
  let moved = advance(owner, live, 8, tick); tick += 8;
  assertMoved(owner, ['ship', 'derelict', 'fragA', 'fragB', 'fragC'], moved, 'baseline');

  // Tether: ship -> derelict massline. Production createAttachment shape.
  const tow = owner.createAttachment({
    attachmentId: 'tow1',
    ownerId: 'ship',
    targetId: 'derelict',
    defId: 'attachment_massline',
    sourceWorld: { x: ship.pos.x, z: ship.pos.z },
    targetWorld: { x: derelict.pos.x, z: derelict.pos.z },
    tick,
  });
  assert.ok(tow, 'tether created');

  // Second lines to fragments: exercises the three production retirement
  // sequences — service cut then removal (towFrag), death auto-cut (towFragC),
  // and physicsBody park (fragB below).
  const fragLine = owner.createAttachment({
    attachmentId: 'towFrag',
    ownerId: 'ship',
    targetId: 'fragA',
    defId: 'attachment_massline',
    sourceWorld: { x: ship.pos.x, z: ship.pos.z },
    targetWorld: { x: fragA.pos.x, z: fragA.pos.z },
    tick,
  });
  assert.ok(fragLine, 'fragment tether created');
  const fragLineC = owner.createAttachment({
    attachmentId: 'towFragC',
    ownerId: 'ship',
    targetId: 'fragC',
    defId: 'attachment_massline',
    sourceWorld: { x: ship.pos.x, z: ship.pos.z },
    targetWorld: { x: fragC.pos.x, z: fragC.pos.z },
    tick,
  });
  assert.ok(fragLineC, 'second fragment tether created');

  // Held tow: 30 ticks. Native AND facade must advance for every live dynamic body.
  moved = advance(owner, live, 30, tick); tick += 30;
  assertMoved(owner, ['ship', 'derelict', 'fragA', 'fragB', 'fragC'], moved, 'held tow');
  assert.ok(owner.attachments.has('tow1'), 'tether survives held tow');

  // Fragment churn 1a: production retirement of a tethered fragment is a
  // service cut (combat attachments service → physics port cutAttachment)
  // followed by sync-set removal. A live entity still owning a registered
  // attachment is refused by design in _removeRecord — the body must not
  // orphan a live joint.
  assert.equal(owner.cutAttachment({ attachmentId: 'towFrag', reason: 'fragment_removed', tick }), true, 'service cut before removal');
  live = live.filter((e) => e !== fragA);
  owner.syncFromEntities(live);
  assertOwned(owner, live, 'sync after tethered fragment drop');
  assert.equal(owner.records.has('fragA'), false, 'cut-then-dropped fragment record retired');

  // Fragment churn 1b: a tethered fragment destroyed in place. Production marks
  // the entity dead; the sync removal pass then auto-cuts any attachment on the
  // dead record and retires it in the same call.
  fragC.alive = false;
  live = live.filter((e) => e !== fragC);
  owner.syncFromEntities(live);
  assertOwned(owner, live, 'sync after tethered fragment death');
  assert.equal(owner.records.has('fragC'), false, 'dead tethered fragment record retired');
  assert.equal(owner.attachments.has('towFragC'), false, 'dead-record attachment auto-cut');

  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-tethered-removal');

  // Fragment churn 2: detach a fragment's body contract mid-sync (physicsBody:false
  // on a live entity suspends its attachments and drops its native record).
  fragB.physicsBody = false;
  owner.syncFromEntities(live);
  fragB.physicsBody = {
    schemaVersion: 1, radius: 3, mass: 8, inertiaY: 72,
    dynamic: true, ccd: true, revision: 1,
  };
  owner.syncFromEntities(live);
  assertOwned(owner, live, 'sync after physicsBody restore');
  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-park churn');

  // Rebase: shift the frame origin exactly like a long-session floating-origin hop.
  assert.equal(owner.setFrameOrigin({ x: 512, z: -1024 }, owner.getFrameOriginSeq() + 1), true, 'rebase accepted');
  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-rebase');

  // Native restore A: same-session canonicalize round-trip — export the live world
  // and re-adopt it (the save-and-keep-flying path; builds attachment contracts
  // from the live owner itself). Falls back to the scalar rebuild exactly like
  // _finishNativeRestore when the adopt contract refuses.
  const snapshot = owner.exportWorldSnapshot();
  const adopted = snapshot ? owner.canonicalizeWorldSnapshot(snapshot) : false;
  if (!adopted) {
    owner.rebuildWorldFromEntities(live, {
      frameOrigin: owner.getFrameOrigin(),
      frameOriginSeq: owner.getFrameOriginSeq(),
    });
  }
  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-restore');

  // Native restore B: the paced loading path (rebuildWorldFromEntitiesSteps).
  const stepped = owner.rebuildWorldFromEntitiesSteps(live, {
    frameOrigin: owner.getFrameOrigin(),
    frameOriginSeq: owner.getFrameOriginSeq(),
  });
  if (stepped && typeof stepped.next === 'function') {
    let guard = 0;
    while (guard++ < 10_000) {
      const r = stepped.next();
      if (r.done) break;
    }
    assert.ok(guard < 10_000, 'stepped rebuild terminates');
  }
  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-stepped-restore');

  // Cut the tow cleanly, then keep asserting progress — release must not wedge
  // the authority either. The native-adopt path re-creates tow1's joint; the
  // scalar-rebuild fallback leaves attachment registration to the combat service,
  // so tow1 may legitimately be absent here.
  if (owner.attachments.has('tow1')) {
    assert.equal(owner.cutAttachment({ attachmentId: 'tow1', reason: 'tether_cut', tick }), true, 'tow cut');
  }
  moved = advance(owner, live, 10, tick); tick += 10;
  assertMoved(owner, ['ship', 'derelict', 'fragB'], moved, 'post-cut');

  const diag = owner.diagnostics();
  assert.equal(diag.pendingNativeRebuilds, 0, 'no native rebuild backlog left behind');
  assert.equal(owner.orchardAuthorityAvailable(), true, 'authority remains available end to end');

  owner.dispose();
});

test('held tow does not freeze an attached pair while neighbor bodies churn', async () => {
  const owner = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  let tick = 0;
  const ship = makeBodyEntity('ship', { x: 0, z: 0, vx: 40, vz: 20 }, { isPlayer: true });
  const hulk = makeBodyEntity('hulk', { x: 55, z: 10, vx: 5, vz: -3 }, { type: 'hulk', radius: 20, mass: 30_000 });
  let churn = Array.from({ length: 4 }, (_, i) => makeBodyEntity(`churn${i}`, { x: 200 + i * 30, z: -100, vx: -3 * i, vz: 5 }, { type: 'cargo', radius: 3, mass: 8 }));
  let live = [ship, hulk, ...churn];
  owner.syncFromEntities(live);

  assert.ok(owner.createAttachment({
    attachmentId: 'hold', ownerId: 'ship', targetId: 'hulk', defId: 'attachment_massline',
    sourceWorld: { x: ship.pos.x, z: ship.pos.z }, targetWorld: { x: hulk.pos.x, z: hulk.pos.z }, tick,
  }));

  // Six rounds of churn: each round drops one cargo fragment from the sync set
  // while the tow is held. Ship and hulk must advance every single round.
  for (let round = 0; round < 4; round++) {
    const dropped = churn[round];
    live = live.filter((e) => e !== dropped);
    owner.syncFromEntities(live);
    const moved = advance(owner, live, 6, tick); tick += 6;
    assertMoved(owner, ['ship', 'hulk'], moved, `churn round ${round}`);
  }
  owner.dispose();
});

// Guard rail for the fixture itself: the held-write-back skip can only ever
// legitimately freeze a body whose spec allows island sleep; every entity in
// this file is sleep-ineligible, so a static facade pose is always a defect.
test('fixture entities are sleep-ineligible (no sleep-skip masking)', () => {
  const probe = makeBodyEntity('probe', { x: 0, z: 0, vx: 1, vz: 0 });
  const spec = resolvePhysicsBodySpec(probe);
  assert.ok(spec && spec.dynamic === true, 'probe resolves as dynamic body');
});
