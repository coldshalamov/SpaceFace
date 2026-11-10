/**
 * Offline microbench: setHudScreenTransform string-build-then-compare vs numeric early-out.
 * Settled path: same x/y/rotate every call (typical for locked reticle/overlay at rest).
 * Motion path: x/y change every call (still builds string once per change).
 */
function setBefore(el, x, y, opts = null) {
  if (!el) return;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const center = !opts || opts.center !== false;
  const rotate = opts && Number.isFinite(opts.rotate) ? ` rotate(${opts.rotate.toFixed(1)}deg)` : '';
  const offset = (opts && opts.offset) || (center ? 'translate(-50%,-50%)' : '');
  const next = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0) ${offset}${rotate}`.trim();
  if (el._sfHudTransform === next) return;
  el._sfHudTransform = next;
  el.styleTransform = next; // stand-in
  el.writes += 1;
}

function setAfter(el, x, y, opts = null) {
  if (!el) return;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const center = !opts || opts.center !== false;
  const hasRotate = !!(opts && Number.isFinite(opts.rotate));
  const qx = Math.round(nx * 10);
  const qy = Math.round(ny * 10);
  const qr = hasRotate ? Math.round(opts.rotate * 10) : 0;
  if (el._sfHudTx === qx && el._sfHudTy === qy && el._sfHudTr === qr && el._sfHudTc === center
      && el._sfHudTo === ((opts && opts.offset) || '')) {
    return;
  }
  el._sfHudTx = qx;
  el._sfHudTy = qy;
  el._sfHudTr = qr;
  el._sfHudTc = center;
  el._sfHudTo = (opts && opts.offset) || '';
  const rotate = hasRotate ? ` rotate(${opts.rotate.toFixed(1)}deg)` : '';
  const offset = (opts && opts.offset) || (center ? 'translate(-50%,-50%)' : '');
  const next = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0) ${offset}${rotate}`.trim();
  el._sfHudTransform = next;
  el.styleTransform = next;
  el.writes += 1;
}

function makeEl() {
  return { _sfHudTransform: '', styleTransform: '', writes: 0 };
}

const CALLS = 200000;
const els = 12;
const settledOpts = { center: true, rotate: 12.5 };

function run(setFn, mode) {
  const nodes = Array.from({ length: els }, makeEl);
  const t0 = performance.now();
  for (let i = 0; i < CALLS; i++) {
    const el = nodes[i % els];
    if (mode === 'settled') {
      setFn(el, 640.25, 360.5, settledOpts);
    } else {
      setFn(el, 640.25 + (i % 200) * 0.1, 360.5 + (i % 150) * 0.1, {
        center: true,
        rotate: 12.5 + (i % 30) * 0.1,
      });
    }
  }
  const t1 = performance.now();
  let writes = 0;
  for (const n of nodes) writes += n.writes;
  return { ms: t1 - t0, writes, sample: nodes[0].styleTransform };
}

// warmup
run(setBefore, 'settled');
run(setAfter, 'settled');

const beforeSettled = run(setBefore, 'settled');
const afterSettled = run(setAfter, 'settled');
const beforeMotion = run(setBefore, 'motion');
const afterMotion = run(setAfter, 'motion');

const out = {
  name: 'hud-screen-transform-cache',
  calls: CALLS,
  elements: els,
  settled: {
    beforeMs: +beforeSettled.ms.toFixed(3),
    afterMs: +afterSettled.ms.toFixed(3),
    speedup: +(beforeSettled.ms / afterSettled.ms).toFixed(3),
    writesBefore: beforeSettled.writes,
    writesAfter: afterSettled.writes,
    sampleMatch: beforeSettled.sample === afterSettled.sample,
  },
  motion: {
    beforeMs: +beforeMotion.ms.toFixed(3),
    afterMs: +afterMotion.ms.toFixed(3),
    speedup: +(beforeMotion.ms / afterMotion.ms).toFixed(3),
    writesBefore: beforeMotion.writes,
    writesAfter: afterMotion.writes,
  },
};
console.log(JSON.stringify(out, null, 2));
