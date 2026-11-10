/**
 * Offline microbench: opticalGLag translate3d string-build-then-setStyle vs quantized early-out.
 * Before models the old call-site gate (if non-zero → toFixed template; else plain).
 */
function setBefore(el, x, y, opts = null) {
  if (!el) return;
  const suffix = (opts && opts.suffix) || '';
  const plain = (opts && Object.prototype.hasOwnProperty.call(opts, 'plain')) ? opts.plain : 'none';
  const next = (x !== 0 || y !== 0)
    ? `translate3d(${Number(x).toFixed(2)}px,${Number(y).toFixed(2)}px,0)${suffix}`
    : plain;
  const cache = el._sfStyle || (el._sfStyle = Object.create(null));
  if (cache.transform === next) return;
  cache.transform = next;
  el.styleTransform = next;
  el.writes += 1;
}

function setAfter(el, x, y, opts = null) {
  if (!el) return;
  const suffix = (opts && opts.suffix) || '';
  const plain = (opts && Object.prototype.hasOwnProperty.call(opts, 'plain')) ? opts.plain : 'none';
  if (x === 0 && y === 0) {
    if (el._sfLagActive === false && el._sfLagPlain === plain) return;
    el._sfLagActive = false;
    el._sfLagQx = 0;
    el._sfLagQy = 0;
    el._sfLagSuf = '';
    el._sfLagPlain = plain;
    const cache = el._sfStyle || (el._sfStyle = Object.create(null));
    if (cache.transform === plain) return;
    cache.transform = plain;
    el.styleTransform = plain;
    el.writes += 1;
    return;
  }
  const ox = Number(x);
  const oy = Number(y);
  const qx = Math.round(ox * 100);
  const qy = Math.round(oy * 100);
  if (el._sfLagActive === true && el._sfLagQx === qx && el._sfLagQy === qy && el._sfLagSuf === suffix) return;
  el._sfLagActive = true;
  el._sfLagQx = qx;
  el._sfLagQy = qy;
  el._sfLagSuf = suffix;
  el._sfLagPlain = null;
  const next = `translate3d(${(qx / 100).toFixed(2)}px,${(qy / 100).toFixed(2)}px,0)${suffix}`;
  const cache = el._sfStyle || (el._sfStyle = Object.create(null));
  cache.transform = next;
  el.styleTransform = next;
  el.writes += 1;
}

function makeEl() {
  return { _sfStyle: Object.create(null), styleTransform: '', writes: 0 };
}

const CALLS = 200000;
const ELS = 6;
const SUFFIX = ' rotate(45deg)';

function run(setFn, mode) {
  const nodes = Array.from({ length: ELS }, makeEl);
  const t0 = performance.now();
  for (let i = 0; i < CALLS; i++) {
    const el = nodes[i % ELS];
    if (mode === 'settled-zero') {
      setFn(el, 0, 0, { plain: 'none' });
    } else if (mode === 'settled-lag') {
      setFn(el, 3.14159, -2.71828, { suffix: SUFFIX, plain: 'rotate(45deg)' });
    } else {
      setFn(el, 3.14 + (i % 200) * 0.01, -2.71 - (i % 150) * 0.01, {
        suffix: SUFFIX,
        plain: 'rotate(45deg)',
      });
    }
  }
  let writes = 0;
  for (const n of nodes) writes += n.writes;
  return { ms: performance.now() - t0, writes, sample: nodes[0].styleTransform };
}

for (const mode of ['settled-zero', 'settled-lag', 'motion']) {
  run(setBefore, mode); run(setAfter, mode);
}

const out = { name: 'hud-glag-transform-cache', calls: CALLS, elements: ELS, modes: {} };
for (const mode of ['settled-zero', 'settled-lag', 'motion']) {
  const before = run(setBefore, mode);
  const after = run(setAfter, mode);
  out.modes[mode] = {
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(1e-9, after.ms)).toFixed(3),
    writesBefore: before.writes,
    writesAfter: after.writes,
    sampleMatch: before.sample === after.sample,
    sample: after.sample,
  };
}
console.log(JSON.stringify(out, null, 2));
