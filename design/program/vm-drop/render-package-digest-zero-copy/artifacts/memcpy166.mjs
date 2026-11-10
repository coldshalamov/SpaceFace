// Isolated, JIT-warmed main-thread sync cost: copying lane vs keeping lane (#166), double vs single slice (#167).
import { Worker } from 'node:worker_threads';
const sizes = [1, 4, 8, 16].map((m) => m << 20);
const w = new Worker(`const { parentPort } = require('node:worker_threads');
parentPort.on('message', (d) => { parentPort.postMessage({ id: d.id, buffer: d.buffer }, d.keep ? [d.buffer] : []); });`, { eval: true });
const roundTrip = (msg, transfer) => new Promise((r) => { w.once('message', r); w.postMessage(msg, transfer); });
const now = () => performance.now();
const out = {};
for (const size of sizes) {
  const reps = 40;
  const res = { copy: [], keep: [], dbl: [], single: [] };
  for (let r = 0; r < reps + 5; r++) {
    // copy lane: view.slice() then transfer the copy (old sha256Hex)
    let buf = new Uint8Array(size).fill(r & 0xff);
    let t = now(); const c = buf.slice(); w.postMessage({ id: r, buffer: c.buffer, keep: false }, [c.buffer]); const tc = now() - t;
    await new Promise((res2) => w.once('message', res2));
    // keep lane: transfer own buffer, get it back
    buf = new Uint8Array(size).fill(r & 0xff);
    t = now(); w.postMessage({ id: r, buffer: buf.buffer, keep: true }, [buf.buffer]); const tk = now() - t;
    await new Promise((res2) => w.once('message', res2));
    // #167: body slice to bufferView, then copy vs one slice off the body
    const body = new ArrayBuffer(size * 2); new Uint8Array(body).fill(7);
    t = now(); const bv = body.slice(1024, 1024 + size); const x = bv.slice(0); const td = now() - t;
    t = now(); const y = body.slice(1024, 1024 + size); const ts = now() - t;
    if (x.byteLength !== y.byteLength) throw new Error('len');
    if (r >= 5) { res.copy.push(tc); res.keep.push(tk); res.dbl.push(td); res.single.push(ts); }
  }
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  out[`${size >> 20}MB`] = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, +med(v).toFixed(4)]));
}
console.log(JSON.stringify(out));
await w.terminate();
