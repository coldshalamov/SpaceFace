// Unit test: shipped COMMODITIES merge exposes flavor from commodityFlavor.js on every record.
import { COMMODITIES, COMMODITY_FLAVOR } from '../src/data/commodities.js';
import { COMMODITY_FLAVOR as FLAVOR_SOURCE } from '../src/data/commodityFlavor.js';
import { wordCount } from '../scripts/check-commodity-flavor.mjs';

const PLACE_FACTION_RE = /\b(ceres|helios|vael|meridian|concord|reach|luna|kuiper|outer)\b/i;

let failures = 0;

if (COMMODITIES.length !== 43) {
  console.error(`expected 43 commodities, got ${COMMODITIES.length}`);
  failures++;
}

if (Object.keys(COMMODITY_FLAVOR).length !== 43) {
  console.error(`expected 43 flavor keys, got ${Object.keys(COMMODITY_FLAVOR).length}`);
  failures++;
}

if (COMMODITY_FLAVOR !== FLAVOR_SOURCE) {
  console.error('COMMODITY_FLAVOR re-export must reference commodityFlavor.js source');
  failures++;
}

for (const cmdty of COMMODITIES) {
  const { id, name, displayName, desc, lore } = cmdty;
  const flavor = COMMODITY_FLAVOR[id];

  if (!flavor) {
    console.error(`missing COMMODITY_FLAVOR entry: ${id}`);
    failures++;
    continue;
  }

  if (!displayName || !desc || !lore) {
    console.error(`merged record missing flavor fields: ${id}`);
    failures++;
  }

  if (displayName === name) {
    console.error(`displayName must differ from name: ${id}`);
    failures++;
  }

  if (wordCount(desc) > 16) {
    console.error(`desc too long (${wordCount(desc)}w): ${id}`);
    failures++;
  }

  if (wordCount(lore) > 30) {
    console.error(`lore too long (${wordCount(lore)}w): ${id}`);
    failures++;
  }

  if (!PLACE_FACTION_RE.test(lore)) {
    console.error(`lore missing place/faction: ${id}`);
    failures++;
  }
}

if (failures) {
  console.error(`commodity-flavor.test: ${failures} failures`);
  process.exit(1);
}

console.log('commodity-flavor.test: ok (43 commodities, flavor merged)');
process.exit(0);