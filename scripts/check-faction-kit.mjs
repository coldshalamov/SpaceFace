#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FACTION_KITS } from '../src/data/factions/index.js';
import { FACTION_PALETTES, PAINT_PROFILES } from '../src/data/palettes.js';
import {
  FACTION_PALETTE_CLAIMS,
  FACTION_PALETTE_COLLISIONS,
} from '../src/data/factionPaletteClaims.js';
import {
  formatValidationIssues,
  validateFactionKitContract,
} from './lib/depthProgramValidators.mjs';

const args = process.argv.slice(2);
const fixtureAt = args.indexOf('--fixture');
const fixture = fixtureAt >= 0 && args[fixtureAt + 1]
  ? JSON.parse(readFileSync(resolve(args[fixtureAt + 1]), 'utf8'))
  : null;
const kits = fixture ? fixture.kits : FACTION_KITS;
const paintProfiles = fixture ? fixture.paintProfiles : PAINT_PROFILES;
const factionPalettes = fixture ? (fixture.factionPalettes || null) : FACTION_PALETTES;
const paletteClaims = fixture ? fixture.paletteClaims : FACTION_PALETTE_CLAIMS;
const allowedPaletteCollisions = fixture ? (fixture.allowedPaletteCollisions || []) : FACTION_PALETTE_COLLISIONS;

const issues = validateFactionKitContract({
  kits,
  paintProfiles,
  factionPalettes,
  paletteClaims,
  allowedPaletteCollisions,
});

if (issues.length) {
  throw new Error(`Faction-kit contract failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${formatValidationIssues(issues)}`);
}

console.log(`Faction-kit contract OK: ${kits.length} modular kits, symmetric relations, paint profiles, and ${paletteClaims.length} palette claims.`);
