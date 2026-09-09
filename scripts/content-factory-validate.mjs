#!/usr/bin/env node
// PQ-133.12 — validate authored modifiers / wave recipes. Local only.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  validateFactoryModifier,
  validateFactoryRecipe,
} from '../src/contracts/contentFactory.js';
import {
  FACTORY_MODIFIER,
  FACTORY_WAVE_RECIPE,
} from '../src/data/contentFactoryExamples.js';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function print(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

const args = process.argv.slice(2);
let kind = 'examples';
let file = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--modifier' || args[i] === '--recipe') {
    kind = args[i].slice(2);
    file = args[i + 1];
    i += 1;
  } else if (args[i] === '--examples') kind = 'examples';
}

if (kind === 'modifier' && file) {
  print(validateFactoryModifier(readJson(resolve(file)), { requireLoc: true }));
} else if (kind === 'recipe' && file) {
  print(validateFactoryRecipe(readJson(resolve(file)), { requireLoc: true }));
} else {
  const modifier = validateFactoryModifier(FACTORY_MODIFIER, { requireLoc: true });
  const recipe = validateFactoryRecipe(FACTORY_WAVE_RECIPE, { requireLoc: true });
  print({
    ok: modifier.ok && recipe.ok,
    modifier,
    recipe,
  });
}

void pathToFileURL;
