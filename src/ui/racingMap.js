// A bounded SVG instrument shared by the board and flight tape. No map/reveal authority.
const NS = 'http://www.w3.org/2000/svg';
export function createRacingMap(gates, label = 'Circuit route', doc = globalThis.document) {
  if (!doc || !Array.isArray(gates) || gates.length < 2) return null;
  const points = gates.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.z)).slice(0, 128);
  if (points.length < 2) return null;
  const node = (tag, attrs) => {
    const el = doc.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
    return el;
  };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) { minX = Math.min(minX,p.x); maxX = Math.max(maxX,p.x); minZ = Math.min(minZ,p.z); maxZ = Math.max(maxZ,p.z); }
  const scale = Math.min(280 / Math.max(1,maxX-minX), 130 / Math.max(1,maxZ-minZ));
  const cx = (minX+maxX)/2, cz = (minZ+maxZ)/2;
  const x = value => 160+(value-cx)*scale, y = value => 85+(value-cz)*scale;
  const svg = node('svg', { viewBox:'0 0 320 170', role:'img', 'aria-label':label, class:'race-map' });
  svg.appendChild(node('polyline', { points:points.map(p=>`${x(p.x).toFixed(2)},${y(p.z).toFixed(2)}`).join(' '),
    fill:'none', stroke:'var(--dp-ink-dim)', 'stroke-width':2.5, 'stroke-linejoin':'round' }));
  const start = node('rect', { x:x(points[0].x)-4, y:y(points[0].z)-4, width:8, height:8, fill:'var(--dp-lamp)' });
  const target = node('circle', { cx:0, cy:0, r:7, fill:'none', stroke:'var(--dp-lamp)', 'stroke-width':2 });
  const player = node('path', { d:'M0 -6 L4 5 L0 3 L-4 5 Z', fill:'var(--dp-ink)', display:'none' });
  svg.append(start, target, player);
  target.setAttribute('display', 'none');
  return {
    element: svg,
    update(pos, nextGate) {
      const g = points[Math.max(0, Math.min(points.length-1, nextGate | 0))];
      target.setAttribute('display',''); target.setAttribute('cx',x(g.x).toFixed(2)); target.setAttribute('cy',y(g.z).toFixed(2));
      const p = pos?.pos || pos;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        player.setAttribute('display','');
        player.setAttribute('transform',`translate(${x(p.x).toFixed(2)} ${y(p.z).toFixed(2)}) rotate(${(Number(pos?.rot)||0)*180/Math.PI+90})`);
      } else player.setAttribute('display','none');
    },
  };
}
export function formatRaceTime(value) {
  if (!Number.isFinite(value)) return '—';
  const hundredths = Math.max(0, Math.round(value * 100));
  const minutes = Math.floor(hundredths / 6000);
  const seconds = ((hundredths % 6000)/100).toFixed(2);
  return minutes ? `${minutes}:${seconds.padStart(5,'0')}` : `${seconds}s`;
}
