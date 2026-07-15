import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import {
  buildGalaxyModel,
  factionColorOf,
  galaxyPresenceInspectorHtml,
  galaxyPresenceMarkerRows,
  setMapCanvasAriaLabel,
  visibleGalaxyPresence,
} from '../src/ui/galaxyMap.js';

function mapState({ reveal = true, revocationCount = 3, discoverAll = true } = {}) {
  const discovery = {};
  if (discoverAll) {
    for (const sector of SECTORS) discovery[sector.id] = { discovered: true };
  }
  return {
    meta: { seed: 0x47a },
    world: { currentSectorId: 'sector_helios_prime', discovery },
    story: { verge: {
      revealed: reveal,
      awake: reveal && revocationCount > 0,
      valeGatesRevoked: reveal && revocationCount > 0,
      playerUsedClosureProtocol: false,
      revocations: Array.from({ length: revocationCount }, (_, index) => ({ id: `vale_revocation_${index + 1}` })),
    } },
  };
}

test('galaxy model adds five presence groups to charted authority nodes without repainting them', () => {
  const state = mapState();
  const before = structuredClone(state);
  const model = buildGalaxyModel(state);
  assert.deepEqual(state, before, 'pure map projection must not mutate story, discovery, or authority state');
  const placements = model.nodes.flatMap((node) => (node.presence || []).map((presence) => ({ node, presence })));
  assert.equal(placements.length, 11);
  assert.equal(new Set(placements.map((row) => row.presence.factionId)).size, 5);

  const helios = model.nodes.find((node) => node.id === 'sector_helios_prime');
  assert.equal(helios.factionId, 'faction_scn');
  assert.equal(helios.color, factionColorOf('faction_scn'));
  assert.deepEqual(helios.presence.map((row) => row.factionId).sort(), ['faction_archive', 'faction_fulfillment']);

  const charon = model.nodes.find((node) => node.id === 'sector_charon_expanse');
  assert.equal(charon.factionId, 'faction_dmc');
  assert.equal(charon.color, factionColorOf('faction_dmc'));
  assert.deepEqual(charon.presence.map((row) => row.factionId), ['faction_understory']);
  assert.match(helios.searchText, /Fulfillment/i);
  assert.match(helios.searchText, /Archive/i);

  const inspector = galaxyPresenceInspectorHtml(helios.presence);
  assert.match(inspector, /Presence/);
  assert.match(inspector, /Fulfillment/);
  assert.match(inspector, /Archive/);
  assert.match(inspector, new RegExp(factionColorOf('faction_fulfillment'), 'i'));
  assert.match(inspector, new RegExp(factionColorOf('faction_archive'), 'i'));

  const markerRows = galaxyPresenceMarkerRows(helios.presence);
  assert.deepEqual(markerRows.map((row) => row.color), [
    factionColorOf('faction_fulfillment'), factionColorOf('faction_archive'),
  ]);
  assert.deepEqual(markerRows.map((row) => row.label), ['Fulfillment', 'Archive']);
});

test('galaxy presence stays off fogged nodes and unrevealed Verge stays absent', () => {
  const ordinary = buildGalaxyModel(mapState({ reveal: false, revocationCount: 0, discoverAll: false }));
  const verge = ordinary.nodes.flatMap((node) => node.presence || [])
    .filter((row) => row.factionId === 'faction_verge_layers');
  assert.deepEqual(verge, []);
  for (const node of ordinary.nodes.filter((row) => !row.charted)) {
    assert.deepEqual(node.presence, []);
  }
});

test('galaxy canvas aria keeps the exact no-data fallback and names visible presences', () => {
  const attrs = new Map();
  const canvas = { setAttribute(name, value) { attrs.set(name, value); } };
  assert.equal(setMapCanvasAriaLabel(canvas, 'galaxy', [], { chartedCount: 0 }), 'Galaxy map. No charted sectors.');
  const model = buildGalaxyModel(mapState());
  const presence = visibleGalaxyPresence(model, true);
  const label = setMapCanvasAriaLabel(canvas, 'galaxy', presence);
  assert.match(label, /Fulfillment/i);
  assert.match(label, /Archive/i);
  assert.equal(attrs.get('aria-label'), label);

  const layerOff = setMapCanvasAriaLabel(canvas, 'galaxy', visibleGalaxyPresence(model, false), {
    chartedCount: model.nodes.filter((node) => node.charted).length,
  });
  assert.doesNotMatch(layerOff, /Fulfillment|Archive/,
    'hidden faction layer must not remain exposed through the canvas accessible name');
});
