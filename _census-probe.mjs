import { createAuthoritativeRuntime } from './src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from './src/runtime/nodeSystemFactoryTable.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from './src/data/featureFlags.js';
import { makeShipEntitySpec } from './src/systems/ships.js';
import { stuntGrammar } from './src/systems/stuntGrammar.js';
import {
  PROOF_SECTOR_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_PLAYER_HULL_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from './src/testing/lab/proofSixtySeconds.js';
import { farActorTableRadius, shouldVirtualizeFarActor } from './src/world/farActorTable.js';

const SEED = 14920;
const TICKS = Number(process.argv[2] || 480);

const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
const runtime = createAuthoritativeRuntime({
  profileId: 'production',
  nodeSafeOnly: true,
  seed: SEED,
  systemLookup: table,
  slots: {
    aiSlot: table.get('aiSlot'),
    flightSlot: table.get('flightSlot'),
    aiBackend: 'sg06-tactical',
    flightBackend: 'v3',
  },
});
const state = runtime.state;
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.flightBackend = 'v3';
state.settings.gameplay.aiBackend = 'sg06-tactical';
if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
  isPlayer: true,
  player: state.player,
  pos: { x: 0, z: 0 },
  fittings: [PROOF_SHOVE_WEAPON_ID],
  factionId: 'faction_free',
}));
state.playerId = player.id;
const world = runtime.getSystem('world');
world.enterSector(PROOF_SECTOR_ID);
const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'table-authority-census' });
player.vel.x = 0;
player.vel.z = 0;
const physics = runtime.getSystem('physics');
const prevFeatures = snapshotFeatureMaps();
applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
const ready = await physics.prepareBackend(state, { reset: true });
restoreFeatureMaps(prevFeatures);
console.log('ready', ready, 'player', JSON.stringify(player.pos), 'maxSpeed', player.maxSpeed);
runtime.bus.on('encounter:telegraph', (p) => {
  const dx = (p?.pos?.x || 0) - player.pos.x;
  const dz = (p?.pos?.z || 0) - player.pos.z;
  console.log('TELEGRAPH', state.tick, p?.kind, p?.encounterId, 'dist', Math.round(Math.hypot(dx, dz)));
});

const timeline = [];
const seenRocks = new Set();
for (let i = 0; i < TICKS; i++) {
  runtime.step(1 / 60);
  if ((i + 1) % 30 === 0) {
    for (const e of state.entityList) {
      if (!e || e.alive === false || e.type !== 'asteroid' || e.data?.opticStructureId) continue;
      if (seenRocks.has(e.id)) continue;
      seenRocks.add(e.id);
      if (i + 1 < 240) continue;
      const d = e.data || {};
      const dist = Math.round(Math.hypot((e.pos?.x || 0) - player.pos.x, (e.pos?.z || 0) - player.pos.z));
      console.log('NEW_ROCK', i + 1, e.id, dist, e.activity?.simTier, d.name || d.kind || d.role || d.source || d.spawnReason || '', Object.keys(d).slice(0, 12).join('|'));
    }
  }
  if ((i + 1) % 60 === 0) {
    const live = state.entityList.filter((e) => e && e.alive !== false && !e.data?.opticStructureId);
    const wrecksNow = live.filter((e) => e.type === 'wreck');
    const chips = wrecksNow.filter((e) => e.data?.collisionTearOff).length;
    const rocks = live.filter((e) => e.type === 'asteroid').length;
    timeline.push(`${i + 1}:w${wrecksNow.length}/c${chips}/a${rocks}/g${live.length}`);
  }
}
console.log('TIMELINE', timeline.join(' '));

const after = (state.entityList || []).filter((e) => e && e.alive !== false);
const gameplay = after.filter((e) => !(e.data && e.data.opticStructureId));
const far = state.world && state.world.farActors;
const farRows = far && far.rows ? far.rows.length : 0;
const wrecks = gameplay.filter((e) => e.type === 'wreck');
const byLabel = {};
for (const e of wrecks) {
  const label = (e.data && (e.data.scanLabel || e.data.name || e.data.kind)) || '(none)';
  byLabel[label] = (byLabel[label] || 0) + 1;
}
const px = player.pos.x, pz = player.pos.z;
const rows = wrecks.map((e) => {
  const d = e.data || {};
  const dx = (e.pos?.x || 0) - px;
  const dz = (e.pos?.z || 0) - pz;
  return {
    label: d.scanLabel || d.authoredScanLabel || d.name || d.kind || '(none)',
    wreckClass: d.wreckClass || null,
    name: d.name || null,
    victim: d.collisionTearOffOf || d.victimClass || null,
    keys: Object.keys(d).filter((k) => !['loot', 'salvagePool', 'proportions', 'ai'].includes(k)).slice(0, 18).join('|'),
    parent: d.parentType || null,
    kind: d.kind || null,
    role: d.role || null,
    site: d.worldSiteId || null,
    salvagePointId: d.salvagePointId != null,
    sort: d.sortPocketId || null,
    field: d.wreckFieldId || null,
    marker: !!d.markerId,
    structural: d.worldSiteStructural === true,
    job: d.jobId || null,
    tethered: !!(e.flags && e.flags.tethered) || !!d.tethered,
    dist: Math.round(Math.hypot(dx, dz)),
    tier: e.activity && e.activity.simTier,
    pinned: !!(e.activity && e.activity.pinnedExact),
    virt: shouldVirtualizeFarActor(e, state),
  };
});
rows.sort((a, b) => a.label.localeCompare(b.label) || a.dist - b.dist);
console.log(JSON.stringify({
  ticks: TICKS,
  gameplay: gameplay.length,
  entityList: after.length,
  farRows,
  liveWrecks: wrecks.length,
  byLabel,
  byType: gameplay.reduce((m, e) => {
    const t = e.type || '?';
    m[t] = (m[t] || 0) + 1;
    return m;
  }, {}),
  farTypes: (far && far.rows || []).reduce((m, r) => {
    const k = `${r.type || '?'}:${(r.data && (r.data.scanLabel || r.data.trafficRole || r.data.role)) || ''}`;
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {}),
}, null, 2));
const radii = farActorTableRadius(state);
console.log('RADII', JSON.stringify(radii), 'activityReach', state.world && state.world.activity && state.world.activity.physicsReachWu);
console.log('WRECKS');
for (const r of rows) console.log(JSON.stringify(r));
const ships = gameplay.filter((e) => e.type === 'ship' || e.type === 'drone');
const rocks = gameplay.filter((e) => e.type === 'asteroid');
const rockDist = rocks.map((e) => Math.round(Math.hypot((e.pos?.x || 0) - px, (e.pos?.z || 0) - pz))).sort((a, b) => a - b);
const byId = new Map(state.entityList.filter(Boolean).map((e) => [e.id, e]));
for (const e of wrecks.filter((w) => w.data?.collisionTearOff)) {
  const v = byId.get(e.data.collisionTearOffOf);
  console.log('CHIP_VICTIM', e.data.collisionTearOffOf, v ? `${v.type} ${v.data?.name || v.data?.scanLabel || v.data?.role || ''} alive=${v.alive}` : 'missing');
}
const farRocks = rocks.filter((e) => Math.hypot((e.pos?.x || 0) - px, (e.pos?.z || 0) - pz) > 1587);
console.log('FAR_ROCKS', farRocks.map((e) => {
  const d = e.data || {};
  return `${Math.round(Math.hypot(e.pos.x - px, e.pos.z - pz))}:${e.activity?.simTier || '-'}:${d.name || d.kind || d.role || d.asteroidId || '?'}:${d.pinned || e.activity?.pinnedExact ? 'pin' : ''}`;
}).join(' | '));
console.log('ROCKS', rocks.length, rockDist.join(','));
console.log('SHIPS', ships.length, 'virt', ships.filter((e) => shouldVirtualizeFarActor(e, state)).length);
console.log('shipTiers', JSON.stringify(ships.reduce((m, e) => {
  const t = (e.activity && e.activity.simTier) || 'none';
  m[t] = (m[t] || 0) + 1;
  return m;
}, {})));
runtime.dispose?.();
