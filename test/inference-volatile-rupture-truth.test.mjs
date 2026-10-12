import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { lootShards, JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { combat } from '../src/systems/combat.js';
import { volatileExposure, volatileExposureReadout, RUPTURE_DAMAGE } from '../src/systems/volatileExposure.js';

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [cargo, lootShards, combat, volatileExposure] });
  const { state } = sim; state.mode = 'flight';
  const ship = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 18, hull: 120, hullMax: 120, shield: 0, shieldMax: 0,
    data: { defId: 'ship_kestrel' }, flags: {} });
  state.playerId = ship.id; state.player.cargo.capVolume = 400; state.player.cargo.capMass = 400;
  assert.equal(addCargo(state, 'cmdty_fuel_cells', 4), 4);
  assert.equal(sim.registry.get('cargo').jettison('cmdty_fuel_cells', 4), 4);
  const pod = state.entityList.find(e => e.data?.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
  assert.ok(pod);
  pod.data.volatileExposure = { schemaVersion: 1, load: 0.99, vents: 1, ventedUnits: 1,
    shocks: 0, stage: 'critical', lastShockAt: -Infinity, lastHeatAt: -Infinity, lastVentAt: -Infinity };
  const events = { ruptures: [], cues: [], voice: [], exposed: [], damage: [] };
  for (const [name, key] of [['cargo:volatileRupture', 'ruptures'], ['presentation:vfxCue','cues'],
    ['toast','voice'], ['cargo:volatileExposed','exposed'], ['combat:damage','damage']]) {
    bus.on(name, p => events[key].push(p));
  }
  const snap = () => { state.simTime += 1; state.tick += 60;
    bus.emit('tether:broken', { targetId: pod.id, reason: 'physics_break' }); };
  return { sim, state, pod, events, snap, sys: sim.registry.get('volatileExposure') };
}

test('an accepted nonlethal cook-off damages containment but never reports surviving cargo as gone', () => {
  const r = boot();
  try {
    r.pod.hull = r.pod.hullMax = RUPTURE_DAMAGE * 4;
    r.snap();
    assert.equal(r.pod.alive, true);
    assert.ok(r.pod.hull < RUPTURE_DAMAGE * 4, 'the ordinary damage owner really applied the hit');
    assert.equal(r.pod.data.amount, 4);
    assert.equal(r.events.ruptures.length, 0, 'no false destroyed-quantity receipt');
    assert.equal(r.events.cues.filter(p => p.id === 'cargoVolatile.rupture').length, 0);
    assert.equal(r.events.voice.filter(p => /units are gone/.test(p.text)).length, 0);
    assert.equal(r.pod.data.volatileDetonated, false);
    assert.equal(r.pod.data.volatileExposure.stage, 'critical', 'live condition agrees with retained load');
    assert.equal(volatileExposureReadout(r.state)[0].amount, 4);
    assert.equal(r.events.exposed.at(-1).cause, 'rupture_contained');
    // No invulnerability, invented refund or permanent suppression: subsequent physical abuse
    // still kills through combat, and only that terminal event names the actual remainder.
    for (let i = 0; i < 8 && r.pod.alive !== false; i++) r.snap();
    assert.equal(r.pod.alive, false);
    assert.equal(r.events.ruptures.length, 1);
    assert.equal(r.events.ruptures[0].destroyedQty, 4);
    r.snap(); assert.equal(r.events.ruptures.length, 1);
  } finally { r.sim.dispose(); }
});

for (const result of [{ ok: true, applied: 0 }, undefined, { ok: false }]) {
  test(`a damage-route result ${JSON.stringify(result)} without body destruction cannot claim rupture`, () => {
    const r = boot();
    try {
      r.sys.helpers = { ...r.sys.helpers, routeCombatDamage: () => result };
      r.snap();
      assert.equal(r.pod.alive, true);
      assert.equal(r.pod.data.amount, 4);
      assert.equal(r.events.ruptures.length, 0);
      assert.equal(r.pod.data.volatileExposure.stage, 'critical');
      assert.equal(r.pod.data.volatileDetonated, false);
    } finally { r.sim.dispose(); }
  });
}

test('a containment survival does not clear a pre-existing detonation mark owned by another cause', () => {
  const r = boot();
  try {
    r.pod.data.volatileDetonated = true;
    r.sys.helpers = { ...r.sys.helpers, routeCombatDamage: () => ({ ok: true, applied: 0 }) };
    r.sys._rupturePod(r.state, r.pod, r.pod.data.volatileExposure, 1, 4);
    assert.equal(r.pod.data.volatileDetonated, true);
    assert.equal(r.events.ruptures.length, 0);
  } finally { r.sim.dispose(); }
});
