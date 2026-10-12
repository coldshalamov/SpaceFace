import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { redact } from './redact.mjs';
import { stableStringify } from './rng.mjs';

export function writeArtifact(file, value) {
  const safe = redact(value);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${stableStringify(safe)}\n`);
  return safe;
}
