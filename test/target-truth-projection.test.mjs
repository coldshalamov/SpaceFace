// Packet 02 (combat convergence): the target-truth projection answers ONE question — what is the
// cursor on, what is selected, and what will the guns address — by READING the existing owners
// (state.player.targetId, tether, resolvePlayerGunTarget, the cloak gate). These tests drive the
// real owners against real GameState; nothing here asserts on source text.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import {
  createAutoTargetRuntime,
  resolvePlayerGunTarget,
  tickAutoTarget,
} from '../src/combat/autoTargetMode.js';
import {
  createTargetTruth,
  projectTargetTruth,
  SELECTION_STATUS,
  TARGET_REASON,
} from '../src/combat/targetTruth.js';
import {
  LAST_KNOWN_TTL_S,
  bindSelection,
} from '../src/combat/targetIdentity.js';
import { engageEntityCloak } from '../src/systems/cloak.js';
import { laneInputWrite } from '../src/core/simLaneCommands.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

const RAW = 0.7; // the cursor's own aim angle, which only an overriding owner may change

function stamp(entity, gen) {
  Object.defineProperty(entity, 'occupantGeneration', {
    value: gen, writable: true, configurable: true, enumerable: false,
  });
  return entity;
}

function ship(id, team, x, z, extra = {}) {
  return stamp({
    id, type: 'ship', alive: true, flags: {}, team, radius: 8,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, mass: 100,
    data: team === 1 ? { combat: { targetId: 1 } } : {},
    ...extra,
  }, id * 10);
}

function boot({ strength } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 100;
  if (strength !== undefined) state.settings.gameplay.targetAssistStrength = strength;
  state.entities.clear();
  state.entityList.length = 0;
  const player = stamp({
    id: 1, type: 'ship', alive: true, flags: {}, team: 0, radius: 14,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 100,
    data: { weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }] },
  }, 10);
  state.playerId = 1;
  state.input.aimAngle = RAW;
  state.input.aimWorld = { x: 300, z: 40 };
  const h = { state, truth: createTargetTruth(), runtime: createAutoTargetRuntime() };
  h.add = (...es) => { for (const e of es) { state.entities.set(e.id, e); state.entityList.push(e); } return h; };
  h.add(player);
  h.select = (id) => { state.player.targetId = id; bindSelection(state); return h; };
  h.latch = (id) => {
    state.player.tether = { active: true, targetId: id, phase: 'slack', restLength: 0, strain: 0, attachmentId: null };
    return h;
  };
  h.project = () => projectTargetTruth(state, h.truth);
  h.tick = () => tickAutoTarget(state, 1 / 60, null, h.runtime);
  return h;
}

test('nothing selected: free aim, the cursor is authoritative, and the aim point is reported', () => {
  const h = boot();
  const t = h.project();
  assert.equal(t.reason, TARGET_REASON.FREE_AIM);
  assert.equal(t.selectedId, null);
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.manualAimAuthoritative, true);
  assert.deepEqual(t.cursorAimPoint, { x: 300, z: 40 });
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW, 'with no target the assist leaves the cursor aim alone');
});

test('a hostile selected with assist on: assist reason, effective == selection, cursor yields', () => {
  const h = boot().add(ship(2, 1, 200, 80)).select(2);
  const t = h.project();
  assert.equal(t.reason, TARGET_REASON.ASSIST);
  assert.equal(t.selectedId, 2);
  assert.equal(t.effectiveGunTargetId, 2);
  assert.equal(t.divergent, false);
  assert.equal(t.manualAimAuthoritative, false);
  assert.equal(t.assistScale, 1);
  h.tick();
  assert.notEqual(h.state.input.aimAngle, RAW, 'assist corrects aim onto the effective target');
  assert.equal(h.state.input.autoAim.targetId, t.effectiveGunTargetId, 'the projection and the published aim marker agree');
});

test('saved assist strengths are preserved: light stays assisted but partial, off is information only', () => {
  const light = boot({ strength: 'light' }).add(ship(2, 1, 200, 80)).select(2);
  const lt = light.project();
  assert.equal(lt.reason, TARGET_REASON.ASSIST);
  assert.equal(lt.assistScale, 0.4);
  assert.equal(lt.manualAimAuthoritative, false);

  const off = boot({ strength: 'off' }).add(ship(2, 1, 200, 80)).select(2);
  const ot = off.project();
  assert.equal(ot.reason, TARGET_REASON.SELECTION);
  assert.equal(ot.selectedId, 2);
  assert.equal(ot.effectiveGunTargetId, null, 'an information focus is not a gun target');
  assert.equal(ot.manualAimAuthoritative, true);
  assert.equal(ot.leadTargetId, 2, 'the lead pip may still show where to aim');
  off.tick();
  assert.equal(off.state.input.aimAngle, RAW, 'selecting never enables aim correction when assist is off');
  assert.ok(!off.state.input.autoAim, 'and publishes no aim provenance');
});

test('free aim beside a locked target: the Tab-past-the-end kill switch keeps the cursor in charge', () => {
  const h = boot().add(ship(2, 1, 200, 80)).select(2);
  h.state.input.targetAssistDisabled = true;
  const t = h.project();
  assert.equal(t.reason, TARGET_REASON.SELECTION);
  assert.equal(t.selectedId, 2, 'the selection is still shown');
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.manualAimAuthoritative, true);
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW, 'manual aim beside a locked target obeys the cursor');
});

test('a neutral selected is an information focus: it never claims the guns or the aim', () => {
  const h = boot().add(ship(3, 2, 150, 0)).select(3);
  const t = h.project();
  assert.equal(t.selectedId, 3);
  assert.equal(t.reason, TARGET_REASON.FREE_AIM);
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.manualAimAuthoritative, true);
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW);
});

test('a hostile on the line owns the guns while another hull is selected', () => {
  const h = boot().add(ship(2, 1, 400, 0), ship(5, 1, 0, 140)).select(2).latch(5);
  const t = h.project();
  assert.equal(t.reason, TARGET_REASON.LINE_TARGET);
  assert.equal(t.selectedId, 2);
  assert.equal(t.effectiveGunTargetId, 5);
  assert.equal(t.tetherTargetId, 5);
  assert.equal(t.leadTargetId, 5, 'the lead pip belongs on the hull the line addresses, not the selection');
  assert.equal(t.divergent, true);
  assert.equal(t.manualAimAuthoritative, false);
  assert.equal(resolvePlayerGunTarget(h.state).id, 5, 'the projection reads the one resolver, it does not fork it');
});

test('the line overrides the cursor even with assist off — the projection must not promise otherwise', () => {
  const h = boot({ strength: 'off' }).add(ship(2, 1, 400, 0), ship(5, 1, 0, 140)).select(2).latch(5);
  h.state.input.targetAssistDisabled = true;
  const t = h.project();
  assert.equal(t.reason, TARGET_REASON.LINE_TARGET);
  assert.equal(t.effectiveGunTargetId, 5);
  assert.equal(t.manualAimAuthoritative, false);
  assert.equal(t.assistScale, 0, 'assist strength is untouched; the tether gate is a separate owner');
});

test('a neutral or a rock on the line never claims the guns', () => {
  for (const body of [ship(6, 2, 0, 140), { id: 7, type: 'asteroid', alive: true, flags: {}, team: 0, radius: 30,
    pos: { x: 0, z: 140 }, vel: { x: 0, z: 0 }, rot: 0, mass: 900, data: {} }]) {
    const h = boot().add(ship(2, 1, 400, 0), body).select(2).latch(body.id);
    const t = h.project();
    assert.equal(t.tetherTargetId, null, `${body.type} on the line is physical attachment only`);
    assert.equal(t.reason, TARGET_REASON.ASSIST, 'the hostile selection keeps the guns');
    assert.equal(t.effectiveGunTargetId, 2);
    assert.equal(t.divergent, false);
  }
});

test('target death retires the bracket and falls back to free aim — never to an unrelated hull', () => {
  const h = boot().add(ship(2, 1, 400, 0), ship(4, 1, 120, 30)).select(2);
  assert.equal(h.project().effectiveGunTargetId, 2);
  h.state.entities.get(2).alive = false;
  const t = h.project();
  assert.equal(t.selectedStatus, SELECTION_STATUS.DEAD);
  assert.equal(t.selectedId, null);
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.reason, TARGET_REASON.FREE_AIM);
  assert.equal(resolvePlayerGunTarget(h.state), null, 'the nearer hostile does not inherit the lock');
  h.state.entities.delete(2);
  h.state.entityList.splice(h.state.entityList.findIndex((e) => e.id === 2), 1);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.DEAD, 'a deleted body is the same answer');
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW);
});

test('a recycled id does not inherit the bracket, the lock, or the aim assist', () => {
  const h = boot().add(ship(2, 1, 400, 0)).select(2);
  assert.equal(h.project().effectiveGunTargetId, 2);
  // the original dies; the allocator hands its number to a new hostile hull
  h.state.entities.delete(2);
  h.state.entityList.splice(h.state.entityList.findIndex((e) => e.id === 2), 1);
  const heir = stamp(ship(2, 1, 90, 20), 777);
  h.add(heir);
  const t = h.project();
  assert.equal(t.selectedStatus, SELECTION_STATUS.RECYCLED);
  assert.equal(t.selectedId, null);
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.reason, TARGET_REASON.FREE_AIM);
  assert.equal(resolvePlayerGunTarget(h.state), null);
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW, 'the assist does not swing onto the heir');
  assert.ok(!h.state.input.autoAim);
  // a deliberate re-pick of that number binds to its NEW occupant
  h.select(2);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE);
  assert.equal(h.project().effectiveGunTargetId, 2);
});

test('a body with no provable token is accepted (fixtures, ledger rows)', () => {
  const h = boot();
  const bare = { id: 9, type: 'ship', alive: true, flags: {}, team: 1, radius: 8,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 1, data: { combat: { targetId: 1 } } };
  h.add(bare).select(9);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE);
});

function cloakedFoe(h, radius = 150) {
  const foe = ship(2, 1, 600, 0);
  engageEntityCloak(foe, radius, h.state.simTime);
  h.add(foe);
  return foe;
}

test('a concealed target gets no wallhack bracket and no aim assist, only an expiring last-known mark', () => {
  const h = boot();
  const foe = ship(2, 1, 600, 0);
  h.add(foe).select(2);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE, 'visible before it cloaks');
  h.tick();
  engageEntityCloak(foe, 150, h.state.simTime);
  foe.pos.x = 700; foe.pos.z = 300; // it keeps moving in the dark
  h.state.simTime += 0.5;
  const t = h.project();
  assert.equal(t.selectedStatus, SELECTION_STATUS.CONCEALED);
  assert.equal(t.selectedId, null, 'no bracket on an unseen hull');
  assert.equal(t.effectiveGunTargetId, null);
  assert.equal(t.reason, TARGET_REASON.FREE_AIM);
  assert.ok(t.lastKnown, 'the last-known mark is shown');
  assert.deepEqual([t.lastKnown.x, t.lastKnown.z], [600, 0], 'at the last CONFIRMED fix, not the live position');
  assert.ok(t.lastKnown.expiresInS > 0 && t.lastKnown.expiresInS <= LAST_KNOWN_TTL_S);
  h.state.input.aimAngle = RAW; // the cursor's raw aim for this tick (the visible tick above re-led it)
  h.tick();
  assert.equal(h.state.input.aimAngle, RAW, 'the assist does not track a hull the sensors cannot see');
  assert.ok(!h.state.input.autoAim);
  // the mark expires on the SIM clock
  h.state.simTime += LAST_KNOWN_TTL_S + 0.1;
  assert.equal(h.project().lastKnown, null);
});

test('reacquisition follows sensor truth: a scan burn or closing inside the cloak radius restores it', () => {
  const h = boot();
  const foe = cloakedFoe(h);
  h.select(2);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.CONCEALED);
  foe.pos.x = 100; // inside the 150 wu detection ring
  const t = h.project();
  assert.equal(t.selectedStatus, SELECTION_STATUS.LIVE);
  assert.equal(t.selectedId, 2);
  assert.equal(t.effectiveGunTargetId, 2);
  assert.equal(t.lastKnown, null, 'reacquiring clears the mark');
  foe.pos.x = 600;
  foe.data.cloak.revealUntil = h.state.simTime + 1.6; // a scan pulse burns the cloak open
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE);
});

test('floating-origin rebase moves nothing: every reported position is global', () => {
  const h = boot();
  const foe = ship(2, 1, 600, 0);
  h.add(foe).select(2);
  h.project();
  engageEntityCloak(foe, 150, h.state.simTime);
  h.state.simTime += 1;
  const before = JSON.parse(JSON.stringify(h.project()));
  h.state.world.frameOrigin = { x: 4.2e6, z: -9.1e6 };
  h.state.world.frameOriginSeq = (h.state.world.frameOriginSeq || 0) + 1;
  const after = JSON.parse(JSON.stringify(h.project()));
  assert.deepEqual(after, before);
});

test('pause while a button is held: nothing expires, nothing re-aims, nothing fires', () => {
  const h = boot().add(ship(2, 1, 200, 80)).select(2);
  h.state.input.fire = true;
  const live = JSON.parse(JSON.stringify(h.project()));
  h.state.mode = 'paused';
  for (let i = 0; i < 600; i += 1) h.tick();
  assert.equal(h.state.input.aimAngle, RAW, 'a paused tick never corrects aim');
  assert.deepEqual(JSON.parse(JSON.stringify(h.project())), live, 'the projection is frozen with the sim clock');
  assert.equal(h.state.input.fire, true, 'targeting never touches the held trigger');
  // a concealed mark does not age while the sim clock is frozen
  const foe = h.state.entities.get(2);
  engageEntityCloak(foe, 20, h.state.simTime);
  foe.pos.x = 900;
  const first = JSON.parse(JSON.stringify(h.project()));
  assert.equal(first.selectedStatus, SELECTION_STATUS.CONCEALED);
  assert.ok(first.lastKnown, 'the mark exists');
  for (let i = 0; i < 100; i += 1) h.project();
  assert.deepEqual(JSON.parse(JSON.stringify(h.project())).lastKnown, first.lastKnown,
    'the mark does not age while the sim clock is frozen');
});

test('the projection reuses its record and allocates no per-call objects', () => {
  const h = boot().add(ship(2, 1, 200, 80)).select(2);
  const a = h.project();
  const aim = a.cursorAimPoint;
  const b = h.project();
  assert.equal(a, b);
  assert.equal(b.cursorAimPoint, aim);
});

test('the selection lane writer binds the occupant, so a deliberate re-pick of a recycled number is live', () => {
  const h = boot().add(ship(2, 1, 400, 0));
  laneInputWrite(h.state, 'player.targetId', 2);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE);
  h.state.entities.delete(2);
  h.state.entityList.splice(h.state.entityList.findIndex((e) => e.id === 2), 1);
  h.add(ship(2, 1, 90, 20, { }));
  h.state.entities.get(2).occupantGeneration = 4242;
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.RECYCLED, 'the heir is not the picked body');
  laneInputWrite(h.state, 'player.targetId', 2); // same number, deliberately chosen again
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE, 'the new occupant is now the picked body');
  laneInputWrite(h.state, 'player.targetId', null);
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.NONE);
});

test('an irreversibly dying wreck gets no bracket (packet 08 lifecycle: no combat affordances)', () => {
  const h = boot();
  const wreck = { id: 8, type: 'wreck', alive: true, flags: {}, team: 0, radius: 9, pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, mass: 50, data: { killedAt: 40, markerId: 'm1' } };
  h.add(wreck).select(8);
  h.state.dyingHullRuntime = { byWreckId: { 8: { killedAt: 40, markerId: 'm1', ruptureAt: h.state.simTime + 1, ruptured: false } } };
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.DYING);
  assert.equal(h.truth.selectedId, null);
  h.state.simTime += 2; // the rupture has happened: an inert wreck can be picked again
  assert.equal(h.project().selectedStatus, SELECTION_STATUS.LIVE);
});
