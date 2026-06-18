// Automation alphabet (V2 §4 / cut-list #28). The unified 5-primitive vocabulary that lets the
// player PROGRAM drones instead of just deploying them. This is the spine that connects the manual
// verbs (you drilled by hand in #27; now you hand that verb to a drone) to the empire fantasy.
//
// THE FIVE PRIMITIVES (orthogonal, never bloat):
//   MOVE     — to a beacon / entity / sector (named targets, never raw coords)
//   MINE     — here, until cargo full or vein empty
//   INTERACT — contextual verb from target: sell / buy / load / unload / dock / repair / build
//   GUARD    — follow an entity, engage hostiles (how escorts work — allied NPC, no new engine)
//   WAIT     — on a condition: cargo full, hull<X, threat near, or a timer
//
// SCOPE (per IMPROVEMENT_IDEAS #28 refinement): the primitives exist as typed data; templates are
// named sequences; ONE runtime executes a drone's current template step-by-step. No conditional
// nodes in this pass (those unlock at a later tier per the V2 plan) — templates are straight-line
// loops for now, which is enough to prove the fantasy: you compose Mine→Move→Sell and a drone
// repeats it forever, earning while you do something else.
//
// Integration: this is an opt-in layer over the existing automation drone. A drone group with a
// `program` field runs the alphabet; a drone without one uses the legacy mine-to-buffer behavior
// (backward compatible). The alphabet reads/writes only its own program state on the group; cargo
// grants route through the canonical cargo.addCargo and credits through economy:grantCredits.

// Primitive type tags.
export const P = Object.freeze({
  MOVE: 'move',
  MINE: 'mine',
  INTERACT: 'interact',
  GUARD: 'guard',
  WAIT: 'wait',
});

// Built-in templates the player can assign without authoring. Each is a named sequence of steps.
// `target` is a beacon name (resolved at runtime to a world position/station); '*' = current/named.
export const TEMPLATES = Object.freeze({
  mine_to_depot: {
    id: 'mine_to_depot', name: 'Mine → Haul to Depot', desc: 'Mine the current field until full, fly to the depot beacon, sell, repeat.',
    steps: [
      { op: P.MINE, until: 'cargoFull' },
      { op: P.MOVE, target: 'depot' },
      { op: P.INTERACT, verb: 'sell' },
      { op: P.MOVE, target: 'field' },
    ],
  },
  patrol_guard: {
    id: 'patrol_guard', name: 'Guard the Player', desc: 'Follow the player and engage any hostile that comes near.',
    steps: [
      { op: P.GUARD, target: 'player' },
    ],
  },
  scout_report: {
    id: 'scout_report', name: 'Scout → Report', desc: 'Fly to a beacon, wait there watching for threats, return.',
    steps: [
      { op: P.MOVE, target: 'scout' },
      { op: P.WAIT, until: 'timer', seconds: 30 },
      { op: P.MOVE, target: 'depot' },
    ],
  },
});

// Resolve a beacon name to a world position. Beacons are named anchors the player places; for this
// pass 'depot' resolves to the player's current position (a stand-in until beacon placement lands)
// and 'field' to the nearest asteroid field, 'player' to the live player entity. Keeps templates
// portable (V2 §4 beacons-not-coords).
function resolveBeacon(name, ctx) {
  const state = ctx.state;
  const helpers = ctx.helpers || {};
  if (name === 'player') {
    const e = state.entities.get(state.playerId);
    return e ? { x: e.pos.x, z: e.pos.z, entity: e } : null;
  }
  if (name === 'depot' || name === 'home') {
    // nearest station (the natural depot); fall back to player position
    const p = state.entities.get(state.playerId);
    let best = null, bestD = Infinity;
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'station' || (e.data && e.data.isGate)) continue;
      if (!p) { best = e; break; }
      const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) return { x: best.pos.x, z: best.pos.z, entity: best, stationId: best.data && best.data.stationId };
    if (p) return { x: p.pos.x, z: p.pos.z };
    return null;
  }
  if (name === 'field' || name === 'rock') {
    // nearest live asteroid — the MINE target
    const g = ctx.group || {};
    const anchor = g.originPos || (state.entities.get(state.playerId) || {}).pos || { x: 0, z: 0 };
    let best = null, bestD = Infinity;
    const range = (g.deployRange || 450);
    for (const e of state.entityList) {
      if (!e.alive || e.type !== 'asteroid') continue;
      if (e.data && e.data.respawnAt != null) continue;
      const d = (e.pos.x - anchor.x) ** 2 + (e.pos.z - anchor.z) ** 2;
      if (d < bestD && d < range * range) { bestD = d; best = e; }
    }
    return best ? { x: best.pos.x, z: best.pos.z, entity: best } : null;
  }
  // Unknown beacon: treat as the player's position (safe default).
  const p = state.entities.get(state.playerId);
  return p ? { x: p.pos.x, z: p.pos.z } : null;
}

// Execute one tick of a drone group's program. Returns true if the group did meaningful work this
// tick (used by the automation system to gate accrual). Advances the program counter as steps
// complete; loops back to step 0 at the end (templates are loops by design).
//
// This is the runtime. It mutates only ctx.group.programState (the program counter + wait timer +
// cargo-full latch) and grants cargo/credits through canonical events. Movement is applied by
// steering the group's flying entities toward the resolved beacon (the existing _driveDrone helper
// shape), reusing the automation system's entity pool.
export function tickProgram(group, ctx, dt) {
  const tpl = group.program && TEMPLATES[group.program.templateId];
  if (!tpl) return false;
  const ps = group.programState || (group.programState = { pc: 0, waitT: 0, cargoWasFull: false });
  const step = tpl.steps[ps.pc];
  if (!step) { ps.pc = 0; return false; }

  const beacon = step.target ? resolveBeacon(step.target, { ...ctx, group }) : null;
  const cargo = ctx.state.player.cargo;
  const cargoFull = cargo && cargo.usedVolume >= cargo.capVolume - 0.01;

  switch (step.op) {
    case P.MINE: {
      // steer to the field beacon; accrue into cargo (not the legacy buffer) when on a rock.
      // Completion: cargo full OR no rock available.
      if (!beacon) { advance(ps, tpl); return false; }
      const onRock = ctx.steerTo(beacon, dt);
      if (onRock && !cargoFull) {
        ctx.mineIntoCargo(dt);
      }
      if (cargoFull || step.until === 'veinEmpty') {
        if (step.until === 'cargoFull' && cargoFull) { advance(ps, tpl); }
      }
      return onRock;
    }
    case P.MOVE: {
      if (!beacon) { advance(ps, tpl); return false; }
      const arrived = ctx.steerTo(beacon, dt);
      if (arrived) advance(ps, tpl);
      return true;
    }
    case P.INTERACT: {
      // sell: realize the group's mined cargo as credits at the depot station.
      if (step.verb === 'sell') {
        ctx.sellMinedCargo(beacon && beacon.stationId);
      }
      advance(ps, tpl);
      return true;
    }
    case P.GUARD: {
      // follow the target (player); engagement is the existing fleet-escort path.
      if (beacon) ctx.steerTo(beacon, dt);
      return true; // guard is a persistent state — never advances
    }
    case P.WAIT: {
      if (step.until === 'timer') {
        ps.waitT += dt;
        if (ps.waitT >= (step.seconds || 10)) { ps.waitT = 0; advance(ps, tpl); }
      }
      return false;
    }
    default:
      advance(ps, tpl);
      return false;
  }
}

function advance(ps, tpl) {
  ps.pc = (ps.pc + 1) % tpl.steps.length;
  ps.waitT = 0;
}

// Assign a template to a drone group (the UI calls this). Resets program state.
export function assignTemplate(group, templateId) {
  if (!TEMPLATES[templateId]) return false;
  group.program = { templateId };
  group.programState = { pc: 0, waitT: 0, cargoWasFull: false };
  return true;
}

// Clear a group's program (return to legacy mine-to-buffer behavior).
export function clearTemplate(group) {
  group.program = null;
  group.programState = null;
}
