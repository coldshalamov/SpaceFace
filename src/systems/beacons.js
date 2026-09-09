// Claim-beacon system (Micro-Loops — "a cheap one-slot claim beacon plants a temporary safe zone or
// marks a rich node; hostiles will sometimes investigate and fight over it, creating emergent
// skirmishes the player can exploit or avoid").
//
// A beacon is a cheap, temporary deployable dropped at the player's position (reuses the CLAIM key —
// U — when there's no claimable body in range). It:
//   • marks the spot (radar marker) + tags the nearest ore seam it sits on ("mark a rich node"),
//   • lures nearby hostile ships that AREN'T already dogfighting the player: their flight intent is
//     steered toward the beacon so they drift in to investigate, seeding skirmishes; once they
//     arrive they're released back to their own AI (so they mill / fight whatever's there).
//
// Owns state.beacons only (§0.6). A beacon is a lightweight state RECORD, not a spawned entity, so it
// can't perturb the renderer/physics/entity-index. The lure writes to hostiles' data.intent AFTER the
// AI system and BEFORE flight in UPDATE_ORDER, so it composes with either AI backend without touching
// AI internals. It is a strict no-op while no beacon is deployed, so the deterministic 47a sim (which
// never deploys one) is unaffected. Beacons are transient — not persisted across save/load.

const BEACON_COST = 250;            // cheap, one-slot
const BEACON_TTL = 45;              // seconds a beacon lives
const BEACON_MAX_ACTIVE = 2;        // active-at-once cap
const LURE_RADIUS = 1800;           // hostiles inside this drift toward the beacon
const ARRIVE_RADIUS = 220;          // once here they're released (AI resumes → mill / fight)
const PLAYER_GUARD_RADIUS = 320;    // ships this close to the player keep fighting the player, not lured
const NODE_SNAP_RADIUS = 1200;      // tag the nearest ore seam within this range as the "rich node"

export const beacons = {
  name: 'beacons',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    if (!Array.isArray(this.state.beacons)) this.state.beacons = [];
    this._nextId = 1;
    this.bus.on('beacon:deploy', () => this.deploy());
    // Beacons are transient; a loaded save starts with none.
    this.bus.on('save:loaded', () => { this.state.beacons = []; });
  },

  newGame() { this.state.beacons = []; this._nextId = 1; },

  // Deploy a beacon at the player's position. Validates the active cap + a cheap credit cost.
  deploy() {
    const state = this.state;
    if (state.mode !== 'flight') return false;
    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return false;

    const active = state.beacons.filter((b) => b.alive !== false);
    if (active.length >= BEACON_MAX_ACTIVE) {
      this.bus.emit('toast', { text: 'Beacon limit reached (' + BEACON_MAX_ACTIVE + ' active)', kind: 'warn', ttl: 2.5 });
      this.bus.emit('audio:cue', { id: 'ui_deny' });
      return false;
    }
    if ((state.player.credits || 0) < BEACON_COST) {
      this.bus.emit('toast', { text: 'Need ' + BEACON_COST + ' cr for a claim beacon', kind: 'error', ttl: 2.5 });
      this.bus.emit('audio:cue', { id: 'ui_deny' });
      return false;
    }

    this.bus.emit('economy:chargeCredits', { amount: BEACON_COST, reason: 'claim_beacon' });
    const pos = { x: player.pos.x, z: player.pos.z };
    const node = this._nearestNode(state, pos);
    const expireAt = (state.simTime || 0) + BEACON_TTL;
    // A beacon is a lightweight state record — not a spawned entity — so it can't perturb the
    // renderer/physics/entity-index (no beacon mesh exists) and is drawn straight from state.beacons.
    const rec = {
      id: 'beacon_' + (this._nextId++),
      x: pos.x, z: pos.z,
      expireAt,
      node: node ? node.label : null,
      alive: true,
    };
    state.beacons.push(rec);
    this.bus.emit('beacon:deployed', { id: rec.id, pos });
    this.bus.emit('toast', {
      text: node ? ('Claim beacon set · marking ' + node.label) : 'Claim beacon deployed · drawing attention',
      kind: 'good', ttl: 3,
    });
    this.bus.emit('audio:cue', { id: 'confirm' });
    return true;
  },

  update(dt, state) {
    // Deploy trigger: the flight-input edge flag (U in open space). Read BEFORE the empty-list
    // early-return so the first beacon can be planted. The UI router falls through in open space
    // (it owns U only when a claimable body is in range — see check-claim-base-input), so the key
    // reaches this deterministic sim-step verb instead of a DOM handler. `beacon:deploy` stays as a
    // programmatic API. Inert during the 47a golden (U never pressed → deployBeacon stays false).
    const acts = state.input && state.input.actions;
    if (acts && acts.deployBeacon && state.mode === 'flight') this.deploy();
    const list = state.beacons;
    if (!list || !list.length) return;         // no beacon → strict no-op (deterministic sim safe)
    if (state.mode !== 'flight') return;
    const now = state.simTime || 0;
    const player = state.entities.get(state.playerId);
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (!b.alive) { list.splice(i, 1); continue; }
      if (now >= b.expireAt) {
        b.alive = false;
        list.splice(i, 1);
        this.bus.emit('toast', { text: 'Claim beacon expired', kind: 'info', ttl: 2 });
        continue;
      }
      this._lure(state, b, player);
    }
  },

  // Steer nearby hostiles toward the beacon (intent override), leaving player-engagers alone.
  _lure(state, b, player) {
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    for (const e of ships) {
      if (!e.alive || e.type !== 'ship' || e.id === state.playerId) continue;
      if (e.team === 0) continue;                         // player-aligned (incl. wingmen) excluded
      if (e.data && e.data.isWingman) continue;
      const dx = b.x - e.pos.x, dz = b.z - e.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > LURE_RADIUS * LURE_RADIUS) continue;       // out of lure range
      if (d2 < ARRIVE_RADIUS * ARRIVE_RADIUS) continue;   // arrived → release to AI (mill / fight)
      if (player) {                                        // keep ships that are on the player fighting
        const pdx = player.pos.x - e.pos.x, pdz = player.pos.z - e.pos.z;
        if (pdx * pdx + pdz * pdz < PLAYER_GUARD_RADIUS * PLAYER_GUARD_RADIUS) continue;
      }
      const intent = (e.data && e.data.intent) || (e.data && (e.data.intent = {}));
      if (intent) driveToward(e, intent, dx, dz);
    }
  },

  // The nearest ore seam under the beacon (marks a rich node). Prefers a scanned seam's ore glyph.
  _nearestNode(state, pos) {
    let best = null, bestD = NODE_SNAP_RADIUS * NODE_SNAP_RADIUS;
    const list = (state.entityIndex && state.entityIndex.radarAsteroids) || state.entityList;
    for (const e of list) {
      if (!e.alive || e.type !== 'asteroid') continue;
      const d = (e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    const glyph = best.data && best.data.scanOreGlyph;
    return { id: best.id, label: glyph ? ('ore seam (' + glyph + ')') : 'ore seam' };
  },
};

// Project a world-space desired direction onto the ship's forward/right axes → flight intent, the
// same convention the AI's _drive uses (flight.applyIntent reads moveZ=forward, moveX=strafe).
function driveToward(e, intent, dirX, dirZ) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len, uz = dirZ / len;
  const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
  const fwd = cf * ux + sf * uz;
  const rt = -sf * ux + cf * uz;
  intent.moveZ = clamp1(fwd);
  intent.moveX = clamp1(rt);
  intent.aimAngle = Math.atan2(dirZ, dirX);
  intent.fire = false;   // drawn in to investigate, not firing on the way
}

function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
