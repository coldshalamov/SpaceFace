import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { runBootstrapScene } from '../src/core/newGameBoot.js';
import { getCareerOfferViewReadOnly } from '../src/careers/origins/careerOrigins.js';
import { buildMissionLogOriginChoiceModel } from '../src/ui/careerLadderView.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, thrusterScaling } from '../src/systems/ships.js';

test('first Hauler settlement connects the real career card to a useful affordable fit', async () => {
  const host = createSimHost(), main = createGameState(4242), domains = new Map(Object.entries(main));
  let serial = 0;
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
  };
  const tick = async () => apply(structuredClone(await host.tick({ tick: ++serial, steps: 0, commands: [] })));
  const card = () => buildMissionLogOriginChoiceModel(main, {
    name: 'careerOrigins', getOfferView: () => getCareerOfferViewReadOnly(main),
  }).cards.find((row) => row.careerId === 'hauler');
  const cardFor = (state) => buildMissionLogOriginChoiceModel(state, {
    name: 'careerOrigins', getOfferView: () => getCareerOfferViewReadOnly(state),
  }).cards.find((row) => row.careerId === 'hauler');
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242, bridgeAll: true,
      domainMirroring: createDomainMirroringProfile('station'),
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) })));
    const { state, runtime, registry, bus } = host.host;
    registry.get('ships').newGame();
    await runBootstrapScene(state, runtime.getHelpers(), bus, registry);
    state.mode = 'flight'; bus.emit('game:started', {});
    for (let i = 0; i < 65 && !card(); i++) await tick();
    assert.doesNotMatch(card().receiptLine, /Harbor Brake/, 'no suggestion before the manifest is completed');
    bus.emit('career:origin:accept', { careerId: 'hauler' });
    assert.equal(state.player.cargo.items.cmdty_food, 8);
    // Progressed fixture: the dock event represents an arrived pilot; no flight is claimed.
    bus.emit('dock:docked', { stationId: 'station_coalition' });
    assert.equal(state.player.credits, 6120);
    assert.equal(state.player.cargo.items.cmdty_food, undefined);
    for (let i = 0; i < 65; i++) { await tick(); if (main.careers?.origins?.hauler?.history?.some((h) => h.kind === 'step_success') && main.player.credits === 6120 && main.player.ownedShips?.length) break; }
    assert.ok(card());
    assert.match(card().receiptLine, /Harbor Brake Set S/);
    assert.match(card().receiptLine, /1,400 cr/i);
    assert.match(card().receiptLine, /Helios Station.*Shipworks/i);
    assert.match(card().receiptLine, /25%.*brak/i);
    assert.doesNotMatch(card().receiptLine, /issues .* immediately/i);
    assert.deepEqual(card().choices.map((x) => x.id), ['bonded_express', 'open_manifest']);
    const poor = { ...main, player: { ...main.player, credits: 1000 } };
    const poorCard = cardFor(poor);
    assert.match(poorCard.receiptLine, /400 cr more/i);
    const hull = SHIPS.find((s) => s.id === 'ship_kestrel');
    const slot = buildSlotList(hull).findIndex((s) => s.type === 'thruster');
    const inventory = { ...main, player: { ...main.player, moduleInventory: [{ defId: 'mod_harbor_brake_s' }] } };
    assert.doesNotMatch(cardFor(inventory).receiptLine, /Harbor Brake/, 'already owned');
    const occupied = { ...main, player: { ...main.player, ownedShips: [{ ...main.player.ownedShips[0], fittings: [...main.player.ownedShips[0].fittings] }] } };
    occupied.player.ownedShips[0].fittings[slot] = 'mod_harbor_brake_s';
    assert.doesNotMatch(cardFor(occupied).receiptLine, /Harbor Brake/, 'already fitted');
    occupied.player.ownedShips[0].fittings[slot] = 'mod_thruster_stripped_s';
    assert.doesNotMatch(cardFor(occupied).receiptLine, /Harbor Brake/, 'occupied slot is not presented as an empty fit');
    const otherHull = { ...main, player: { ...main.player, ownedShips: [{ defId: 'ship_wasp', fittings: [] }] } };
    assert.doesNotMatch(cardFor(otherHull).receiptLine, /Harbor Brake/, 'recommendation is specific to the Hitch');
    bus.emit('career:origin:choose', { careerId: 'hauler', choiceId: 'open_manifest' });
    for (let i = 0; i < 65 && !card().selectedChoiceId; i++) await tick();
    assert.match(card().receiptLine, /Open Manifest is saved/);
    assert.match(card().receiptLine, /Harbor Brake/);
    state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
    bus.emit('ui:buyModule', { defId: 'mod_harbor_brake_s', shipIndex: 0, fitSlotIndex: slot });
    assert.equal(state.player.credits, 4720);
    assert.equal(state.player.ownedShips[0].fittings[slot], 'mod_harbor_brake_s');
    assert.equal(thrusterScaling(hull, [MODULES.find((m) => m.id === 'mod_harbor_brake_s')]).brake, 1.25);
    for (let i = 0; i < 65; i++) { await tick(); if (main.player.ownedShips?.[0]?.fittings?.[slot] === 'mod_harbor_brake_s') break; }
    assert.doesNotMatch(card().receiptLine, /Harbor Brake/);
  } finally { host.shutdown(); }
});
