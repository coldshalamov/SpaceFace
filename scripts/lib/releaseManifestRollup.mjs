import { createHash } from 'node:crypto';

/**
 * Deterministic rollup of every parts/ source listed in release_manifest.json.
 * Sorted by source path; payload is `source:sourceSha256` lines joined by newline.
 */
export function computePartsSourceRollupSha256(entries) {
  const partEntries = (entries || [])
    .filter((e) => typeof e.source === 'string' && e.source.replace(/\\/g, '/').includes('/ships/parts/'))
    .sort((a, b) => a.source.localeCompare(b.source));
  const payload = partEntries.map((e) => `${e.source}:${e.sourceSha256}`).join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function partsSourceEntryCount(entries) {
  return (entries || []).filter((e) => typeof e.source === 'string' && e.source.replace(/\\/g, '/').includes('/ships/parts/')).length;
}