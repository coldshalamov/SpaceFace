import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile, DOMAIN_COLD_BYTES, DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { createBlackFlagRegistry } from '../src/ui/blackFlagRegistry.js';
import { componentDefinition } from '../src/shipjack/market.js';
import { quoteModuleSale } from '../src/shipjack/componentProvenance.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

test('paid extraction publishes the exact moved instance and empty fitting at collection', async () => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  const domains = new Map(Object.entries(main)); let seq = 0, board;
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
    const fittings = fittingsFromDefaultModules('ship_wasp', ['mod_engine_ion_m']);
    const prize = runtime.spawn(makeShipEntitySpec('ship_wasp', { team: 2,
      pos: { x: player.pos.x, z: player.pos.z + 60 }, fittings, ai: { fsm: 'surrender' } }));
    prize.shield = 0; prize.hull = 40;
    const v = jack.admit(prize, { origin: 'extraction-test', name: 'Salvaged Wasp', ownerId: 'captain_mara_venn', crew: 'evacuated' });
    const a = jack.attempt(v, prize); a.phase = 'foothold'; a.dwell = 1.6; a.surrendered = true; a.scanned = true;
    assert.equal(jack.command({ action: 'helm', targetId: prize.id, generation: v.generation }).ok, true);
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios'; workerBus.emit('dock:docked', { stationId: 'station_helios' });
    const owned = state.player.ownedShips[1], slot = owned.fittings.findIndex(Boolean);
    const instanceId = owned.fittedInstances[slot].instanceId;
    // Genuine cold leaves: a mature fleet and its existing component inventory.
    for (let i = 0; i < 45; i++) state.player.ownedShips.push({ defId: 'ship_kestrel', name: `Owned hull ${i}`,
      fittings: [null, null, null], fittedInstances: {}, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40 } });
    state.player.moduleInventory = Array.from({ length: 100 }, (_, i) => ({ instanceId: `mi_existing_${i}`, defId: 'mod_hull_patch_kit_s', condition: 1 }));
    for (let i = 0; i <= DOMAIN_COLD_TICKS && (!main.player.ownedShips?.[1]?.vesselId || main.player.moduleInventory?.length !== 100 || !main.player.shipjack?.vesselsById?.[v.vesselId]); i++) await tick();
    const ownedLeaf = host.host.domainDiffer.paths.get('player.ownedShips');
    const inventoryLeaf = host.host.domainDiffer.paths.get('player.moduleInventory');
    assert.ok(ownedLeaf?.bytes > DOMAIN_COLD_BYTES && inventoryLeaf?.bytes > DOMAIN_COLD_BYTES, 'both affected leaves are cold');
    const doc = fakeDom(); doc.createElementNS = (_ns, tag) => doc.createElement(tag);
    const make = doc.createElement;
    doc.createElement = tag => { const n = make(tag); n.ownerDocument = doc; n.replaceChildren = (...children) => { n.children = []; for (const c of children) n.appendChild(c); }; n.remove = () => {}; n.getBoundingClientRect = () => ({ width: 120, height: 40 }); return n; };
    globalThis.document = doc;
    const ring = createSimCommandRing(); assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('ui:shipjack'));
    bus.on('ui:shipjack', p => ring.pushBus({ emit: 'ui:shipjack', payload: p }));
    board = createBlackFlagRegistry({ state: main, bus }, { dockHost: () => true });
    board.render(main.player.ownedShips[1]);
    const button = text => findAll(board.el, n => n.tagName === 'button' && n.textContent === text)[0];
    const extract = button('Extract this part'); assert.ok(extract && !extract.disabled); extract.click();
    const accept = button('Accept this quote'); assert.ok(accept && !accept.disabled); accept.click();
    const creditsBefore = state.player.credits, booked = await tick(ring.drain());
    assert.ok(state.player.credits < creditsBefore, 'the yard charged the extraction');
    assert.ok(booked.events.some(e => e.t === 'shipjack:yardStarted'));
    for (const e of booked.events || []) bus.emit(e.t, e.p);
    assert.ok(main.player.shipjack.yards[v.vesselId], 'the open board receives the accepted job');
    const job = state.player.shipjack.yards[v.vesselId];
    // Explicit fixture advancement: the real owner completes only on return to its berth.
    // No fabricated receipt or item is inserted, and no ambient waiting is performed.
    while ((ownedLeaf.slot - host.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 8
      || (inventoryLeaf.slot - host.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 8) await tick();
    state.simTime = job.completesAt;
    workerBus.emit('dock:committed', { stationId: 'station_helios' });
    const completed = await tick();
    assert.ok(completed.events.some(e => e.t === 'shipjack:yardReceipt' && e.p.action === 'extract' && e.p.ok));
    assert.equal(owned.fittings[slot], null);
    assert.equal(state.player.moduleInventory.filter(item => item.instanceId === instanceId).length, 1);
    for (const e of completed.events || []) bus.emit(e.t, e.p);
    assert.equal(main.player.moduleInventory.filter(item => item.instanceId === instanceId).length, 1, 'the exact instance reaches the main inventory');
    assert.equal(main.player.ownedShips[1].fittings[slot], null, 'the completed fitting removal reaches the main board');
    assert.ok(findAll(board.el, n => /No fitted parts remain/.test(n.textContent)).length, 'the board removes the fitted part');
    const name = componentDefinition('mod_engine_ion_m').name;
    assert.ok(findAll(board.el, n => n.textContent.startsWith(`${name} ·`)).length, 'the newly extracted part is reachable on the newest page');
    const older = button('Older parts'); assert.ok(older); older.click();
    assert.ok(button('Newer parts'), 'older inventory stays reachable through the same list');
    button('Newer parts').click();
    assert.ok(findAll(board.el, n => n.textContent.startsWith(`${name} ·`)).length);
    // A sale of an older ordinary spare uses the same mounted Registry and its
    // silent inventory owner; verify that paid receipt also reaches a cold hold.
    while ((inventoryLeaf.slot - host.host.domainDiffSeq + DOMAIN_COLD_TICKS) % DOMAIN_COLD_TICKS < 8) await tick();
    const saleQuote = quoteModuleSale(main, { instanceId: 'mi_existing_99' }); assert.ok(saleQuote.ok);
    const saleButton = button(`Offer spare · ${saleQuote.quote.amount.toLocaleString('en-US')} cr`);
    assert.ok(saleButton && !saleButton.disabled); saleButton.click();
    const saleAccept = button('Accept this quote'); assert.ok(saleAccept && !saleAccept.disabled); saleAccept.click();
    const walletBeforeSale = state.player.credits, sold = await tick(ring.drain());
    assert.ok(sold.events.some(e => e.t === 'module:sold' && e.p.instanceId === 'mi_existing_99'));
    assert.ok(state.player.credits > walletBeforeSale);
    for (const e of sold.events || []) bus.emit(e.t, e.p);
    assert.equal(main.player.moduleInventory.some(item => item.instanceId === 'mi_existing_99'), false, 'the sold instance leaves the cold main hold');
    assert.equal(main.player.credits, state.player.credits);
    const saved = registry.get('save').serializeData();
    assert.equal(saved.player.ownedShips[1].fittings[slot], null);
    assert.equal(saved.player.moduleInventory.filter(item => item.instanceId === instanceId).length, 1);
  } finally { board?.dispose(); globalThis.document = oldDocument; host.shutdown(); }
});
