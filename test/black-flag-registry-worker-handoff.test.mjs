import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile, DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createBlackFlagRegistry } from '../src/ui/blackFlagRegistry.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

test('paid Registry title settlement is visible on its cold worker reply', async () => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  const domains = new Map(Object.entries(main)); let seq = 0; let board;
  const oldDocument = globalThis.document;
  const apply = reply => { for (const u of reply.domainUpdates || []) {
    const segs = u.segs.length === 1 && u.segs[0].includes('.') ? u.segs[0].split('.') : u.segs;
    applyDomainPathUpdate(domains, { ...u, segs }, new Set()); main[segs[0]] = domains.get(segs[0]);
  }};
  const tick = async (commands = []) => { const r = structuredClone(await host.tick({ tick: ++seq, steps: 0, commands })); apply(r); return r; };
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json', 'utf8')) })));
    const { state, registry, runtime, bus: workerBus } = host.host;
    state.mode = 'flight'; state.run.kind = 'adventure'; state.onboarding = { active: false, finished: true };
    registry.get('world').enterSector('sector_helios_prime');
    const jack = registry.get('shipjack'), station = jack.stationEntity('station_helios');
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true,
      pos: { x: station.pos.x + station.radius + 60, z: station.pos.z }, fittings: [] }));
    state.playerId = player.id; state.player.credits = 100000;
    state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }]; state.player.activeShipIndex = 0;
    const prize = runtime.spawn(makeShipEntitySpec('ship_wasp', { team: 2,
      pos: { x: player.pos.x, z: player.pos.z + 60 }, fittings: [], ai: { fsm: 'surrender' } }));
    prize.shield = 0; prize.hull = 40;
    const v = jack.admit(prize, { origin: 'registry-test', name: 'Claimant Wasp', ownerId: 'captain_mara_venn', crew: 'evacuated' });
    const a = jack.attempt(v, prize); a.phase = 'foothold'; a.dwell = 1.6; a.surrendered = true; a.scanned = true;
    assert.equal(jack.command({ action: 'helm', targetId: prize.id, generation: v.generation }).ok, true);
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios'; workerBus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(v.location.kind, 'berth'); assert.equal(v.title, 'disputed');
    // A plausible populated Registry exercises the real cold scheduling tier.
    for (let i = 0; i < 12; i++) {
      const copy = structuredClone(v); copy.vesselId = `vessel:older:${i}`; copy.name = `Recorded vessel ${i}`;
      copy.history = Array.from({ length: 12 }, (_, n) => ({ at: n, action: 'observed', text: `Recorded condition and prior ownership for vessel ${i}, entry ${n}.` }));
      state.player.shipjack.vesselsById[copy.vesselId] = copy;
    }
    for (let i = 0; i <= DOMAIN_COLD_TICKS && !main.player.shipjack?.vesselsById?.[v.vesselId]; i++) await tick();
    const leaf = host.host.domainDiffer.paths.get('player.shipjack');
    assert.ok(leaf?.bytes > DOMAIN_COLD_BYTES, 'Registry is on the production cold tier');
    while ((leaf.slot - host.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 10) await tick();
    const doc = fakeDom(); doc.createElementNS = (_ns, tag) => doc.createElement(tag);
    const make = doc.createElement;
    doc.createElement = tag => { const n = make(tag); n.ownerDocument = doc; n.replaceChildren = (...children) => { n.children = []; for (const c of children) n.appendChild(c); }; n.remove = () => {}; n.getBoundingClientRect = () => ({ width: 120, height: 40 }); return n; };
    globalThis.document = doc;
    const ring = createSimCommandRing(); assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('ui:shipjack'));
    bus.on('ui:shipjack', p => ring.pushBus({ emit: 'ui:shipjack', payload: p }));
    board = createBlackFlagRegistry({ state: main, bus }, { dockHost: () => true });
    board.render(main.player.ownedShips.find(s => s.vesselId === v.vesselId));
    const findButton = text => findAll(board.el, node => node.tagName === 'button' && node.textContent === text)[0];
    const action = findButton('Compensate claimant / buy title'); assert.ok(action && !action.disabled);
    action.click();
    const accept = findButton('Accept this quote'); assert.ok(accept && !accept.disabled);
    accept.click();
    assert.ok(findButton('Request transmitted')?.disabled, 'the actual screen waits for its receipt');
    const before = state.player.credits, reply = await tick(ring.drain());
    assert.equal(v.title, 'clean'); assert.ok(state.player.credits < before, 'the real owner charged the claimant payment');
    assert.equal(main.player.credits, state.player.credits, 'the paid wallet is current in the same reply');
    assert.ok(reply.events.some(e => e.t === 'shipjack:yardReceipt' && e.p.ok));
    for (const e of reply.events || []) bus.emit(e.t, e.p);
    assert.equal(main.player.shipjack.vesselsById[v.vesselId].title, 'clean', 'the answer includes current Registry title');
    const after = findButton('Compensate claimant / buy title'); assert.ok(after?.disabled, 'the repainted board cannot offer the completed claim again');
    const saved = registry.get('save').serializeData();
    assert.equal(saved.player.shipjack.vesselsById[v.vesselId].title, 'clean');
    assert.equal(saved.player.credits, state.player.credits);
  } finally { board?.dispose(); globalThis.document = oldDocument; host.shutdown(); }
});
