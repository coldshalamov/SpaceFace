function setBefore(el, x, y) {
  const next = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
  if (el._sfTransform === next) return;
  el._sfTransform = next;
  el.styleTransform = next;
  el.writes += 1;
}
function setAfter(el, x, y) {
  const qx = Math.round(Number(x) * 10);
  const qy = Math.round(Number(y) * 10);
  if (el._sfHudTx === qx && el._sfHudTy === qy) return;
  el._sfHudTx = qx;
  el._sfHudTy = qy;
  const next = `translate3d(${(qx / 10).toFixed(1)}px,${(qy / 10).toFixed(1)}px,0) translate(-50%,-50%)`;
  el._sfTransform = next;
  el.styleTransform = next;
  el.writes += 1;
}
function makeEl() { return { writes: 0, styleTransform: '', _sfTransform: '' }; }
const CALLS = 200000;
const ELS = 8;
function run(fn, mode) {
  const nodes = Array.from({ length: ELS }, makeEl);
  const t0 = performance.now();
  for (let i = 0; i < CALLS; i++) {
    const el = nodes[i % ELS];
    if (mode === 'settled') fn(el, 120.25, 40.5);
    else fn(el, 120.25 + (i % 200) * 0.1, 40.5 + (i % 150) * 0.1);
  }
  let writes = 0;
  for (const n of nodes) writes += n.writes;
  return { ms: performance.now() - t0, writes, sample: nodes[0].styleTransform };
}
for (const m of ['settled', 'motion']) { run(setBefore, m); run(setAfter, m); }
const out = { name: 'threat-halo-transform-cache', calls: CALLS, elements: ELS, modes: {} };
for (const mode of ['settled', 'motion']) {
  const b = run(setBefore, mode), a = run(setAfter, mode);
  out.modes[mode] = {
    beforeMs: +b.ms.toFixed(3), afterMs: +a.ms.toFixed(3),
    speedup: +(b.ms / Math.max(1e-9, a.ms)).toFixed(3),
    writesBefore: b.writes, writesAfter: a.writes,
    sampleMatch: b.sample === a.sample, sample: a.sample,
  };
}
console.log(JSON.stringify(out, null, 2));
