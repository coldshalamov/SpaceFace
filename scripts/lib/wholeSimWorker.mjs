// S1 Phase-B stage 6 — worker_threads adapter for the whole-sim host.
//
// All sim + channel machinery lives in simWorkerHost.mjs so SIM_LANE=main runs
// the identical directive → step → reply path in-process. This file is only the
// transport adapter: serialize every directive on a promise chain (a reload
// await inside tick N must finish before tick N+1 applies input), stamp sendNs
// just before postMessage, and hand back the typed-array transfer list.

import { parentPort, workerData } from 'node:worker_threads';

import { createSimHost } from './simWorkerHost.mjs';

const { tick, init, finalize, shutdown } = createSimHost();

let chain = Promise.resolve();
parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  chain = chain.then(async () => {
    try {
      if (msg.kind === 'init') {
        const result = await init(msg);
        parentPort.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      } else if (msg.kind === 'tick') {
        const reply = await tick(msg);
        reply.kind = 'tickDone';
        reply.seq = msg.seq;
        reply.sendNs = Number(process.hrtime.bigint());
        const transfers = [];
        if (reply.pack.scalars.byteLength) transfers.push(reply.pack.scalars.buffer);
        if (reply.pack.kinds.byteLength) transfers.push(reply.pack.kinds.buffer);
        if (reply.pack.typeIndex.byteLength) transfers.push(reply.pack.typeIndex.buffer);
        parentPort.postMessage(reply, transfers);
      } else if (msg.kind === 'finalize') {
        const result = await finalize();
        parentPort.postMessage({ kind: 'done', seq: msg.seq, ...result });
      } else if (msg.kind === 'shutdown') {
        shutdown();
        parentPort.postMessage({ kind: 'bye', seq: msg.seq });
      }
    } catch (error) {
      parentPort.postMessage({
        kind: 'error',
        seq: msg && msg.seq,
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? String(error.stack) : null,
      });
    }
  });
});

parentPort.postMessage({ kind: 'boot', workerDataPresent: workerData != null });
