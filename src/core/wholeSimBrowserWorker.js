// S1 Phase-B stage 8 — browser Worker adapter for the whole-sim host.
//
// Twin of scripts/lib/wholeSimWorker.mjs on the DedicatedWorker transport:
// self.onmessage serializes every directive on the same promise chain (a reload
// await inside tick N still finishes before tick N+1 applies input), stamps
// sendNs just before postMessage, and transfers the pack columns. Reply
// envelope shapes are byte-identical to the node adapter's — ready/tickDone/
// done/bye/error plus 'boot'.
//
// SAB: the arena descriptor rides the init directive (sabArena). Without
// COOP/COEP headers crossOriginIsolated is false and SharedArrayBuffer is
// undefined — the host's bindSabJournalArena degrades to the transfer channel
// on its own, so no guard is needed here beyond the same SAB-transfer skip the
// node adapter does.

import { createSimHost } from '../../scripts/lib/simWorkerHost.mjs';
import { nowNs } from '../../scripts/lib/simRealm.mjs';

const { tick, init, finalize, shutdown, drainStorageOps } = createSimHost();

let chain = Promise.resolve();
self.onmessage = (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;
  chain = chain.then(async () => {
    try {
      if (msg.kind === 'init') {
        const result = await init(msg);
        self.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      } else if (msg.kind === 'tick') {
        const reply = await tick(msg);
        reply.kind = 'tickDone';
        reply.seq = msg.seq;
        reply.sendNs = Number(nowNs());
        const transfers = [];
        for (const col of [reply.pack.scalars, reply.pack.kinds, reply.pack.typeIndex]) {
          if (col.byteLength && !(typeof SharedArrayBuffer === 'function' && col.buffer instanceof SharedArrayBuffer)) transfers.push(col.buffer);
        }
        self.postMessage(reply, transfers);
      } else if (msg.kind === 'finalize') {
        const result = await finalize();
        self.postMessage({ kind: 'done', seq: msg.seq, ...result });
      } else if (msg.kind === 'shutdown') {
        shutdown();
        // storageOps rides every reply kind — writes must not wait for a
        // tickDone that may never come (shutdown races a queued autosave).
        self.postMessage({ kind: 'bye', seq: msg.seq, storageOps: drainStorageOps() });
      }
    } catch (error) {
      self.postMessage({
        kind: 'error',
        seq: msg && msg.seq,
        message: error && error.message ? error.message : String(error),
        stack: error && error.stack ? String(error.stack) : null,
      });
    }
  });
};

self.postMessage({ kind: 'boot', workerDataPresent: false });
