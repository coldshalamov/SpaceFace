// X-06 v6 (row 564): comms that name where you are. Twelve place-naming lines live inside
// V-01's shipped SECTOR_GREETING_BARKS bank — the barkDirector link is already landed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTOR_GREETING_BARKS } from '../src/data/barks.js';
import { SECTORS } from '../src/data/sectors.js';
import { KETTLE_LINE } from '../src/data/kettleLine.js';

// line -> place it names (verbatim POI/station title in that sector)
const PLACE_LINES = {
  sector_helios_prime: [
    { place: 'Checkpoint Niner', line: 'Checkpoint Niner reads every manifest twice. File clean.' },
    { place: 'Smear Marker 7', line: "Procession's walking past Smear Marker 7. Give it room." },
    { place: 'The Pit Line', line: "The Pit Line bearing isn't for sightseers. Hold your lane." },
    { place: 'Helios Weigh-Point', line: 'Helios Weigh-Point counted the raid twice. Nobody pays for the second.' },
    { place: 'Helios Bay 7', line: "Helios Bay 7 runs cold. Don't ask what's in the lockers." },
    { place: 'Shift Bell 3', line: "Shift Bell 3 rang early. Somebody's getting docked pay." },
  ],
  sector_ceres_belt: [
    { place: 'Inbound Weigh Pin', line: 'Inbound Weigh Pin says eighteen minutes. It lies on bad shifts.' },
    { place: 'The Kettle Line', line: "The Kettle Line's shedding off the gate approach. Mind your drift." },
    { place: 'Second Measure Shipbreak', line: "Second Measure Shipbreak's paying by the plate. Bring a cutter." },
    { place: 'Refinery Flare Rack', line: 'Follow the Refinery Flare Rack in. The scale pays honest.' },
    { place: 'Belt Outpost', line: 'Belt Outpost buys ore. Ceres Refinery buys better. Fly the extra.' },
    { place: 'Wreck Cathedral', line: "Wreck Cathedral's lit again. Insurers want nobody near it." },
  ],
};

function words(line) {
  return String(line).trim().split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

test('X-06 all twelve place-naming lines sit in their sector bank and name a real place', () => {
  for (const [sectorId, rows] of Object.entries(PLACE_LINES)) {
    const bank = SECTOR_GREETING_BARKS[sectorId];
    const sector = SECTORS.find((s) => s.id === sectorId);
    assert.ok(sector, `${sectorId} resolves`);
    const names = new Set([
      ...(sector.pois || []).map((p) => p.name),
      ...(sector.stations || []).map((st) => st.name),
      KETTLE_LINE && KETTLE_LINE.title ? KETTLE_LINE.title : null,
    ].filter(Boolean));
    for (const { place, line } of rows) {
      assert.ok(bank.includes(line), `${sectorId} bank carries: ${line}`);
      assert.ok(line.includes(place), `line names its place verbatim: ${place}`);
      assert.ok(names.has(place), `${place} is a real ${sectorId} place (${[...names].join(', ')})`);
      assert.ok(words(line) <= 12, `≤12 words: ${line}`);
    }
  }
});
