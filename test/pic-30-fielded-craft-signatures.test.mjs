// PIC-30 — the fielded tanker and cutter carry job signatures like the other working craft.
//
// The Helios volatiles-tanker and inspection-cutter fixtures spawn real hulls but the cutter's
// job spec returned null, so it floated signatureless while barges, tugs and tenders all showed
// their working light. The fix lives in the two named owners: FIELDED_ROLE_JOB_KIND maps the
// fielded roles onto the kernel's kinds (tanker → hauler, customs → patrol), and the signature
// resolver aliases the same hull names so `resolveNpcJobSignature('tanker', …)` answers directly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import {
  resolveNpcJobSignature,
  NPC_JOB_SIGNATURE_PROFILES,
} from '../src/render/npcJobSignatureVfx.js';
import { OCCUPATIONAL_JOB_KIND_BY_ROLE } from '../src/data/occupationalTrafficCraft.js';

test('the tanker resolves the loaded-heartbeat / empty-bar pair', () => {
  assert.equal(resolveNpcJobSignature('tanker', 'transit', true), NPC_JOB_SIGNATURE_PROFILES.heavy_burn,
    'a laden volatiles tanker must show the loaded heartbeat — "amber heartbeat means mass"');
  assert.equal(resolveNpcJobSignature('tanker', 'transit', false), NPC_JOB_SIGNATURE_PROFILES.clean_burn);
  assert.equal(resolveNpcJobSignature('tanker', 'return', true), NPC_JOB_SIGNATURE_PROFILES.heavy_burn);
});

test('the cutter resolves the pin sweep across its beat', () => {
  for (const phase of ['transit', 'approach', 'hold']) {
    const sig = resolveNpcJobSignature('cutter', phase, false);
    assert.equal(sig, NPC_JOB_SIGNATURE_PROFILES.on_the_pin, `cutter in ${phase} must sweep`);
    assert.equal(sig.rhythm, 'pin-sweep');
  }
  // 'customs' is the spawned role name; it must answer the same sweep.
  assert.equal(resolveNpcJobSignature('customs', 'hold', false), NPC_JOB_SIGNATURE_PROFILES.on_the_pin);
});

test('the role map carries both fielded roles onto real kernel kinds', () => {
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.tanker, 'hauler');
  assert.equal(OCCUPATIONAL_JOB_KIND_BY_ROLE.customs, 'patrol');
});

function boot() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 1,
    nextEntityId: 500,
    meta: { seed: 4242 },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_helios_prime' },
    traffic: { freighters: [] },
    economy: { markets: {} },
    player: { pos: { x: 0, z: 0 }, tether: { active: false, targetId: null } },
    story: { flags: {} },
    ui: {},
  };
  const helpers = {};
  npcJobsRuntime.init({ state, bus, helpers, registry: null });
  helpers.spawnEntity = (spec) => {
    const ent = {
      ...spec,
      id: spec.id ?? state.nextEntityId++,
      alive: true,
      data: spec.data ? { ...spec.data } : {},
      flags: spec.flags ? { ...spec.flags } : {},
    };
    state.entities.set(ent.id, ent);
    state.entityList.push(ent);
    return ent;
  };
  // The fixture functions are module methods; driving them directly keeps this focused —
  // traffic.init's full listener surface is not under test here.
  traffic.state = state;
  traffic.helpers = helpers;
  traffic._active = [];
  return { state, bus, helpers };
}

const HELIOS = { id: 100, type: 'station', name: 'Helios Station', pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } };
const DEPOT = { id: 101, type: 'station', name: 'Depot', pos: { x: 800, z: 400 }, data: { stationId: 'station_depot' } };
const SECTOR = { id: 'sector_helios_prime', factionId: 'faction_free' };

test('a seed-4242 Helios tanker spawn carries a signature-resolving job', () => {
  const { helpers } = boot();
  const list = [];
  traffic._ensureHeliosTankerFixture('sector_helios_prime', SECTOR, [HELIOS, DEPOT], list);
  const tankerRec = list.find((r) => r && r.role === 'tanker');
  assert.ok(tankerRec, 'the tanker fixture must field a record');
  const entry = helpers.npcJobs.byEntity(tankerRec.id);
  assert.ok(entry, 'the fielded tanker must carry a durable job');
  assert.equal(entry.kind, 'hauler');
  // Whatever phase it is in, the signature layer must answer — and its transit legs must
  // resolve to the Code's load distinction the line names.
  assert.ok(resolveNpcJobSignature(entry.kind, entry.job.phase, false));
  assert.equal(resolveNpcJobSignature(entry.kind, 'transit', true), NPC_JOB_SIGNATURE_PROFILES.heavy_burn);
  assert.equal(resolveNpcJobSignature(entry.kind, 'transit', false), NPC_JOB_SIGNATURE_PROFILES.clean_burn);
});

test('a seed-4242 Helios customs spawn carries the pin sweep', () => {
  const { helpers } = boot();
  const list = [];
  traffic._ensureHeliosCustomsFixture('sector_helios_prime', SECTOR, [HELIOS, DEPOT], list);
  const customsRec = list.find((r) => r && r.role === 'customs');
  assert.ok(customsRec, 'the customs fixture must field a record');
  const entry = helpers.npcJobs.byEntity(customsRec.id);
  assert.ok(entry, 'the fielded customs cutter must carry a durable job — today it gets none');
  assert.equal(entry.kind, 'patrol',
    'a customs cutter runs a beat, not a freight loop — patrol is its honest kind');
  assert.ok(resolveNpcJobSignature(entry.kind, entry.job.phase, false));
  assert.equal(resolveNpcJobSignature(entry.kind, 'hold', false), NPC_JOB_SIGNATURE_PROFILES.on_the_pin,
    'the cutter on its beat must show the measured-box sweep');
});
