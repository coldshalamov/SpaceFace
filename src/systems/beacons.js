// Claim-beacon system (Micro-Loops — "a cheap one-slot claim beacon plants a temporary safe zone or
// marks a rich node; hostiles will sometimes investigate and fight over it, creating emergent
// skirmishes the player can exploit or avoid").
//
// A beacon is a cheap, temporary deployable dropped at the player's position (reuses the CLAIM key —
// U — when there's no claimable body in range). It:
//   • EXISTS in the world: deploy also spawns a transient story-prop buoy entity (type 'beacon') —
//     the same route-nav buoy the renderer builds for lane/story beacons — so the skirmish has a
//     physical focal point the player can see, tether, and scan ("Claim beacon"),
//   • marks the spot (radar marker) + tags the nearest ore seam it sits on ("mark a rich node"),
//   • lures nearby hostile ships that AREN'T already dogfighting the player: their flight intent is
//     steered toward the beacon so they drift in to investigate, seeding skirmishes; once they
//     arrive they're released back to their own AI (so they mill / fight whatever's there).
//
// Owns state.beacons plus the transient buoy entities it spawns (§0.6). The state RECORD stays the
// deterministic sim brain and the radar's data source; the spawned entity is presentation + physical
// presence only (no interaction profile targets 'beacon'; the physics statics layer builds it as a
// FIXED body, which is what actually anchors it — mass is inert for fixed bodies). Deploy is
// reached only through the player's deploy verb, so the deterministic 47a sim (which never deploys
// one) is unaffected. The buoy is transient — not flags.persistent, so saves never serialize it and
// the load path's transient-entity clear drops it; state.beacons resets on save:loaded to match.

import { queryNearbyEntities } from '../core/spatialQuery.js';

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
    this._lureScratch = [];
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
    // The buoy drops AFT of the hull, not centered in it: the physics statics layer builds the
    // beacon entity as a fixed collider, and an r=5 ball spawned inside the player's capsule would
    // depenetrate the ship in an arbitrary direction on every deploy. Record, lure, radar marker
    // and entity all use this same dropped point.
    const dropDist = (player.radius || 12) + 18;
    const rot = Number.isFinite(player.rot) ? player.rot : 0;
    const pos = {
      x: player.pos.x - Math.cos(rot) * dropDist,
      z: player.pos.z - Math.sin(rot) * dropDist,
    };
    const node = this._nearestNode(state, pos);
    const expireAt = (state.simTime || 0) + BEACON_TTL;
    const rec = {
      id: 'beacon_' + (this._nextId++),
      x: pos.x, z: pos.z,
      expireAt,
      node: node ? node.label : null,
      alive: true,
      entityId: null,
    };
    rec.entityId = this._spawnBuoy(state, rec);
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
        this._despawnBuoy(b);
        list.splice(i, 1);
        this.bus.emit('toast', { text: 'Claim beacon expired', kind: 'info', ttl: 2 });
        continue;
      }
      this._lure(state, b, player);
    }
  },

  // The world presence: a transient story-prop buoy (the renderer's route-nav visual — mast, fins,
  // blinking amber lens), spawned through the standard entity contract so tether/beam/scanner all
  // just work on it. Absent helpers (focused harnesses) degrade to the record-only beacon.
  _spawnBuoy(state, rec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const ent = spawnEntity({
      type: 'beacon',
      pos: { x: rec.x, z: rec.z },
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Claim beacon',
        storyPropKind: 'claim_beacon',
        claimBeaconId: rec.id,
        tetherable: true,
        // The latch gate's real field (src/systems/tetherGameplay.js reads data.masslineTetherable);
        // `tetherable` above stays as descriptive metadata matching the other story-prop writers.
        masslineTetherable: true,
      },
    });
    return (ent && ent.id != null) ? ent.id : null;
  },

  _despawnBuoy(rec) {
    const id = rec && rec.entityId;
    if (id == null) return;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') removeEntity(id);
    rec.entityId = null;
  },

  // Steer nearby hostiles toward the beacon (intent override), leaving player-engagers alone.
  _lure(state, b, player) {
    const fallback = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    const scratch = this._lureScratch || (this._lureScratch = []);
    const ships = queryNearbyEntities(state, { x: b.x, z: b.z }, LURE_RADIUS, scratch, fallback);
    for (const e of ships) {
      if (!e || !e.alive || !e.pos || e.type !== 'ship' || e.id === state.playerId) continue;
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
