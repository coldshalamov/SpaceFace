import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATION_GLYPHS,
  UNKNOWN_STATION_GLYPH,
} from '../src/data/stationGlyphs.js';
import {
  buildLocalModel,
  buildSystemModel,
  galaxyMapScreen,
} from '../src/ui/galaxyMap.js';

function overviewMarkers(state, localModel) {
  return galaxyMapScreen._overviewMarkersForState.call({
    _localModelForState: () => localModel,
    _claimsSystem: () => null,
  }, state);
}

function stationState(stations, entities = []) {
  return {
    world: { currentSectorId: 'sector_glyph_test' },
    content: {
      sectors: [{
        id: 'sector_glyph_test',
        name: 'Glyph Test',
        position: { x: 0, z: 0 },
        stations,
      }],
    },
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
}

test('live station contacts carry every authored station type into the overview glyph and label', () => {
  for (const [stationTypeId, readout] of Object.entries(STATION_GLYPHS)) {
    const entity = {
      id: `live-${stationTypeId}`,
      type: 'station',
      name: `${readout.label} Station`,
      alive: true,
      pos: { x: 10, z: 0 },
      data: { stationId: `live-${stationTypeId}`, stationTypeId },
    };
    const state = stationState([], [entity]);
    const localModel = buildLocalModel(state);
    assert.equal(localModel.contacts[0].stationTypeId, stationTypeId);

    const marker = overviewMarkers(state, localModel)
      .find((item) => item.target.id === entity.id);
    assert.ok(marker, `${stationTypeId} station should appear in the overview`);
    assert.equal(marker.glyph, readout.glyph);
    assert.equal(marker.tag, readout.label.toUpperCase());
  }
});

test('static system stations preserve their authored type and show the readable unknown fallback', () => {
  const state = stationState([
    { id: 'static-military', name: 'Arsenal', type: 'military', pos: { x: 10, z: 0 } },
    { id: 'static-modded', name: 'Modded Station', type: 'modded_station', pos: { x: 20, z: 0 } },
  ]);
  const systemModel = buildSystemModel(state);
  assert.equal(systemModel.points.find((point) => point.id === 'static-military').stationTypeId, 'military');

  const markers = overviewMarkers(state, { contacts: [] });
  const military = markers.find((item) => item.target.id === 'static-military');
  assert.equal(military.glyph, STATION_GLYPHS.military.glyph);
  assert.equal(military.tag, STATION_GLYPHS.military.label.toUpperCase());

  const unknown = markers.find((item) => item.target.id === 'static-modded');
  assert.equal(unknown.glyph, UNKNOWN_STATION_GLYPH.glyph);
  assert.equal(unknown.tag, UNKNOWN_STATION_GLYPH.label.toUpperCase());
});
