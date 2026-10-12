// Contact sheet: one JPEG a reviewer opens. Top rows are the flagged moments (boxed, labelled with
// the check that fired); the bottom rows are an evenly spaced timeline of the whole run.

import sharp from 'sharp';

const TILE_W = 400; const TILE_H = 225; const COLS = 4; const HEADER = 54;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function pickTimeline(shots, n = 8) {
  const play = shots.filter((s) => s.play); const pool = play.length >= n ? play : shots;
  if (pool.length <= n) return pool.slice();
  return Array.from({ length: n }, (_, i) => pool[Math.round(i * (pool.length - 1) / (n - 1))]);
}

export function nearestShot(shots, t) {
  let best = null; let bd = Infinity;
  for (const s of shots) { const d = Math.abs(s.t - t); if (d < bd) { bd = d; best = s; } }
  return best;
}

async function tile(shot, { label, sub, boxes = [], color = '#ff3b30', vw, vh }) {
  const sx = TILE_W / vw; const sy = TILE_H / vh;
  const rects = boxes.filter(Boolean).map((b) => {
    const x = Math.max(0, b[0] * sx); const y = Math.max(0, b[1] * sy);
    const w = Math.max(8, (b[2] - b[0]) * sx); const h = Math.max(8, (b[3] - b[1]) * sy);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${color}" stroke-width="3"/>`;
  }).join('');
  const svg = `<svg width="${TILE_W}" height="${TILE_H}" xmlns="http://www.w3.org/2000/svg">${rects}
    <rect x="0" y="0" width="${TILE_W}" height="20" fill="rgba(0,0,0,0.72)"/>
    <text x="5" y="14" font-family="DejaVu Sans, sans-serif" font-size="12" fill="${color === '#ff3b30' ? '#ff6b60' : '#e8e8e8'}" font-weight="bold">${esc(label).slice(0, 62)}</text>
    <rect x="0" y="${TILE_H - 18}" width="${TILE_W}" height="18" fill="rgba(0,0,0,0.72)"/>
    <text x="5" y="${TILE_H - 5}" font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d0d0d0">${esc(sub).slice(0, 70)}</text></svg>`;
  const base = shot ? sharp(shot.file).resize(TILE_W, TILE_H, { fit: 'fill' }) : sharp({ create: { width: TILE_W, height: TILE_H, channels: 3, background: '#202020' } });
  return base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 78 }).toBuffer();
}

/**
 * @param {object} o
 * @param {Array} o.shots  [{ t, sim, file, play, label }]
 * @param {Array} o.results check results (with moments)
 * @param {object} o.meta   verdict header fields
 */
export async function buildContactSheet({ shots, results, meta, outFile, vw, vh }) {
  const flagged = [];
  for (const r of results) {
    if (r.status !== 'FAIL') continue;
    for (const m of r.moments || []) {
      if (m.t == null) continue;
      const shot = nearestShot(shots, m.t); if (!shot) continue;
      flagged.push({ shot, label: `FAIL ${r.id}`, sub: m.line || r.value, boxes: [m.box] });
      if (flagged.filter((f) => f.label === `FAIL ${r.id}`).length >= 2) break;
    }
  }
  const flagTiles = flagged.slice(0, 12);
  const timeline = pickTimeline(shots, 8);
  const tiles = [];
  for (const f of flagTiles) tiles.push(await tile(f.shot, { label: f.label, sub: `sim ${f.shot.sim == null ? '?' : f.shot.sim.toFixed(1)} s · ${f.sub}`, boxes: f.boxes, vw, vh }));
  const flagRows = Math.ceil(tiles.length / COLS);
  for (const s of timeline) tiles.push(await tile(s, { label: s.label || 'timeline', sub: `sim ${s.sim == null ? '?' : s.sim.toFixed(1)} s · ${s.hud || ''}`, color: '#9ad', vw, vh }));
  const rows = flagRows + Math.ceil(timeline.length / COLS);
  const W = COLS * TILE_W; const H = HEADER + rows * TILE_H + (flagRows ? 18 : 0) + 18;
  const fails = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
  const header = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${HEADER}" fill="#111"/>
    <text x="10" y="22" font-family="DejaVu Sans, sans-serif" font-size="17" font-weight="bold" fill="${meta.overall === 'PASS' ? '#4cd964' : '#ff6b60'}">${esc(meta.overall)} · ${esc(meta.label)} · seed ${esc(meta.seed)} · ${esc(meta.commit)}</text>
    <text x="10" y="44" font-family="DejaVu Sans, sans-serif" font-size="12" fill="#ccc">${esc(meta.renderer).slice(0, 90)} · ${esc(meta.resolution)} · FAIL: ${esc(fails.join(', ') || 'none')}</text>
    ${flagRows ? `<text x="10" y="${HEADER + 13}" font-family="DejaVu Sans, sans-serif" font-size="12" fill="#ff8a80">FLAGGED MOMENTS</text>` : ''}
    <text x="10" y="${HEADER + (flagRows ? 18 + flagRows * TILE_H : 0) + 13}" font-family="DejaVu Sans, sans-serif" font-size="12" fill="#9ad">TIMELINE (evenly spaced)</text></svg>`;
  const comps = [{ input: Buffer.from(header), top: 0, left: 0 }];
  tiles.forEach((buf, i) => {
    const isFlag = i < flagTiles.length; const j = isFlag ? i : i - flagTiles.length;
    const rowBase = isFlag ? HEADER + 18 : HEADER + (flagRows ? 18 + flagRows * TILE_H : 0) + 18;
    comps.push({ input: buf, left: (j % COLS) * TILE_W, top: rowBase + Math.floor(j / COLS) * TILE_H });
  });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111' } }).composite(comps).jpeg({ quality: 72 }).toFile(outFile);
  return { file: outFile, flagged: flagTiles.length, timeline: timeline.length };
}
