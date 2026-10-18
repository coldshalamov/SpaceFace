import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { isThrowArmPayload } from '../src/systems/input.js';
import { save, preflightSaveImport } from '../src/save/saveSystem.js';
import { encodeSavePayloadFinal, restorePrepareSaveJsonAsync } from '../src/save/saveWorker.js';
import { expandNativeAttestationTables } from '../src/save/nativeAttestationTables.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

// These are real SaveSystem captures, not current envelopes with a lowered version.
// v15: 2e2f2d661afee3a1487557e680cb484ed26bc782 (native schema 3)
// v16: 7c46b0ced576f82b9bb1b28347a9c16e597945fc (native schema 4)
// v17: ffb7dff92b8be65fef65d231488881670c998ae0 (native schema 4)
// v18: current producer at capture; regeneration/provenance is beside the fixtures.
const versions = [15, 16, 17, CURRENT_VERSION];
const massPerUnit = new Map(COMMODITIES.map(item => [item.id, item.massPerU]));
const fixtureText = (version, attached) => readFileSync(new URL(
  `./fixtures/saves/continue-v${version}-${attached ? 'tether' : 'free'}.json`, import.meta.url), 'utf8');
const cargoMass = items => Object.entries(items).reduce((sum, [id, qty]) => {
  assert.ok(massPerUnit.has(id), `fixture commodity ${id} must remain known`);
  return sum + qty * massPerUnit.get(id);
}, 0);

async function session() {
  const sim = createSimulation({ seed: 4242, systems: [ships, cargo, combat, flightV3, tetherGameplay, physics, save] });
  const state = sim.state, shipOwner = sim.registry.get('ships');
  state.mode = 'flight';
  state.ui.screenStack.length = 0;
  state.save.currentSlot = 'previous-session';
  shipOwner.newGame();
  const owned = state.player.ownedShips[0];
  const player = sim.spawn(makeShipEntitySpec(owned.defId, { team: 0, isPlayer: true,
    player: state.player, fittings: owned.fittings, pos: { x: -200, z: -80 } }));
  state.playerId = player.id;
  shipOwner.recomputeActiveShip();
  assert.equal(sim.registry.get('cargo').addCargo('cmdty_refined_metals', 99), 99);
  sim.registry.get('cargo').recompute();
  shipOwner.flushCargoMassRefresh();
  // Saved target 2 must not resolve to this outgoing asteroid after Continue.
  const rock = sim.spawn({ type: 'asteroid', mass: 200, radius: 6, pos: { x: -100, z: -80 },
    flags: { persistent: true }, data: { name: 'Old rock' } });
  const owner = sim.registry.get('physics');
  assert.equal(await owner.prepareBackend(state), true);
  const line = sim.registry.get('combat').kernel.attachments.create({
    defId: 'tether_standard', ownerId: player.id, targetId: rock.id,
  });
  assert.equal(line.ok, true, JSON.stringify(line));
  sim.registry.get('tetherGameplay').update(1 / 60, state);
  assert.equal(state.player.tether.active, true);
  return { sim, state, owner, saver: sim.registry.get('save'),
    dispose() { owner._sg02?.dispose(); sim.dispose(); } };
}

async function prepare(raw) {
  const prepared = await restorePrepareSaveJsonAsync(raw, CURRENT_VERSION);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(preflightSaveImport(prepared.env).ok, true);
  return prepared.env;
}

async function withPhysics(raw, kind) {
  if (kind === 'native') return raw;
  const envelope = JSON.parse(raw);
  if (kind === 'scalar') envelope.data.physics.snapshot = '';
  else envelope.data.physics = null;
  // Re-encode an actual capture through the production checksum/wire owner.
  const { data, ...descriptor } = envelope;
  const encoded = await encodeSavePayloadFinal({ descriptor, data });
  assert.equal(encoded.ok, true, JSON.stringify(encoded));
  return encoded.json;
}

function assertRestored(state, envelope, attached) {
  const player = state.entities.get(state.playerId), expectedMass = cargoMass(envelope.data.cargo.items);
  assert.deepEqual(state.player.cargo.items, envelope.data.cargo.items);
  assert.equal(state.player.cargo.usedMass, expectedMass, 'Continue rebuilds mass from the restored items');
  assert.equal(player.data.derived.cargoMass, expectedMass, 'ship derivation reads restored cargo');
  assert.equal(player.data.derived.mass, player.data.derived.dryMass + expectedMass);
  assert.equal(player.physicsBody.mass, player.data.derived.mass);
  assert.equal(player.mass, player.data.derived.mass);
  assert.equal(state.meta.version, CURRENT_VERSION);
  for (const key of ['hull', 'shield', 'cap']) assert.equal(player[key], envelope.data.entities.player[key]);
  if (attached) {
    const tether = state.player.tether, attachment = state.combat.attachments.byId[tether.attachmentId];
    const target = state.entityList.find(entity => entity.data?.fixtureMarker === 'continue-crate');
    assert.ok(target, 'saved cargo crate survives Continue');
    assert.equal(tether.active, true);
    assert.equal(tether.targetId, target.id, 'first restored input sees the same remapped body as the line');
    assert.notEqual(target.id, envelope.data.player.tether.targetId, 'case exercises an actual ID remap');
    assert.equal(attachment.state, 'active');
    assert.equal(attachment.ownerId, player.id);
    assert.equal(attachment.targetId, target.id);
    assert.equal(attachment.ownerGeneration, player.occupantGeneration);
    assert.equal(attachment.targetGeneration, target.occupantGeneration);
    assert.equal(isThrowArmPayload(state), true, 'production RMB arbitration recognizes the restored crate');
  } else {
    assert.notEqual(state.player.tether?.active, true, 'a free save cannot inherit an outgoing line');
    assert.equal(Object.values(state.combat.attachments.byId).filter(line => line.state === 'active').length, 0);
    assert.equal(isThrowArmPayload(state), false);
  }
}

for (const version of versions) for (const attached of [false, true]) {
  test(`v${version} ${attached ? 'tethered' : 'free'} Continue: native, scalar, missing and rejected envelopes`, async () => {
    for (const kind of ['native', 'scalar', 'missing']) {
      const raw = fixtureText(version, attached), captured = JSON.parse(raw);
      assert.equal(captured.version, version);
      assert.equal(captured.data.physics.schema, version === 15 ? 3 : 4);
      const envelope = await prepare(await withPhysics(raw, kind));
      const h = await session();
      try {
        const domains = new Map(), differ = createDomainDiffer();
        const mirror = () => {
          for (const update of differ.diff(h.state, h.state.tick).updates) {
            applyDomainPathUpdate(domains, update, new Set());
          }
        };
        mirror();
        let completions = 0;
        const complete = h.owner.completeRestoreSteps;
        h.owner.completeRestoreSteps = function* (...args) {
          completions++;
          // This boundary precedes native publication and the first input/flight update.
          assertRestored(h.state, envelope, attached);
          return yield* complete.apply(this, args);
        };
        assert.equal(h.saver.loadEnvelope(envelope, `matrix-v${version}-${kind}`), true);
        assert.equal(completions, 1, 'normal save epilogue completes the real physics owner once');
        assertRestored(h.state, envelope, attached);
        const player = h.state.entities.get(h.state.playerId), record = h.owner._sg02.records.get(player.id);
        assert.equal(record.body.isValid(), true);
        assert.ok(Math.abs(record.body.mass() - player.physicsBody.mass) < 1e-5);
        if (kind === 'missing') {
          assert.deepEqual(h.state.physicsRuntime.nativeRestore,
            { mode: 'scalar', exact: false, reason: 'legacy_missing' });
          assert.equal(record._playerContactLastTick ?? null, null);
          assert.equal(record._playerContactCumulativeDeltaV ?? 0, 0, 'absent legacy debt stays absent');
        } else {
          const saved = expandNativeAttestationTables(captured.data.physics).bodies[captured.data.entities.player.id];
          assert.equal(record._playerContactLastTick, saved.contactEpisode.lastTick);
          assert.equal(record._playerContactCumulativeDeltaV, 4, 'Continue cannot refill the recent contact budget');
          assert.equal(h.state.physicsRuntime.nativeRestore.mode, kind);
          assert.equal(h.state.physicsRuntime.nativeRestore.exact, kind === 'native');
        }
        mirror();
        assert.equal(domains.get('player').cargo.usedMass, h.state.player.cargo.usedMass);
        assert.deepEqual(domains.get('player').tether, h.state.player.tether);
        assert.deepEqual(domains.get('combat').attachments, h.state.combat.attachments);

        // Flight consumes the restored mirror before tetherGameplay can adopt/refresh it.
        h.state.input.moveZ = 1; h.state.input.turnIntent = 1;
        h.sim.registry.get('flight').update(1 / 60, h.state);
        if (attached) {
          assert.equal(player._flightFrame.orbitAssist.active, true, JSON.stringify(player._flightFrame.orbitAssist));
          assert.ok(Math.abs(player._flightFrame.orbitAssist.radius - 60) < 1e-5);
        }
        h.owner.update(1 / 60, h.state);
        if (attached) {
          const line = h.owner._sg02.attachments.get(h.state.player.tether.attachmentId);
          assert.equal(line.owner.entity, player);
          assert.equal(line.target.entity.id, h.state.player.tether.targetId, 'real native constraint binds the restored crate');
        } else assert.equal(h.owner._sg02.attachments.size, 0);
        assert.equal(record.body.isValid(), true, 'the first real solver step after Continue completes');
        assert.ok(Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z));
        const resaved = h.saver.serialize('matrix-resaved');
        assert.equal(resaved.version, CURRENT_VERSION);
        assert.equal((await prepare(JSON.stringify(resaved))).version, CURRENT_VERSION);
      } finally { h.dispose(); }
    }
    for (const hostile of ['truncated', 'checksum']) await assertRejected(version, attached, hostile);
  });
}

async function assertRejected(version, attached, hostile) {
  const h = await session();
  try {
    const original = fixtureText(version, attached);
    const envelope = JSON.parse(original);
    envelope.checksum = 'invalid';
    const raw = hostile === 'truncated' ? original.slice(0, -100) : JSON.stringify(envelope);
    const player = h.state.entities.get(h.state.playerId), record = h.owner._sg02.records.get(player.id);
    const before = structuredClone({ player: h.state.player, ids: [...h.state.entities.keys()],
      slot: h.state.save.currentSlot, tick: h.state.tick, simTime: h.state.simTime, mode: h.state.mode });
    let loaded = 0;
    h.sim.bus.on('save:loaded', () => loaded++);
    const result = await restorePrepareSaveJsonAsync(raw, CURRENT_VERSION);
    assert.equal(result.ok, false);
    assert.equal(result.reason, hostile === 'truncated' ? 'parse_failed' : 'checksum');
    if (hostile === 'checksum') assert.equal(h.saver.loadEnvelope(envelope, 'hostile'), false);
    assert.deepEqual({ player: h.state.player, ids: [...h.state.entities.keys()],
      slot: h.state.save.currentSlot, tick: h.state.tick, simTime: h.state.simTime, mode: h.state.mode }, before);
    assert.equal(h.state.entities.get(h.state.playerId), player);
    assert.equal(h.owner._sg02.records.get(player.id), record);
    assert.equal(record.body.isValid(), true);
    assert.equal(loaded, 0);
    h.owner.update(1 / 60, h.state);
    assert.equal(record.body.isValid(), true, 'the previous session remains playable');
  } finally { h.dispose(); }
}
