// SFQ-B031 + SFQ-B033 (row 221): distinct useful starter verbs, and status
// combinations that explain themselves. Asserts through the real ownership seams —
// the fit resolver, the authored defs, and the combat status service — never mirrors.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { BOMB_DEFS, BOMB_STARTER_KIT } from '../src/data/bombs.js';
import { buildSlotList, fittingsFromDefaultModules, fits } from '../src/systems/ships.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import { createStatusService } from '../src/combat/statuses.js';

const DEFS = new Map([...WEAPONS, ...MODULES].map((d) => [d.id, d]));

// ------------------------------------------------------------------ SFQ-B031

test('B031: every starter fits a damaging gun plus its tag verb hardware — nothing drops silently', () => {
  const EXPECTED_VERB = {
    starter_hitch: ['wpn_pulse_laser_s', 'mod_mining_laser_s'],           // gun + work
    starter_pelican: ['wpn_pulse_laser_s', 'mod_winch_hd'],               // gun + rope
    starter_wasp: ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'mod_ram_plate'], // gun + shove-gun + ram
  };
  for (const starter of NEW_GAME_STARTERS) {
    const shipDef = SHIPS.find((s) => s.id === starter.shipId);
    const fittings = fittingsFromDefaultModules(starter.shipId, starter.fittedModules);
    // Every listed module id landed in a real slot on the hull — a silently dropped id
    // would strand the starter without a verb its card promises.
    assert.equal(fittings.filter(Boolean).length, starter.fittedModules.length,
      `${starter.id}: every authored module resolved to a slot`);
    for (const expectedId of EXPECTED_VERB[starter.id]) {
      assert.ok(fittings.includes(expectedId), `${starter.id} carries ${expectedId}`);
      assert.ok(DEFS.has(expectedId), `${expectedId} resolves to a shipped def`);
    }
    // The gun must actually bite: at least one fitted weapon deals real damage.
    const guns = fittings.map((id) => DEFS.get(id)).filter((d) => d && d.slotType === 'weapon');
    assert.ok(guns.length >= 1, `${starter.id} fits at least one weapon`);
    assert.ok(guns.some((g) => g.dmg > 0), `${starter.id}'s gun kills reliably (dmg > 0)`);
    // Slots stay open to refits — the starter is a point, not a lock.
    const slots = buildSlotList(shipDef);
    assert.ok(fittings.length === slots.length);
  }
});

test('B031: the starter verbs carry different authored consequences — kill, shove, trap, tow', () => {
  const pulse = DEFS.get('wpn_pulse_laser_s');
  const auto = DEFS.get('wpn_autocannon_s');
  const ram = DEFS.get('mod_ram_plate');
  const winch = DEFS.get('mod_winch_hd');
  // Gun vs shove-gun: different channel, different physical signature.
  assert.equal(pulse.damageType, 'energy');
  assert.equal(auto.damageType, 'kinetic');
  assert.ok(auto.tumbleTorque > pulse.tumbleTorque * 10,
    'the autocannon is the knock-over gun — pulse plinks, slugs tumble');
  assert.ok(pulse.dmg * pulse.rof >= 40, 'the starter gun kills on a readable burst, not a peashooter');
  // Shove: the drum pays momentum and zero damage; the ram plate is a contact verb.
  assert.equal(BOMB_DEFS.bomb_concussion.damage, 0);
  assert.ok(BOMB_DEFS.bomb_concussion.impulse > 1000, 'the drum is a real shove');
  assert.ok(ram, 'the ram plate def exists for the brawler starter');
  // Trap: the frag cassette persists as a drifting proximity/fuze hazard, not an instant hit.
  assert.ok(BOMB_DEFS.bomb_frag.fuzeS >= 4 && BOMB_DEFS.bomb_frag.triggerRadius > 0,
    'the bomb lays a moving trap');
  // Rope: the tug starter's winch is a utility module that exists and fits.
  assert.ok(winch && winch.slotType === 'utility', 'the tow line is a fitted verb, not flavor text');
  // The bomb starter kit stays the two most legible payloads.
  assert.deepEqual([...BOMB_STARTER_KIT], ['bomb_frag', 'bomb_concussion']);
});

// ------------------------------------------------------------------ SFQ-B033

function bootStatus(catalog = createCombatCatalog()) {
  const state = { tick: 0, combat: {}, meta: { seed: 4242 } };
  ensureCombatState(state);
  const entity = { id: 2, type: 'ship', alive: true, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 500, hullMax: 500 };
  const runtime = ensureCombatant(state, entity, catalog);
  const bus = createBus();
  const applied = [];
  const routed = [];
  bus.on('combat:statusApplied', (p) => applied.push(p));
  const svc = createStatusService({ state, catalog, bus });
  const apply = (id, stacks = 1) => {
    assert.equal(svc.schedule(entity, runtime, { id, stacks }, { attackerId: 1 }).ok, true, `schedule ${id}`);
    state.tick += 1;
    svc.advance(entity, runtime, (req) => { routed.push(req); return { ok: true }; });
  };
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { state.tick += 1; svc.advance(entity, runtime, (req) => { routed.push(req); return { ok: true }; }); } };
  return { state, entity, runtime, svc, applied, routed, apply, tick, bus };
}

test('B033: ionizing an overheated hull resolves to scrambled — the authored combo fires', () => {
  const t = bootStatus();
  try {
    t.apply('status_overheated');
    assert.ok(t.runtime.statuses.status_overheated, 'overheated is live');
    t.apply('status_ionized');
    // consumeWith:false — both parents persist and the scrambled verdict lands on top.
    assert.ok(t.runtime.statuses.status_scrambled, 'overheated + ionized -> scrambled');
    assert.ok(t.runtime.statuses.status_overheated && t.runtime.statuses.status_ionized,
      'non-consuming combo: both setup statuses remain visible');
    const ev = t.applied.find((a) => a.statusId === 'status_scrambled');
    assert.ok(ev && ev.cueId, 'the payoff publishes its presentation cue — the state explains itself');
    assert.equal(ev.stacks, 1);
  } finally { t.bus.clear(); }
});

test('B033: pinned and unmoored are a consuming antonym pair — each cancels the other', () => {
  const t = bootStatus();
  try {
    t.apply('status_pinned');
    assert.ok(t.runtime.statuses.status_pinned, 'ballast is live');
    t.apply('status_unmoored');
    assert.ok(t.runtime.statuses.status_unmoored, 'repulsor lands');
    assert.equal(t.runtime.statuses.status_pinned, undefined,
      'the repulsor consumes the pin — a visible counter, not a mystery heal');
    // And the reverse direction holds the same law.
    const u = bootStatus();
    try {
      u.apply('status_unmoored');
      u.apply('status_pinned');
      assert.ok(u.runtime.statuses.status_pinned, 'ballast re-lands');
      assert.equal(u.runtime.statuses.status_unmoored, undefined, 'the ballast consumes the repulsor');
    } finally { u.bus.clear(); }
  } finally { t.bus.clear(); }
});

test('B033: repeated application is bounded — burning caps at three stacks and pays authored DoT only', () => {
  const t = bootStatus();
  try {
    for (let i = 0; i < 5; i++) t.apply('status_burning', 1);
    const burning = t.runtime.statuses.status_burning;
    assert.equal(burning.stacks, 3, 'stack mode clamps at maxStacks — no infinite damage ramp');
    // The periodic payoff scales by live stacks against the authored packet — and nothing more.
    t.routed.length = 0;
    t.tick(31); // cross the first periodic tick (everyTicks 30)
    const ticks = t.routed.filter((r) => r.origin && r.origin.kind === 'status' && r.origin.id === 'status_burning');
    assert.ok(ticks.length >= 1, 'the burn pays on its published cadence');
    for (const req of ticks) {
      assert.ok(req.packet.channels.thermal <= 4 * 3, `DoT packet bounded by maxStacks, got ${req.packet.channels.thermal}`);
      assert.equal(req.packet.flags.statusPeriodic, true, 'burn damage is marked as status payout, not a hidden hit');
    }
  } finally { t.bus.clear(); }
});

test('B033: control loss refreshes rather than stacks — tumbling cannot stun-lock', () => {
  const t = bootStatus();
  try {
    t.apply('status_tumbling');
    const first = t.runtime.statuses.status_tumbling;
    const expiry1 = first.expiresTick;
    t.tick(60); // a full second inside the tumble
    t.apply('status_tumbling'); // re-application mid-tumble
    const second = t.runtime.statuses.status_tumbling;
    assert.equal(second.stacks, 1, 'refresh mode never stacks control loss');
    assert.ok(second.expiresTick > expiry1, 're-hit refreshes the clock — bounded, never accumulating');
    assert.ok(second.expiresTick - t.state.tick <= 360, 'total control loss is capped at the authored duration');
  } finally { t.bus.clear(); }
});
