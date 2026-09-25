/**
 * Offline microbench: setText textContent-read vs _sfText cache.
 * Models settled HUD: many elements, mostly unchanged labels each tick.
 */
function setTextBefore(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
function setTextAfter(el, text) {
  if (!el) return;
  if (el._sfText === text) return;
  el._sfText = text;
  el.textContent = text;
}

function makeEl(initial) {
  let reads = 0;
  let writes = 0;
  let value = initial;
  return {
    get textContent() { reads += 1; return value; },
    set textContent(v) { writes += 1; value = String(v); },
    getReads() { return reads; },
    getWrites() { return writes; },
    resetCounters() { reads = 0; writes = 0; },
  };
}

const ELS = 48; // approx distinct HUD text nodes touched on a slow tick
const TICKS = 20000; // ~33 min of 10 Hz, scaled for wall
const CHANGE_EVERY = 200; // rare real change (credits/speed)

function run(mode) {
  const els = Array.from({ length: ELS }, (_, i) => makeEl(`v${i}`));
  // prime after-cache
  if (mode === 'after') {
    for (let i = 0; i < ELS; i++) setTextAfter(els[i], `v${i}`);
    for (const el of els) el.resetCounters();
  }
  const t0 = performance.now();
  let reads = 0, writes = 0;
  for (let t = 0; t < TICKS; t++) {
    const bump = (t % CHANGE_EVERY) === 0;
    for (let i = 0; i < ELS; i++) {
      const text = bump ? `v${i}-${t}` : `v${i}`;
      if (mode === 'before') setTextBefore(els[i], text);
      else setTextAfter(els[i], text);
    }
  }
  for (const el of els) { reads += el.getReads(); writes += el.getWrites(); }
  return { ms: performance.now() - t0, reads, writes };
}

run('before'); run('after');
const before = run('before');
const after = run('after');
const out = {
  label: 'hud-settext-cache',
  elements: ELS,
  ticks: TICKS,
  changeEvery: CHANGE_EVERY,
  before: { ms: +before.ms.toFixed(3), reads: before.reads, writes: before.writes },
  after: { ms: +after.ms.toFixed(3), reads: after.reads, writes: after.writes },
  speedup: +(before.ms / Math.max(1e-9, after.ms)).toFixed(3),
  readReduction: +(1 - after.reads / Math.max(1, before.reads)).toFixed(4),
};
console.log(JSON.stringify(out, null, 2));
