#!/usr/bin/env node
// Prove the sim/render boundary over an in-process MessageChannel before any thread moves.
//
// The gate is digest equality: what the renderer receives across the transport must hash identically
// to what a direct, single-threaded read would have produced, frame for frame. Two owners "looking
// right" proves nothing — a dropped field, a detached buffer or a reordered message all look fine
// until something is subtly in the wrong place.
//
// Doing this in-process is the point. If the ownership boundary and the thread move together and the
// result diverges, there is no way to tell a genuine ownership violation from a transfer artifact,
// and you get to find out across a thread boundary with no shared stack. Here every divergence is
// synchronously debuggable.

import { createPresentationSnapshot, SNAPSHOT_FLAG } from '../src/render/presentationSnapshot.js';
import {
  createSimTransport,
  digestSnapshot,
  packSnapshot,
  unpackSnapshot,
  TRANSPORT_MESSAGE,
} from '../src/core/simTransport.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const FRAMES = 40;
const POPULATION = 300;

/** A deterministic sim step. Same inputs, same outputs, so any divergence is the transport's doing. */
function stepSim(snapshot, frame) {
  snapshot.beginFrame(POPULATION);
  for (let i = 0; i < POPULATION; i++) {
    const t = (frame * 0.05) + i * 0.01;
    const half = t * 0.5;
    snapshot.write(
      i, i % 5,
      Math.sin(t) * 10, i * 0.1, Math.cos(t) * 10,
      0, Math.sin(half), 0, Math.cos(half),
      1, 1, 1,
      i % 9 === 0 ? 0 : SNAPSHOT_FLAG.VISIBLE,
    );
  }
  return snapshot;
}

async function run() {
  // Baseline: the single-threaded path, read directly with no transport in between.
  const baselineDigests = [];
  {
    const snapshot = createPresentationSnapshot({ capacity: 512 });
    for (let frame = 0; frame < FRAMES; frame++) {
      baselineDigests.push(digestSnapshot(stepSim(snapshot, frame)));
    }
  }

  // Separated: the sim publishes across the transport and the renderer digests what it receives.
  const transport = createSimTransport();
  const receivedDigests = [];
  const receivedSequences = [];
  transport.onRender((message) => {
    if (message.kind !== TRANSPORT_MESSAGE.SNAPSHOT) return;
    receivedSequences.push(message.sequence);
    receivedDigests.push(digestSnapshot(unpackSnapshot(message.payload)));
  });

  const simSnapshot = createPresentationSnapshot({ capacity: 512 });
  for (let frame = 0; frame < FRAMES; frame++) {
    transport.publish(TRANSPORT_MESSAGE.SNAPSHOT, packSnapshot(stepSim(simSnapshot, frame)));
  }
  // Let every queued message land. A transport that delivered synchronously would already have run.
  await new Promise((resolve) => setTimeout(resolve, 0));

  check('the transport uses a real MessageChannel', transport.structured,
    'fell back to the queue shim — the production and proven paths differ');
  check('every published frame is delivered', receivedDigests.length === FRAMES,
    `${receivedDigests.length} of ${FRAMES}`);

  const ordered = receivedSequences.every((seq, i) => i === 0 || seq > receivedSequences[i - 1]);
  check('messages arrive in publish order', ordered, receivedSequences.slice(0, 8).join(','));

  const firstDivergence = baselineDigests.findIndex((d, i) => d !== receivedDigests[i]);
  check('separated digests match the single-threaded baseline, frame for frame',
    firstDivergence === -1,
    firstDivergence >= 0
      ? `frame ${firstDivergence}: baseline ${baselineDigests[firstDivergence]} vs received ${receivedDigests[firstDivergence]}`
      : '');

  // The digest has to be able to fail, or none of the above means anything.
  {
    const snapshot = stepSim(createPresentationSnapshot({ capacity: 512 }), 0);
    const before = digestSnapshot(snapshot);
    snapshot.columns.position[0] += 0.01;
    check('the digest detects a moved entity', digestSnapshot(snapshot) !== before,
      'digest is insensitive to position — it would never catch divergence');
  }

  // Ownership: the payload the renderer sees must be a copy, so writing to it cannot reach the sim.
  {
    const snapshot = stepSim(createPresentationSnapshot({ capacity: 512 }), 3);
    const packed = packSnapshot(snapshot);
    packed.position[0] = 12345;
    check('the published payload is a copy, not a view onto sim state',
      snapshot.columns.position[0] !== 12345,
      'the renderer can mutate sim state through the payload');
  }

  transport.close();
}

await run();
console.log(`\n${failures === 0 ? 'sim transport: separated owners agree with the baseline' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
