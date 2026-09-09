import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECTORS } from '../src/data/sectors.js';
import {
  galaxyExplorationSummary,
  sectorExplorationProgress,
  explorationDiscoveryPlates,
} from '../src/world/explorationJournal.js';
import { codexProgressSummary } from '../src/ui/screens/codex.js';

test('galaxyExplorationSummary on empty state returns 0% with full sector and POI catalog counts', () => {
  const state = {
    world: {
      discovery: {},
    },
  };

  const summary = galaxyExplorationSummary(state);
  assert.equal(summary.totalSectors, SECTORS.length);
  assert.equal(summary.exploredSectors, 0);
  assert.equal(summary.partialSectors, 0);
  assert.equal(summary.foundPois, 0);
  assert.ok(summary.totalPois > 0, 'Total POIs in galaxy must be positive');
  assert.equal(summary.overallPercent, 0);
  assert.equal(summary.trophies, 0);
});

test('galaxyExplorationSummary reflects discovered POIs, explored sectors, and recovered artifacts', () => {
  const firstSectorWithPois = SECTORS.find((s) => Array.isArray(s.pois) && s.pois.length > 0);
  assert.ok(firstSectorWithPois, 'At least one sector has POIs');

  const pois = firstSectorWithPois.pois;
  const mockPoisDisc = {};
  for (let i = 0; i < pois.length; i++) {
    mockPoisDisc[pois[i].id] = {
      investigated: true,
      investigatedAt: 100 + i,
      landmarkArtifact: i === 0 ? { id: 'art_artifact_1', title: 'Ancient Core', body: 'Intact pre-collapse core' } : null,
    };
  }

  const state = {
    world: {
      discovery: {
        [firstSectorWithPois.id]: {
          pois: mockPoisDisc,
        },
      },
    },
  };

  const summary = galaxyExplorationSummary(state);
  assert.equal(summary.exploredSectors, 1, 'Sector with all POIs discovered should be fully explored');
  assert.equal(summary.foundPois, pois.length);
  assert.equal(summary.trophies, 1, 'One artifact should be counted');
  assert.ok(summary.overallPercent > 0);

  const plates = explorationDiscoveryPlates(state);
  assert.equal(plates.length, pois.length);
});

test('codexProgressSummary includes Survey metric when state is provided', () => {
  const story = { beatIndex: 2 };
  const state = {
    world: {
      discovery: {},
    },
  };

  const withState = codexProgressSummary(story, state);
  const surveyItem = withState.items.find((item) => item.key === 'Survey');
  assert.ok(surveyItem, 'Survey item must be present in codex status when state is passed');
  assert.ok(surveyItem.value.includes('%'), 'Survey value must contain percentage');

  const withoutState = codexProgressSummary(story);
  const withoutSurvey = withoutState.items.find((item) => item.key === 'Survey');
  assert.equal(withoutSurvey, undefined, 'Survey item should be omitted when state is null');
});
