import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMAIN_COLD_TICKS } from '../scripts/lib/simReadModel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { laneCommandSink, installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { automationScreen } from '../src/ui/screens/automationPanel.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { fakeDom } from './helpers/fake-dom.mjs';

test('panel keeps one owned hull in one fleet assignment through save, index shift and release', async () => {
  const oldDocument = globalThis.document;
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  let lane, deliver, commandsDone = Promise.resolve(), serial = 0, screen;
  const asWorker = async (fn) => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const drain = async () => { for (;;) { const p = commandsDone; await p; if (p === commandsDone) return; } };
  const tick = async (steps = 0) => {
    await drain();
    const reply = await asWorker(() => host.tick({ kind: 'tick', tick: ++serial, steps, commands: [] }));
    deliver(structuredClone({ kind: 'clockTick', ...reply })); await drain();
  };
  try {
    const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
      flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
      channelFactory: () => ({ onMessage(fn) { deliver = fn; }, terminate() {}, post(message) {
        if (message.kind === 'init') asWorker(() => host.init({ ...structuredClone(message), profile: 'production', seed: 4242, scenarioContract: contract }))
          .then((reply) => deliver(structuredClone({ kind: 'ready', seq: message.seq, ...reply })))
          .catch((error) => deliver({ kind: 'error', seq: message.seq, message: String(error) }));
        if (message.kind === 'clockCommand') commandsDone = commandsDone.then(async () => {
          const reply = await asWorker(() => host.tick({ ...structuredClone(message), kind: 'tick' }));
          deliver(structuredClone({ kind: 'clockTick', ...reply, commandSequence: message.commandSequence }));
        });
      } }),
    });
    await lane.readyPromise;
    const state = host.host.state, owner = host.host.registry.get('automation');
    state.mode = 'flight';
    const playerEntity = host.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [] }));
    state.playerId = playerEntity.id;
    host.host.registry.get('world').enterSector('sector_helios_prime');
    // Configured progressed-state fixture: three owned hulls, with a valuable parked hold and fitting.
    state.player.ownedShips = [
      { defId: 'ship_kestrel', fittings: [] },
      { defId: 'ship_kestrel', fittings: [] },
      { defId: 'ship_kestrel', name: 'Prospector', fittings: ['wpn_pulse_laser_s'], fittedInstances: { 0: { instanceId: 'mi_777', defId: 'wpn_pulse_laser_s', condition: 0.5 } }, cargo: { items: { cmdty_ore_iron: 7 }, usedVolume: 7, capVolume: 40 } },
    ];
    state.player.activeShipIndex = 0;
    state.player.moduleInventory.push({ instanceId: 'mi_888', defId: 'wpn_pulse_laser_s' }, { instanceId: 'mi_999', defId: 'mod_mining_laser_s' });
    for (let i = 0; i <= DOMAIN_COLD_TICKS && main.player?.ownedShips?.length !== 3; i++) await tick();
    const doc = fakeDom(); doc.createDocumentFragment = () => doc._make('fragment'); globalThis.document = doc;
    const root = doc._make('div'), body = doc._make('div'), tabs = doc._make('div');
    root.querySelector = (s) => s === '[data-body]' ? body : s === '[data-tabs]' ? tabs : null;
    body.replaceChildren = (...nodes) => { body.children = nodes; };
    screen = Object.create(automationScreen); screen._tab = 'fleet';
    const receipts = [], fitRefusals = []; bus.on('toast', (p) => receipts.push(p.text));
    bus.on('module:fitRefused', (p) => fitRefusals.push(p));
    screen.mount(root, { state: main, bus }); screen.refresh();
    const html = () => body.children.flatMap((fragment) => fragment.children).map((n) => n.innerHTML).join('\n');
    assert.match(html(), /data-act="assignFleet" data-ref="2"/);
    const click = (act, ref) => { const control = { dataset: { act, ref: String(ref), kind: act === 'assignFleet' ? 'ownedShip' : 'fleet' } }; for (const fn of body.listeners.click || []) fn({ target: { closest: () => control } }); };
    click('assignFleet', 2); click('assignFleet', 2); await drain();
    assert.equal(state.automation.fleet.length, 1, 'concurrent panel requests cannot duplicate the same hull');
    const id = state.automation.fleet[0].id;
    assert.equal(state.player.ownedShips[2].fleetAssignmentId, id);
    assert.equal(main.player.ownedShips[2].fleetAssignmentId, id, 'the command reply publishes hull custody');
    assert.doesNotMatch(html(), /data-act="assignFleet" data-ref="2"/, 'assigned hull is no longer offered');
    assert.match(html(), /data-act="releaseFleet"/, 'the same wingman can return to the hangar');
    assert.ok(receipts.some((text) => /already assigned/.test(text)), 'the stale second command is refused visibly');
    click('assignFleet', 0); await drain();
    assert.equal(state.automation.fleet.length, 1, 'the active hull cannot be assigned');
    assert.ok(receipts.some((text) => /active hull cannot be assigned/.test(text)));
    const ships = host.host.registry.get('ships');
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    bus.emit('ui:setActiveShip', { index: 2 }); await drain();
    assert.equal(state.player.activeShipIndex, 0, 'the ordinary switch intent cannot fly the assigned hull');
    assert.ok(receipts.some((text) => /before flying its hull/.test(text)), 'the refusal explains how to fly it');
    assert.equal(await asWorker(() => ships.sellShip(2)), false, 'cannot sell the assigned hull');
    assert.equal(await asWorker(() => ships.setActiveShip(1)), true, 'another owned hull can be flown');
    assert.equal(await asWorker(() => ships.setActiveShip(0)), true);
    assert.equal(await asWorker(() => ships.sellShip(1)), true, 'selling another hull shifts the berth index');
    assert.equal(state.player.ownedShips[1].fleetAssignmentId, id, 'the link travels with the actual owned record');
    const save = host.host.registry.get('save');
    const envelope = await asWorker(() => structuredClone(save.serialize('fleet-custody')));
    assert.equal(envelope.data.player.ownedShips[1].fleetAssignmentId, id, 'the actual save includes the owned link');
    assert.equal(await asWorker(() => save.loadEnvelope(envelope)), true, 'the production save owner restores it');
    assert.equal(state.player.ownedShips[1].fleetAssignmentId, id);
    assert.equal(state.automation.fleet[0].id, id);
    assert.equal(await asWorker(() => ships.setActiveShip(1)), false, 'restored assignment still protects the hull');
    for (let i = 0; i <= DOMAIN_COLD_TICKS && main.player?.ownedShips?.length !== 2; i++) await tick();
    screen.refresh();
    await asWorker(() => host.host.registry.get('wingmen')._spawnWingmen());
    let live = state.entities.get(state.automation.fleet[0]._liveId);
    assert.ok(live, 'the owned wingman is deployed before return');
    const fittedWeapon = live.data.weapons.find((weapon) => weapon.defId === 'wpn_pulse_laser_s');
    assert.ok(fittedWeapon, 'the deployed wingman uses its owned fitted weapon');
    const pristine = makeShipEntitySpec('ship_kestrel', { fittings: ['wpn_pulse_laser_s'] }).data.weapons[0];
    assert.ok(Math.abs(fittedWeapon.dmg - pristine.dmg * 0.675) < 1e-9, 'the fitted instance condition affects its actual gun');
    state.mode = 'flight'; state.ui.docked = false;
    click('orderMine', id); await drain();
    await asWorker(() => host.host.registry.get('wingmen').update(1 / 60, state)); await tick();
    assert.equal(live.data.miningBeam, null, 'an owned hull without a fitted miner receives no free beam');
    assert.ok(receipts.some((text) => /No mining beam fitted/.test(text)), 'the real mining owner explains the missing beam');
    assert.match(html(), /No mining beam fitted/, 'the panel explains why Mine cannot cut');
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    bus.emit('ui:fitModule', { shipIndex: 1, slotIndex: 0, instanceId: 'mi_888' }); await drain();
    assert.ok(fitRefusals.some((row) => row.reason === 'fleet_assigned'));
    assert.ok(state.player.moduleInventory.some((item) => item.instanceId === 'mi_888'), 'refused refit keeps inventory custody');
    bus.emit('ui:unfitModule', { shipIndex: 1, slotIndex: 0, operationId: 'fleet-refit' }); await drain();
    assert.equal(state.player.ownedShips[1].fittedInstances[0].instanceId, 'mi_777', 'an assigned hull cannot lose its fitted instance');
    live.hull = live.hullMax * 0.4; live.armorMax = 30; live.armorHp = 9;
    const damagedHull = live.hull;
    const damagedSave = await asWorker(() => structuredClone(save.serialize('fleet-damaged')));
    assert.equal(damagedSave.data.automation.fleet[0].parkedBody.armorHp, 9, 'actual save captures live armor damage');
    assert.equal(await asWorker(() => save.loadEnvelope(damagedSave)), true);
    await asWorker(() => host.host.registry.get('wingmen')._spawnWingmen());
    live = state.entities.get(state.automation.fleet[0]._liveId);
    assert.equal(live.hull, damagedHull, 'load and redeploy preserve live hull damage');
    assert.equal(live.armorHp, 9, 'load and redeploy preserve live armor damage');
    click('releaseFleet', id); await drain();
    assert.equal(live.alive, false, 'return removes the live duplicate through normal lifetime cleanup');
    assert.equal(state.automation.fleet.length, 0);
    assert.equal(state.player.ownedShips[1].fleetAssignmentId, undefined);
    assert.equal(state.player.ownedShips[1].name, 'Prospector');
    assert.equal(state.player.ownedShips[1].parkedBody.hull, live.hull, 'return retains physical hull damage');
    assert.equal(state.player.ownedShips[1].parkedBody.armorHp, 9, 'return retains armor damage');
    assert.deepEqual(state.player.ownedShips[1].fittings, ['wpn_pulse_laser_s']);
    assert.equal(state.player.ownedShips[1].cargo.items.cmdty_ore_iron, 7, 'return preserves the owned hold');
    assert.match(html(), /data-act="assignFleet" data-ref="1"/, 'returned hull is available again');
    assert.ok(receipts.some((text) => /returned to the hangar/.test(text)));
    const releasedSave = await asWorker(() => structuredClone(save.serialize('fleet-returned')));
    assert.equal(releasedSave.data.player.ownedShips[1].parkedBody.armorHp, 9);
    assert.equal(await asWorker(() => save.loadEnvelope(releasedSave)), true);
    assert.equal(state.player.ownedShips[1].parkedBody.hull, damagedHull);
    click('assignFleet', 1); await drain();
    await asWorker(() => host.host.registry.get('wingmen')._spawnWingmen());
    const reassigned = state.automation.fleet[0];
    const again = state.entities.get(reassigned._liveId);
    assert.equal(state.entityList.filter((entity) => entity.alive && entity.data?.isWingman && entity.data.wingmanOf === reassigned.id).length, 1, 'reassignment materializes only one live wingman');
    assert.equal(again.hull, damagedHull, 'reassignment cannot heal the returned hull');
    assert.equal(again.armorHp, 9, 'reassignment cannot heal armor');
    click('releaseFleet', reassigned.id); await drain();
    assert.equal(await asWorker(() => ships.setActiveShip(1)), true, 'the returned hull can be flown');
    assert.equal(state.entities.get(state.playerId).hull, damagedHull, 'switching into the hull preserves its damage');
    assert.equal(state.entities.get(state.playerId).armorHp, 9, 'switching preserves the hull armor damage');
    assert.equal(await asWorker(() => ships.setActiveShip(0)), true);
    assert.equal(await asWorker(() => ships.setActiveShip(1)), true);
    assert.equal(state.entities.get(state.playerId).hull, damagedHull, 'parking and returning to the hull does not heal it');
    assert.equal(state.entities.get(state.playerId).armorHp, 9, 'parking and returning retains armor');
    assert.equal(state.player.ownedShips[1].fittedInstances[0].instanceId, 'mi_777');
    assert.equal(await asWorker(() => ships.unfitModule({ shipIndex: 1, slotIndex: 0 })), true);
    assert.equal(state.player.moduleInventory.filter((item) => item.instanceId === 'mi_777').length, 1, 'unfit moves the same instance once');
    assert.equal(await asWorker(() => ships.fitModule({ shipIndex: 1, slotIndex: 0, instanceId: 'mi_888' })), true);
    assert.equal(state.player.ownedShips[1].fittedInstances[0].instanceId, 'mi_888', 'normal fitting resumes after return');
    assert.equal(await asWorker(() => ships.fitModule({ shipIndex: 1, slotIndex: 4, instanceId: 'mi_999' })), true);
    assert.equal(state.entities.get(state.playerId).armorHp, 9, 'a real refit does not repair armor');
    assert.equal(await asWorker(() => ships.setActiveShip(0)), true);
    click('assignFleet', 1); await drain();
    await asWorker(() => host.host.registry.get('wingmen')._spawnWingmen());
    const lost = state.entities.get(state.automation.fleet[0]._liveId);
    assert.ok(lost.data.miningBeam?.dps > 0, 'the newly fitted mining laser reaches the deployed hull');
    const rock = state.entityList.find((e) => e.type === 'asteroid' && e.alive && !e.data?.siteAnchored && !e.data?.opticStructureId && !e.data?.isChunk && (e.data?.oreHP == null || e.data.oreHP > 0));
    assert.ok(rock); rock.pos.x = lost.pos.x; rock.pos.z = lost.pos.z; state.player.targetId = rock.id;
    state.mode = 'flight'; state.ui.docked = false;
    click('orderMine', state.automation.fleet[0].id); await drain();
    await asWorker(() => host.host.registry.get('wingmen').update(1 / 60, state));
    assert.equal(lost.data.wingmanMining, rock.id, 'the fitted mining laser cuts the marked rock');
    lost.hull = 0; lost.alive = false; state.mode = 'flight'; state.ui.docked = false;
    await asWorker(() => host.host.registry.get('wingmen').update(1 / 60, state)); await tick();
    assert.equal(state.automation.fleet.length, 0, 'the existing loss owner retires the destroyed job');
    assert.equal(state.player.ownedShips[1].parkedBody.hull, 0, 'destruction cannot silently restore the owned hull');
    assert.equal(state.player.ownedShips[1].fittedInstances[0].instanceId, 'mi_888', 'destruction retains the owned fitting record');
    click('assignFleet', 1); await drain();
    assert.equal(state.automation.fleet.length, 0, 'a zero-integrity hull cannot redeploy for a free repair');
    assert.ok(receipts.some((text) => /no integrity/.test(text)));
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    assert.equal(await asWorker(() => ships.setActiveShip(1)), true, 'the owner can switch to the damaged hull at a berth');
    assert.equal(state.entities.get(state.playerId).hull, 0, 'switching does not heal the destroyed hull');
    const creditsBeforeRepair = state.player.credits;
    bus.emit('ui:service', { type: 'repair' }); await drain();
    const pendingRepair = host.host.registry.get('stationServices').pendingPlayerService('repair');
    assert.ok(pendingRepair.hull > 0 || state.entities.get(state.playerId).hull > 0, 'the existing repair service accepts the damaged hull');
    assert.ok(state.player.credits < creditsBeforeRepair, 'the existing repair owner charges its normal price');
    const legacy = { ...state.automation.fleet[0], id: 'legacy_wing', defId: 'ship_kestrel', order: 'escort' };
    const legacySave = structuredClone(owner.serialize()); legacySave.fleet = [legacy];
    await asWorker(() => owner.deserialize(legacySave));
    click('releaseFleet', 'legacy_wing'); await drain();
    assert.equal(state.automation.fleet[0].id, 'legacy_wing', 'unlinked legacy rows are not guessed or deleted');
    assert.ok(receipts.some((text) => /link is missing or ambiguous/.test(text)));
    // Configured tracked-vessel fixture: Shipjack remains the owner of this physical hull.
    state.player.ownedShips.push({ defId: 'ship_kestrel', fittings: [], vesselId: 'vessel:tracked-test' });
    for (let i = 0; i <= DOMAIN_COLD_TICKS && main.player?.ownedShips?.length !== 3; i++) await tick();
    screen.refresh();
    assert.doesNotMatch(html(), /data-act="assignFleet" data-ref="2"/, 'the panel does not offer an independently tracked vessel');
    click('assignFleet', 2); await drain();
    assert.equal(state.automation.fleet.length, 1, 'a stale tracked-vessel request cannot create a second physical hull');
    assert.ok(receipts.some((text) => /tracked vessel remains under Registry custody/i.test(text)));
    state.player.ownedShips[2].fleetAssignmentId = 'tracked_wing';
    state.automation.fleet.push({ id: 'tracked_wing', defId: 'ship_kestrel', order: 'escort' });
    await asWorker(() => host.host.registry.get('wingmen')._spawnWingmen());
    assert.equal(state.automation.fleet.find((row) => row.id === 'tracked_wing')._liveId, undefined, 'an older linked tracked vessel is retained without a duplicate spawn'); 
  } finally { screen?.dispose(); lane?.close(); host.shutdown(); globalThis.document = oldDocument; }
});


