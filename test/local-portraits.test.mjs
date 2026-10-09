import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { LOCAL_PORTRAIT_POOL, LOCAL_PORTRAIT_ROOT, localPortraitForContact } from '../src/data/localPortraits.js';
import * as portraitRegistry from '../src/data/portraits.js';
import { SECTORS } from '../src/data/sectors.js';

const contact = (stationId, slot, role) => ({ id: `contact_${stationId}_${slot}`, name: `Local ${slot}`, role });

test('every declared pool face ships, and the manifest records each one', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/portraits/locals/manifest.json', import.meta.url), 'utf8'));
  for (const [role, count] of Object.entries(LOCAL_PORTRAIT_POOL)) {
    assert.ok(count >= 8, `${role} needs a pool wide enough that a station never repeats a face`);
    for (let n = 1; n <= count; n += 1) {
      const file = `${role}_${String(n).padStart(2, '0')}.jpg`;
      await access(new URL(`../assets/portraits/locals/${file}`, import.meta.url));
      assert.ok(manifest.files[file] && manifest.files[file].subject, `${file} needs provenance in the manifest`);
    }
  }
});

test('a local gets one stable face from its role pool, never a role mask', () => {
  for (const role of Object.keys(LOCAL_PORTRAIT_POOL)) {
    const first = localPortraitForContact(contact('station_ceres', 0, role));
    assert.equal(first, localPortraitForContact(contact('station_ceres', 0, role)), 'the same person keeps the same face');
    assert.match(first, new RegExp(`^${LOCAL_PORTRAIT_ROOT}${role}_\\d{2}\\.jpg$`));
  }
  // Across the 34 stations the pool is spread EVENLY: no face is used more than its fair share.
  const stations = [];
  for (const sector of SECTORS) for (const station of sector.stations || []) stations.push(station.id);
  assert.ok(stations.length >= 30);
  for (const [role, count] of Object.entries(LOCAL_PORTRAIT_POOL)) {
    const uses = new Map();
    for (const id of stations) {
      const face = localPortraitForContact(contact(id, 0, role));
      uses.set(face, (uses.get(face) || 0) + 1);
    }
    assert.equal(uses.size, count, `${role}: every authored face is used`);
    assert.ok(Math.max(...uses.values()) <= Math.ceil(stations.length / count), `${role}: no face repeats more than ${Math.ceil(stations.length / count)} times`);
  }
});

test('people at one station never share a face while the pool allows', () => {
  for (const role of Object.keys(LOCAL_PORTRAIT_POOL)) {
    for (const station of ['station_ceres', 'station_helios', 'station_beltout', 'a-station-with-an-odd-id']) {
      const faces = [0, 1, 2, 3].map((slot) => localPortraitForContact(contact(station, slot, role)));
      assert.equal(new Set(faces).size, faces.length, `${role} at ${station} must not repeat a face`);
    }
  }
});

test('authored cast, unknown roles and empty contacts never receive a pool face', () => {
  assert.equal(localPortraitForContact({ id: 'contact_station_ceres_0', canonicalKey: 'kessler', role: 'barkeep' }), null);
  assert.equal(localPortraitForContact({ id: 'contact_station_ceres_1', role: 'courier' }), null);
  assert.equal(localPortraitForContact({ id: 'contact_station_ceres_1', role: 'no_such_role' }), null);
  assert.equal(localPortraitForContact(null), null);
  assert.equal(localPortraitForContact(undefined), null);
});

test('the identity registry still refuses role masks (the pool lives beside it, not inside it)', () => {
  assert.equal('ROLE_PORTRAITS' in portraitRegistry, false);
  assert.equal(portraitRegistry.portraitAssetForContact({ id: 'contact_station_ceres_0', role: 'barkeep' }), null);
});

test('the bar portrait mount asks the identity registry first and the pool second', async () => {
  const source = await readFile(new URL('../src/ui/portraitArt.js', import.meta.url), 'utf8');
  assert.match(source, /portraitAssetForContact\(contact\) \|\| localPortraitForContact\(contact\)/);
});
