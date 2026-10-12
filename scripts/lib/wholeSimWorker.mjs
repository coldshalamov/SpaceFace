// S1 Phase-B stage 6 — worker_threads adapter for the whole-sim host.
//
// All sim + channel machinery lives in simWorkerHost.mjs so SIM_LANE=main runs
// the identical directive → step → reply path in-process. This file is only the
// transport adapter: serialize every directive on a promise chain (a reload
// await inside tick N must finish before tick N+1 applies input), stamp sendNs
// just before postMessage, and hand back the typed-array transfer list.
//
// SAB envelope (arena layout v2): once init binds the arena, the worker arms
// the shared cmd/reply cell rings — the main lane stops postMessage-ing
// directives and the worker parks on Atomics.wait instead of the message port.
// tickDone replies write through the reply ring (pack columns ride a SAB
// descriptor or the cell's binary tail); rare kinds (ready/done/bye/error)
// keep postMessage. See scripts/lib/simSabEnvelope.mjs for the channel rules.

import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createSimHost, bindSabJournalArena } from './simWorkerHost.mjs';
import { installRealmFs } from './simRealm.mjs';
import {
  bindSabEnvelopeChannel,
  encodeReplyForSab,
  sabEnvelopeDrain,
  sabEnvelopePostReply,
  sabEnvelopeWaitCommand,
  SAB_CMD_SEQ_INDEX,
  SAB_ENV_KIND,
} from './simSabEnvelope.mjs';
import { SAB_V8_CODEC } from './simSabV8Codec.mjs';

installRealmFs({ readFileSync, resolve });

const { tick, init, finalize, shutdown, drainStorageOps } = createSimHost();

let chain = Promise.resolve();
let sabEnv = null;

// One directive, one dispatch — shared by the pre-arm message path and the
// post-arm ring park loop. Returns true only for 'shutdown'.
async function dispatchDirective(msg) {
  try {
    if (msg.kind === 'init') {
      const result = await init(msg);
      parentPort.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      // Arm the envelope rings only after 'ready' posts — the channel contract
      // flips post-arm and stray pre-arm messages must drain first.
      const arena = bindSabJournalArena(msg.sabArena);
      if (arena) {
        // v8.serialize: node realms share the postMessage serializer — faster
        // than JSON on the heavy tickDone payloads and BigInt-native.
        sabEnv = bindSabEnvelopeChannel(arena, SAB_V8_CODEC);
        if (sabEnv) void sabParkLoop();
      }
    } else if (msg.kind === 'tick') {
      const reply = await tick(msg);
      reply.kind = 'tickDone';
      reply.seq = msg.seq;
      reply.sendNs = Number(process.hrtime.bigint());
      if (sabEnv) {
        const { msg: wire, binTail } = encodeReplyForSab(reply);
        sabEnvelopePostReply(sabEnv, wire, SAB_ENV_KIND.TICK_DONE, binTail);
      } else {
        const transfers = [];
        // Stage-7 item C: SAB-backed pack columns post as shared memory — the
        // SAB itself must never hit the transfer list (it isn't transferable
        // and transferring it would detach the arena).
        for (const col of [reply.pack.scalars, reply.pack.kinds, reply.pack.typeIndex]) {
          if (col.byteLength && !(typeof SharedArrayBuffer === 'function' && col.buffer instanceof SharedArrayBuffer)) transfers.push(col.buffer);
        }
        parentPort.postMessage(reply, transfers);
      }
    } else if (msg.kind === 'finalize') {
      const result = await finalize();
      parentPort.postMessage({ kind: 'done', seq: msg.seq, ...result });
    } else if (msg.kind === 'shutdown') {
      shutdown();
      parentPort.postMessage({ kind: 'bye', seq: msg.seq, storageOps: drainStorageOps() });
      return true;
    }
  } catch (error) {
    parentPort.postMessage({
      kind: 'error',
      seq: msg && msg.seq,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack) : null,
    });
  }
  return false;
}

// Post-arm pump: drain ready command cells, dispatch each in FIFO, then park
// the thread on the seq counter until the next writer store. `seen` is read
// BEFORE the drain — a post landing mid-dispatch is already in the counter
// and must make the next wait fall through to another drain pass; reading it
// after the drain would sleep past that post forever. Legal to block here —
// a worker thread owns no frames.
async function sabParkLoop() {
  for (;;) {
    const seen = Atomics.load(sabEnv.header, SAB_CMD_SEQ_INDEX);
    const batch = [];
    sabEnvelopeDrain(sabEnv, 'cmd', (msg) => batch.push(msg));
    for (const msg of batch) {
      if (await dispatchDirective(msg)) return;
    }
    sabEnvelopeWaitCommand(sabEnv, seen);
  }
}

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  chain = chain.then(() => dispatchDirective(msg));
});

parentPort.postMessage({ kind: 'boot', workerDataPresent: workerData != null });
