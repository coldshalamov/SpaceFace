#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLUEPRINTS } from '../src/data/blueprints.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import {
  formatValidationIssues,
  validateUniqueLootContract,
} from './lib/depthProgramValidators.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const fixtureAt = args.indexOf('--fixture');
const manifestPath = fixtureAt >= 0 && args[fixtureAt + 1]
  ? resolve(args[fixtureAt + 1])
  : join(ROOT, 'design/depth-program/unique-loot-reservations.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const acquisition = stationAcquisitionSurfaces();
const channelRows = Array.isArray(manifest.channels) ? manifest.channels : [];
const channelIds = channelRows.map((row) => typeof row === 'string' ? row : row && row.id).filter(Boolean);
const issues = validateUniqueLootContract({
  wrecks: manifest.wrecks,
  rumors: manifest.rumors || [],
  channels: channelIds,
  stationInventoryIds: [...acquisition.keys()],
  sourceIndex: FLAVOR_SOURCE_BY_REF,
  requireAuthored: true,
});

if (manifest.schemaVersion !== 1) {
  issues.push({ code: 'unique.schema-version', path: 'schemaVersion', message: 'Expected schemaVersion 1.', severity: 'error' });
}

const seenChannels = new Set();
for (const row of channelRows) {
  const id = row && row.id;
  if (!id || typeof row.carrier !== 'string' || !row.carrier) {
    issues.push({ code: 'unique.channel.invalid', path: 'channels', message: 'Channel rows require id and carrier.', severity: 'error' });
    continue;
  }
  if (seenChannels.has(id)) issues.push({ code: 'unique.channel.duplicate', path: id, message: `Duplicate channel ${id}.`, severity: 'error' });
  seenChannels.add(id);
  const carrierPath = isAbsolute(row.carrier) ? row.carrier : join(ROOT, row.carrier);
  if (!existsSync(carrierPath)) {
    issues.push({ code: 'unique.channel.carrier', path: id, message: `Carrier does not exist: ${row.carrier}.`, severity: 'error' });
  }
}

const baseIds = new Set([...WEAPONS, ...MODULES, ...SHIPS, ...COMMODITIES].map((entry) => entry.id));
const slots = new Set();
for (const wreck of manifest.wrecks || []) {
  if (!/^D(?:[1-9]|1[0-2])$/.test(String(wreck.programSlot || ''))) {
    issues.push({ code: 'unique.program-slot', path: wreck.id || '<unknown>', message: `Invalid program slot ${wreck.programSlot || '<none>'}.`, severity: 'error' });
  } else if (slots.has(wreck.programSlot)) {
    issues.push({ code: 'unique.program-slot', path: wreck.programSlot, message: 'Program slot is assigned more than once.', severity: 'error' });
  } else slots.add(wreck.programSlot);

  for (const drop of wreck.uniqueDrops || []) {
    if (!drop || !drop.id || !['weapon', 'module', 'story'].includes(drop.kind)) {
      issues.push({ code: 'unique.drop.schema', path: wreck.id || '<unknown>', message: 'Unique drops require id and weapon/module/story kind.', severity: 'error' });
      continue;
    }
    if (drop.kind !== 'story' && (!drop.baseId || !baseIds.has(drop.baseId))) {
      issues.push({ code: 'unique.drop.base', path: drop.id, message: `Unknown base item ${drop.baseId || '<none>'}.`, severity: 'error' });
    }
  }
  for (const loot of wreck.bonusLoot || []) {
    if (!loot || !baseIds.has(loot.id) || !Number.isFinite(loot.qty) || loot.qty <= 0) {
      issues.push({ code: 'unique.bonus-loot', path: wreck.id || '<unknown>', message: 'bonusLoot requires a real item id and positive quantity.', severity: 'error' });
    }
  }
  for (const source of wreck.rumorSources || []) {
    if (!source || !source.sourceRef || !['reserved', 'authored', 'wired'].includes(source.status)) {
      issues.push({ code: 'unique.rumor.source', path: `${wreck.id || '<unknown>'}.rumorSources`, message: 'Rumor sources require sourceRef and reserved/authored/wired status.', severity: 'error' });
    }
  }
}

if (slots.size !== 12) {
  issues.push({ code: 'unique.program-coverage', path: 'wrecks', message: `Expected D1-D12 reservations, found ${slots.size}.`, severity: 'error' });
}

if (issues.length) {
  throw new Error(`Unique-loot contract failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${formatValidationIssues(issues)}`);
}

const authoredCount = (manifest.wrecks || []).flatMap((wreck) => wreck.rumorSources || [])
  .filter((source) => ['authored', 'wired'].includes(source.status)).length;
console.log(`Unique-loot contract OK: ${manifest.wrecks.length} reserved wrecks, ${authoredCount} authored rumor sources, ${channelIds.length} verified channels, zero station-stocked unique ids.`);

function stationAcquisitionSurfaces() {
  const surfaces = new Map();
  const add = (id, surface) => {
    if (!id) return;
    if (!surfaces.has(id)) surfaces.set(id, []);
    surfaces.get(id).push(surface);
  };
  for (const item of COMMODITIES) add(item.id, 'market');
  for (const item of MODULES) if (Number(item.price) > 0) add(item.id, 'outfitting');
  for (const item of WEAPONS) if (Number(item.price) > 0) add(item.id, 'outfitting');
  for (const ship of SHIPS) add(ship.id, 'shipyard');
  for (const blueprint of BLUEPRINTS) add(blueprint.outputs && blueprint.outputs.id, `manufacture:${blueprint.id}`);
  return surfaces;
}
