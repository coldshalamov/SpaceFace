// SAB envelope channel — stage C: the two per-tick wire envelopes (tick
// directive main→worker, tickDone reply worker→main) ride fixed cells inside
// the journal arena instead of postMessage. The postMessage wake hop measured
// ~0.85 ms p95 on worker_threads (platform wake latency, payload-independent);
// an Atomics notify hop measures ~0.10 ms. The pack columns already cross in
// shared memory — this moves the last per-tick postMessage pair.
//
// Layout: after the journal slots the arena grows two rings of envelope cells.
// Each cell: a 32-byte Int32 head {status, seq, kind, jsonLen, binLen} followed
// by a UTF-8 JSON payload and an optional binary tail (array-backed journal
// packs memcpy into the tail — no JSON encode, exact bytes, ordering stays
// single-channel).
//
//   writer: fill payload -> fill head fields -> Atomics.store(status, READY)
//           -> Atomics.add(header, SEQ_INDEX, 1) -> Atomics.notify
//   reader: Atomics.wait on the seq cell (worker — blocking is legal on a
//           dedicated thread) or Atomics.waitAsync (main — non-blocking),
//           then drains status==READY cells in ring order and stores FREE.
//
// Ordering is single-channel end-to-end: every directive kind that can arrive
// post-arm rides the command ring (tick/finalize/shutdown), every reply kind
// rides the reply ring. postMessage survives only for pre-arm traffic (boot,
// init handshake) and rare out-of-band kinds (error posts) — never a payload
// the ring already claimed, so no cross-channel merge exists.
//
// Fail-closed: a payload that cannot serialize into a cell (oversize,
// non-JSON) throws at the writer — the lane's existing fail path reports it;
// there is no silent postMessage fallback because a parked worker cannot see
// one. A full reply ring parks the writer on the FREE counter with a stall
// bound; overflow then throws into the same fail path rather than splitting
// channels mid-stream.

// Layout constants mirror scripts/lib/simWorkerHost.mjs — the envelope module
// is imported by simWorkerHost for arena sizing, so it must not import back.
const SAB_HEADER_BYTES = 64;
const SAB_SLOT_BYTES_PER_RECORD = 18 * 8 + 1 + 2;

// Envelope head indices inside each cell's Int32 view.
export const SAB_ENV_STATUS = 0; // 0 = FREE, 1 = READY
export const SAB_ENV_SEQ = 1;
export const SAB_ENV_KIND_IDX = 2;
export const SAB_ENV_JSON_LEN = 3;
export const SAB_ENV_BIN_LEN = 4;
export const SAB_ENV_CODEC_IDX = 5;    // 0 = JSON (bigint→number), 1+ = caller codec
const SAB_ENV_HEAD_BYTES = 32; // 8 Int32 slots — payload starts f64-aligned

// Arena header cells (the journal arena's Int32 header is 16 slots; [4..12)
// are the slot busy bits).
export const SAB_CMD_SEQ_INDEX = 13;    // monotonically increasing write count
export const SAB_REPLY_SEQ_INDEX = 14;  // reply posts
export const SAB_REPLY_FREE_INDEX = 15; // replies the reader freed (writer parks on this)

export const SAB_ENV_KIND = Object.freeze({
  TICK: 1,
  TICK_DONE: 2,
  FINALIZE: 3,
  DONE: 4,
  SHUTDOWN: 5,
  BYE: 6,
  ERROR: 7,
  OTHER: 8,
});

const ENV_CMD_RING = 4;
const ENV_CMD_PAYLOAD_BYTES = 256 * 1024;
const ENV_REPLY_RING = 4;
// JSON headroom 64 KB + binary tail for a full array-backed pack
// (4096 records x (18 f64 + u8 + u16) = 602 112 B) + slack.
const ENV_REPLY_PAYLOAD_BYTES = 64 * 1024 + 640 * 1024;
const ENV_REPLY_STALL_MS = 5000;

function alignTo(value, bytes) {
  return Math.ceil(value / bytes) * bytes;
}

// Byte offsets for the envelope region — the journal arena is laid out
// [header][slots][cmd ring][reply ring]. Version 2 of the arena layout.
export function sabEnvelopeRegionLayout({ slotCount, recordCap }) {
  const slotBytes = recordCap * SAB_SLOT_BYTES_PER_RECORD;
  const journalEnd = SAB_HEADER_BYTES + slotCount * slotBytes;
  const cmdBase = alignTo(journalEnd, 8);
  const cmdCellBytes = alignTo(SAB_ENV_HEAD_BYTES + ENV_CMD_PAYLOAD_BYTES, 8);
  const replyBase = alignTo(cmdBase + ENV_CMD_RING * cmdCellBytes, 8);
  const replyCellBytes = alignTo(SAB_ENV_HEAD_BYTES + ENV_REPLY_PAYLOAD_BYTES, 8);
  const totalBytes = alignTo(replyBase + ENV_REPLY_RING * replyCellBytes, 8);
  return {
    cmdBase, cmdCellBytes, cmdRing: ENV_CMD_RING, cmdPayloadBytes: ENV_CMD_PAYLOAD_BYTES,
    replyBase, replyCellBytes, replyRing: ENV_REPLY_RING,
    replyPayloadBytes: ENV_REPLY_PAYLOAD_BYTES,
    totalBytes,
  };
}

// Total arena bytes for layout v2 (journal slots + both envelope rings). Both
// arena creators (host + lane journal) size off this so the descriptor carries
// the envelope region end to end.
export function sabArenaTotalBytes({ slotCount, recordCap }) {
  return sabEnvelopeRegionLayout({ slotCount, recordCap }).totalBytes;
}

// Wrap a bound arena ({ sab, header, slotCount, recordCap }) with the two cell
// rings. `codec` is the writer's payload codec — the head stamps its code per
// cell and decode dispatches on the flag (JSON stays the universal read).
// Returns null when the arena predates layout v2 (no envelope region).
export function bindSabEnvelopeChannel(arena, codec = null) {
  if (!arena || !arena.sab || !arena.header) return null;
  const layout = sabEnvelopeRegionLayout(arena);
  if (arena.sab.byteLength < layout.totalBytes) return null;
  const { sab } = arena;
  const mkCell = (base) => ({
    head: new Int32Array(sab, base, 8),
    payload: new Uint8Array(sab, base + SAB_ENV_HEAD_BYTES),
  });
  const cmd = { cells: [], nextWrite: 0 };
  for (let i = 0; i < ENV_CMD_RING; i++) cmd.cells.push(mkCell(layout.cmdBase + i * layout.cmdCellBytes));
  const reply = { cells: [], nextWrite: 0 };
  for (let i = 0; i < ENV_REPLY_RING; i++) reply.cells.push(mkCell(layout.replyBase + i * layout.replyCellBytes));
  return { sab, header: arena.header, cmd, reply, layout, codec: codec || null };
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Default codec — UTF-8 JSON. The structured-clone wire carried BigInt fields
// (arrivalNs et al.); JSON has none — degrade to number, safe under 2^53 for
// nanosecond values. Callers may pass {code, into(msg,dest)=>n, from(buf)=>msg}
// to bindSabEnvelopeChannel for a faster codec (node's v8.serialize rides as
// code 1 — see scripts/lib/simSabV8Codec.mjs); the head stamps the codec so
// the reader decodes by flag, not by which side it is.
const JSON_CODEC = {
  code: 0,
  into(msg, dest) {
    const text = JSON.stringify(msg, (k, v) => (typeof v === 'bigint' ? Number(v) : v));
    if (text === undefined) throw new Error('sab envelope: payload not serializable');
    const { read, written } = textEncoder.encodeInto(text, dest);
    if (read < text.length) {
      throw new Error(`sab envelope: payload ${text.length} chars exceeds ${dest.byteLength}-byte cell`);
    }
    return written;
  },
  from(buf) { return JSON.parse(textDecoder.decode(buf)); },
};

// Writer-side envelope post. binTail is an optional Uint8Array/typed array
// copied after the JSON payload. Returns the assigned seq; throws fail-closed
// when the cell is occupied or the payload does not fit.
export function sabEnvelopePost(channel, ring, msg, kindCode, binTail = null) {
  const cells = ring === 'cmd' ? channel.cmd.cells : channel.reply.cells;
  const seqIndex = ring === 'cmd' ? SAB_CMD_SEQ_INDEX : SAB_REPLY_SEQ_INDEX;
  const budget = ring === 'cmd' ? channel.layout.cmdPayloadBytes : channel.layout.replyPayloadBytes;
  const which = ring === 'cmd' ? channel.cmd : channel.reply;
  const cell = cells[which.nextWrite];
  if (Atomics.load(cell.head, SAB_ENV_STATUS) !== 0) {
    throw new Error(`sab envelope: ${ring} cell ${which.nextWrite} still occupied (seq ${Atomics.load(cell.head, SAB_ENV_SEQ)})`);
  }
  // Codec payload first — the tail lands after it, so both lengths must fit.
  const codec = channel.codec || JSON_CODEC;
  const jsonLen = codec.into(msg, cell.payload.subarray(0, budget));
  let binLen = 0;
  if (binTail && binTail.byteLength > 0) {
    binLen = binTail.byteLength;
    if (jsonLen + binLen > budget) {
      throw new Error(`sab envelope: payload ${jsonLen} + tail ${binLen} exceeds ${budget}-byte cell`);
    }
    cell.payload.set(new Uint8Array(binTail.buffer, binTail.byteOffset, binTail.byteLength), jsonLen);
  }
  const seq = Atomics.load(channel.header, seqIndex) + 1;
  cell.head[SAB_ENV_SEQ] = seq;
  cell.head[SAB_ENV_KIND_IDX] = kindCode;
  cell.head[SAB_ENV_JSON_LEN] = jsonLen;
  cell.head[SAB_ENV_BIN_LEN] = binLen;
  cell.head[SAB_ENV_CODEC_IDX] = codec.code;
  Atomics.store(cell.head, SAB_ENV_STATUS, 1);
  Atomics.store(channel.header, seqIndex, seq);
  Atomics.notify(channel.header, seqIndex);
  which.nextWrite = (which.nextWrite + 1) % cells.length;
  return seq;
}

// Reply-ring writer with bounded park: when every reply cell is occupied the
// worker waits on SAB_REPLY_FREE_INDEX (main stores the consumed count there
// after freeing a cell). Waits only happen once a tick's directive finished —
// the sim thread is genuinely idle for the envelope hop.
export function sabEnvelopePostReply(channel, msg, kindCode, binTail = null) {
  const cell = channel.reply.cells[channel.reply.nextWrite];
  if (Atomics.load(cell.head, SAB_ENV_STATUS) !== 0) {
    const seen = Atomics.load(channel.header, SAB_REPLY_FREE_INDEX);
    const deadline = Date.now() + ENV_REPLY_STALL_MS;
    let spun = false;
    while (Atomics.load(cell.head, SAB_ENV_STATUS) !== 0) {
      spun = true;
      const r = Atomics.wait(channel.header, SAB_REPLY_FREE_INDEX, seen, 250);
      if (r === 'timed-out' && Date.now() > deadline) {
        throw new Error(`sab envelope: reply ring occupied >${ENV_REPLY_STALL_MS}ms — main consume stalled`);
      }
      if (r === 'ok' && Atomics.load(channel.header, SAB_REPLY_FREE_INDEX) === seen && Date.now() > deadline) {
        throw new Error(`sab envelope: reply ring freed no cells >${ENV_REPLY_STALL_MS}ms`);
      }
    }
    void spun;
  }
  return sabEnvelopePost(channel, 'reply', msg, kindCode, binTail);
}

// Drain ready cells from a ring in ring order. cb(msg, cell, binView) — the
// binView is a Uint8Array over the cell's tail (copy before releasing).
export function sabEnvelopeDrain(channel, ring, cb) {
  const cells = ring === 'cmd' ? channel.cmd.cells : channel.reply.cells;
  const ready = [];
  for (const cell of cells) {
    if (Atomics.load(cell.head, SAB_ENV_STATUS) === 1) ready.push(cell);
  }
  // Process in seq order — a single producer writes cells in ring order, but
  // draining by seq keeps the wire's FIFO contract if a cell ever lands late.
  ready.sort((a, b) => a.head[SAB_ENV_SEQ] - b.head[SAB_ENV_SEQ]);
  let drained = 0;
  for (const cell of ready) {
    const jsonLen = cell.head[SAB_ENV_JSON_LEN];
    const binLen = cell.head[SAB_ENV_BIN_LEN];
    const codecCode = cell.head[SAB_ENV_CODEC_IDX];
    const decoder = codecCode === 0 ? JSON_CODEC : channel.codec;
    const msg = decoder.from(cell.payload.subarray(0, jsonLen));
    const bin = binLen > 0 ? cell.payload.subarray(jsonLen, jsonLen + binLen) : null;
    cb(msg, cell, bin, cell.head[SAB_ENV_SEQ], cell.head[SAB_ENV_KIND_IDX]);
    Atomics.store(cell.head, SAB_ENV_STATUS, 0);
    drained++;
    if (ring === 'reply') {
      Atomics.add(channel.header, SAB_REPLY_FREE_INDEX, 1);
      Atomics.notify(channel.header, SAB_REPLY_FREE_INDEX);
    }
  }
  return drained;
}

// Worker park loop helper: waits on the command seq cell until it advances
// past `seen`. Returns the new counter value.
export function sabEnvelopeWaitCommand(channel, seen) {
  for (;;) {
    const current = Atomics.load(channel.header, SAB_CMD_SEQ_INDEX);
    if (current !== seen) return current;
    Atomics.wait(channel.header, SAB_CMD_SEQ_INDEX, seen);
  }
}

// ---------------------------------------------------------------------------
// Journal-pack wire codec — the tickDone reply's `pack` column views cannot
// serialize (typed arrays). SAB-backed packs ship as a descriptor the reader
// re-views over the journal slots; array-backed packs (slot-full or oversized
// fallback) memcpy into the cell's binary tail — `binPack` byte lengths let the
// reader slice the three columns back out. Ordering stays single-channel:
// no pack ever splits across postMessage once the ring is armed.
// ---------------------------------------------------------------------------

// Worker→main encode. Returns { msg, binTail } — post through sabEnvelopePostReply.
export function encodeReplyForSab(reply) {
  const pack = reply && reply.pack;
  if (!pack || typeof pack !== 'object') return { msg: reply, binTail: null };
  if (pack.sab === true) {
    const { scalars, kinds, typeIndex, ...desc } = pack;
    return { msg: { ...reply, pack: { ...desc } }, binTail: null };
  }
  const sLen = pack.scalars.byteLength;
  const kLen = pack.kinds.byteLength;
  const tLen = pack.typeIndex.byteLength;
  // Tail order [scalars | typeIndex | kinds] keeps the u16 column 2-aligned
  // regardless of record count.
  const binTail = new Uint8Array(sLen + tLen + kLen);
  binTail.set(new Uint8Array(pack.scalars.buffer, pack.scalars.byteOffset, sLen), 0);
  binTail.set(new Uint8Array(pack.typeIndex.buffer, pack.typeIndex.byteOffset, tLen), sLen);
  binTail.set(new Uint8Array(pack.kinds.buffer, pack.kinds.byteOffset, kLen), sLen + tLen);
  const { scalars, kinds, typeIndex, ...desc } = pack;
  return {
    msg: { ...reply, pack: { ...desc, binPack: [sLen, kLen, tLen] } },
    binTail,
  };
}

// Main←worker decode — the inverse of encodeReplyForSab. `packViewsFor` is the
// caller's SAB-slot view accessor ((sabSlot, count) => { scalars, kinds,
// typeIndex }) or null when the main side holds no arena binding (array-backed
// packs still decode — they need no arena). Returns a reply whose `pack` is
// the same shape postMessage used to deliver.
export function decodeReplyFromSab(msg, bin, packViewsFor) {
  const pack = msg && msg.pack;
  if (!pack || typeof pack !== 'object') return msg;
  if (pack.sab === true) {
    const views = packViewsFor && packViewsFor(pack.sabSlot, pack.count);
    if (!views) return { ...msg, pack: { ...pack, scalars: new Float64Array(0), kinds: new Uint8Array(0), typeIndex: new Uint16Array(0) } };
    return { ...msg, pack: { ...pack, ...views } };
  }
  if (Array.isArray(pack.binPack)) {
    const [sLen, kLen, tLen] = pack.binPack;
    if (sLen + kLen + tLen > 0 && (!bin || bin.byteLength < sLen + kLen + tLen)) return msg;
    // Copy out of the SAB cell before viewing: the bin view's byteOffset is not
    // aligned for f64/u16 typed views, and the cell recycles after release.
    const tail = bin ? bin.slice(0) : new Uint8Array(0);
    const scalars = new Float64Array(tail.buffer, 0, sLen / 8);
    const typeIndex = new Uint16Array(tail.buffer, sLen, tLen / 2);
    const kinds = new Uint8Array(tail.buffer, sLen + tLen, kLen);
    const { binPack, ...rest } = pack;
    return { ...msg, pack: { ...rest, scalars, kinds, typeIndex } };
  }
  return msg;
}

// Main-side pump: Atomics.waitAsync resolves on the writer's notify without
// blocking the frame thread. Returns a promise for the next reply seq past
// `seen`, or null when waitAsync is unavailable (caller falls back to
// postMessage / periodic drain).
export function sabEnvelopeAwaitReply(channel, seen, timeoutMs = 5000) {
  if (typeof Atomics.waitAsync !== 'function') return null;
  const current = Atomics.load(channel.header, SAB_REPLY_SEQ_INDEX);
  if (current !== seen) return Promise.resolve(current);
  const r = Atomics.waitAsync(channel.header, SAB_REPLY_SEQ_INDEX, seen, timeoutMs);
  if (!r.async) return Promise.resolve(Atomics.load(channel.header, SAB_REPLY_SEQ_INDEX));
  return r.value.then(() => Atomics.load(channel.header, SAB_REPLY_SEQ_INDEX), () => Atomics.load(channel.header, SAB_REPLY_SEQ_INDEX));
}
