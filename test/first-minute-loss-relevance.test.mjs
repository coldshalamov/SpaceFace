// CPU/component fixtures: actual combat/loss/wreck/automation producers and the
// existing LOG consumer. This does not claim an ordinary New Game or death route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { automation } from '../src/systems/automation.js';
import { createStuntCallout, calloutTextFor } from '../src/ui/stuntCallout.js';

const SID = 'sector_helios_prime';
const RECORD_LINES = /WRECK RECORDED|LOSS RECORDED/;

function element() {
  const node = { children: [], parentNode: null, textContent: '', hidden: false,
    className: '', attributes: {}, style: { setProperty() {}, removeProperty() {} } };
  const classes = new Set();
  node.classList = { add: (...names) => names.forEach(n => classes.add(n)),
    remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n),
    toggle(n, on) { if (on ?? !classes.has(n)) classes.add(n); else classes.delete(n); } };
  node.setAttribute = (k, v) => { node.attributes[k] = String(v); };
  node.removeAttribute = k => { delete node.attributes[k]; };
  node.appendChild = child => { child.parentNode = node; node.children.push(child); return child; };
  node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; return child; };
  return node;
}

function fixture() {
  const sim = createSimulation({ seed: 4242, systems: [combat, lossLedger, aftermathWrecks], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.run = null; state.simTime = 10; state.tick = 600;
  state.world.currentSectorId = SID;
  state.ui.screenStack = []; state.settings.video.motionReduce = true;
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, radius: 14, hull: 140, hullMax: 140, data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const doc = { head: element(), body: element(), documentElement: element(),
    getElementById: () => null, createElement: () => element() };
  const reader = createStuntCallout({ state, bus, doc });
  const records = [];
  for (const event of ['lossLedger:recorded', 'aftermathWreck:recorded']) {
    bus.on(event, payload => records.push({ event, payload: structuredClone(payload) }));
  }
  return { sim, state, bus, player, reader, records,
    text() { reader.update(0); return calloutTextFor(reader.root); },
    close() { reader.destroy(); sim.dispose(); } };
}

function kill(f, playerCaused = false) {
  const attacker = playerCaused ? f.player : f.sim.spawn({ type: 'ship', team: 1,
    factionId: 'faction_reach', pos: { x: 900, z: 0 }, radius: 8, hull: 100,
    data: { defId: 'ship_wasp' } });
  const victim = f.sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 1000, z: 0 }, vel: { x: 0, z: 0 }, radius: 14, mass: 40,
    hull: 10, hullMax: 180, shield: 0, shieldMax: 0,
    data: { defId: 'ship_pelican', name: 'Fixture Barge', homeSectorId: SID } });
  f.sim.registry.get('combat').onHit({ targetId: victim.id, ownerId: attacker.id,
    damage: 100, damageType: 'kinetic', weaponId: 'wpn_autocannon_s', pos: victim.pos });
  assert.equal(victim.alive, false, 'the canonical combat owner produces a real kill');
  return victim;
}

test('unrelated NPC history is recorded and survives JSON restore without personal LOG notices', () => {
  const f = fixture(); let cold;
  try {
    const victim = kill(f);
    assert.equal(f.records.filter(row => row.event === 'lossLedger:recorded').length, 1);
    assert.equal(f.records.filter(row => row.event === 'aftermathWreck:recorded').length, 1);
    assert.doesNotMatch(f.text(), RECORD_LINES);
    const saved = JSON.parse(JSON.stringify({ losses: f.sim.registry.get('lossLedger').serialize(),
      wrecks: f.sim.registry.get('aftermathWrecks').serialize() }));
    assert.equal(saved.losses.entries.find(row => row.assetId === victim.id).killedByPlayer, false);
    const marker = saved.wrecks.bySector[SID].find(row => row.victimId === victim.id);
    assert.ok(marker, 'the actual NPC wreck remains in durable world history');

    // Delayed main receipt after its old victim id has a different, owned occupant.
    // Ownership must come from the original receipt, never from this replacement.
    f.state.entities.set(victim.id, { id: victim.id, occupantGeneration: 999, alive: true,
      type: 'ship', ownerId: f.player.id, data: { playerOwned: true } });
    for (const record of f.records.slice()) f.bus.emit(record.event, record.payload);
    assert.doesNotMatch(f.text(), RECORD_LINES, 'recycled ids cannot make unrelated history personal');
    const npcKiller = f.records.find(row => row.event === 'aftermathWreck:recorded').payload.killerId;
    f.state.playerId = npcKiller;
    for (const record of f.records.slice()) f.bus.emit(record.event, record.payload);
    assert.doesNotMatch(f.text(), RECORD_LINES,
      'a later player body matching the old killer id cannot rewrite who caused the historical loss');

    cold = fixture();
    cold.sim.registry.get('lossLedger').deserialize(saved.losses);
    cold.sim.registry.get('aftermathWrecks').deserialize(saved.wrecks);
    assert.ok(cold.state.lossLedger.entries.some(row => row.lossId === saved.losses.entries[0].lossId));
    assert.ok(aftermathForSector(cold.state, SID).some(row => row.markerId === marker.markerId));
    assert.doesNotMatch(cold.text(), RECORD_LINES, 'restored bookkeeping does not invent a personal event');
  } finally { f.close(); cold?.close(); }
});

test('a real player-caused kill keeps its canonical personal loss receipt', () => {
  const f = fixture();
  try {
    kill(f, true);
    assert.equal(f.state.lossLedger.entries[0].killedByPlayer, true);
    assert.match(f.text(), /LOSS RECORDED/);
    assert.doesNotMatch(f.text(), /WRECK RECORDED/,
      'a generic wreck marker has no frozen player-cause fact and adds no duplicate accounting line');
  } finally { f.close(); }
});

test('canonical own-hull and owned-automation losses retain personal feedback', () => {
  for (const kind of ['hull', 'automation']) {
    const f = fixture();
    try {
      if (kind === 'hull') {
        // Keep the presenter in its flight scope to check the record receipt;
        // terminal/death-mode silence belongs to the existing lifecycle owner.
        f.bus.emit('player:death', { killerId: null, pos: f.player.pos, victimVel: { x: 0, z: 0 } });
        assert.equal(f.state.lossLedger.entries[0].source, 'player:death');
        assert.equal(aftermathForSector(f.state, SID)[0].playerWreck, true);
        assert.match(f.text(), /WRECK RECORDED/);
      } else {
        const owner = Object.assign(Object.create(automation), { state: f.state, bus: f.bus });
        owner.meta();
        const asset = { id: 'fixture:owned-trader', defId: 'trader_shuttle' };
        f.state.automation.traders.push(asset);
        f.state.automation.traders.splice(f.state.automation.traders.indexOf(asset), 1);
        owner._loseAsset('trader', asset, 100, SID);
        assert.equal(f.state.lossLedger.entries[0].source, 'automation:assetLost');
      }
      assert.match(f.text(), /LOSS RECORDED/, kind);
    } finally { f.close(); }
  }
});
