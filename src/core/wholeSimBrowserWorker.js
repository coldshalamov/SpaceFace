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
//
// SAB envelope (arena layout v2): once init binds the arena, the worker arms
// the shared cmd/reply cell rings — the main lane stops postMessage-ing
// directives and the worker parks on Atomics.wait instead of the message port.
// tickDone replies write through the reply ring (pack columns ride a SAB
// descriptor or the cell's binary tail); rare kinds (ready/done/bye/error)
// keep postMessage. The single producer preserves FIFO either way, and a
// directive that cannot fit a cell posts 'error' through the port — the lane
// fails rather than splitting channels mid-stream.

import { createSimHost, bindSabJournalArena } from '../../scripts/lib/simWorkerHost.mjs';
import { nowNs } from '../../scripts/lib/simRealm.mjs';
import {
  bindSabEnvelopeChannel,
  encodeReplyForSab,
  sabEnvelopeDrain,
  sabEnvelopePostReply,
  sabEnvelopeWaitCommand,
  SAB_CMD_SEQ_INDEX,
  SAB_ENV_KIND,
} from '../../scripts/lib/simSabEnvelope.mjs';

const { tick, init, finalize, shutdown, drainStorageOps } = createSimHost();

let chain = Promise.resolve();
let sabEnv = null;

// One directive, one dispatch — shared by the pre-arm message path and the
// post-arm ring park loop. Returns true only for 'shutdown'.
async function dispatchDirective(msg) {
  try {
    if (msg.kind === 'init') {
      const result = await init(msg);
      self.postMessage({ kind: 'ready', seq: msg.seq, ...result });
      // Arm the envelope rings only after 'ready' posts — the channel contract
      // flips post-arm and stray pre-arm messages must drain first.
      const arena = bindSabJournalArena(msg.sabArena);
      if (arena) {
        sabEnv = bindSabEnvelopeChannel(arena);
        if (sabEnv) void sabParkLoop();
      }
    } else if (msg.kind === 'tick') {
      const reply = await tick(msg);
      reply.kind = 'tickDone';
      reply.seq = msg.seq;
      reply.sendNs = Number(nowNs());
      if (sabEnv) {
        const { msg: wire, binTail } = encodeReplyForSab(reply);
        sabEnvelopePostReply(sabEnv, wire, SAB_ENV_KIND.TICK_DONE, binTail);
      } else {
        const transfers = [];
        for (const col of [reply.pack.scalars, reply.pack.kinds, reply.pack.typeIndex]) {
          if (col.byteLength && !(typeof SharedArrayBuffer === 'function' && col.buffer instanceof SharedArrayBuffer)) transfers.push(col.buffer);
        }
        self.postMessage(reply, transfers);
      }
    } else if (msg.kind === 'finalize') {
      const result = await finalize();
      self.postMessage({ kind: 'done', seq: msg.seq, ...result });
    } else if (msg.kind === 'shutdown') {
      shutdown();
      // storageOps rides every reply kind — writes must not wait for a
      // tickDone that may never come (shutdown races a queued autosave).
      self.postMessage({ kind: 'bye', seq: msg.seq, storageOps: drainStorageOps() });
      return true;
    }
  } catch (error) {
    self.postMessage({
      kind: 'error',
      seq: msg && msg.seq,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack) : null,
    });
  }
  return false;
}

// Post-arm pump: drain ready command cells, dispatch each in FIFO, then park
// the thread on the seq counter until the next writer store. Legal to block
// here — a DedicatedWorker has no frames to keep alive.
async function sabParkLoop() {
  for (;;) {
    // `seen` is read BEFORE the drain — a post landing mid-dispatch is already
    // counted and must make the next wait fall through to another drain pass.
    const seen = Atomics.load(sabEnv.header, SAB_CMD_SEQ_INDEX);
    const batch = [];
    sabEnvelopeDrain(sabEnv, 'cmd', (msg) => batch.push(msg));
    for (const msg of batch) {
      if (await dispatchDirective(msg)) return;
    }
    sabEnvelopeWaitCommand(sabEnv, seen);
  }
}

self.onmessage = (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;
  chain = chain.then(() => dispatchDirective(msg));
};

self.postMessage({ kind: 'boot', workerDataPresent: false });
