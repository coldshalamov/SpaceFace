/** RUBRIC skin painter. Draws the marker's four body skins and its stencil-wheel face sheet on a
 * canvas inside headless Chromium (Playwright) and writes them under
 *   assets/ships/release/surfaces/rubric/
 * Deterministic: every random draw comes from one seeded stream, so re-running reproduces the PNGs.
 *
 *   node tools/art/rubric_skins.mjs          # write the PNGs + manifest.json
 *   node tools/art/rubric_skins.mjs --contact  # also write a labelled contact sheet next to them
 *
 * Skin atlas (1024 x 1024, four 1024 x 256 rows, row 0 at the TOP of the image):
 *   0 primer    red-lead primer, stencilled HM-11 and the Customs desk code, hazard band, panel seams
 *   1 witness   primer plus the overspray of every mark it has made (chalk, amber, green, hot red)
 *   2 scarred   witness plus a scorched, struck-through front panel (the player hurt the marker)
 *   3 memorial  whitewash coat, HM-11 struck through once, primer showing through the drips
 * Drum strip (2048 x 576): five cartridges wrapped round the stencil drum behind the visor window:
 *   0 level bars   1 working dots   2 alarm wedges   3 struck eyes   4 blank
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'assets', 'ships', 'release', 'surfaces', 'rubric');
const contact = process.argv.includes('--contact');

const painter = () => {
  // ---- seeded stream ---------------------------------------------------------------------
  let s = 0x5ab1c0de >>> 0;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  const COL = { primer: '#a93b25', primerHi: '#c24c30', primerLo: '#7f2a1a', graphite: '#1b1f25', graphiteHi: '#2c323b',
    chalk: '#ece6d2', amber: '#f0a028', green: '#37d985', hot: '#ff4a2e', white: '#dcd8cc', ink: '#101216' };

  // ---- surface helpers (all draw into a clipped row) -------------------------------------
  function blotch(ctx, w, h, colors, n, rmin, rmax, alpha) {
    for (let i = 0; i < n; i++) {
      const x = rr(0, w), y = rr(0, h), r = rr(rmin, rmax);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = colors[Math.floor(rnd() * colors.length)];
      g.addColorStop(0, c + Math.round(alpha * 255).toString(16).padStart(2, '0'));
      g.addColorStop(1, c + '00');
      ctx.fillStyle = g;
      for (const dx of [-w, 0, w]) { ctx.save(); ctx.translate(dx, 0); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
    }
  }
  function grain(ctx, w, h, amount) {
    const d = ctx.getImageData(0, 0, w, h), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const n = (rnd() - 0.5) * amount; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
    ctx.putImageData(d, 0, 0);
  }
  function scratches(ctx, w, h, n, color, alpha) {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rr(0, w), y = rr(0, h), len = rr(10, 90), a = rr(-0.5, 0.5) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      ctx.strokeStyle = color; ctx.globalAlpha = rr(alpha * 0.4, alpha); ctx.lineWidth = rr(0.6, 1.6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    ctx.restore();
  }
  function drips(ctx, w, y0, n, color) {
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x = rr(0, w), len = rr(14, 70), wd = rr(2, 5);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, color + 'cc'); g.addColorStop(1, color + '00');
      ctx.fillStyle = g; ctx.fillRect(x, y0, wd, len);
      ctx.beginPath(); ctx.arc(x + wd / 2, y0 + len, wd * 0.8, 0, Math.PI * 2); ctx.fillStyle = color + '66'; ctx.fill();
    }
    ctx.restore();
  }
  function stencilText(ctx, text, cx, cy, size, color, bridge) {
    const [c, g] = mk(Math.ceil(size * text.length * 0.9 + 40), Math.ceil(size * 1.4));
    g.font = `900 ${size}px Impact, "Arial Black", "Segoe UI Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color;
    g.fillText(text, c.width / 2, c.height / 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < bridge; i++) g.fillRect(0, c.height * (0.3 + i * 0.38) - size * 0.025, c.width, Math.max(2, size * 0.055));
    for (let i = 0; i < text.length; i++) g.fillRect(c.width / 2 + (i - text.length / 2 + 0.5) * size * 0.62 - size * 0.025, 0, Math.max(2, size * 0.05), c.height);
    ctx.drawImage(c, cx - c.width / 2, cy - c.height / 2);
  }
  function hazard(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = COL.ink; ctx.fillRect(x, y, w, h); ctx.fillStyle = COL.amber;
    for (let i = -h; i < w + h; i += h * 1.1) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h * 0.55, y + h);
      ctx.lineTo(x + i + h * 1.1, y); ctx.lineTo(x + i + h * 0.55, y); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function seams(ctx, w, h) {
    ctx.save(); ctx.strokeStyle = '#00000088'; ctx.lineWidth = 2;
    for (const u of [0, 0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(u * w, h * 0.12); ctx.lineTo(u * w, h * 0.86); ctx.stroke();
      ctx.strokeStyle = '#ffffff22'; ctx.beginPath(); ctx.moveTo(u * w + 2, h * 0.12); ctx.lineTo(u * w + 2, h * 0.86); ctx.stroke(); ctx.strokeStyle = '#00000088'; }
    for (const u of [0, 0.25, 0.5, 0.75]) for (const v of [0.18, 0.5, 0.8]) for (const du of [-9, 9]) {
      ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.arc(u * w + du + 4, h * v + 1, 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff44'; ctx.beginPath(); ctx.arc(u * w + du + 3.4, h * v + 0.4, 1.4, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function spray(ctx, w, h, count, colors, spread) {
    for (let i = 0; i < count; i++) {
      const x = rr(0, w), y = rr(h * 0.1, h * 0.9), c = colors[Math.floor(rnd() * colors.length)];
      const cloud = rr(6, 26) * spread;
      const g = ctx.createRadialGradient(x, y, 0, x, y, cloud);
      g.addColorStop(0, c + '55'); g.addColorStop(1, c + '00'); ctx.fillStyle = g;
      ctx.fillRect(x - cloud, y - cloud, cloud * 2, cloud * 2);
      for (let k = 0; k < 14; k++) { const a = rnd() * 6.28, d = rnd() * cloud * 1.3, r = rr(0.6, 2.4);
        ctx.fillStyle = c + 'dd'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, 7); ctx.fill(); }
    }
  }
  function strikeLine(ctx, x0, y0, x1, y1, width, color) {
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.shadowColor = color; ctx.shadowBlur = 5; ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (x1 - x0) * 0.3, y0 + rr(-5, 5), x0 + (x1 - x0) * 0.7, y1 + rr(-5, 5), x1, y1); ctx.stroke(); ctx.restore();
  }

  // ---- one skin row ----------------------------------------------------------------------
  function row(kind) {
    const W = 1024, H = 256, [c, ctx] = mk(W, H);
    const memorial = kind === 'memorial';
    const base = memorial ? COL.white : COL.primer;
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    blotch(ctx, W, H, memorial ? ['#ffffff', '#c9c4b4', '#bdb8a8'] : [COL.primerHi, COL.primerLo, '#b0442b'], 90, 30, 120, 0.5);
    // rim and hazard band
    ctx.fillStyle = COL.graphite; ctx.fillRect(0, 0, W, H * 0.1); ctx.fillStyle = COL.graphiteHi; ctx.fillRect(0, H * 0.1, W, 3);
    hazard(ctx, 0, H * 0.88, W, H * 0.12);
    seams(ctx, W, H);
    // primer showing through the whitewash
    if (memorial) { drips(ctx, W, H * 0.1, 46, COL.primer); blotch(ctx, W, H, [COL.primer], 26, 16, 54, 0.32); }
    else drips(ctx, W, H * 0.1, 20, COL.primerLo);
    // stencilled identity
    stencilText(ctx, 'HM-11', W * 0.18, H * 0.5, 104, memorial ? COL.primer : COL.chalk, 2);
    stencilText(ctx, 'HM-11', W * 0.68, H * 0.5, 104, memorial ? COL.primer : COL.chalk, 2);
    stencilText(ctx, 'WT-TETH-19', W * 0.43, H * 0.5, 34, memorial ? COL.primerLo : COL.chalk, 1);
    stencilText(ctx, 'FILED / CORRECTED', W * 0.93, H * 0.5, 26, memorial ? COL.primerLo : COL.chalk, 1);
    if (kind === 'witness' || kind === 'scarred') spray(ctx, W, H, 56, [COL.chalk, COL.amber, COL.green, COL.hot, COL.hot], 1);
    if (kind === 'scarred') {
      blotch(ctx, W, H, ['#000000'], 22, 18, 64, 0.42);
      strikeLine(ctx, W * 0.07, H * 0.34, W * 0.3, H * 0.62, 7, COL.hot);
      strikeLine(ctx, W * 0.07, H * 0.46, W * 0.3, H * 0.74, 7, COL.hot);
      strikeLine(ctx, W * 0.57, H * 0.34, W * 0.8, H * 0.62, 7, COL.hot);
      strikeLine(ctx, W * 0.57, H * 0.46, W * 0.8, H * 0.74, 7, COL.hot);
    }
    if (memorial) { strikeLine(ctx, W * 0.07, H * 0.5, W * 0.3, H * 0.5, 7, COL.hot); strikeLine(ctx, W * 0.57, H * 0.5, W * 0.8, H * 0.5, 7, COL.hot); }
    scratches(ctx, W, H, memorial ? 60 : 160, memorial ? '#6b6759' : '#e6b49a', 0.5);
    scratches(ctx, W, H, 70, '#00000099', 0.5);
    grain(ctx, W, H, memorial ? 14 : 26);
    return c;
  }

  // ---- stencil drum ----------------------------------------------------------------------
  // A strip wrapped round a horizontal drum (r = 2.6 WU, 4.6 WU long): 2048 x 576 px at 125 px/WU.
  // Five 409.6 px cells; the visor window shows one cell at a time. In each cell the eye pair sits
  // side by side ALONG THE DRUM AXIS (canvas y), so on the machine the eyes read left and right.
  function drum() {
    const SW = 2048, SH = 576, CW = SW / 5, [c, ctx] = mk(SW, SH);
    ctx.fillStyle = COL.ink; ctx.fillRect(0, 0, SW, SH);
    const plate = ctx.createLinearGradient(0, 0, 0, SH);
    plate.addColorStop(0, '#1b1f25'); plate.addColorStop(0.5, '#2a3038'); plate.addColorStop(1, '#1b1f25');
    ctx.fillStyle = plate; ctx.fillRect(0, 0, SW, SH);
    ctx.strokeStyle = '#ffffff0b';
    for (let x = 0; x < SW; x += 4) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#000000cc'; ctx.fillRect(i * CW - 4, 0, 8, SH);
      ctx.fillStyle = '#ffffff1c'; ctx.fillRect(i * CW + 4, 0, 2, SH);
    }
    const glow = (color, draw) => { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 34; ctx.fillStyle = color; ctx.strokeStyle = color; draw(); draw(); ctx.restore(); };
    const cell = (i, fn) => { ctx.save(); ctx.translate(i * CW + CW / 2, SH / 2); fn(); ctx.restore(); };
    const EYE = 118; // half the eye spacing along the axis, px (window is +-1.9 WU = +-237 px)
    cell(0, () => glow('#a6f5ff', () => { for (const sy of [-1, 1]) ctx.fillRect(-26, sy * EYE - 62, 52, 124); }));               // level bars
    cell(1, () => glow('#ffb347', () => { for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(0, sy * EYE, 46, 0, 7); ctx.fill(); } }));  // working dots
    cell(2, () => glow('#ff3b2f', () => { for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-50, sy * EYE - 54); ctx.lineTo(-50, sy * EYE + 54);
      ctx.lineTo(56, sy * EYE); ctx.closePath(); ctx.fill(); } }));                                                                    // alarm wedges
    cell(3, () => glow('#ff4a2e', () => { ctx.lineWidth = 22; ctx.lineCap = 'round'; for (const sy of [-1, 1]) { ctx.beginPath();
      ctx.moveTo(-44, sy * EYE - 44); ctx.lineTo(44, sy * EYE + 44); ctx.moveTo(44, sy * EYE - 44); ctx.lineTo(-44, sy * EYE + 44); ctx.stroke(); } })); // struck eyes
    cell(4, () => { ctx.fillStyle = '#3a4350'; ctx.fillRect(-4, -70, 8, 140); });                                                       // blank
    return c;
  }

  // ---- compose --------------------------------------------------------------------------
  const kinds = ['primer', 'witness', 'scarred', 'memorial'];
  const [atlas, actx] = mk(1024, 1024);
  kinds.forEach((k, i) => actx.drawImage(row(k), 0, i * 256));
  return { atlas: atlas.toDataURL('image/png'), wheel: drum().toDataURL('image/png') };
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const { atlas, wheel } = await page.evaluate(`(${painter.toString()})()`);
  await fs.mkdir(OUT, { recursive: true });
  const png = (d) => Buffer.from(d.replace(/^data:image\/png;base64,/, ''), 'base64');
  await fs.writeFile(path.join(OUT, 'rubric_skin_atlas.png'), png(atlas));
  await fs.writeFile(path.join(OUT, 'rubric_stencil_wheel.png'), png(wheel));
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({
    schema: 'spaceface.generatedArt.v1',
    set: 'rubric hull marker',
    use: "src/render/rubricSkinLibrary.js: 'atlas' rows (primer, witness, scarred, memorial) wrap the marker's paint tank; 'wheel' is the five-cartridge stencil drum read through the visor window.",
    date: new Date().toISOString().slice(0, 10),
    generator: 'tools/art/rubric_skins.mjs — Canvas2D painted in headless Chromium from one seeded stream; no image model, no third-party source',
    license: 'Painted for SpaceFace by the project; no third-party source image supplied.',
    files: {
      atlas: { file: 'rubric_skin_atlas.png', size: [1024, 1024], rows: ['primer', 'witness', 'scarred', 'memorial'], rowHeight: 256 },
      wheel: { file: 'rubric_stencil_wheel.png', size: [2048, 576], cells: ['level bars', 'working dots', 'alarm wedges', 'struck eyes', 'blank'], cellWidth: 409.6, pxPerWorldUnit: 125 },
    },
  }, null, 2) + '\n');
  if (contact) await fs.writeFile(path.join(OUT, '_contact.png'), png(atlas));
  console.log(`wrote ${OUT}`);
} finally { await browser.close(); }
