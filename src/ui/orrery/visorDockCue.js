import { resolveCollisionProxyManifest, resolveCorridorAxisWorld, resolveDockAnchor } from '../../data/collisionProxyManifests.js';
import { svg } from './svg.js';

/** The live range alert remains the authority. This only places its cue when the real dock is visible. */
export function createVisorDockCue(root) {
  const overlay = svg('svg', { class: 'sf-visor-dock-guide', 'aria-hidden': 'true' });
  const leader = svg('path', { class: 'sf-visor-dock-guide__leader' });
  const approach = svg('path', { class: 'sf-visor-dock-guide__course' });
  const ticks = svg('path', { class: 'sf-visor-dock-guide__ticks' });
  const pin = svg('circle', { r: 4.4, class: 'sf-visor-dock-guide__pin' });
  overlay.append(approach, ticks, leader, pin);
  overlay.style.display = 'none';
  root.appendChild(overlay);
  const world = { x: 0, y: 0, z: 0 };
  const dockScreen = { x: 0, y: 0, onScreen: false };
  const shipScreen = { x: 0, y: 0, onScreen: false };
  const corridorScreen = { x: 0, y: 0, onScreen: false };
  const corridorPoint = { x: 0, y: 0, z: 0 };
  let bend = null;
  let viewport = '';

  function project(station, player, projectWorld) {
    if (!station?.pos || !player?.pos || typeof projectWorld !== 'function') return null;
    const manifest = resolveCollisionProxyManifest(station);
    const anchor = (manifest && resolveDockAnchor(station, manifest, player)) || station.pos;
    world.x = anchor.x;
    world.y = station.pos.y || 0;
    world.z = anchor.z;
    const at = projectWorld(world, dockScreen);
    if (!at || !at.onScreen || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
    bend = null;
    if (manifest && anchor.kind === 'berth') {
      const axis = resolveCorridorAxisWorld(station, manifest);
      const forward = (player.pos.x - anchor.x) * axis.x + (player.pos.z - anchor.z) * axis.z;
      if (forward >= 0) {
        const len = Math.max(6, Math.min(110, forward * .5));
        corridorPoint.x = world.x + axis.x * len;
        corridorPoint.y = world.y;
        corridorPoint.z = world.z + axis.z * len;
        const elbow = projectWorld(corridorPoint, corridorScreen);
        if (elbow?.onScreen) bend = elbow;
      }
    }
    return at;
  }

  function draw(at, box, width, height, player, projectWorld) {
    const newViewport = `0 0 ${width} ${height}`;
    if (viewport !== newViewport) { viewport = newViewport; overlay.setAttribute('viewBox', viewport); }
    const x = Math.round(at.x), y = Math.round(at.y);
    const tx = Math.round(box.x), ty = Math.round(box.y + box.height / 2);
    const edgeX = tx > x ? tx : tx + box.width;
    const elbowX = edgeX + (edgeX > x ? -1 : 1) * Math.min(15, Math.abs(edgeX - x) * .25);
    leader.setAttribute('d', `M${x} ${y}L${Math.round(elbowX)} ${ty}H${edgeX}`);
    pin.setAttribute('cx', x);
    pin.setAttribute('cy', y);
    const from = projectWorld(player.pos, shipScreen);
    const dx = from ? from.x - x : 0;
    const dy = from ? from.y - y : 0;
    const length = Math.hypot(dx, dy);
    const span = Math.min(168, length * .53);
    const bx = bend ? bend.x - x : dx, by = bend ? bend.y - y : dy;
    const departure = Math.hypot(bx, by);
    let line = '', markers = '';
    if (departure > 5 && (from?.onScreen || bend)) {
      const ux = bx / departure, uy = by / departure;
      const point = (along, side = 0) => `${Math.round(x + ux * along - uy * side)} ${Math.round(y + uy * along + ux * side)}`;
      const marked = bend && span > 52;
      if (from?.onScreen && span > 18) {
        const end = `${Math.round(x + dx / length * span)} ${Math.round(y + dy / length * span)}`;
        line = `M${point(marked ? 36 : 10)}${bend ? `Q${point(Math.min(departure, span * .64))} ${end}` : `L${end}`}`;
      }
      if (marked) {
        for (const offset of [13, 24]) markers += `M${point(offset + 5, -5)}L${point(offset)}L${point(offset + 5, 5)}`;
      }
      if (bend) for (const side of [-1, 1]) markers += `M${point(-4, side * 12)}L${point(-9, side * 12)}L${point(-9, side * 7)}`;
    }
    approach.setAttribute('d', line);
    ticks.setAttribute('d', markers);
    overlay.style.display = '';
  }
  return { project, draw, hide() { overlay.style.display = 'none'; } };
}
