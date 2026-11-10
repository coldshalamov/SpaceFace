// Spray, coat, bridge, sever. Positions stay inputs; impulses are outputs.
// The film's tear force shrinks with the square root of the lighter mass, and
// the demand is separating speed times reduced mass, so one modest pull can
// hold two crates and snap two gates.

import { ADHESIVE, ADHESIVE_LINES } from '../../data/reactiveMatter/adhesive.js';

function compareId(a, b) {
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function pairId(a, b) {
  const as = String(a);
  const bs = String(b);
  return as < bs ? `film:${as}|${bs}` : `film:${bs}|${as}`;
}

function ensureAdhesive(world) {
  if (!world.adhesive) world.adhesive = { coatings: new Map(), bridges: new Map() };
  return world.adhesive;
}

function reducedMass(a, b) {
  const aFree = !a.anchored && a.mass > 0;
  const bFree = !b.anchored && b.mass > 0;
  if (!aFree && !bFree) return 0;
  if (!aFree) return b.mass;
  if (!bFree) return a.mass;
  return 1 / (1 / a.mass + 1 / b.mass);
}

function holdingStrength(massA, massB, coat) {
  const lighter = Math.min(massA, massB);
  if (!(lighter > 0) || !(coat > 0)) return 0;
  return ADHESIVE.filmNewtons * coat * Math.sqrt(ADHESIVE.referenceMass / lighter);
}

function pushHold(impulses, a, b, nx, nz, j) {
  const aFree = !a.anchored && a.mass > 0;
  const bFree = !b.anchored && b.mass > 0;
  const player = a.isPlayer === true || b.isPlayer === true;
  if (aFree && bFree) {
    impulses.push({
      bodyId: a.id, otherId: b.id, anchorId: null,
      jx: nx * j, jz: nz * j,
      source: 'adhesive-hold', externalEffect: player, continuous: true,
      storeId: null, storeJ: 0,
    });
    return;
  }
  const free = aFree ? a : b;
  const anchor = aFree ? b : a;
  const sign = aFree ? 1 : -1;
  impulses.push({
    bodyId: free.id, otherId: null, anchorId: anchor.id,
    jx: nx * j * sign, jz: nz * j * sign,
    source: 'adhesive-hold', externalEffect: player, continuous: true,
    storeId: null, storeJ: 0,
  });
}

export function refreshAdhesiveCoat(world, id) {
  const bag = ensureAdhesive(world);
  bag.coatings.set(id, { integrity: 1 });
  const doomed = [];
  for (const [bridgeId, bridge] of bag.bridges) {
    if (bridge.aId === id || bridge.bId === id) doomed.push(bridgeId);
  }
  for (let i = 0; i < doomed.length; i++) bag.bridges.delete(doomed[i]);
}

function lineBetween(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const reach = (a.radius || 0) + (b.radius || 0) + ADHESIVE.bridgeGap;
  if (dist > 1e-6) return { dist, reach, nx: dx / dist, nz: dz / dist };
  return { dist, reach, nx: 1, nz: 0 };
}

export function stepAdhesive(world, dt) {
  const impulses = [];
  const notices = [];
  const bag = world && world.adhesive;
  if (!bag || !world.bodies || (bag.coatings.size === 0 && bag.bridges.size === 0)) {
    return { impulses, notices };
  }
  const step = dt > 0 && Number.isFinite(dt) ? dt : 1 / 60;
  const lost = [];
  const coatIds = [...bag.coatings.keys()].sort(compareId);
  for (let i = 0; i < coatIds.length; i++) {
    const id = coatIds[i];
    const coat = bag.coatings.get(id);
    coat.integrity -= ADHESIVE.wearPerSecond * step;
    if (!(coat.integrity > ADHESIVE.coatMin)) {
      bag.coatings.delete(id);
      lost.push(id);
    }
  }

  const heldLoss = new Set();
  const bridgeIds = [...bag.bridges.keys()].sort(compareId);
  for (let i = 0; i < bridgeIds.length; i++) {
    const bridge = bag.bridges.get(bridgeIds[i]);
    if (!bridge.alive) {
      const a = world.bodies.get(bridge.aId);
      const b = world.bodies.get(bridge.bId);
      if (!a || !b) {
        bag.bridges.delete(bridge.id);
        continue;
      }
      const apart = lineBetween(a, b);
      if (apart.dist > apart.reach) bag.bridges.delete(bridge.id);
      continue;
    }
    const a = world.bodies.get(bridge.aId);
    const b = world.bodies.get(bridge.bId);
    const coatA = bag.coatings.get(bridge.aId);
    const coatB = bag.coatings.get(bridge.bId);
    if (!a || !b || !coatA || !coatB || a.phase === 'fractured' || b.phase === 'fractured') {
      bridge.alive = false;
      bridge.fresh = false;
      bridge.severed = 'worn';
      heldLoss.add(bridge.aId);
      heldLoss.add(bridge.bId);
      notices.push({ text: ADHESIVE_LINES.woreThrough, kind: 'warn' });
    }
  }
  for (let i = 0; i < lost.length; i++) {
    if (!heldLoss.has(lost[i])) notices.push({ text: ADHESIVE_LINES.wornOff, kind: 'info' });
  }

  const coated = [...bag.coatings.keys()].sort(compareId);
  for (let i = 0; i < coated.length; i++) {
    if (bag.bridges.size >= ADHESIVE.maxBridges) break;
    const a = world.bodies.get(coated[i]);
    if (!a || a.phase === 'fractured') continue;
    for (let j = i + 1; j < coated.length; j++) {
      if (bag.bridges.size >= ADHESIVE.maxBridges) break;
      const b = world.bodies.get(coated[j]);
      if (!b || b.phase === 'fractured') continue;
      const id = pairId(a.id, b.id);
      if (bag.bridges.has(id)) continue;
      const line = lineBetween(a, b);
      if (line.dist > line.reach) continue;
      bag.bridges.set(id, {
        id, aId: a.id, bId: b.id, alive: true, fresh: true, severed: null,
      });
    }
  }

  const liveIds = [...bag.bridges.keys()].sort(compareId);
  for (let i = 0; i < liveIds.length; i++) {
    const bridge = bag.bridges.get(liveIds[i]);
    if (!bridge || !bridge.alive) continue;
    const a = world.bodies.get(bridge.aId);
    const b = world.bodies.get(bridge.bId);
    const coatA = bag.coatings.get(bridge.aId);
    const coatB = bag.coatings.get(bridge.bId);
    if (!a || !b || !coatA || !coatB) continue;
    const line = lineBetween(a, b);
    const sep = (b.vx - a.vx) * line.nx + (b.vz - a.vz) * line.nz;
    const reduced = reducedMass(a, b);
    const coat = Math.min(coatA.integrity, coatB.integrity);
    const budget = holdingStrength(a.mass, b.mass, coat) * step;
    const load = Math.max(0, sep) * reduced;
    // Two anchored ends cannot pull the film apart.
    if (!(reduced > 0)) {
      if (bridge.fresh) {
        notices.push({ text: ADHESIVE_LINES.bridged, kind: 'info' });
        bridge.fresh = false;
      }
      continue;
    }
    if (load > budget + 1e-6) {
      bridge.alive = false;
      bridge.fresh = false;
      bridge.severed = 'overloaded';
      notices.push({ text: ADHESIVE_LINES.snapped, kind: 'warn' });
      continue;
    }
    if (bridge.fresh) {
      notices.push({ text: ADHESIVE_LINES.bridged, kind: 'info' });
      bridge.fresh = false;
    }
    if (load > 1e-8) pushHold(impulses, a, b, line.nx, line.nz, load);
  }
  return { impulses, notices };
}
