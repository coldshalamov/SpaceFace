// Sparkline renderer. Draws an inline price-trend line into a <canvas>. Accepts either a plain
// number[] or a PricePoint[] {mid, buy, sell, t} from priceHistory.js.

/**
 * Draw a sparkline into a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]|{mid:number}[]} values - price series (oldest first); <2 points draws nothing
 * @param {object} [opts]
 */
export function drawSparkline(canvas, values, opts = {}) {
  if (canvas.__sparkAnim) { cancelAnimationFrame(canvas.__sparkAnim); canvas.__sparkAnim = null; }

  if (!canvas || !Array.isArray(values) || values.length < 2) {
    if (canvas) { const c = canvas.getContext('2d'); if (c) c.clearRect(0, 0, canvas.width, canvas.height); }
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  
  const pts = values.map((v) => (v && typeof v === 'object' ? (v.mid != null ? v.mid : (v.buy + v.sell) / 2) : v));
  let min = Infinity, max = -Infinity;
  for (const v of pts) { if (v < min) min = v; if (v > max) max = v; }
  const range = (max - min) || 1;
  const n = pts.length;
  const trend = pts[n - 1] - pts[0];
  const upColor = opts.upColor || '#ffb35c';
  const downColor = opts.downColor || '#4f8fdd';
  const col = trend > 0.0001 ? upColor : trend < -0.0001 ? downColor : (opts.flatColor || '#84a0c8');

  const padT = 3, padB = 3;
  const yFor = (v) => padT + (1 - (v - min) / range) * (H - padT - padB);

  const duration = 400; // ms
  const startT = performance.now();

  function drawFrame(now) {
    const elapsed = now - startT;
    const progress = Math.min(1, elapsed / duration);
    const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    ctx.clearRect(0, 0, W, H);

    // baseline
    const baseY = yFor(pts[0]);
    ctx.strokeStyle = 'rgba(132,160,200,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();

    // Limit points to draw based on progress
    const drawLimit = Math.max(1, Math.floor(easeProgress * n));
    
    // gradient fill under the line (up to drawLimit)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, col + '33'); 
    grad.addColorStop(1, col + '00');
    ctx.beginPath();
    ctx.moveTo(0, H);
    let lastX = 0, lastDrawY = 0;
    for (let i = 0; i < drawLimit; i++) {
      const x = (i / (n - 1)) * W;
      const y = yFor(pts[i]);
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
      lastX = x;
      lastDrawY = y;
    }
    ctx.lineTo(lastX, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // the line
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < drawLimit; i++) {
      const x = (i / (n - 1)) * W;
      const y = yFor(pts[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // endpoint dot / leading edge bright pixel
    ctx.fillStyle = progress < 1 ? '#fff' : col;
    ctx.beginPath(); 
    ctx.arc(Math.min(lastX, W - 2), lastDrawY, progress < 1 ? 2.8 : 2.2, 0, Math.PI * 2); 
    ctx.fill();

    if (progress < 1) {
      canvas.__sparkAnim = requestAnimationFrame(drawFrame);
    } else {
      canvas.__sparkAnim = null;
    }
  }

  canvas.__sparkAnim = requestAnimationFrame(drawFrame);
}
