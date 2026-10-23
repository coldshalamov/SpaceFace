// Continuous travel instruments; reads state and projected positions only.
// Mode detection mirrors flightV3.resolveAssistMode precedence — an explicit entity/input packet
// override wins, then the settings choice — so the tick-line appears exactly when the assist
// governor is NOT holding the velocity for the pilot (drift ≈ 20 % assist, newtonian = 0).
export function travelVectorReadout(state, player, out = {}) {
  const explicit = player?.flightAssistMode
    || state?.input?.flightMode
    || state?.settings?.controls?.flightMode
    || 'assisted';
  const drift = explicit === 'drift' || explicit === 'newtonian';
  const speed = Math.hypot(player?.vel?.x || 0, player?.vel?.z || 0);
  const wrestle = state?.player?.cruise?.wrestle;
  out.drift = drift && speed > 2; out.mode = explicit; out.speed = speed; out.wrestle = wrestle || null;
  return out;
}

export function mountTravelVectorHud(root, state, helpers) {
  const doc = root.ownerDocument;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;color:var(--dp-phosphor,#bdf6ff)';
  const line = doc.createElementNS(svg.namespaceURI, 'path');
  line.setAttribute('fill', 'none'); line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', '1');
  const arc = line.cloneNode();
  svg.append(line, arc); root.appendChild(svg);
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  const pa = {}, pb = {};
  const reading = {};
  return {
    update(player) {
      const read = travelVectorReadout(state, player, reading);
      line.style.display = read.drift ? '' : 'none';
      arc.style.display = read.wrestle ? '' : 'none';
      if ((!read.drift && !read.wrestle) || !player?.pos || !helpers?.worldToScreen) return;
      a.x = player.pos.x; a.z = player.pos.z;
      b.x = a.x + (player.vel.x || 0) * 0.5; b.z = a.z + (player.vel.z || 0) * 0.5;
      const A = helpers.worldToScreen(a, pa), B = helpers.worldToScreen(b, pb);
      if (!A?.onScreen || !Number.isFinite(B?.x)) { line.style.display = arc.style.display = 'none'; return; }
      let dx = B.x - A.x, dy = B.y - A.y;
      const length = Math.hypot(dx, dy), scale = length > 180 ? 180 / length : 1;
      dx *= scale; dy *= scale;
      const nx = length > 0 ? -dy / (length * scale) * 3 : 0;
      const ny = length > 0 ? dx / (length * scale) * 3 : 0;
      let d = `M${A.x},${A.y}l${dx},${dy}`;
      for (let t = 0.25; t <= 1; t += 0.25) d += `M${A.x + dx * t - nx},${A.y + dy * t - ny}l${2 * nx},${2 * ny}`;
      line.setAttribute('d', d);
      if (read.wrestle) {
        const w = read.wrestle, r = 64;
        // Project the escape bearing into the same world-to-screen basis as the flight tick.
        b.x = a.x + Math.cos(w.escapeBearing) * 100; b.z = a.z + Math.sin(w.escapeBearing) * 100;
        const C = helpers.worldToScreen(b, pb);
        const angle = Math.atan2(C.y - A.y, C.x - A.x), half = Math.PI / 9;
        const x1 = A.x + Math.cos(angle - half) * r, y1 = A.y + Math.sin(angle - half) * r;
        const x2 = A.x + Math.cos(angle + half) * r, y2 = A.y + Math.sin(angle + half) * r;
        arc.setAttribute('d', `M${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}`);
        arc.setAttribute('stroke-dasharray', '4 3');
      }
    },
    destroy() { svg.remove(); },
  };
}
