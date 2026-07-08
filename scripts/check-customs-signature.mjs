import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  SIGNATURE_AUDIO_CUE_BY_ID,
  getSignatureRecipe,
  validateSignatureRecipes,
} from '../src/presentation/cueRecipesSignatures.js';
import {
  CUSTOMS_SIGNATURE_DEBOUNCE_MS,
  CUSTOMS_ZONE_TYPES,
  SIGNATURE_CAPTIONS,
  buildCustomsScanCue,
  isCustomsContext,
  isCustomsStation,
  isCustomsZone,
  resolveCustomsScanSignature,
  shouldDebounceCustomsSignature,
} from '../src/systems/signatureAdapters.js';

const report = validateSignatureRecipes();
assert(report.ok, report.issues.join('\n'));

const scan = getSignatureRecipe('sensor.scan');
const lock = getSignatureRecipe('sensor.lock');
const customs = getSignatureRecipe('customs.scan');
assert(scan, 'AUD-04 depends on the AUD-03 sensor.scan base signature');
assert(lock, 'sensor.lock must remain distinct from customs.scan');
assert(customs, 'customs.scan signature must exist');
assert.equal(customs.extends, 'sensor.scan', 'customs.scan should extend the scan family');
assert.equal(SIGNATURE_AUDIO_CUE_BY_ID['customs.scan'], 'presentation.customs.scan');
assert.equal(SIGNATURE_CAPTIONS['customs.scan'], 'Customs sweep.');
assert(customs.importance > scan.importance, 'customs scan should be more tense than plain scan');
assert(customs.importance < lock.importance, 'customs scan must stay distinct from weapons lock');
assert(customs.tones.length > scan.tones.length, 'customs scan should have a longer held tail than plain scan');
assert.equal(customs.budgets.draw, 0);
assert.equal(customs.budgets.voice, 0);
assert.equal(customs.budgets.spawn, 0);
assert.deepEqual(CUSTOMS_ZONE_TYPES, ['border_checkpoint', 'patrol_corridor']);

const tethysZones = zonesForSector('sector_tethys_junction');
const customsZone = tethysZones.find((zone) => zone.id === 'zone_tethys_checkpoint');
assert(customsZone, 'Tethys Junction must have the authored customs checkpoint zone');
assert.equal(isCustomsZone(customsZone), true, 'Tethys checkpoint must count as a customs context');

const heliosZones = zonesForSector('sector_helios_prime');
const heliosCore = heliosZones.find((zone) => zone.id === 'zone_helios_core');
const heliosLane = heliosZones.find((zone) => zone.id === 'zone_helios_lane');
assert(heliosCore && heliosLane, 'Helios customs fixtures must exist');
assert.equal(isCustomsZone(heliosCore), false, 'safe Concord core must not count as a customs cone just because it is secure');
assert.equal(isCustomsZone(heliosLane), true, 'Customs Corridor patrol lane must count as customs');

const tethys = SECTORS.find((sector) => sector.id === 'sector_tethys_junction');
const customsStation = tethys.stations.find((station) => station.id === 'station_customs');
assert(customsStation, 'Tethys must expose the Customs Gate station');
assert.equal(isCustomsStation(customsStation), true, 'Customs Gate station should count as customs context');

assert.equal(resolveCustomsScanSignature({ scanStarted: false, hasContraband: true, zone: customsZone }), null,
  'customs tone must trigger only on scan-start, not every frame in-zone');
assert.equal(resolveCustomsScanSignature({ scanStarted: true, hasContraband: false, zone: customsZone }), 'sensor.scan',
  'clean hold should stay a plain scan tone');
assert.equal(resolveCustomsScanSignature({ scanStarted: true, hasContraband: true, zone: heliosCore }), 'sensor.scan',
  'secure but non-customs zone must not fire customs dread');
assert.equal(resolveCustomsScanSignature({ scanStarted: true, hasContraband: true, zone: customsZone }), 'customs.scan');
assert.equal(resolveCustomsScanSignature({ scanStarted: true, hasContraband: true, station: customsStation }), 'customs.scan');

const customsCue = buildCustomsScanCue({ scanStarted: true, hasContraband: true, zone: customsZone, nowMs: 2000 });
assert.equal(customsCue.id, 'customs.scan');
assert.equal(customsCue.caption, 'Customs sweep.');
assert.equal(customsCue.sourceEvent, 'player:scannedByPatrol');
assert.equal(customsCue.customsContext, true);
assert.equal(customsCue.zoneId, 'zone_tethys_checkpoint');

const cleanCue = buildCustomsScanCue({ scanStarted: true, hasContraband: false, zone: customsZone, nowMs: 2100 });
assert.equal(cleanCue.id, 'sensor.scan');
assert.equal(cleanCue.caption, 'Scanned.');

const previous = { id: 'customs.scan', startedAtMs: 2000, untilMs: 6000 };
assert.equal(shouldDebounceCustomsSignature(previous, 2500), true);
assert.equal(buildCustomsScanCue({ scanStarted: true, hasContraband: true, zone: customsZone, nowMs: 2500, previous }), null,
  'customs scan must not loop every frame while in the cone');
assert.equal(buildCustomsScanCue({ scanStarted: true, hasContraband: true, zone: customsZone, nowMs: 6001, previous }).id,
  'customs.scan',
  'a later distinct scan-start may fire again');
assert.equal(CUSTOMS_SIGNATURE_DEBOUNCE_MS, 4000, 'customs debounce should mirror the shipped customs prompt cadence');

const adapterSource = readFileSync(new URL('../src/systems/signatureAdapters.js', import.meta.url), 'utf8');
assert.doesNotMatch(adapterSource, /from ['"].*economy|from ['"].*audioSystem|from ['"].*sectorZones/,
  'AUD-04 adapter must not import no-touch owners');
assert.doesNotMatch(adapterSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'customs signature adapter must stay deterministic and backend-free');

const recipeSource = readFileSync(new URL('../src/presentation/cueRecipesSignatures.js', import.meta.url), 'utf8');
assert.doesNotMatch(recipeSource, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval|AudioContext|document|window/,
  'customs signature recipe must stay deterministic and backend-free');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['check:customs-signature'], 'node scripts/check-customs-signature.mjs',
  'package.json must expose the AUD-04 check');

console.log(JSON.stringify({
  schema: 'spaceface.customsSignatureCheck.v1',
  ok: true,
  customsAudioId: customs.audioId,
  customsImportance: customs.importance,
  customsCaption: customsCue.caption,
  plainFallback: cleanCue.id,
  customsZone: customsZone.id,
  customsStation: customsStation.id,
}, null, 2));
