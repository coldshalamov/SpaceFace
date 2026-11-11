import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerCargoRelease } from '../src/systems/kesslerCargoRelease.js';
import { kesslerPadPosition, kesslerScaleWaypoint } from '../src/systems/kesslerScaleWorksite.js';
import { tethysScaleRead, tethysScaleChoices, tethysScaleReply } from '../src/ui/station/tethysScaleConversation.js';

function fixture(radius = 10) {
  const sim = createSimulation({ seed: 8126, systems: [cargo, mining, createKesslerScale()], updateOrder: [] });
  const s = sim.state;
  s.mode = 'flight'; s.run.kind = 'adventure'; s.simTime = 20;
  s.world.currentSectorId = 'sector_tethys_junction';
  const p = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: kesslerPadPosition(), vel: { x: 0, z: 0 }, radius, mass: 30, hull: 100, data: {} });
  s.playerId = p.id; s.player.flags = { docked: false }; s.ui.docked = false;
  s.player.cargo.capVolume = 100;
  s.story.beatIndex = 1;
  s.story.campaign47a = { stepProgress: { '1': { completed: ['alloy_run'] } } };
  s.missions.active = [];
  sim.registry.get('kesslerScale')._sync();
  addCargo(s, 'cmdty_silicate', 3);
  const pods = () => s.entityList.filter(e => e.alive && e.data?.jettisonedCargo && e.data.playerJettisonOrigin);
  return { sim, s, p, pods, owner: sim.registry.get('cargo'), scale: sim.registry.get('kesslerScale'), close: () => sim.dispose() };
}
function release(f, qty = 1, options) { return f.owner.jettison('cmdty_silicate', qty, options); }
function mira(f) {
  f.s.ui.docked = true; f.s.ui.dockedStationId = 'station_tethys'; f.s.player.flags.docked = true;
  f.s.story.campaign47a.stepProgress['1'].completed.push('scale_4');
  const choice = tethysScaleChoices(f.s, 'station_tethys').find(c => c.id.startsWith('tethys_scale:read:'));
  assert.ok(choice);
  return tethysScaleReply({ state: f.s, bus: f.sim.bus }, 'station_tethys', choice.id);
}

test('stopped deck release uses real reserved-safe cargo, adjacent clearance and inherited motion across hulls', () => {
  for (const radius of [6, 12, 24, 48]) for (const rot of [0, Math.PI / 2, Math.PI]) {
    const f = fixture(radius);
    try {
      f.p.rot = rot; f.p.vel = { x: 1, z: -.5 };
      const before = { ...f.p.pos }, credits = f.s.player.credits;
      assert.equal(release(f), 1);
      const pod = f.pods()[0]; assert.ok(pod);
      assert.equal(f.s.player.cargo.items.cmdty_silicate, 2);
      assert.ok(Math.abs(Math.hypot(pod.pos.x - before.x, pod.pos.z - before.z) - (radius + 7)) < 1e-8);
      assert.ok(Math.abs(pod.vel.x - (1 - 2 * Math.cos(rot))) < 1e-8);
      assert.ok(Math.abs(pod.vel.z - (-.5 - 2 * Math.sin(rot))) < 1e-8);
      assert.deepEqual({ ...f.p.pos }, before); assert.equal(pod.data.kesslerRead, undefined);
      assert.equal(pod.data.amount, 1); assert.equal(pod.data.salvagePool.cmdty_silicate, 1);
      f.scale.update(0, f.s);
      assert.equal(pod.data.kesslerReceipt.trueRead, Math.round(pod.mass * 10) / 10);
      assert.equal(pod.data.kesslerReceipt.plateRead, Math.round(pod.mass * .94 * 10) / 10);
      assert.equal(f.s.player.credits, credits);
    } finally { f.close(); }
  }
});

test('moving, off-deck, docked, venue, other mode and bay releases retain their old impulse', () => {
  const cases = [f => { f.p.vel.x = 2.01; }, f => { f.p.pos.x += 100; },
    f => { f.s.world.currentSectorId = 'sector_ceres_belt'; }, f => { f.s.ui.docked = true; },
    f => { f.s.player.flags.docked = true; }, f => { f.s.physicsVenue = { active: true }; },
    f => { f.s.run.kind = 'survival'; }];
  for (const change of cases) {
    const f = fixture(); try {
      change(f); const vx = f.p.vel.x, vz = f.p.vel.z;
      assert.equal(release(f), 1); const pod = f.pods()[0];
      assert.equal(pod.vel.x, vx - 60); assert.equal(pod.vel.z, vz);
    } finally { f.close(); }
  }
  const f = fixture(); try {
    f.p.vel = { x: 40, z: 10 }; assert.equal(release(f, 1, { bay: true }), 1);
    assert.equal(f.pods()[0].vel.x, 1.6); assert.equal(f.pods()[0].vel.z, .4);
  } finally { f.close(); }
});

test('a blocked aft set-down refuses before cargo removal, including solid dressing', () => {
  for (const dressing of [false, true]) {
    const f = fixture(); try {
      const spec = { type: 'asteroid', pos: { x: f.p.pos.x - 17, z: f.p.pos.z }, radius: 5, mass: 20, hull: 100, collides: true };
      if (dressing) f.s.world.dressing.rows.push({ ...spec, id: 'test-obstruction', alive: true });
      else f.sim.spawn(spec);
      const before = JSON.stringify(f.s.player.cargo), events = [];
      f.sim.bus.on('toast', event => events.push(event));
      assert.equal(release(f), 0); assert.equal(JSON.stringify(f.s.player.cargo), before);
      assert.equal(f.pods().length, 0); assert.match(events.at(-1).text, /blocked behind the hull/);
    } finally { f.close(); }
  }
});

test('selected release cannot mint, touch another commodity, release sealed cargo or replace destroyed freight', () => {
  const f = fixture(); try {
    addCargo(f.s, 'cmdty_alloys', 6);
    f.s.missions.active.push({ id: 'sealed', status: 'active', type: 'cargo_delivery', params: { cmdtyId: 'cmdty_alloys', qty: 6, cargoReserved: true } });
    // The canonical reservation law is exercised by the named accepted contract.
    f.s.missions.active[0].preloadedCargo = true;
    f.s.missions.active[0].params.preloadedCargo = true;
    const held = f.s.player.cargo.items.cmdty_alloys;
    assert.equal(f.owner.jettison('cmdty_alloys', 1), 0);
    assert.equal(f.s.player.cargo.items.cmdty_alloys, held);
    assert.equal(release(f, 3), 3); const pod = f.pods()[0];
    f.scale.update(0, f.s); pod.alive = false;
    assert.equal(release(f), 0); assert.equal(f.s.player.cargo.items.cmdty_silicate || 0, 0);
    assert.match(mira(f).text, /not that you recovered/);
  } finally { f.close(); }
});

test('partial collection keeps actual remainder and competing/unmeasured freight cannot fill the weighed account', () => {
  const f = fixture(); try {
    assert.equal(release(f, 3), 3); const pod = f.pods()[0]; f.scale.update(0, f.s);
    f.s.player.cargo.capVolume = 1;
    f.sim.registry.get('mining')._collectPayload(pod, f.p);
    assert.equal(f.s.player.cargo.items.cmdty_silicate, 1);
    assert.equal(pod.data.amount, 2); assert.equal(pod.data.salvagePool.cmdty_silicate, 2);
    assert.match(mira(f).text, /2u still remain/);
    const row = tethysScaleRead(f.s, 'station_tethys'); assert.equal(row.pods.filter(p => p.read).length, 1);
    f.s.ui.docked = false; f.s.player.flags.docked = false;
    // A same-commodity second body carries its own physical quantity and no reading yet.
    f.p.pos.x += 250; assert.equal(release(f), 1); const competitor = f.pods().find(e => e !== pod);
    assert.equal(competitor.data.kesslerRead, undefined);
    assert.match(mira(f).text, /2u still remain/);
    pod.alive = false; assert.match(mira(f).text, /not that you recovered/);
    assert.equal(competitor.alive, true);
  } finally { f.close(); }
});

test('Mira and Mission Log explain the same ordinary player-controlled set-down', () => {
  const f = fixture(); try {
    const point = kesslerScaleWaypoint(f.s); assert.match(point.reason, /brake below 2 WU\/s/);
    f.s.ui.docked = true; f.s.ui.dockedStationId = 'station_tethys'; f.s.player.flags.docked = true;
    const choice = tethysScaleChoices(f.s, 'station_tethys').find(c => c.id.startsWith('tethys_scale:course:'));
    const reply = tethysScaleReply({ state: f.s, bus: f.sim.bus }, 'station_tethys', choice.id);
    assert.match(reply.text, /cargo still aboard/); assert.match(reply.text, /brake below 2 WU\/s/);
    assert.match(reply.text, /Outside the calm deck/); assert.equal(f.pods().length, 0);
    assert.equal(f.s.player.cargo.items.cmdty_silicate, 3);
  } finally { f.close(); }
});


test('calm oversized and edge-of-ring pilots get a clear refusal instead of unexpected fast ejection', () => {
  for (const [radius, offset] of [[80, 0], [10, 75]]) {
    const f = fixture(radius); try {
      f.p.pos.x += offset; const messages=[]; f.sim.bus.on('toast', e => messages.push(e));
      assert.equal(release(f), 0); assert.equal(f.s.player.cargo.items.cmdty_silicate, 3);
      assert.match(messages.at(-1).text, /clearance.*ring center/);
    } finally { f.close(); }
  }
});

test('mixed rich and plain lots have separate clear physical slots with retained provenance', () => {
  for (const rot of [0, Math.PI / 4, Math.PI / 2, 1.234]) {
  const f=fixture();try {
    f.p.rot = rot;
    addCargo(f.s,'cmdty_silicate',1,{lotId:'rich-a',provenanceId:'p-a'});
    addCargo(f.s,'cmdty_silicate',1,{lotId:'rich-b',provenanceId:'p-b'});
    assert.equal(release(f,5),5);const pods=f.pods();assert.equal(pods.length,3);
    assert.equal(pods.reduce((n,p)=>n+p.data.amount,0),5);
    for(let i=0;i<pods.length;i++)for(let j=i+1;j<pods.length;j++) {
      assert.ok(Math.hypot(pods[i].pos.x-pods[j].pos.x,pods[i].pos.z-pods[j].pos.z)>=10-1e-8);
    }
    assert.deepEqual(pods.filter(p=>p.data.richLotSource).map(p=>p.data.richLotSource.lotId).sort(),['rich-a','rich-b']);
    f.scale.update(0,f.s);assert.ok(pods.every(p=>p.data.kesslerRead));
    // A temporarily noncolliding real cargo body is still not an empty release slot.
    pods[0].collides=false;addCargo(f.s,'cmdty_alloys',1);assert.equal(f.owner.jettison('cmdty_alloys',1),0);
    assert.equal(f.s.player.cargo.items.cmdty_alloys,1);
  }finally{f.close();}
  }
});

test('synchronous cargo changes cannot commit an obstructed or stale set-down', () => {
  for (const change of [f => f.sim.spawn({ type: 'asteroid',
    pos: { x: f.p.pos.x - 17, z: f.p.pos.z }, radius: 5, mass: 20, hull: 100, collides: true }),
  f => { f.p.pos.x += 5; }, f => { f.p.vel.x = 5; }, f => { f.s.ui.docked = true; }]) {
    const f = fixture(); try {
      let changed = false;
      f.sim.bus.on('cargo:changed', () => { if (!changed) { changed = true; change(f); } });
      assert.equal(release(f), 0);
      assert.equal(f.s.player.cargo.items.cmdty_silicate, 3);
      assert.equal(f.pods().length, 0);
    } finally { f.close(); }
  }
});

test('a newly obstructed later slot refunds only the uncommitted rich lot', () => {
  const f = fixture(); try {
    f.owner.removeCargo('cmdty_silicate', 3);
    addCargo(f.s, 'cmdty_silicate', 1, { lotId: 'first', provenanceId: 'source-first' });
    addCargo(f.s, 'cmdty_silicate', 1, { lotId: 'second', provenanceId: 'source-second' });
    const originalSpawn = f.owner.helpers.spawnEntity;
    let admissions = 0;
    f.owner.helpers = { ...f.owner.helpers, spawnEntity(spec) {
      const entity = originalSpawn(spec);
      if (++admissions === 1) f.sim.spawn({ type: 'asteroid',
        pos: { x: f.p.pos.x - 17, z: f.p.pos.z + 10 }, radius: 5, mass: 20, hull: 100, collides: true });
      return entity;
    } };
    assert.equal(release(f, 2), 1);
    assert.equal(f.pods().length, 1); assert.equal(f.pods()[0].data.richLotSource.lotId, 'first');
    assert.equal(f.s.player.cargo.items.cmdty_silicate, 1);
    assert.equal(f.s.player.cargo.richLots.length, 1);
    assert.equal(f.s.player.cargo.richLots[0].lotId, 'second');
    assert.equal(f.s.player.cargo.richLots[0].qty, 1);
  } finally { f.close(); }
});
