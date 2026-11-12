#!/usr/bin/env node
// Seed-47 proof collateral probe: trace the released Massline payload's closest
// approach to any live ship. Why the collateral beat went dark post-retune.
import { runProofSixtySeconds } from '../src/testing/lab/proofSixtySeconds.js';

const released = new Map(); // entityId -> { t0, minDist, minShip, track:[] }
let payloadId = null;
let aimAtRelease = null;
let shipPositions = new Map();

let subscribed = false;
const run = await runProofSixtySeconds(47, {
  tickProbe(state, ticks, runtime) {
    if (!subscribed && runtime && runtime.bus) {
      subscribed = true;
      console.log(`[boot] playerId=${state.playerId}`);
      for (const ev of ['combat:collisionConsequence', 'tether:whipImpact']) {
        runtime.bus.on(ev, (p) => {
          const ids = [p && p.targetId, p && p.aId, p && p.otherId, p && p.bId, p && p.victimId].filter((x) => x != null);
          if ([...released.keys()].some((id) => ids.includes(id)) || ids.includes(131)) {
            console.log(`  [${ev}] t=${state.simTime.toFixed(2)} ${JSON.stringify(p)}`);
          }
        });
      }
    }
    const tether = state.player && state.player.tether;
    if (tether && tether.active && tether.targetId != null) payloadId = tether.targetId;

    // snapshot ship positions once a second for context
    if (ticks % 60 === 0) {
      shipPositions = new Map();
      for (const e of state.entityList || []) {
        if (e && e.type === 'ship' && e.alive !== false) {
          shipPositions.set(e.id, { x: e.pos.x, z: e.pos.z, v: Math.hypot(e.vel?.x || 0, e.vel?.z || 0) });
        }
      }
    }

    // detect releases: an entity that was the payload and is now free-flying
    if (payloadId != null) {
      const still = tether && tether.active && tether.targetId === payloadId;
      const e = state.entities && state.entities.get ? state.entities.get(payloadId) : null;
      if (!still && e && e.alive !== false && !released.has(payloadId)) {
        released.set(payloadId, {
          t0: state.simTime, minDist: Infinity, minShip: null, minT: 0,
          vx: e.vel?.x, vz: e.vel?.z, x0: e.pos.x, z0: e.pos.z,
        });
        console.log(`[release] t=${state.simTime.toFixed(2)} hull#${payloadId} vel=(${(e.vel?.x||0).toFixed(1)},${(e.vel?.z||0).toFixed(1)}) |v|=${Math.hypot(e.vel?.x||0,e.vel?.z||0).toFixed(1)} pos=(${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)}) aim=${state.input?.aimAngle?.toFixed(2)}`);
        payloadId = null;
      }
    }

    // track released hulls' closest approach to ships
    for (const [id, rec] of released) {
      const e = state.entities && state.entities.get ? state.entities.get(id) : null;
      if (!e || e.alive === false) continue;
      for (const s of state.entityList || []) {
        if (!s || s.id === id || s.type !== 'ship' || s.alive === false) continue;
        const d = Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) - (s.radius || 0) - (e.radius || 0);
        if (d < rec.minDist) {
          rec.minDist = d; rec.minShip = s.id; rec.minT = state.simTime;
        }
      }
      if ((ticks % 30) === 0 && state.simTime - rec.t0 < 12) {
        const v = Math.hypot(e.vel?.x || 0, e.vel?.z || 0);
        console.log(`  [fly] t=${state.simTime.toFixed(1)} hull#${id} |v|=${v.toFixed(0)} minDistToShip=${rec.minDist === Infinity ? 'n/a' : rec.minDist.toFixed(1)} vs #${rec.minShip}`);
      }
    }
  },
});

console.log('\n=== RESULT ===');
console.log('simS', run.simS, 'detected', run.detected, 'times', JSON.stringify(run.times));
console.log('details', JSON.stringify(run.details));
for (const [id, rec] of released) {
  console.log(`released hull #${id}: closest ship approach ${rec.minDist === Infinity ? 'never near a ship' : rec.minDist.toFixed(1) + ' wu vs #' + rec.minShip + ' at t=' + rec.minT.toFixed(2)}`);
}
