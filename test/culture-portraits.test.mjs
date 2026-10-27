import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CULTURE_FACES_SHIPPED,
  CULTURE_PORTRAIT_POOL,
  CULTURE_PORTRAIT_ROOT,
  STATION_CULTURE,
  localPortraitForContact,
} from '../src/data/localPortraits.js';
import { CANONICAL_PORTRAITS, PENDING_CANONICAL_PORTRAITS } from '../src/data/portraits.js';
import { SECTORS } from '../src/data/sectors.js';
import { generateContacts } from '../src/ui/station/barContacts.js';

const contact = (stationId, slot, role = 'merchant') => ({ id: `contact_${stationId}_${slot}`, name: `Local ${slot}`, role });

const exists = (url) => access(url).then(() => true, () => false);
// Run a culture-selection test only once the face art ships; until then the gate tests below
// pin what the player gets instead (an existing role-pool face, never a 404).
const whenShipped = { skip: !CULTURE_FACES_SHIPPED && 'culture face art not shipped (CULTURE_FACES_SHIPPED = false)' };

test('culture face flag and files agree: the flag flips in the same commit as the 64 faces', async () => {
  assert.equal(Object.keys(CULTURE_PORTRAIT_POOL).length, 8, '03 §2 names eight peoples — the pools must cover all eight');
  const manifest = JSON.parse(await readFile(new URL('../assets/portraits/cultures/manifest.json', import.meta.url), 'utf8'));
  let present = 0;
  let total = 0;
  for (const [culture, count] of Object.entries(CULTURE_PORTRAIT_POOL)) {
    assert.ok(count >= 8, `${culture} needs a pool wide enough that a station never repeats a face`);
    for (let n = 1; n <= count; n += 1) {
      const file = `${culture}_${String(n).padStart(2, '0')}.jpg`;
      total += 1;
      if (await exists(new URL(`../assets/portraits/cultures/${file}`, import.meta.url))) present += 1;
      if (CULTURE_FACES_SHIPPED) {
        assert.ok(manifest.files[file] && manifest.files[file].subject, `${file} needs provenance in the manifest`);
      }
    }
  }
  if (CULTURE_FACES_SHIPPED) assert.equal(present, total, 'CULTURE_FACES_SHIPPED is true but culture face files are missing');
  else assert.equal(present, 0, `${present} culture face files exist now: flip CULTURE_FACES_SHIPPED to true in localPortraits.js and add the rest`);
});

test('until the culture art ships every station draws an existing role-pool face', async () => {
  if (CULTURE_FACES_SHIPPED) return;
  for (const stationId of Object.keys(STATION_CULTURE)) {
    for (const role of ['barkeep', 'merchant', 'miner']) {
      for (const slot of [0, 1, 2, 3]) {
        const face = localPortraitForContact(contact(stationId, slot, role));
        assert.match(face, /^assets\/portraits\/locals\/[a-z_]+_\d{2}\.jpg$/, `${stationId}/${role}/${slot} must stay on the role pool`);
        assert.ok(await exists(new URL(`../${face}`, import.meta.url)), `${face} must exist on disk — no 404, no placeholder`);
      }
    }
  }
});

test('every mapped station names a real culture and every culture keeps at least one station', () => {
  const stationIds = new Set();
  for (const sector of SECTORS) for (const station of sector.stations || []) stationIds.add(station.id);
  const used = new Set();
  for (const [stationId, culture] of Object.entries(STATION_CULTURE)) {
    assert.ok(stationIds.has(stationId), `${stationId} is not a real station`);
    assert.ok(culture in CULTURE_PORTRAIT_POOL, `${stationId} maps to an unauthored culture ${culture}`);
    used.add(culture);
  }
  for (const culture of Object.keys(CULTURE_PORTRAIT_POOL)) {
    assert.ok(used.has(culture), `culture ${culture} is authored but no station is home to it`);
  }
});

test('a local at a cultured station gets one stable face from the station people, for any role', whenShipped, () => {
  for (const [stationId, culture] of Object.entries(STATION_CULTURE)) {
    for (const role of ['barkeep', 'merchant', 'miner']) {
      const first = localPortraitForContact(contact(stationId, 0, role));
      assert.equal(first, localPortraitForContact(contact(stationId, 0, role)), 'the same person keeps the same face');
      assert.match(first, new RegExp(`^${CULTURE_PORTRAIT_ROOT}${culture}_\\d{2}\\.jpg$`),
        `${stationId} is ${culture} country — the local face must be one of that people, not a role mask`);
    }
  }
});

test('patrons at one cultured station never share a face while the pool allows', whenShipped, () => {
  for (const stationId of Object.keys(STATION_CULTURE)) {
    const faces = [0, 1, 2, 3].map((slot) => localPortraitForContact(contact(stationId, slot, 'merchant')));
    assert.equal(new Set(faces).size, faces.length, `${stationId} must not seat two patrons on one face`);
  }
});

test('an explicit cultureId overrides the station, and uncultured stations keep the role pool', () => {
  // A Belter drinking at the Quiet's fence is still Beltborn: people, not employers.
  if (CULTURE_FACES_SHIPPED) {
    assert.match(
      localPortraitForContact({ id: 'contact_station_nyx_march_1', role: 'smuggler', cultureId: 'beltborn' }),
      new RegExp(`^${CULTURE_PORTRAIT_ROOT}beltborn_\\d{2}\\.jpg$`),
    );
  }
  // Nyx Fence has no single people — the role pool still covers the mixed crew.
  assert.match(
    localPortraitForContact(contact('station_nyx_march', 1, 'smuggler')),
    /^assets\/portraits\/locals\/smuggler_\d{2}\.jpg$/,
  );
  // Unknown cultures and cast stay out of every pool.
  assert.equal(localPortraitForContact(contact('station_helios', 0, 'merchant')), localPortraitForContact(contact('station_helios', 0, 'merchant')));
  assert.equal(localPortraitForContact({ id: 'contact_station_helios_0', canonicalKey: 'wex', role: 'engineer' }), null);
});

// W-FACES row 543 — the rest of the canon cast and the eleven new faces sit where their canon put
// them, and stations that keep more than one authored face seat them all.
const NEW_FACE_PLACEMENTS = Object.freeze({
  station_dione_customs: ['sula_dree', 'petra_lusk'],
  station_dione: ['callum'],
  station_helios: ['kessler', 'wex'],
  station_ashcache: ['kurtz', 'sump', 'ma_sprocket'],
  station_sker: ['quinn', 'clatter'],
  station_eunomia: ['moss_keeps_moss'],
  station_orcus_shadow: ['brother_index'],
  station_phoebe_echo: ['addendum_seroy'],
  station_depot3: ['cantor_lise'],
  station_sedna: ['mael_ost'],
  station_hyperion_claim: ['nine_finger_abe'],
  station_reach: ['tamsin'],
  station_tethys: ['mira', 'clerk_0003'],
  station_io_merc: ['sallow'],
  station_expanse: ['ferrow'],
});

test('every new face sits at its canon station, even where several share one bar', () => {
  for (const [stationId, keys] of Object.entries(NEW_FACE_PLACEMENTS)) {
    const contacts = generateContacts(stationId, {});
    const seated = new Set(contacts.map((c) => c.canonicalKey).filter(Boolean));
    for (const key of keys) {
      assert.ok(seated.has(key), `${stationId} must seat ${key} — it is the station their canon ties them to`);
      // Kurtz is the Witness: canon keeps him in the terminal register, never on a photograph.
      if (key !== 'kurtz') {
        assert.ok(CANONICAL_PORTRAITS[key] || PENDING_CANONICAL_PORTRAITS[key],
          `${key} must own an identity portrait in the registry (live or pending art)`);
      }
    }
    // No authored face crowds out the room: the bar keeps its standing cap (4, or 5 when the
    // world calendar's shift-end/festival swells the room — unchanged semantics).
    const patrons = contacts.filter((c) => c.id && c.id.startsWith(`contact_${stationId}_`));
    assert.ok(patrons.length <= 5, `${stationId} bar lineup grew past its five-seat cap`);
  }
});
