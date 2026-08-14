import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const promote = JSON.parse(readFileSync(
  resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4/evidence/hitch_polish_v9/promote_report.json'),
  'utf8',
));
const build = JSON.parse(readFileSync(
  resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4/evidence/hitch_polish_v9/build_report.json'),
  'utf8',
));

const player = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
const visual = wholeShipVisualForEntity(player, { requiredWholeShip: true });
assert.equal(visual.file, 'wholeships/kestrel.glb', 'starter must still resolve to live Hitch');
assert.equal(visual.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4');

const live = resolve(ROOT, 'assets/ships/parts', visual.file);
assert.ok(existsSync(live), 'live Hitch file missing');
const liveHash = createHash('sha256').update(readFileSync(live)).digest('hex').toUpperCase();
assert.equal(liveHash, promote.members[0].sha256, 'live Hitch must be the promoted V9 body');
assert.equal(promote.status, 'complete');
assert.ok(build.polish.objectsAdded >= 20, 'V9 must add extra manufactured assemblies beyond V8');
assert.ok(build.polish.extras.some((item) => /antenna/i.test(item)));
assert.ok(build.polish.extras.some((item) => /airlock/i.test(item)));
assert.ok(build.polish.v8.extras.some((item) => /weapon spine/i.test(item)));
assert.ok(existsSync(resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v4/evidence/hitch_polish_v9/three_quarter.png')));
assert.equal(promote.members[0].releaseUntouched, true, 'do not smash KTX2 release with uncompressed V9');

const remasters = [
  'hornet', 'drifter', 'ranger', 'ironback', 'bastion', 'atlas', 'warden',
  'colossus', 'leviathan', 'pelican', 'mule', 'wasp',
  'ashline_dart', 'ashline_lode', 'ashline_rig',
  'helios_lark', 'helios_cradle', 'helios_span',
  'ore_barge', 'repair_tender', 'salvage_cutter', 'survey_pin',
];
for (const ship of remasters) {
  const glb = resolve(
    ROOT,
    `assets/ships/fleet_player_bodies_v1/${ship}/source/wholeships/${ship}_production_v1_lod0.glb`,
  );
  assert.ok(existsSync(glb), `${ship} remaster candidate missing`);
}

console.log('Hitch V9 live polish: PASS');
