import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULES } from '../src/data/modules.js';
import { QUARTERMASTER_CONTACT, quartermasterMemoryFor } from '../src/data/stationContacts.js';
import { SHIPS } from '../src/data/ships.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildSlotList, fits } from '../src/systems/ships.js';
import { quartermasterShipworksComment } from '../src/ui/station/screens/shipworks.js';

const MODULE_ID = 'mod_cargo_scanner_s';
const BOND_TECH_ID = 'tech_tractor_systems';

test('Iri only enters through a successful physical-berth fit, then reads real tech and hull history', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x52a12 });
  try {
    const { state, bus } = runtime;
    runtime.getSystem('ships').newGame();
    const stationContacts = runtime.getSystem('stationContacts');
    const voices = [];
    stationContacts.helpers.voice = { say: (payload) => voices.push(structuredClone(payload)) };
    const owned = state.player.ownedShips[state.player.activeShipIndex];
    const shipDef = SHIPS.find((row) => row.id === owned.defId);
    const moduleDef = MODULES.find((row) => row.id === MODULE_ID);
    const slots = buildSlotList(shipDef);
    const slotIndex = slots.findIndex((slot) => fits(slot, moduleDef));
    assert.ok(slotIndex >= 0, 'the production starter hull has a compatible utility slot');
    assert.equal(quartermasterShipworksComment(state, owned), null);

    // A forged/off-berth receipt cannot create the character.
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    bus.emit('module:equipped', { shipId: 'player', slotIndex, defId: MODULE_ID });
    assert.equal(quartermasterMemoryFor(state).unlocked, false);

    // Use the real Shipworks UI intent at Helios. Ships validates the actual station service and
    // owns the fitting mutation before stationContacts observes the successful receipt.
    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    if (owned.fittings[slotIndex]) bus.emit('ui:unfitModule', { slotIndex });
    state.player.moduleInventory.push({ instanceId: 'mi_plan52_quartermaster', defId: MODULE_ID });
    bus.emit('ui:fitModule', { slotIndex, instanceId: 'mi_plan52_quartermaster' });
    assert.equal(owned.fittings[slotIndex], MODULE_ID);

    let memory = quartermasterMemoryFor(state);
    assert.equal(memory.unlocked, true);
    assert.equal(memory.fitCount, 1);
    assert.equal(memory.firstStationId, 'station_helios');
    assert.equal(memory.lastShipDefId, owned.defId);
    assert.equal(memory.lastModuleId, MODULE_ID);
    assert.equal(memory.lastEvent, 'fit');
    let comment = quartermasterShipworksComment(state, owned);
    assert.equal(comment.id, QUARTERMASTER_CONTACT.id);
    assert.match(comment.text, /Cargo Scanner.*seated/i);
    assert.equal(voices[0].kind, 'quartermaster');

    // Research still belongs to Ships. Iri observes that receipt and gives the tech tree a short,
    // diegetic outfitter reading instead of inventing another progression flag.
    state.player.credits = 1_000_000;
    state.player.researchPoints = 1_000;
    bus.emit('ui:unlockTech', { nodeId: BOND_TECH_ID });
    assert.ok(state.player.researchedNodes.includes(BOND_TECH_ID));
    memory = quartermasterMemoryFor(state);
    assert.equal(memory.techCount, 1);
    assert.equal(memory.lastTechNodeId, BOND_TECH_ID);
    assert.equal(memory.lastEvent, 'tech');
    comment = quartermasterShipworksComment(state, owned);
    assert.match(comment.text, /Bond line.*Tractor Systems/i);

    // A real heavy-repair receipt changes the existing Living Hull. The Quartermaster reads the
    // resulting patch and stores only that she commented, never a second hull-history mirror.
    bus.emit('service:completed', {
      type: 'repair',
      restoredHull: 35,
      restoredArmor: 20,
      hullMax: 100,
      armorMax: 80,
      beforeProtection: 0.4,
    });
    assert.equal(owned.livingHull.repairPatches, 1);
    memory = quartermasterMemoryFor(state);
    assert.equal(memory.scarCount, 1);
    assert.equal(memory.lastScarSource, 'heavy_repair');
    assert.equal(memory.lastEvent, 'scar');
    comment = quartermasterShipworksComment(state, owned);
    assert.match(comment.text, /1 repair patch.*frame moved/i);
    assert.ok(voices.length >= 3);
    for (const voice of voices) {
      assert.ok(voice.text.trim().split(/\s+/).length <= 12, `voice bark stays short: ${voice.text}`);
    }

    const savedContacts = JSON.parse(JSON.stringify(state.player.stationContacts));
    const savedCharacter = savedContacts[QUARTERMASTER_CONTACT.id].quartermaster;
    assert.deepEqual(
      Object.keys(savedCharacter).filter((key) => /credit|cargo|kill|mission|deed|researchpoints/i.test(key)),
      [],
      'the character remembers only her own observed fit, tech, and scar events',
    );

    const continued = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x52a12 });
    try {
      continued.state.player.stationContacts = savedContacts;
      continued.bus.emit('save:loaded', {});
      const restored = quartermasterMemoryFor(continued.state);
      assert.equal(restored.unlocked, true);
      assert.equal(restored.fitCount, 1);
      assert.equal(restored.techCount, 1);
      assert.equal(restored.scarCount, 1);
      assert.equal(restored.lastEvent, 'scar');
    } finally {
      continued.dispose();
    }
  } finally {
    runtime.dispose();
  }
});
