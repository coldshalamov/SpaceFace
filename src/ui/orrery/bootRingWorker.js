import { createLoadingProgressModel } from '../loadingProgressModel.js';

// Self-contained worker runtime: serialized with the pure factory so source and esbuild bundles
// use the SAME worker, without fragile worker URL rewrites or a second game dependency graph.
export function bootRingWorkerRuntime(makeModel) {
  const model = makeModel();
  let canvas, ctx, scale = 1, timer = null, running = false, reduced = false;
  let frames = 0, lastReport = 0, epoch = 0;
  const marks = new Set();
  function draw() {
    if (!ctx) return;
    const t = performance.now();
    const f = model.tick(t);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, 176, 208);
    const start = -Math.PI / 2, end = start + f * Math.PI * 2;
    const glow = Math.pow(f, 2);
    ctx.lineCap = 'round';
    if (f > 0) {
      // A few narrow strokes on a 176px instrument, not a full-screen blur/compositor layer.
      for (const [width, alpha] of [[10, .025 + .09 * glow], [5, .12 + .20 * glow], [1.8, .95]]) {
        ctx.strokeStyle = `rgba(143,203,255,${alpha})`; ctx.lineWidth = width;
        ctx.beginPath(); ctx.arc(88, 88, 60, start, end); ctx.stroke();
      }
      ctx.fillStyle = '#dfeeff'; ctx.beginPath();
      ctx.arc(88 + 60 * Math.cos(end), 88 + 60 * Math.sin(end), 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(236,230,216,.8)'; ctx.lineWidth = 1;
    for (const mark of marks) {
      const a = mark / 200 * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(88 + 57 * Math.cos(a), 88 + 57 * Math.sin(a));
      ctx.lineTo(88 + 69 * Math.cos(a), 88 + 69 * Math.sin(a)); ctx.stroke();
    }
    ctx.fillStyle = '#b8dcff'; ctx.textAlign = 'center';
    ctx.font = '500 15px system-ui, sans-serif'; ctx.fillText(model.format(), 88, 195);
    frames++;
    if (t - lastReport > 240) {
      lastReport = t;
      postMessage({ type: 'sample', shown: f, frames, epoch, at: performance.timeOrigin + t });
    }
  }
  function loop() {
    timer = null;
    if (!running) return;
    draw();
    timer = setTimeout(loop, reduced ? 250 : 1000 / 30);
  }
  function run() { running = true; if (timer === null) loop(); }
  function stop() { running = false; if (timer !== null) clearTimeout(timer); timer = null; }
  onmessage = ({ data }) => {
    try {
      if (data.type === 'init') {
        canvas = data.canvas; scale = Math.max(1, Math.min(2, data.dpr || 1));
        canvas.width = Math.round(176 * scale); canvas.height = Math.round(208 * scale);
        ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) throw new Error('2D context unavailable');
        canvas.addEventListener?.('contextlost', () => { stop(); postMessage({ type: 'failed' }); });
        model.report(data.stage || { id: 'boot-modules', progress: 0 }, performance.now());
        reduced = data.reduced === true; model.setReduced(reduced);
        draw(); postMessage({ type: 'ready' }); run();
      } else if (data.type === 'stage') {
        if (data.reset) { marks.clear(); epoch = data.epoch ?? epoch + 1; }
        model.report(data.stage, performance.now(), data.reset);
        const value = Math.round((Number(data.stage.progress) || 0) * 200);
        if (value > 0) marks.add(Math.min(200, value));
        draw(); run();
      } else if (data.type === 'set') { model.adopt(Number(data.value)); draw(); }
      else if (data.type === 'mark') { marks.add(Math.max(0, Math.min(199, Math.round(Number(data.value) * 200) || 0))); draw(); }
      else if (data.type === 'finish') { model.finish(); run(); }
      else if (data.type === 'motion') { reduced = data.reduced; model.setReduced(reduced); draw(); }
      else if (data.type === 'pause') stop();
      else if (data.type === 'resume') run();
      else if (data.type === 'destroy') { stop(); close(); }
    } catch (error) { stop(); postMessage({ type: 'failed', message: String(error) }); }
  };
}

export function createBootRingWorker(canvas, { stage, reduced, onReady, onSample, onFailure } = {}) {
  if (typeof globalThis.Worker !== 'function' || typeof canvas?.transferControlToOffscreen !== 'function') return null;
  let worker = null, url = null, deadline = null, disposed = false;
  function revoke() { if (url) URL.revokeObjectURL(url); url = null; }
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(deadline); revoke(); worker?.terminate();
  }
  function fail(error) { dispose(); onFailure?.(error); }
  try {
    const source = `(${bootRingWorkerRuntime.toString()})(${createLoadingProgressModel.toString()});`;
    url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    worker = new Worker(url, { name: 'spaceface-boot-ring' });
    worker.onerror = (event) => { event.preventDefault?.(); fail(event.message); };
    worker.onmessageerror = () => fail('message error');
    worker.onmessage = ({ data }) => {
      if (disposed) return;
      if (data.type === 'ready') { clearTimeout(deadline); revoke(); onReady?.(); }
      else if (data.type === 'sample') onSample?.(data);
      else if (data.type === 'failed') fail(data.message);
    };
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ type: 'init', canvas: offscreen, stage, reduced,
      dpr: Math.min(2, globalThis.devicePixelRatio || 1) }, [offscreen]);
    deadline = setTimeout(() => fail('worker handshake timeout'), 2000);
    return { post(data) { if (!disposed) worker.postMessage(data); }, destroy: dispose };
  } catch (error) { fail(error); return null; }
}
