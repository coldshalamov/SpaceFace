// Explicit fixture staging; actual trap/mines/combat/law/loss consumers. This
// reproduces an attribution defect, not the unidentified ordinary lethal packet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { mines } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';

const SID = 'sector_helios_prime';

function fixture() {
  const sim = createSimulation({ seed: 4242,
    systems: [mines, combat, lawSecurity, lossLedger], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = SID;
  state.world.sectors = { [SID]: { id: SID, factionId: 'faction_scn', security: 0.9, tier: 0 } };
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: -500, z: 0 }, radius: 14, hull: 140, hullMax: 140, shield: 0,
    data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_helios', dockRadius: 72, factionId: 'faction_scn' } });
  const victim = sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 200, z: 0 }, radius: 14, hull: 10, hullMax: 180, shield: 0, shieldMax: 0,
    data: { defId: 'ship_pelican', trafficRole: 'miner',
      ai: { archetype: 'fleeing_trader', passive: true, spawnContext: 'convoy_civilian' } } });
  const events = [];
  for (const event of ['combat:damage', 'entity:killed', 'law:incidentOpened', 'mines:detonated']) {
    bus.on(event, p => events.push({ event, p: structuredClone(p) }));
  }
  const trapOwner = Object.assign(Object.create(aftermathWrecks), { state, helpers: sim.helpers });
  return { sim, state, player, victim, events, trapOwner, mineOwner: sim.registry.get('mines') };
}

function trigger(f, mine) {
  assert.equal(mine.physicsBody.dynamic, true);
  assert.equal(mine.physicsBody.ccd, true);
  assert.equal(mine.physicsBody.material, 'projectile');
  f.mineOwner.update(1 / 60, f.state);
  const killed = f.events.find(x => x.event === 'entity:killed' && x.p.id === f.victim.id)?.p;
  assert.ok(killed, 'the real explosive damage still kills the staged low-hull victim');
  assert.equal(killed.presentation.cause, 'explosive');
  assert.equal(mine.alive, false, 'the original physical mine detonates once');
  assert.equal(f.events.filter(x => x.event === 'mines:detonated').length, 1);
  const loss = f.state.lossLedger.entries.find(row => row.assetId === f.victim.id);
  assert.ok(loss, 'canonical entity:killed reaches the real loss ledger');
  return { killed, loss, incidents: f.events.filter(x => x.event === 'law:incidentOpened').map(x => x.p) };
}

test('an actual hostile wreck trap stays unowned and never fabricates player piracy or a player kill', () => {
  const f = fixture();
  try {
    const field = { fieldId: 'fixture:unowned-wreck-trap', sectorId: SID, zoneId: 'zone_helios_claim' };
    const mine = f.trapOwner._spawnTrap(field, f.victim.pos);
    assert.equal(mine.ownerId, null);
    assert.equal(mine.data.ownerId, null, 'explicit unowned null survives the canonical placement helper');
    assert.equal(mine.team, 1); assert.equal(mine.factionId, 'faction_reach');
    assert.equal(mine.data.wreckEcologyRole, 'trap');
    assert.deepEqual(mine.data.wreckEcology, { ...field, role: 'trap' });
    const result = trigger(f, mine);
    assert.notEqual(result.killed.killerId, f.player.id);
    assert.equal(result.loss.killedByPlayer, false);
    assert.notEqual(result.loss.killerId, f.player.id);
    assert.ok(result.incidents.every(row => row.attackerId !== f.player.id && row.cause !== 'player_piracy'));
    assert.equal(f.player.hull, 140, 'the player did nothing in this fixture');
  } finally { f.sim.dispose(); }
});

test('explicit and legacy omitted player mine ownership retain real kill credit and lawful consequences', () => {
  for (const intent of ['explicit', 'omitted', 'undefined']) {
    const f = fixture();
    try {
      const opts = { pos: f.victim.pos, team: 0, armDelayS: 0, telegraph: false };
      if (intent === 'explicit') opts.ownerId = f.player.id;
      if (intent === 'undefined') opts.ownerId = undefined;
      const mine = f.mineOwner.placeMine(opts);
      assert.equal(mine.ownerId, f.player.id, intent);
      assert.equal(mine.data.ownerId, f.player.id, intent);
      const result = trigger(f, mine);
      assert.equal(result.killed.killerId, f.player.id, intent);
      assert.equal(result.loss.killedByPlayer, true, intent);
      assert.ok(result.incidents.some(row => row.attackerId === f.player.id && row.cause === 'player_piracy'),
        `${intent}: actual player ordnance still opens the canonical civilian attack case`);
    } finally { f.sim.dispose(); }
  }
});
