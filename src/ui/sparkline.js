// Sparkline renderer (UX-4). Draws a tiny inline price-trend line into a <canvas>, colored by the
// trend direction (up = warmer/dearer, down = cooler/cheaper) so a glance tells you which way the
// price is moving. Used inline in the market table next to each commodity's buy/sell.
//
// Pure + stateless: call drawSparkline(canvas, values, opts) with a number[] of prices.

/**
 * Draw a sparkline into a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values    - price series (oldest first); <2 points draws nothing
 * @param {object} [opts]
 * @param {string} [opts.upColor]   - stroke color when the trend is up (last > first)
 * @param {string} [opts.downColor] - stroke color when the trend is down
 * @param {string} [opts.flatColor] - stroke color when flat
 */
export function drawSparkline(canvas, values, opts) {
  opts = opts || {};
  if (!canvas || !Array.isArray(values) || values.length < 2) {
    if (canvas) { const c = canvas.getContext('2d'); if (c) c.clearRect(0, 0, canvas.width, canvas.height); }
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const range = (max - min) || 1;
  const n = values.length;
  // trend color: last vs first
  const trend = values[n - 1] - values[0];
  const col = trend > 0.0001 ? (opts.upColor || '#ff8a3d')
    : trend < -0.0001 ? (opts.downColor || '#7af7d0')
    : (opts.flatColor || '#84a0c8');

  // baseline (the first sample) so the eye anchors on where the price started
  const baseY = H - ((values[0] - min) / range) * (H - 4) - 2;
  ctx.strokeStyle = 'rgba(132,160,200,.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, baseY); ctx.lineTo(W, baseY); ctx.stroke();

  // the line
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * W;
    const y = H - ((values[i] - min) / range) * (H - 4) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // endpoint dot so the current price is anchored
  const lastX = W;
  const lastY = H - ((values[n - 1] - min) / range) * (H - 4) - 2;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(lastX - 1, lastY, 1.8, 0, Math.PI * 2); ctx.fill();
}
