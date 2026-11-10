// S1 Phase-B stage-C — node-only v8.serialize codec for the SAB envelope rings.
//
// JSON is the universal default (browser realms, readable dumps); on node both
// sides of the worker lane can ride v8.serialize instead — the same serializer
// postMessage itself uses, so BigInt (arrivalNs), typed arrays, and nested
// reply objects encode natively and ~3-6x faster than JSON for the heavy
// tickDone payloads (domainUpdates, entityVitals, spawnInfos). Codec code 1
// stamps the cell head; readers dispatch on the flag.
//
// Browser callers never import this file — src/core/wholeSimBrowserWorker.js
// keeps the JSON codec (structured clone has no to-buffer API in workers).

import v8 from 'node:v8';

export const SAB_V8_CODEC = Object.freeze({
  code: 1,
  into(msg, dest) {
    const bytes = v8.serialize(msg); // Buffer — a Uint8Array subclass
    if (bytes.byteLength > dest.byteLength) {
      throw new Error(`sab envelope: v8 payload ${bytes.byteLength} exceeds ${dest.byteLength}-byte cell`);
    }
    dest.set(bytes, 0);
    return bytes.byteLength;
  },
  from(buf) {
    // v8.deserialize accepts Buffer/TypedArray — a Uint8Array view over the SAB
    // cell reads straight through (no copy).
    return v8.deserialize(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  },
});
