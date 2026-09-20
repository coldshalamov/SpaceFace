#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'assets/ships/parts/places/place_station_trade_hub.glb',
  'assets/ships/parts/wholeships/helios_span.glb',
  'assets/ships/parts/wholeships/wasp_production_v1.glb',
];

function glbJson(abs) {
  const buf = readFileSync(abs);
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
    }
    off += len;
  }
  return null;
}

for (const rel of files) {
  const json = glbJson(resolve(import.meta.dirname || '.', rel));
  console.log(JSON.stringify({
    file: rel.split('/').pop(),
    materials: (json.materials || []).map((m) => m.name),
    extras: json.asset?.extras?.spacefaceAsset || json.asset?.extras || null,
    sceneRoots: ((json.scenes || [])[json.scene ?? 0]?.nodes || []).map((i) => json.nodes?.[i]?.name),
  }, null, 2));
}
