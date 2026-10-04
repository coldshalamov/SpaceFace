// SFQ-B141 — one Courier delivery is a real physical transaction, not an inventory
// grant. The mail is a jettisoned-cargo pod carrying source custody (ownerId = the
// courier frame), a route (originId -> destinationId), and recipient acceptance through
// the world-site receiver ledger (evaluate/commitReceiverAcceptance). This file pins the
// four outcomes the packet requires:
//
//   1. The token exists in space — a persistent colliding pod in the frame's custody;
//      standing next to the courier grants nothing to the hold.
//   2. Delivery settles exactly once — the destination site's receiver commits one
//      receipt, the body is consumed, and later ticks/receipts never re-deliver.
//   3. Intercept/divert changes the outcome — scooping the pod (committed
//      pickup:collected) marks the mail intercepted, files L06/N08, and the recipient
//      never gets its receipt; a knocked-loose pod becomes free cargo; carrying the held
//      token home through the destination radius closes custody as a late delivery.
//   4. Rematerialization/save re-entry never duplicates the token — the durable record
//      on ae.machineSites drives exactly one body per tokenId, and a settled token
//      never re-mints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES, MACHINE_KINDS } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  materializeMachineLayer,
  tickMachineLayer,
  handleMachinePickupCollected,
} from '../src/systems/precursorMachines.js';
import {
  serializeAlienEcologyState,
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
} from '../src/systems/alienEcology.js';
import { addCargo } from '../src/systems/cargo.js';

const SITE = MACHINE_SITES.io_listening_field;
const KIND = MACHINE_KINDS.courier;
const DT = 1 / 60;

function makeState(sectorId = SITE.sectorId) {
  return {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
}

function makeWorld(state, emitLog = []) {
  const world = {
    state,
    registry: { get: () => null },
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: null,
  };
  world.bus = {
    emit: (type, p) => {
      emitLog.push({ type, p });
      // The live world.js bindings, mirrored: ecology events to the ecology handler, a
      // committed pickup receipt to the machine layer's custody resolution.
      if (type.startsWith('ecology:')) handleAlienEcologyEvent(world, type, p);
      if (type === 'pickup:collected') handleMachinePickupCollected(world, p);
    },
  };
  return world;
}

function makePlayer(state, x, z) {
  const p = { id: state.playerId, type: 'player',
    pos: { x, z }, vel: { x: 0, z: 0 }, data: { fittings: [] } };
  state.entities.set(state.playerId, p);
  state.entityList.push(p);
  return p;
}

function tokenPods(state) {
  return state.entityList.filter((e) => e.type === 'payload'
    && e.alive !== false && e.data && e.data.machineToken);
}

function courierOf(state) {
  return state.entityList.find((e) => e.type === 'machine'
    && e.data && e.data.machine && e.data.machine.kind === 'courier');
}

function materializeIo(state) {
  const world = makeWorld(state, []);
  materializeMachineLayer(world, { id: SITE.sectorId }, world.active);
  return world;
}

function simulate(world, state, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    state.simTime += DT;
    tickMachineLayer(world, DT);
  }
}

// ── 1. The token exists in space, carrying custody + route — approach grants nothing ────
test('the courier tows a persistent colliding pod with custody and a route', () => {
  const state = makeState();
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: SITE.sectorId }, world.active);
  const courier = courierOf(state);
  assert.ok(courier, 'courier cast');
  // Old behavior check: the player parked on the frame must not find a hold grant.
  makePlayer(state, courier.pos.x, courier.pos.z);
  tickMachineLayer(world, DT);
  assert.equal(state.player.cargo.items.cmdty_gate_handshake || 0, 0,
    'approach alone grants nothing');

  const pods = tokenPods(state);
  assert.equal(pods.length, 1, 'exactly one token body exists');
  const pod = pods[0];
  // It is a real body in space — colliding, physics-backed, save-persistent.
  assert.equal(pod.collides, true);
  assert.ok(pod.physicsBody && pod.physicsBody.mass > 0, 'mass-backed body');
  assert.equal(pod.flags && pod.flags.persistent, true, 'persistent across save');
  // Source custody: the frame owns it; the route stamps origin -> destination.
  assert.equal(pod.data.ownerId, courier.id, 'courier is the custody owner');
  assert.equal(pod.data.ownerName, 'Courier frame');
  assert.equal(pod.data.originId, SITE.siteId, 'route origin is the sending site');
  assert.ok(pod.data.destinationId, 'route destination is stamped');
  assert.equal(pod.data.machineToken.tokenId,
    `machine-token:${SITE.siteId}`, 'token identity is the site-keyed durable id');
  // The cargo the pod carries is the route-authority instrument — collectible content,
  // not a narrative flag.
  assert.equal(pod.data.salvagePool.cmdty_gate_handshake, 1);
  // The durable record is minted on the site row, open while the body rides.
  const token = ensureAlienEcologyState(state).machineSites[SITE.siteId].courierToken;
  assert.ok(token, 'durable token record minted');
  assert.equal(token.status, 'in_transit');
  // The pod physically follows the frame — custody is spatial, not a flag.
  simulate(world, state, 1);
  const d2 = (pod.pos.x - courier.pos.x) ** 2 + (pod.pos.z - courier.pos.z) ** 2;
  assert.ok(d2 <= (KIND.strayR * KIND.strayR), 'the pod rides inside courier custody');
  assert.equal(pod.data.machineCarriedBy, courier.id, 'the frame carries it');
});

// ── 2. Delivery settles exactly once through the site receiver ──────────────────────────
test('the destination receiver accepts the pod once and only once', () => {
  const state = makeState();
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: SITE.sectorId }, world.active);
  makePlayer(state, -3000, 3000); // far away — observer only
  tickMachineLayer(world, DT);
  const token = ensureAlienEcologyState(state).machineSites[SITE.siteId].courierToken;
  const pod = tokenPods(state)[0];
  assert.ok(pod && token.status === 'in_transit');
  // Compress the signing dwell: the recipient countersigns once the mail is of age.
  token.readyAt = state.simTime;
  simulate(world, state, 12); // the frame carries the pod inside the intake radius
  assert.equal(token.status, 'delivered', 'receiver committed the delivery');
  assert.equal(pod.alive, false, 'the body is consumed by the recipient');
  const receiver = ensureAlienEcologyState(state)
    .machineSites[token.destSiteId].courierReceiver;
  assert.ok(receiver && receiver.acceptedReceipts[token.receiptId] === 1,
    'exactly one committed receipt in the receiver ledger');
  const deliveries = emitLog.filter((e) => e.type === 'machine:tokenDelivered');
  assert.equal(deliveries.length, 1, 'one delivery event, ever');
  // Settled tokens never re-deliver and never re-mint a body.
  simulate(world, state, 4);
  assert.equal(tokenPods(state).length, 0, 'no new pod after settlement');
  assert.equal(emitLog.filter((e) => e.type === 'machine:tokenDelivered').length, 1);
});

// ── 3a. Intercept changes the outcome: the recipient never gets its mail ────────────────
test('scooping the pod intercepts the mail — destination procedure changes', () => {
  const state = makeState();
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: SITE.sectorId }, world.active);
  const player = makePlayer(state, 0, 0);
  tickMachineLayer(world, DT);
  const token = ensureAlienEcologyState(state).machineSites[SITE.siteId].courierToken;
  const pod = tokenPods(state)[0];
  // A committed pickup receipt (what mining._collectPayload emits after cargo accepts)
  // is the custody transfer — the handler settles the token on it.
  world.bus.emit('pickup:collected', {
    pickupId: pod.id, collectorId: player.id, kind: 'cargo',
    amount: 1, commodityId: 'cmdty_gate_handshake', acceptedAmount: 1,
    pos: { x: pod.pos.x, z: pod.pos.z },
  });
  assert.equal(token.status, 'intercepted');
  assert.equal(token.settledBy, player.id);
  const ae = ensureAlienEcologyState(state);
  assert.ok(ae.evidence.L06, 'intercepting the mail files L06');
  assert.equal(ae.machineSites[SITE.siteId].setpieces.N08, true, 'N08 fired');
  // The destination's receiver ledger stays empty — the delivery can no longer settle.
  simulate(world, state, 12);
  const receiver = ae.machineSites[token.destSiteId].courierReceiver;
  assert.ok(!receiver || !receiver.acceptedReceipts[token.receiptId],
    'the recipient never receives intercepted mail');
  assert.equal(emitLog.filter((e) => e.type === 'machine:tokenDelivered').length, 0);
  // A rejected/zero receipt does NOT settle the token — the mail keeps riding.
  const state2 = makeState();
  const world2 = materializeIo(state2);
  makePlayer(state2, 0, 0);
  tickMachineLayer(world2, DT);
  const token2 = ensureAlienEcologyState(state2).machineSites[SITE.siteId].courierToken;
  const pod2 = tokenPods(state2)[0];
  world2.bus.emit('pickup:collected', {
    pickupId: pod2.id, collectorId: state2.playerId, kind: 'cargo',
    amount: 1, commodityId: 'cmdty_gate_handshake', acceptedAmount: 0, rejectedAmount: 1,
    pos: { x: pod2.pos.x, z: pod2.pos.z },
  });
  assert.equal(token2.status, 'in_transit', 'full-hold rejection leaves the mail riding');
});

// ── 3b. Divert: a pod dragged off the frame goes loose; the held token can come home ────
test('a pod dragged out of custody goes loose, and a held token returns to the site', () => {
  const state = makeState();
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: SITE.sectorId }, world.active);
  const courier = courierOf(state);
  const player = makePlayer(state, 0, 0);
  tickMachineLayer(world, DT);
  const token = ensureAlienEcologyState(state).machineSites[SITE.siteId].courierToken;
  const pod = tokenPods(state)[0];
  // Physically drag the pod beyond the stray radius — a tether haul, a shove — custody
  // breaks and the mail becomes loose cargo anyone can take or carry home.
  pod.pos.x = courier.pos.x + KIND.strayR + 50;
  pod.pos.z = courier.pos.z;
  tickMachineLayer(world, DT);
  assert.equal(token.status, 'loose');
  assert.ok(pod.alive !== false, 'the pod survives as loose cargo');
  assert.ok(emitLog.some((e) => e.type === 'comms:log' && /ROUTE MAIL ADRIFT/.test(e.p.text)));
  // A loose pod parked inside the intake radius still settles — physical return counts.
  token.readyAt = 0;
  pod.pos.x = token.destPos.x;
  pod.pos.z = token.destPos.z;
  tickMachineLayer(world, DT);
  assert.equal(token.status, 'delivered', 'loose mail brought home still delivers');
  assert.equal(pod.alive, false);

  // Second route: player intercepted the token, then flies the held unit back to the site.
  const stateB = makeState();
  const worldB = materializeIo(stateB);
  makePlayer(stateB, 0, 0);
  tickMachineLayer(worldB, DT);
  const tokenB = ensureAlienEcologyState(stateB).machineSites[SITE.siteId].courierToken;
  const podB = tokenPods(stateB)[0];
  worldB.bus.emit('pickup:collected', {
    pickupId: podB.id, collectorId: stateB.playerId, kind: 'cargo',
    amount: 1, commodityId: 'cmdty_gate_handshake', acceptedAmount: 1,
    pos: { x: podB.pos.x, z: podB.pos.z },
  });
  assert.equal(tokenB.status, 'intercepted');
  addCargo(stateB, 'cmdty_gate_handshake', 1, 'test_intercept'); // the committed hold write
  player.pos.x = tokenB.destPos.x;
  player.pos.z = tokenB.destPos.z;
  const playerB = stateB.entities.get(stateB.playerId);
  playerB.pos.x = tokenB.destPos.x;
  playerB.pos.z = tokenB.destPos.z;
  tickMachineLayer(worldB, DT);
  assert.equal(tokenB.status, 'delivered', 'a returned token closes custody late');
  assert.equal(stateB.player.cargo.items.cmdty_gate_handshake || 0, 0,
    'the receiver takes the held unit through the cargo writer');
  const receiverB = ensureAlienEcologyState(stateB)
    .machineSites[tokenB.destSiteId].courierReceiver;
  assert.ok(receiverB.acceptedReceipts[tokenB.receiptId] === 1,
    'late delivery commits the same single receipt');
});

// ── 4. Rematerialization and save re-entry never duplicate the token ────────────────────
test('re-entry re-bodies the same token once; a settled token never re-mints', () => {
  // In-flight save: serialize with the pod live, restore onto a fresh state, re-enter.
  const state = makeState();
  const world = materializeIo(state);
  makePlayer(state, 0, 0);
  tickMachineLayer(world, DT);
  const token = ensureAlienEcologyState(state).machineSites[SITE.siteId].courierToken;
  assert.equal(token.status, 'in_transit');
  const wire = JSON.parse(JSON.stringify(serializeAlienEcologyState(state)));

  const fresh = makeState();
  deserializeAlienEcologyState(fresh, wire);
  const world2 = materializeIo(fresh);
  makePlayer(fresh, 0, 0);
  simulate(world2, fresh, 2);
  const pods = tokenPods(fresh);
  assert.equal(pods.length, 1, 'one body after re-entry — adopted or re-bodied, never two');
  assert.equal(pods[0].data.machineToken.tokenId, token.tokenId, 'same token identity');
  const token2 = ensureAlienEcologyState(fresh).machineSites[SITE.siteId].courierToken;
  assert.equal(token2.tokenId, token.tokenId, 'the durable record survived the wire');
  // Further ticks still hold at exactly one body.
  simulate(world2, fresh, 2);
  assert.equal(tokenPods(fresh).length, 1);

  // Settled save: a delivered token restores as delivered — no body, no re-delivery.
  const stateD = makeState();
  const worldD = makeWorld(stateD, []);
  materializeMachineLayer(worldD, { id: SITE.sectorId }, worldD.active);
  makePlayer(stateD, -3000, 3000);
  tickMachineLayer(worldD, DT);
  const tokenD = ensureAlienEcologyState(stateD).machineSites[SITE.siteId].courierToken;
  tokenD.readyAt = 0;
  simulate(worldD, stateD, 12);
  assert.equal(tokenD.status, 'delivered');
  const wireD = JSON.parse(JSON.stringify(serializeAlienEcologyState(stateD)));
  const freshD = makeState();
  deserializeAlienEcologyState(freshD, wireD);
  const worldD2 = materializeIo(freshD);
  makePlayer(freshD, -3000, 3000);
  simulate(worldD2, freshD, 3);
  assert.equal(tokenPods(freshD).length, 0, 'a settled token re-mints nothing');
  const tokenD2 = ensureAlienEcologyState(freshD).machineSites[SITE.siteId].courierToken;
  assert.equal(tokenD2.status, 'delivered', 'the settlement survives the wire');
  const receiverD = ensureAlienEcologyState(freshD)
    .machineSites[tokenD2.destSiteId].courierReceiver;
  assert.ok(receiverD.acceptedReceipts[tokenD2.receiptId] === 1,
    'the committed receipt survives the wire');
});
