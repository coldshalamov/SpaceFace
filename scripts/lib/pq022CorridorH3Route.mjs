// PQ-022 H3 route drivers.
//
// The owner seams are the accepted PQ-022 H1 corridor drivers in
// scripts/probe-pq022-corridor-asset-leaves.mjs: visible fixed-seed New Game, the registered
// world.enterSector owner, asteroidSites._ensureBeacon on a live rock, the traffic owner's durable
// identity and manifest seams, and the entity-list plus dressing-table subject pool. That probe is a
// top-level script (its broker gate runs at import) and three H1 manifest tests pin its source, so the
// drivers are transcribed here instead of imported.
//
// H3 deliberately drops every H1 stills-only override: no frustumCulled=false, no forceRender or
// neverCull flags, no forced updateLod levels, no explicit camera rig, no target lock, and no explicit
// authored-upgrade request before a bounded natural wait. Those overrides would falsify frame timing,
// draw counts, and LOD occupancy. The shipping chase camera, zoom, LOD resolver, and culling are left
// alone; only the player pose moves between windows, and timing starts after the pipeline settles.

import assert from 'node:assert/strict';

export const PQ022_H3_RELAY_SITE_ID = 'site_pq022_h3_relay_collar';
export const PQ022_H3_ADMISSION_CEILING_MS = 180_000;
export const PQ022_H3_NATURAL_ADMISSION_WAIT_MS = 15_000;
export const PQ022_H3_TRAFFIC_ROLES = Object.freeze(['courier', 'hauler', 'miner']);

export const PQ022_H3_ROUTE_DECLARATION = Object.freeze({
  declaredRoute:
    'visible fixed-seed New Game -> Helios (floor-in, trade hub, military, jump ring, billboard, relay, '
    + 'Lark, Span, Cradle, floor-out) -> Ceres (floor-in, refinery, mining, floor-out) -> Tethys '
    + '(floor-in, Customs Log buoy, floor-out) -> Helios cycle end; three cycles in one Browser context',
  compressions: Object.freeze([
    Object.freeze({
      kind: 'travel',
      subject: 'sector-order',
      detail: 'the registered world.enterSector owner moves Helios -> Ceres -> Tethys -> Helios instead of flying gates (accepted PQ-022 H1 compression); this cell measures accepted asset cost and cleanup, not route completion',
    }),
    Object.freeze({
      kind: 'pose',
      subject: 'all-windows',
      detail: 'before each window the player entity pose, physics body, and velocity are set to a deterministic standoff and the shipping chase camera snaps to it; timing starts only after the render pipeline settles; camera zoom, LOD selection, culling, and render flags are untouched',
    }),
    Object.freeze({
      kind: 'subject-instance',
      subject: 'station-billboard',
      detail: 'the measured Helios billboard is the core-station dressing instance at Coalition Station; the Helios Station instance sits inside the trade hub docking and collision neighbourhood, where diagnostic measurement poses were relocated out of the sector',
    }),
    Object.freeze({
      kind: 'owner-fixture',
      subject: 'relay-collar',
      detail: 'asteroidSites._ensureBeacon places the shipped relay on a live Helios asteroid (accepted PQ-022 H1 relay owner seam); a live beacon for the H3 site id is reused, never duplicated. Entities, far-actor rows, field rocks, and dressing rows share one presentation id space and the owner allocator recycles ids a far-actor row still holds, so a beacon whose id any other table holds, that is still on the free list, or that has a foreign mesh or presentation slot under it is dropped and re-issued by the same seam (bounded); every collision is recorded with its ownership census, the id is watched from issue until its target window opens, and a binding lost during measurement voids only that measurement and re-issues the relay at most twice',
    }),
    Object.freeze({
      kind: 'owner-fixture',
      subject: 'corridor-traffic-bodies',
      detail: 'courier/hauler/miner bodies are spawned through makeShipEntitySpec and the traffic owner durable-identity and manifest seams (accepted PQ-022 H1 seam), anchored at Coalition Station rather than Helios Station with faction pinned to SCN, laid out in a shallow fan 800-1150 WU from that anchor on the first of 16 fixed bearings whose hulls keep clear of every station, gate, dressing prop, and asteroid (so no other accepted identity shares the default frame of a measured hull), issued and re-issued with the player posed collision-free at the fan centroid (far-actor residency shelves ships beyond its exit radius from the player on the next tick), and held on station through the traffic owner record wait (waitT covering the route, refreshed on reuse; the Cradle record steps as a waiting hauler record because the ambient miner stepper ignores waits, while the hull keeps defId, trafficRole miner, worldRecordId, and its whole-ship selection) so each hull stays default-framed through its window; a fixture adopted by a job or courier service, or whose record or defId changed, is re-issued, with an explicit entity id above every id held by the far-actor, asteroid-field, and dressing tables (a shared-id collision otherwise lets a far-actor row adopt the fixture); every issuance stamps a unique durable sequence so no two fixtures ever share a worldRecordId (the traffic owner derives it from role, sequence, and spawn position, and identical fan positions otherwise duplicated one durable identity across cycles, after which a fixture vanished), fixtures are retired at the end of every Helios visit and any straggler is promoted from the far-actor table and retired before the next visit measures, a fixture lost or adopted during its own measurement voids only that measurement and is re-issued at most twice with the owner destroy events recorded, and every issuance, sweep, retirement, and loss is recorded',
      distributionClaim: false,
    }),
  ]),
  retainedEvidenceReferences: Object.freeze([
    'design/program/roadmap/receipts/PQ-022-relay-reauthor-review-REPORT.md',
    'design/program/roadmap/receipts/PQ-022-refinery-reauthor-REPORT.md',
    'design/program/roadmap/receipts/PQ-022-billboard-buoy-reauthor-REPORT.md',
    'design/program/roadmap/receipts/PQ-022-corridor-assets-h2-disposition-REPORT.md',
  ]),
});

// ---------------------------------------------------------------------------------------------
// Transcribed H1 owner drivers
// ---------------------------------------------------------------------------------------------

export async function bootSeededFlight(targetPage, rootUrl, fixedSeed, { admissionTimeoutMs = PQ022_H3_ADMISSION_CEILING_MS } = {}) {
  await targetPage.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const url = new URL(targetPage.url());
  assert.equal(url.search, '', 'PQ-022 route must use the canonical root with no query flags');
  assert.equal(url.hash, '', 'PQ-022 route must use the canonical root with no hash flags');
  await targetPage.bringToFront().catch(() => {});
  await targetPage.waitForFunction(() => !!(
    window.SF?.state && window.SF?.bus && window.SF?.registry && window.SF?.helpers
  ), null, { timeout: 60_000 });
  const splash = targetPage.locator('#cinematic-splash');
  if (await splash.isVisible().catch(() => false)) {
    await targetPage.keyboard.press('Space');
    await splash.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
  const isNewGameVisible = await targetPage.locator('[data-screen="newGame"]:visible').isVisible().catch(() => false);
  if (!isNewGameVisible) {
    const newGameButton = targetPage.getByRole('button', { name: 'New Game', exact: true });
    if (await newGameButton.isVisible().catch(() => false)) {
      await newGameButton.click({ timeout: 20_000 });
    } else {
      await targetPage.locator('[data-screen="mainMenu"]:visible').waitFor({ timeout: 15_000 }).catch(() => {});
      if (await newGameButton.isVisible().catch(() => false)) {
        await newGameButton.click({ timeout: 20_000 });
      }
    }
  }
  await targetPage.locator('[data-screen="newGame"]:visible').waitFor({ timeout: 20_000 });
  await targetPage.fill('#sf-ng-seed', String(fixedSeed));
  await targetPage.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 20_000 });
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return !!(state?.mode === 'flight' && player && player.alive !== false && Number(player.hull) > 0);
  }, null, { timeout: 150_000 });
  const begin = targetPage.getByRole('button', { name: /^Begin$/i }).first();
  if (await begin.isVisible().catch(() => false)) await begin.click({ timeout: 10_000 });
  await targetPage.evaluate(() => {
    const sf = window.SF;
    if (sf.state.onboarding) {
      sf.state.onboarding.active = false;
      sf.state.onboarding.finished = true;
    }
    sf.bus.emit('ui:closeAll', {});
    sf.bus.emit('voice:clear', {});
  });
  await targetPage.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && player?.presentationAdmission === 'ready'
      && String(player?.mesh?.userData?.authoredAssetState || '').startsWith('authored');
  }, null, { timeout: admissionTimeoutMs });
  return targetPage.evaluate(() => window.SF.state.meta?.seed ?? null);
}

export async function readGpuContract(targetPage) {
  return targetPage.evaluate(() => {
    const gl = window.SF?.state?.render?.renderer?.getContext?.();
    if (!gl) return { available: false, vendor: null, renderer: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    };
  });
}

export async function enterSectorOwner(targetPage, sectorId) {
  const entry = await targetPage.evaluate((wantedSectorId) => {
    const sf = window.SF;
    const state = sf.state;
    const world = sf.registry.get('world');
    if (!world || typeof world.enterSector !== 'function') throw new Error('registered world.enterSector unavailable');
    const fromSectorId = state.world.currentSectorId;
    const tiers = () => Object.fromEntries(Object.entries(state.world.residentSectors || {})
      .filter(([, value]) => value && value.tier !== 'RECORD_ONLY')
      .map(([id, value]) => [id, value.tier]));
    const tiersBefore = tiers();
    const calledAtPerfMs = performance.now();
    if (fromSectorId !== wantedSectorId) {
      world.enterSector(wantedSectorId, { placePlayer: true, fromSectorId, via: 'pq022-h3-performance' });
    }
    sf.bus.emit('ui:closeAll', {});
    return {
      sectorId: wantedSectorId,
      fromSectorId,
      moved: fromSectorId !== wantedSectorId,
      calledAtPerfMs,
      ownerCallMs: performance.now() - calledAtPerfMs,
      tiersBefore,
      tiersAfter: tiers(),
    };
  }, sectorId);
  await targetPage.waitForFunction((wantedSectorId) => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    return state?.mode === 'flight'
      && state?.world?.currentSectorId === wantedSectorId
      && player && player.alive !== false;
  }, sectorId, { timeout: 60_000 });
  return entry;
}

export async function ensureRelayFixture(targetPage, siteId = PQ022_H3_RELAY_SITE_ID, {
  policy = 'clean',
  releaseFile = 'places/place_claim_outpost_relay.glb',
} = {}) {
  return targetPage.evaluate(async ({ wantedSiteId, idPolicy, file }) => {
    const state = window.SF.state;
    const helpers = window.__PQ022_H3__;
    const sectorId = state.world.currentSectorId;
    const { dropDressingRow } = await import('/src/world/dressingTable.js');
    const beaconRows = () => (state.world?.dressing?.rows || []).filter((row) => row && row.alive !== false
      && row.data?.siteBeacon === wantedSiteId);
    const ownershipOf = (row) => helpers.idOwnership(row.id, file, 'dressing');
    // Entities, far-actor rows, field rocks, and dressing rows share one presentation id space, and the owner
    // allocator (insertDressingRow -> allocateEntityId -> freeIds.pop) can hand a new beacon an id a far-actor row
    // still holds. Under the clean policy a beacon whose id any other table holds, that is still on the free
    // list, or that already has a foreign mesh or presentation slot under it is dropped and the owner seam
    // re-issues it (dropDressingRow does not return the id to the free list, so each re-issue draws a new id).
    // Every collision is recorded with its ownership census. The observe policy (diagnostic only) keeps
    // whatever the owner issued and records its ownership.
    const clean = idPolicy !== 'observe';
    const MAX_ISSUES = 32;
    const collided = [];
    let chosen = null;
    for (const row of beaconRows()) {
      const ownership = ownershipOf(row);
      if (!clean || ownership.clean) {
        if (!chosen) chosen = { row, ownership, reused: true, attempts: 0 };
        continue;
      }
      collided.push({ id: row.id, phase: 'existing', ownership });
      dropDressingRow(state, row.id);
    }
    let rock = null;
    let freeIdsBefore = null;
    if (!chosen) {
      const { asteroidSites, makeSiteRecord } = await import('/src/systems/asteroidSites.js');
      rock = state.entityList.find((entity) => entity?.type === 'asteroid'
        && entity.alive !== false
        && (entity.homeSectorId || entity.data?.homeSectorId || entity.data?.sectorId) === sectorId);
      if (!rock) return { error: `no live asteroid in ${sectorId}`, collided };
      if (!asteroidSites.ctx) return { error: 'asteroidSites is not initialized on the live route', collided };
      const site = makeSiteRecord({
        id: wantedSiteId,
        asteroidId: rock.id,
        sectorId,
        fieldId: rock.data?.fieldId || 'field_1',
        createdT: state.simTime,
      });
      site.anchored = true;
      freeIdsBefore = Array.isArray(state.freeIds) ? state.freeIds.slice(-8) : null;
      for (let attempt = 1; attempt <= MAX_ISSUES; attempt += 1) {
        asteroidSites._ensureBeacon(site);
        const row = beaconRows()[0] || null;
        if (!row) return { error: 'asteroidSites._ensureBeacon issued no relay beacon', collided, freeIdsBefore };
        const ownership = ownershipOf(row);
        if (!clean || ownership.clean) {
          chosen = { row, ownership, reused: false, attempts: attempt };
          break;
        }
        collided.push({ id: row.id, phase: 'issue', attempt, ownership });
        dropDressingRow(state, row.id);
      }
      if (!chosen) {
        return { error: `no collision-free relay beacon id after ${MAX_ISSUES} issues`, collided, freeIdsBefore };
      }
    }
    const relay = chosen.row;
    return {
      relayId: relay.id,
      relayKey: `d:${relay.id}`,
      policy: clean ? 'clean' : 'observe',
      reused: chosen.reused,
      issueAttempts: chosen.attempts,
      idCollisionReissues: collided.length,
      collided,
      ownership: chosen.ownership,
      freeIdsBefore,
      rockId: rock ? rock.id : null,
      rockRadius: rock ? rock.radius : null,
      sectorId,
      placeId: relay.data?.placeId || null,
      placeScale: relay.data?.placeScale ?? null,
      worldDressing: relay.data?.worldDressing === true,
      collides: relay.collides === true,
      pos: { x: relay.pos.x, z: relay.pos.z },
      contactRingDistance: rock ? Math.hypot(relay.pos.x - rock.pos.x, relay.pos.z - rock.pos.z) : null,
    };
  }, { wantedSiteId: siteId, idPolicy: policy, file: releaseFile });
}

// Traffic fixture layout. Three hulls sit in a shallow fan 800-1150 WU from the Coalition anchor and at
// least ~480 WU from each other, so no station, gate, dressing prop, relay beacon, or other hull shares a
// measured hull's default chase frame, and all stay within far-actor residency of one approach pose at
// the fan centroid. The fan bearing is the first of 16 fixed bearings (starting away from Helios
// Station, then alternating either side) whose hulls and centroid keep clear of every station/gate
// (700 WU), dressing/prop row (450 WU), and asteroid (150 WU plus radius). The plan is read-only.
export async function planTrafficFixtureLayout(targetPage) {
  return targetPage.evaluate(() => {
    const state = window.SF.state;
    const owner = window.SF.registry.get('traffic');
    const stations = owner?._sectorStations?.() || [];
    const anchor = stations.find((station) => station.data?.stationId === 'station_coalition')
      || stations.find((station) => station.data?.stationId === 'station_helios')
      || stations[0];
    if (!anchor) throw new Error('Helios has no station for controlled traffic owner fixtures');
    const hub = stations.find((station) => station.data?.stationId === 'station_helios') || null;
    const obstacles = [];
    for (const entity of state.entityList || []) {
      if (!entity || entity.alive === false || !entity.pos) continue;
      if (entity.type === 'station') obstacles.push({ kind: 'station', id: entity.id, x: entity.pos.x, z: entity.pos.z, clearance: 700 });
      else if (entity.type === 'asteroid') obstacles.push({ kind: 'asteroid', id: entity.id, x: entity.pos.x, z: entity.pos.z, clearance: 150 + (Number(entity.radius) || 0) });
      else if (entity.data?.siteBeacon || entity.data?.placeId) obstacles.push({ kind: 'prop', id: entity.id, x: entity.pos.x, z: entity.pos.z, clearance: 450 });
    }
    for (const row of state.world?.dressing?.rows || []) {
      if (!row || row.alive === false || !row.pos) continue;
      obstacles.push({ kind: 'dressing', id: row.id, x: row.pos.x, z: row.pos.z, clearance: 450 });
    }
    for (const rock of state.world?.asteroidField?.rocks || []) {
      if (!rock || rock.alive === false || !rock.pos) continue;
      obstacles.push({ kind: 'field-rock', id: rock.id, x: rock.pos.x, z: rock.pos.z, clearance: 150 + (Number(rock.radius) || 0) });
    }
    const fan = [['courier', -0.35, 800], ['hauler', 0, 1150], ['miner', 0.35, 800]];
    const base = hub ? Math.atan2(anchor.pos.z - hub.pos.z, anchor.pos.x - hub.pos.x) : 0;
    const steps = [0];
    for (let k = 1; k < 16; k += 1) steps.push(k % 2 === 1 ? (k + 1) / 2 : -(k / 2));
    const tried = [];
    let best = null;
    for (const step of steps) {
      const bearing = base + step * (Math.PI / 8);
      const positions = {};
      for (const [role, dAngle, distance] of fan) {
        positions[role] = {
          x: anchor.pos.x + Math.cos(bearing + dAngle) * distance,
          z: anchor.pos.z + Math.sin(bearing + dAngle) * distance,
        };
      }
      const values = Object.values(positions);
      const centroid = {
        x: values.reduce((total, point) => total + point.x, 0) / values.length,
        z: values.reduce((total, point) => total + point.z, 0) / values.length,
      };
      let worst = null;
      for (const [label, point] of [...Object.entries(positions), ['centroid', centroid]]) {
        for (const obstacle of obstacles) {
          const margin = Math.hypot(point.x - obstacle.x, point.z - obstacle.z) - obstacle.clearance;
          if (!worst || margin < worst.margin) worst = { label, kind: obstacle.kind, id: obstacle.id, margin: Math.round(margin) };
        }
      }
      const candidate = { step, bearing, positions, centroid, worst };
      tried.push({ step, bearing: Math.round(bearing * 1000) / 1000, worst });
      if (!best || (worst?.margin ?? Infinity) > (best.worst?.margin ?? Infinity)) best = candidate;
      if (!worst || worst.margin >= 0) {
        return {
          anchor: { stationId: anchor.data?.stationId || null, x: anchor.pos.x, z: anchor.pos.z },
          clear: true, bearing, positions, centroid, obstacleCount: obstacles.length, tried,
        };
      }
    }
    return {
      anchor: { stationId: anchor.data?.stationId || null, x: anchor.pos.x, z: anchor.pos.z },
      clear: false, bearing: best.bearing, positions: best.positions, centroid: best.centroid,
      obstacleCount: obstacles.length, tried,
    };
  });
}

export async function ensureTrafficFixtures(targetPage, knownRecordIds = null, layout = null, issuance = 0) {
  if (!layout?.positions?.courier || !layout?.positions?.hauler || !layout?.positions?.miner) {
    throw new Error('traffic fixtures require a planned layout (planTrafficFixtureLayout)');
  }
  return targetPage.evaluate(async ({ known, positions, issuance: issuanceIndex }) => {
    const { makeShipEntitySpec } = await import('/src/systems/ships.js');
    const { wholeShipVisualForEntity } = await import('/src/render/partsLibrary.js');
    const sf = window.SF;
    const state = sf.state;
    const owner = sf.registry.get('traffic');
    if (!owner || typeof owner._stampTrafficDurableIdentity !== 'function'
      || typeof owner._assignManifest !== 'function') {
      throw new Error('registered traffic owner lacks its production identity/manifest seams');
    }
    const stations = owner._sectorStations();
    // Anchored at Coalition Station (faction pinned to SCN so whole-ship selection stays the accepted
    // Lark/Span/Cradle releases): the Helios Station neighbourhood relocated measurement poses.
    const anchor = stations.find((station) => station.data?.stationId === 'station_coalition')
      || stations.find((station) => station.data?.stationId === 'station_helios')
      || stations[0];
    if (!anchor) throw new Error('Helios has no station for controlled traffic owner fixtures');
    const defs = {
      courier: { ship: 'ship_kestrel', team: 2, archetype: 'fleeing_trader', label: 'Courier' },
      hauler: { ship: 'ship_mule', team: 2, archetype: 'fleeing_trader', label: 'Cargo Hauler' },
      miner: { ship: 'ship_pelican', team: 2, archetype: 'fleeing_trader', label: 'Mining Barge' },
    };
    const expected = {
      courier: { file: 'wholeships/helios_lark.glb', assetId: 'SF_WHOLESHIP_HELIOS_LARK' },
      hauler: { file: 'wholeships/helios_span.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN' },
      miner: { file: 'wholeships/helios_cradle.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE' },
    };
    // Entity ids share one numeric space with far-actor, asteroid-field, and dressing rows, but neither
    // allocateEntityId nor spawnEntity reserves their ids. A fixture spawned onto an id a far-actor row
    // still holds is adopted by that row on promotion (pose and data overwritten, then virtualized
    // away) and is shadowed in presentation. Fixtures therefore spawn with an explicit id above every
    // id any of those tables holds, and the entity counter is advanced past it.
    const presentationTables = () => [state.world?.farActors?.byId, state.world?.asteroidField?.byId, state.world?.dressing?.byId];
    const heldByPresentationTable = (id) => presentationTables().some((map) => map instanceof Map && map.has(id));
    const maxKnownId = () => {
      let max = Number(state.nextEntityId) || 1;
      for (const id of state.entities.keys()) if (Number(id) > max) max = Number(id);
      for (const map of presentationTables()) {
        if (!(map instanceof Map)) continue;
        for (const id of map.keys()) if (Number(id) > max) max = Number(id);
      }
      return max;
    };
    const retireFixture = (entity) => {
      sf.helpers.removeEntity?.(entity.id, { immediate: true });
      owner._active = owner._active.filter((id) => id !== entity.id);
      state.traffic.freighters = state.traffic.freighters.filter((row) => row.id !== entity.id);
    };
    // Hold station through the traffic owner's own wait. The ambient stepper honours a record's waitT
    // for courier/hauler records, but dispatches miner records to _stepMiner before that check, so the
    // Cradle's record steps as a waiting hauler record. The hull's identity (defId, data.trafficRole
    // 'miner', worldRecordId) and therefore its whole-ship selection are unchanged. The wait covers the
    // whole three-cycle route and is refreshed whenever a fixture is reused.
    const HOLD_WAIT_S = 3_600;
    const recordRoleFor = (role) => (role === 'miner' ? 'hauler' : role);
    const recordOf = (entityId) => state.traffic.freighters.find((row) => row && row.id === entityId) || null;
    const holdRecord = (rec, role) => {
      rec.role = recordRoleFor(role);
      rec.waitT = Math.max(Number(rec.waitT) || 0, HOLD_WAIT_S);
      rec.nextTradeT = Math.max(Number(rec.nextTradeT) || 0, HOLD_WAIT_S);
      return { recordRole: rec.role, waitT: rec.waitT, holdMechanism: 'traffic-owner-record-wait' };
    };
    const out = {};
    let index = 0;
    for (const role of ['courier', 'hauler', 'miner']) {
      const def = defs[role];
      const wantedRecordId = known?.[role] || null;
      let survivor = wantedRecordId
        ? state.entityList.find((entity) => entity && entity.alive !== false && entity.type === 'ship'
          && entity.data?.worldRecordId === wantedRecordId && entity.data?.trafficRole === role)
        : null;
      let retiredShadowedSurvivor = null;
      if (survivor && heldByPresentationTable(survivor.id)) {
        retiredShadowedSurvivor = survivor.id;
        retireFixture(survivor);
        survivor = null;
      }
      let retiredRecordlessSurvivor = null;
      if (survivor && !recordOf(survivor.id)) {
        // Without its owner record the hull cannot be held through the owner's wait.
        retiredRecordlessSurvivor = survivor.id;
        retireFixture(survivor);
        survivor = null;
      }
      if (survivor) {
        const visual = wholeShipVisualForEntity(survivor);
        if (!visual || visual.file !== expected[role].file) {
          throw new Error(`${role} surviving fixture whole-ship selection mismatch: ${JSON.stringify(visual)}`);
        }
        survivor.vel?.set?.(0, 0, 0);
        survivor.thrust = 0;
        out[role] = {
          entityId: survivor.id,
          reused: true,
          holdStation: true,
          ...holdRecord(recordOf(survivor.id), role),
          worldRecordId: survivor.data?.worldRecordId || null,
          trafficRole: survivor.data?.trafficRole || null,
          visual,
          pos: { x: survivor.pos.x, z: survivor.pos.z },
        };
        index += 1;
        continue;
      }
      const pos = { x: positions[role].x, z: positions[role].z };
      const cleanId = maxKnownId() + 1000 + index;
      const spec = {
        ...makeShipEntitySpec(def.ship, {
          team: def.team,
          factionId: 'faction_scn',
          pos,
          ai: { archetype: def.archetype, passive: true, spawnContext: 'convoy_civilian' },
        }),
        id: cleanId,
      };
      const entity = sf.helpers.spawnEntity(spec);
      if (!entity) throw new Error(`traffic owner fixture failed to spawn ${role}`);
      if (entity.id !== cleanId) throw new Error(`${role} fixture did not take its explicit clean id ${cleanId} (got ${entity.id})`);
      if (!Number.isSafeInteger(state.nextEntityId) || state.nextEntityId <= cleanId) state.nextEntityId = cleanId + 1;
      // Hold station for measurement: a trader drifting out of the chase frame mid-window cannot be
      // measured. Only simulation motion is held; hull presentation, admission, and LOD are untouched.
      entity.vel?.set?.(0, 0, 0);
      entity.thrust = 0;
      // A unique durable sequence per issuance: the owner derives worldRecordId from role, sequence, and the
      // quantized spawn position, so one sequence reused at the same fan position duplicated a durable
      // identity across cycles (after which one of the two hulls vanished mid-measurement).
      const durableSeq = 900 + (Number(issuanceIndex) || 0) * 3 + index;
      owner._stampTrafficDurableIdentity(entity, state.world.currentSectorId, role, def, durableSeq);
      const target = owner._pickStation(stations);
      const cargoManifest = owner._assignManifest(entity, role, target, state.world.currentSectorId);
      owner._active.push(entity.id);
      const record = {
        id: entity.id,
        role,
        targetId: target.id,
        waitT: 0,
        nextTradeT: 0,
        orbitPhase: 0,
        dockSeq: 0,
        manifest: cargoManifest,
      };
      state.traffic.freighters.push(record);
      const hold = holdRecord(record, role);
      const visual = wholeShipVisualForEntity(entity);
      if (!visual || visual.file !== expected[role].file || visual.assetId !== expected[role].assetId) {
        throw new Error(`${role} production whole-ship selection mismatch: ${JSON.stringify(visual)}`);
      }
      out[role] = {
        entityId: entity.id,
        reused: false,
        idPolicy: 'explicit-id-above-every-presentation-table',
        durableSeq,
        holdStation: true,
        ...hold,
        idHeldByPresentationTableAtSpawn: heldByPresentationTable(entity.id),
        retiredShadowedSurvivor,
        retiredRecordlessSurvivor,
        defId: entity.data?.defId || null,
        worldRecordId: entity.data?.worldRecordId || null,
        trafficRole: entity.data?.trafficRole || null,
        trafficLabel: entity.data?.trafficLabel || null,
        cargoManifestId: cargoManifest?.id || cargoManifest?.manifestId || null,
        visual,
        pos,
        fixtureKind: 'controlled-role-draw-through-traffic-owner',
      };
      index += 1;
    }
    return out;
  }, { known: knownRecordIds, positions: layout.positions, issuance });
}

// Retires harness-issued traffic fixtures by durable identity only. A fixture still live is removed through
// the core entity owner; one shelved in the far-actor table is first promoted through the world owner seam
// (farActorTable.promoteFarActor) and then removed, so it can never be restored into a later window. Its
// traffic owner record goes with it. Nothing whose worldRecordId this harness did not issue is touched.
export async function retireTrafficFixtures(targetPage, { worldRecordIds = [], reason = 'pq022-h3-fixture-retire' } = {}) {
  return targetPage.evaluate(async ({ recordIds, why }) => {
    const { promoteFarActor } = await import('/src/world/farActorTable.js');
    const sf = window.SF;
    const state = sf.state;
    const owner = sf.registry.get('traffic');
    const wanted = new Set((recordIds || []).filter((id) => typeof id === 'string' && id.length > 0));
    const promotedFarRows = [];
    for (const row of [...(state.world?.farActors?.rows || [])]) {
      const recordId = row?.data?.worldRecordId ?? row?.worldRecordId ?? null;
      if (!row || !wanted.has(recordId)) continue;
      const promoted = promoteFarActor(state, row.id, sf.helpers);
      promotedFarRows.push({ rowId: row.id, entityId: promoted?.id ?? null, worldRecordId: recordId });
    }
    const retired = [];
    for (const entity of [...(state.entityList || [])]) {
      if (!entity || entity.alive === false || entity.type !== 'ship') continue;
      const recordId = entity.data?.worldRecordId ?? null;
      if (!wanted.has(recordId)) continue;
      const id = entity.id;
      retired.push({
        id,
        worldRecordId: recordId,
        trafficRole: entity.data?.trafficRole ?? null,
        pos: { x: Math.round(entity.pos.x), z: Math.round(entity.pos.z) },
      });
      sf.helpers.removeEntity(id, { immediate: true, reason: why });
      if (owner && Array.isArray(owner._active)) owner._active = owner._active.filter((activeId) => activeId !== id);
      if (Array.isArray(state.traffic?.freighters)) {
        state.traffic.freighters = state.traffic.freighters.filter((rec) => rec && rec.id !== id && rec.farActorId !== id);
      }
    }
    return { retired, promotedFarRows, sectorId: state.world?.currentSectorId ?? null, reason: why };
  }, { recordIds: worldRecordIds, why: reason });
}

// ---------------------------------------------------------------------------------------------
// H3 page measurement surface (installed once per page; read-only except placePlayer)
// ---------------------------------------------------------------------------------------------

export async function installPq022H3PageHelpers(targetPage, identityRows) {
  await targetPage.evaluate(async (rows) => {
    const SF = window.SF;
    const state = SF.state;
    const THREE = SF.THREE;
    if (!THREE) throw new Error('window.SF.THREE is unavailable');
    const residencyModule = await import('/src/render/assetResidency.js');
    const partsLibrary = await import('/src/render/partsLibrary.js');
    const visibilityModule = await import('/src/render/entityMeshVisibility.js');
    const presentationSources = await import('/src/world/presentationSources.js');
    const metrics = await import('/scripts/lib/performanceSceneMetrics.mjs');
    const sphere = new THREE.Sphere();
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();

    const finite = (value) => (value !== null && value !== undefined && value !== ''
      && Number.isFinite(Number(value)) ? Number(value) : null);
    // Subjects are addressed by store-aware keys ("e:<id>" live entity, "d:<id>" dressing row): dressing
    // rows keep reserved ids that can coincide with a live entity id, and a bare id would resolve the
    // wrong object. Dressing rows carry no mesh of their own; the renderer keeps their presentation
    // root in its id-keyed mesh map, which a live entity with the same id shadows.
    const renderSystem = () => SF.registry?.get?.('render') || null;
    const resolve = (key) => {
      if (typeof key === 'string') {
        const separator = key.indexOf(':');
        const store = key.slice(0, separator);
        const id = Number(key.slice(separator + 1));
        if (store === 'd') return state.world?.dressing?.byId?.get?.(id) || null;
        if (store === 'e') return state.entities?.get?.(id) || null;
        return null;
      }
      return state.entities?.get?.(key) || state.world?.dressing?.byId?.get?.(key) || null;
    };
    const keyOf = (entity) => (entity ? `${entity.dressingResident === true ? 'd' : 'e'}:${entity.id}` : null);
    const shadowedByLiveEntity = (entity) => {
      if (!entity || entity.dressingResident !== true) return false;
      const live = state.entities?.get?.(entity.id);
      return !!live && live !== entity && live.alive !== false;
    };
    const rootOf = (entity) => {
      if (!entity) return null;
      if (entity.mesh) return entity.mesh;
      if (entity.view?.root) return entity.view.root;
      if (entity.dressingResident === true) {
        if (shadowedByLiveEntity(entity)) return null;
        return renderSystem()?._meshes?.get?.(entity.id) || null;
      }
      return null;
    };
    const pool = () => {
      const list = [...(state.entityList || [])];
      for (const row of state.world?.dressing?.rows || []) list.push(row);
      return list;
    };
    const homeOf = (entity) => entity?.homeSectorId || entity?.data?.homeSectorId || entity?.data?.sectorId || null;
    const slotUrls = (root) => Object.values(root?.userData?.authoredSlots || {}).flat().map(String);
    const identityForUrls = (urls) => {
      for (const row of rows) if (urls.some((url) => url.endsWith(row.releaseFile))) return row.key;
      return null;
    };
    const identityForEntity = (entity) => {
      const root = rootOf(entity);
      if (root) {
        const key = identityForUrls(slotUrls(root));
        if (key) return key;
      }
      const data = entity?.data || {};
      for (const id of [data.placeId, data.archetypeGlb]) {
        if (!id) continue;
        const key = identityForUrls([`places/${id}.glb`]);
        if (key) return key;
      }
      if (entity?.type === 'ship' && entity.id !== state.playerId) {
        try {
          const visual = partsLibrary.wholeShipVisualForEntity(entity);
          if (visual?.file) {
            const key = identityForUrls([String(visual.file)]);
            if (key) return key;
          }
        } catch (_) { /* non-authored ship */ }
      }
      return null;
    };
    // A pose that touches a collider produces a physics impact every tick (sparks, camera trauma,
    // contact work, and eventually an out-of-sector relocation), so impacts are counted for the
    // player and every pose and window must hold zero.
    let playerImpacts = 0;
    let lastPlayerImpact = null;
    SF.bus.on('physics:impact', (payload) => {
      const playerId = state.playerId;
      if (!payload || (payload.aId !== playerId && payload.bId !== playerId)) return;
      playerImpacts += 1;
      const otherId = payload.aId === playerId ? payload.bId : payload.aId;
      const other = state.entities?.get?.(otherId) || null;
      lastPlayerImpact = {
        tick: payload.tick ?? null,
        otherId,
        otherType: other?.type ?? null,
        otherRole: other?.data?.trafficRole ?? other?.data?.stationId ?? other?.data?.archetypeGlb ?? null,
        otherDistance: other?.pos && state.entities.get(playerId)?.pos
          ? Math.round(Math.hypot(other.pos.x - state.entities.get(playerId).pos.x, other.pos.z - state.entities.get(playerId).pos.z))
          : null,
        dp: finite(payload.dp),
        impulse: finite(payload.impulse),
      };
    });
    // Entity destroy journal (core removal events with the owner's reason when one is given), read when a
    // harness-owned fixture goes missing so the loss carries the owners' own account of it.
    const destroyedLog = [];
    SF.bus.on('entity:destroyed', (payload) => {
      if (!payload || payload.id == null) return;
      destroyedLog.push({
        id: payload.id,
        type: payload.type ?? null,
        reason: payload.reason ?? null,
        tick: finite(state.tick),
        simTime: finite(state.simTime),
        pos: payload.pos ? { x: Math.round(payload.pos.x), z: Math.round(payload.pos.z) } : null,
      });
      if (destroyedLog.length > 400) destroyedLog.splice(0, destroyedLog.length - 400);
    });
    const destroyedEvents = (ids) => {
      const wanted = new Set((Array.isArray(ids) ? ids : [ids]).filter((id) => id != null).map(Number));
      return destroyedLog.filter((row) => wanted.has(Number(row.id)));
    };
    const chainVisible = (object, stopAt = null) => {
      for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor.visible === false) return false;
        if (cursor === stopAt) break;
      }
      return true;
    };
    const updateFrustum = () => {
      const camera = state.render.camera;
      camera.updateMatrixWorld(true);
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
      return camera;
    };
    const MAX_SANE_MESH_RADIUS = 2_000;
    const lodRadiusOf = (entity, root) => finite(root?.userData?.hlod?.visualRadius)
      || Math.max(1, Number(entity?.radius) || 10);
    // Per-mesh bounds decide "drawn in frame", but a mesh whose bounds are non-finite or absurd cannot
    // prove anything, so it is skipped; a root with no trustworthy mesh bounds falls back to its own
    // LOD sphere at the root's world position.
    // Authored instance pools: small repeated authored parts are drawn from shared InstancedMesh chunks
    // keyed by spacefaceInstancePoolKey, while the owning root's own copies stay hidden. Submission is
    // refreshed once per census/facts read, never per frame.
    let submittingPoolKeys = null;
    const refreshPoolSubmission = () => {
      const keys = new Map();
      state.render?.scene?.traverse?.((object) => {
        if (!object?.isInstancedMesh || object.userData?.spacefaceInstancePool !== true) return;
        const key = object.userData.spacefaceInstancePoolKey;
        const row = keys.get(key) || { chunks: [], submitting: false };
        row.chunks.push(object);
        if (object.visible !== false && Number(object.count) > 0) row.submitting = true;
        keys.set(key, row);
      });
      submittingPoolKeys = keys;
      return keys;
    };
    const poolSourceOf = (root) => {
      const keys = new Set();
      let sourceMeshes = 0;
      let trianglesPerInstance = 0;
      let vertices = 0;
      root?.traverse?.((object) => {
        const key = object?.userData?.spacefaceInstancePoolKey;
        if (!object?.isMesh || object.isInstancedMesh || !key) return;
        keys.add(key);
        sourceMeshes += 1;
        const geometry = object.geometry;
        const position = geometry?.getAttribute?.('position');
        const total = geometry?.index ? geometry.index.count : (position ? position.count : 0);
        trianglesPerInstance += total / 3;
        vertices += position ? position.count : 0;
      });
      return { keys, sourceMeshes, trianglesPerInstance: Math.round(trianglesPerInstance), vertices };
    };
    const rootInFrame = (root, entity = null) => {
      if (!root) return false;
      if (chainVisible(root)) {
        let hit = false;
        let saneMeshes = 0;
        root.traverse((object) => {
          if (hit || !object.isMesh || !object.geometry || !chainVisible(object, root)) return;
          const geometry = object.geometry;
          if (!geometry.boundingSphere) geometry.computeBoundingSphere();
          if (!geometry.boundingSphere) return;
          sphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
          if (!Number.isFinite(sphere.radius) || sphere.radius > MAX_SANE_MESH_RADIUS
              || !Number.isFinite(sphere.center.x) || !Number.isFinite(sphere.center.z)) return;
          saneMeshes += 1;
          if (frustum.intersectsSphere(sphere)) hit = true;
        });
        if (hit) return true;
        if (saneMeshes > 0) return false;
      }
      // Pooled presentation: drawn only when the root itself is visible (a hidden root's pool slots are
      // not submitted), a chunk for one of its pool keys is submitting, and the pose sphere intersects
      // the camera frustum.
      if (!chainVisible(root)) return false;
      const source = poolSourceOf(root);
      if (source.keys.size > 0) {
        const pools = submittingPoolKeys || refreshPoolSubmission();
        let submitting = false;
        for (const key of source.keys) if (pools.get(key)?.submitting) submitting = true;
        if (!submitting) return false;
      }
      root.updateWorldMatrix(true, false);
      sphere.center.setFromMatrixPosition(root.matrixWorld);
      if (!Number.isFinite(sphere.center.x) || !Number.isFinite(sphere.center.z)) return false;
      sphere.radius = lodRadiusOf(entity, root);
      return frustum.intersectsSphere(sphere);
    };
    // Admitted-pose presence: when the draw path is not attributable to the root (hidden authored
    // root, or pool submission without a detectable key), an admitted authored subject counts as in
    // frame when its pose sphere intersects the camera frustum. Every fact records its basis.
    const poseInFrame = (root, entity) => {
      if (!entity?.pos) return false;
      const player = state.entities.get(state.playerId);
      const focus = state.camera?.focus;
      let center = null;
      if (root) {
        root.updateWorldMatrix(true, false);
        const fromRoot = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
        if (Number.isFinite(fromRoot.x) && Number.isFinite(fromRoot.z)) center = fromRoot;
      }
      if (!center && player && focus) {
        center = new THREE.Vector3(entity.pos.x - player.pos.x + focus.x, 0, entity.pos.z - player.pos.z + focus.z);
      }
      if (!center) return false;
      sphere.center.copy(center);
      sphere.radius = lodRadiusOf(entity, root);
      return frustum.intersectsSphere(sphere);
    };
    // Framed and drawn are separate facts. Framed: the subject's pose sphere (or a drawn mesh)
    // intersects the camera frustum. Drawn: a visible root mesh, or a submitting pool chunk for a
    // visible root's pool keys, intersects it. An admitted subject can be framed yet not drawn when
    // the renderer's own submit policy hides its root; that is recorded, never counted as drawn.
    const presenceOf = (root, entity) => {
      const drawn = rootInFrame(root, entity);
      const framed = drawn || poseInFrame(root, entity);
      const basis = drawn ? (poolSourceOf(root).keys.size > 0 ? 'pooled-submission-or-meshes' : 'drawn-meshes') : null;
      return { framed, drawn, basis };
    };
    // Replays the renderer's own submit decision (entityMeshVisibility.shouldSubmitEntityMesh) with the
    // inputs syncEntityViews passes for a visible-query root, clause by clause, so a framed but undrawn
    // subject carries the owner's reason instead of a harness guess.
    const submitDecisionOf = (entity, root) => {
      if (!entity || !root) return null;
      const render = renderSystem();
      const frame = render?._activityFrame || state.render?.activityFrame || null;
      const has = (collection, value) => !!collection && (typeof collection.has === 'function'
        ? collection.has(value) : Array.isArray(collection) && collection.includes(value));
      const glass = frame && (frame.renderGlassIds || frame.glassIds);
      const runway = frame && (frame.renderRunwayIds || frame.runwayIds);
      const data = root.userData || {};
      const inputs = {
        isPlayer: entity.id === state.playerId,
        forceRender: !!entity.flags?.forceRender,
        neverCull: !!entity.flags?.neverCull,
        hidden: false,
        snapshotMissing: false,
        pipelinesPending: !!data.pipelinesPending,
        authoredPending: visibilityModule.isAuthoredPendingStatus(data.authoredAssetState),
        geometryPending: !!data.geometryPending,
        activityFrame: frame,
        entityId: entity.id,
        presentationTier: entity.activity?.presentationTier,
        ledgerRow: presentationSources.isPresentationLedgerRow(entity),
      };
      const clauses = [];
      if (visibilityModule.isProtectedEntityMesh(inputs)) clauses.push('protected-root');
      if (inputs.pipelinesPending) clauses.push('pipelines-pending');
      if (inputs.authoredPending) clauses.push('authored-pending');
      if (inputs.geometryPending) clauses.push('geometry-pending');
      if (frame) {
        if (has(glass, entity.id)) clauses.push('on-activity-glass');
        else if (has(runway, entity.id)) clauses.push('on-activity-runway-not-submitted');
        else if (frame.complete === true) clauses.push(inputs.ledgerRow ? 'ledger-row-not-named' : 'activity-frame-complete-id-not-named');
      }
      if (['R2_METADATA', 'R3_UNLOADED', 'R1_RUNWAY'].includes(inputs.presentationTier)) {
        clauses.push(`tier-${inputs.presentationTier}`);
      }
      return {
        ownerDecision: visibilityModule.shouldSubmitEntityMesh(inputs),
        rootVisible: root.visible !== false,
        clauses,
        activityFrameComplete: frame ? frame.complete === true : null,
        idOnGlass: has(glass, entity.id),
        idOnRunway: has(runway, entity.id),
        ledgerRow: inputs.ledgerRow,
      };
    };
    const normalizeAssetState = (root) => {
      const raw = root?.userData?.authoredAssetState;
      return String(raw || '').startsWith('authored') ? 'authored' : (raw ?? null);
    };
    // Framing anchors on the entity's own global pose, converted to render space through the player's
    // presentation offset. Geometry bounds are never trusted for this: a box-derived centre over a
    // station root once landed millions of units away and teleported the player out of the sector.
    // Projection facts use the posed root's own world position; without a root, the global pose is
    // mapped through the chase camera focus, which tracks the player in render space. The player's
    // mesh position is never used because it can lag a teleport by several frames.
    const visualCenter = (root, entity) => {
      if (root) {
        root.updateWorldMatrix(true, false);
        const center = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
        if (Number.isFinite(center.x) && Number.isFinite(center.z)) {
          return { center, radius: lodRadiusOf(entity, root) };
        }
      }
      const player = state.entities.get(state.playerId);
      const focus = state.camera?.focus || { x: player.pos.x, z: player.pos.z };
      return {
        center: new THREE.Vector3(entity.pos.x - player.pos.x + focus.x, 0, entity.pos.z - player.pos.z + focus.z),
        radius: lodRadiusOf(entity, root),
      };
    };
    const subjectFacts = (id, releaseFile) => {
      const entity = resolve(id);
      const root = rootOf(entity);
      const camera = updateFrustum();
      refreshPoolSubmission();
      const poolSource = poolSourceOf(root);
      const vc = entity && (root || entity.pos) ? visualCenter(root, entity) : null;
      const ndc = vc ? vc.center.clone().project(camera) : null;
      return {
        entityId: id,
        alive: !!entity && entity.alive !== false,
        hasRoot: !!root,
        admission: entity?.presentationAdmission ?? null,
        assetState: normalizeAssetState(root),
        rawAssetState: root?.userData?.authoredAssetState ?? null,
        assetMode: root?.userData?.authoredAssetMode ?? null,
        fallbackRetained: root ? root.userData?.authoredReadableFallbackRetained !== false : null,
        releaseBound: root ? slotUrls(root).some((url) => url.endsWith(releaseFile)) : false,
        lodLevel: root?.userData?.lod?.level ?? null,
        lodPx: finite(root?.userData?.lod?.lastPx),
        lodResolvedByRenderer: Number.isFinite(Number(root?.userData?.lod?.lastPx)),
        pooledPresentation: poolSource.keys.size > 0,
        hlodVisualRadius: finite(root?.userData?.hlod?.visualRadius),
        farDetailHidden: finite(root?.userData?.hlod?.farDetailHidden),
        ...(() => {
          const presence = presenceOf(root, entity);
          return {
            inFrame: presence.framed,
            drawn: presence.drawn,
            drawBasis: presence.basis,
            submit: submitDecisionOf(entity, root),
          };
        })(),
        centerNdc: ndc ? { x: ndc.x, y: ndc.y, z: ndc.z } : null,
        cameraDistance: vc ? camera.position.distanceTo(vc.center) : null,
        visualRadius: vc ? vc.radius : null,
        globalPos: entity?.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
        homeSectorId: homeOf(entity),
        idOwnership: typeof id === 'string' ? subjectIdOwnership(id, releaseFile) : null,
      };
    };
    const census = (subjectId = null, releaseFile = null) => {
      updateFrustum();
      refreshPoolSubmission();
      // identitiesInFrame lists accepted identities actually drawn in frame; framed-but-undrawn roots
      // (admitted, hidden by the renderer's submit policy) are listed separately.
      const byKey = {};
      const framedNotDrawn = {};
      for (const entity of pool()) {
        if (!entity || entity.alive === false) continue;
        const root = rootOf(entity);
        if (!root) continue;
        const key = identityForUrls(slotUrls(root));
        if (!key) continue;
        const presence = presenceOf(root, entity);
        if (presence.drawn) (byKey[key] ||= []).push(entity.id);
        else if (presence.framed) (framedNotDrawn[key] ||= []).push(entity.id);
      }
      const player = state.entities.get(state.playerId);
      return {
        identitiesInFrame: Object.keys(byKey).sort(),
        instancesInFrame: byKey,
        identitiesFramedNotDrawn: Object.keys(framedNotDrawn).sort(),
        subject: subjectId == null ? null : subjectFacts(subjectId, releaseFile),
        player: player ? {
          x: player.pos.x,
          z: player.pos.z,
          speed: Math.hypot(player.vel?.x || 0, player.vel?.z || 0),
          hull: finite(player.hull),
        } : null,
        cameraZoom: finite(state.camera?.zoom),
        cameraFov: finite(state.render?.camera?.fov),
        mode: state.mode || null,
        docked: state.ui?.docked === true,
        jumpState: state.jump?.state ?? null,
        timeScale: finite(state.timeScale),
        tick: finite(state.tick),
        sectorId: state.world?.currentSectorId || null,
        entityCount: (state.entityList || []).filter((entity) => entity && entity.alive !== false).length,
        dressingRowCount: state.world?.dressing?.rows?.length ?? null,
        playerImpacts,
        lastPlayerImpact,
        hostileShipsNear: (state.entityList || []).filter((entity) => entity && entity.alive !== false
          && entity.type === 'ship' && entity.id !== state.playerId && entity.team === 1
          && player && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) < 900).length,
      };
    };
    const placePlayer = (x, z) => {
      const sf = window.SF;
      const player = state.entities.get(state.playerId);
      if (!player) throw new Error('player unavailable for pose placement');
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`refusing non-finite player pose ${x},${z}`);
      const jump = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (jump > 12_000) {
        throw new Error(`refusing a ${Math.round(jump)} WU pose jump to ${Math.round(x)},${Math.round(z)}; a sector-local standoff never moves that far`);
      }
      if (player.pos?.set) player.pos.set(x, 0, z);
      else { player.pos.x = x; player.pos.z = z; }
      player.prevPos?.copy?.(player.pos);
      player.vel?.set?.(0, 0, 0);
      player.flags = { ...(player.flags || {}), noInterp: true };
      const phys = sf.registry?.get?.('physics');
      if (phys?._sg02?.records) {
        const rec = phys._sg02.records.get(player.id);
        if (rec) {
          if (typeof phys._sg02._maybeResyncBodyPose === 'function') {
            phys._sg02._maybeResyncBodyPose(rec, player);
            if (rec.body?.setLinvel) rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            if (rec.body?.setAngvel) rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            if (rec.kinematics) { rec.kinematics.vx = 0; rec.kinematics.vz = 0; }
          } else {
            const origin = phys._sg02.getFrameOrigin?.() || { x: 0, z: 0 };
            const localX = x - (origin.x || 0);
            const localZ = z - (origin.z || 0);
            if (rec.body?.setTranslation) rec.body.setTranslation({ x: localX, y: 0, z: localZ }, true);
            if (rec.body?.setLinvel) rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            if (rec.body?.setAngvel) rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            if (rec.kinematics) { rec.kinematics.x = localX; rec.kinematics.z = localZ; rec.kinematics.vx = 0; rec.kinematics.vz = 0; }
          }
        }
      }
      if (phys?._rapier?.bodies) {
        const rec = phys._rapier.bodies.get(player.id);
        if (rec?.body?.setTranslation) rec.body.setTranslation({ x, y: 0, z }, true);
        if (rec?.body?.setLinvel) rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      state.render?.cameraCtrl?.snapToPlayer?.();
      const renderSystem = state.render || sf.render || sf.registry?.get?.('render');
      renderSystem?.reconcileMeshes?.();
      return { x: player.pos.x, z: player.pos.z };
    };
    const planFraming = (id) => {
      const entity = resolve(id);
      if (!entity) throw new Error(`subject ${id} unavailable for framing`);
      const root = rootOf(entity);
      const camera = updateFrustum();
      const player = state.entities.get(state.playerId);
      const focus = state.camera?.focus;
      if (!player || !focus || !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) {
        throw new Error('player or chase camera focus unavailable for framing');
      }
      // Translation-invariant plan: the chase rig offset is camera minus focus (both render space) and
      // the subject sits at the origin of a player-relative frame built from global poses, so a render
      // root that lags a teleport can never skew the standoff.
      const focusY = Number(focus.y) || 0;
      const cameraOffset = { x: camera.position.x - focus.x, y: camera.position.y - focusY, z: camera.position.z - focus.z };
      let subjectY = 0;
      if (root) {
        root.updateWorldMatrix(true, false);
        const rootY = root.matrixWorld.elements[13];
        if (Number.isFinite(rootY)) subjectY = rootY;
      }
      const subjectAt = new THREE.Vector3(0, subjectY, 0);
      const centerGlobal = { x: entity.pos.x, z: entity.pos.z };
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const flat = Math.hypot(forward.x, forward.z) || 1;
      const f = { x: forward.x / flat, z: forward.z / flat };
      const minSeparation = Math.max(0, Number(entity.radius) || 0) + (Number(player.radius) || 14) + 12;
      const vc = { radius: lodRadiusOf(entity, root) };
      const probe = camera.clone();
      const at = (standoff) => {
        probe.position.set(-f.x * standoff + cameraOffset.x, focusY + cameraOffset.y, -f.z * standoff + cameraOffset.z);
        probe.quaternion.copy(camera.quaternion);
        probe.updateMatrixWorld(true);
        const ndc = subjectAt.clone().project(probe);
        return {
          standoff,
          player: { x: centerGlobal.x - f.x * standoff, z: centerGlobal.z - f.z * standoff },
          centerNdc: { x: ndc.x, y: ndc.y, z: ndc.z },
          cameraDistance: probe.position.distanceTo(subjectAt),
          inFrame: Math.abs(ndc.x) <= 0.9 && Math.abs(ndc.y) <= 0.9 && ndc.z > -1 && ndc.z < 1,
        };
      };
      const samples = [];
      for (let standoff = minSeparation; standoff <= minSeparation + 600; standoff += 2) samples.push(at(standoff));
      const framed = samples.filter((row) => row.inFrame);
      const nearest = (list, y) => list.reduce((best, row) => (
        Math.abs(row.centerNdc.y - y) < Math.abs(best.centerNdc.y - y) ? row : best));
      const close = framed.length ? framed[0] : samples[0];
      const defaultFrame = framed.length ? nearest(framed, 0.35) : samples[0];
      const far = framed.length ? framed[framed.length - 1] : samples[0];
      const distant = at(Math.max(far.standoff * 4, far.standoff + 600));
      return {
        minSeparation,
        visualRadius: vc.radius,
        centerGlobal,
        cameraForward: f,
        cameraOffset: { x: cameraOffset.x, y: cameraOffset.y, z: cameraOffset.z },
        framedStandoffs: framed.length,
        close,
        default: defaultFrame,
        far,
        distant,
      };
    };
    const identityResources = (id, residencyKey) => {
      const entity = resolve(id);
      const root = rootOf(entity);
      const renderer = state.render.renderer;
      let visibleMeshes = 0;
      let drawGroups = 0;
      let triangles = 0;
      let vertices = 0;
      let instancedMeshes = 0;
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      const programs = new Set();
      root?.traverse?.((object) => {
        if (!object.isMesh || !chainVisible(object, root)) return;
        visibleMeshes += 1;
        const geometry = object.geometry;
        if (!geometry) return;
        geometries.add(geometry.uuid);
        const position = geometry.getAttribute?.('position');
        const total = geometry.index ? geometry.index.count : (position ? position.count : 0);
        const rangeCount = Number.isFinite(geometry.drawRange?.count) ? geometry.drawRange.count : Infinity;
        const drawCount = Math.min(total, rangeCount);
        const instances = object.isInstancedMesh ? Math.max(0, Number(object.count) || 0) : 1;
        if (object.isInstancedMesh) instancedMeshes += 1;
        const materialList = Array.isArray(object.material) ? object.material : [object.material];
        if (Array.isArray(object.material) && geometry.groups?.length) {
          for (const group of geometry.groups) {
            const material = object.material[group.materialIndex];
            if (!material || material.visible === false) continue;
            drawGroups += 1;
            triangles += (Math.min(group.count, drawCount) / 3) * instances;
          }
        } else {
          drawGroups += 1;
          triangles += (drawCount / 3) * instances;
        }
        vertices += position ? position.count : 0;
        for (const material of materialList) {
          if (!material) continue;
          materials.add(material.uuid);
          for (const value of Object.values(material)) if (value && value.isTexture) textures.add(value.uuid);
          if (material.uniforms) {
            for (const uniform of Object.values(material.uniforms)) if (uniform?.value?.isTexture) textures.add(uniform.value.uuid);
          }
          try {
            const key = renderer.properties?.get?.(material)?.currentProgram?.cacheKey;
            if (key) programs.add(key);
          } catch (_) { /* program not yet linked */ }
        }
      });
      const diagnostics = residencyModule.getAssetResidency(renderer)?.canonicalDiagnostics?.() || state.render.assetResidency;
      const row = (diagnostics?.assets || []).find((asset) => asset.key === residencyKey) || null;
      const pools = refreshPoolSubmission();
      const source = poolSourceOf(root);
      const pool = source.keys.size > 0 ? (() => {
        let chunks = 0;
        let submittingChunks = 0;
        let instancesAllOwners = 0;
        const poolMaterials = new Set();
        const poolTextures = new Set();
        const poolPrograms = new Set();
        for (const key of source.keys) {
          for (const chunk of pools.get(key)?.chunks || []) {
            chunks += 1;
            const count = Math.max(0, Number(chunk.count) || 0);
            if (chunk.visible !== false && count > 0) {
              submittingChunks += 1;
              instancesAllOwners += count;
            }
            const material = chunk.material;
            if (!material) continue;
            poolMaterials.add(material.uuid);
            for (const value of Object.values(material)) if (value && value.isTexture) poolTextures.add(value.uuid);
            try {
              const key2 = renderer.properties?.get?.(material)?.currentProgram?.cacheKey;
              if (key2) poolPrograms.add(key2);
            } catch (_) { /* not yet linked */ }
          }
        }
        return {
          keys: source.keys.size,
          sourceMeshes: source.sourceMeshes,
          trianglesPerInstance: source.trianglesPerInstance,
          vertices: source.vertices,
          chunks,
          submittingChunks,
          instancesAllOwners,
          materials: poolMaterials.size,
          textures: poolTextures.size,
          programs: poolPrograms.size,
        };
      })() : null;
      const pooled = visibleMeshes === 0 && !!pool && pool.submittingChunks > 0 && chainVisible(root);
      // Authored geometry under the root regardless of submission, excluding readable-fallback
      // placeholders: what admission made resident for this identity, drawn or not.
      const authored = (() => {
        let meshCount = 0;
        let groupCount = 0;
        let triangleCount = 0;
        let vertexCount = 0;
        const hiddenGeometries = new Set();
        const hiddenMaterials = new Set();
        const hiddenTextures = new Set();
        const hiddenPrograms = new Set();
        root?.traverse?.((object) => {
          if (!object.isMesh || !object.geometry || /^SF_PlaceFallback/.test(String(object.name || ''))) return;
          meshCount += 1;
          const geometry = object.geometry;
          hiddenGeometries.add(geometry.uuid);
          const position = geometry.getAttribute?.('position');
          const total = geometry.index ? geometry.index.count : (position ? position.count : 0);
          const materialList = Array.isArray(object.material) ? object.material : [object.material];
          groupCount += Array.isArray(object.material) && geometry.groups?.length ? geometry.groups.length : 1;
          triangleCount += total / 3;
          vertexCount += position ? position.count : 0;
          for (const material of materialList) {
            if (!material) continue;
            hiddenMaterials.add(material.uuid);
            for (const value of Object.values(material)) if (value && value.isTexture) hiddenTextures.add(value.uuid);
            try {
              const programKey = renderer.properties?.get?.(material)?.currentProgram?.cacheKey;
              if (programKey) hiddenPrograms.add(programKey);
            } catch (_) { /* not yet linked */ }
          }
        });
        return meshCount > 0 ? {
          meshes: meshCount,
          groups: groupCount,
          triangles: Math.round(triangleCount),
          vertices: vertexCount,
          geometries: hiddenGeometries.size,
          materials: hiddenMaterials.size,
          textures: hiddenTextures.size,
          programs: hiddenPrograms.size,
        } : null;
      })();
      const submitted = visibleMeshes > 0 || pooled;
      // Submitted numbers are what the renderer draws for this root this frame (zero when its root is
      // not submitted); authored numbers are what admission made resident.
      return {
        presentation: pooled ? 'instance-pool' : submitted ? 'root-meshes' : 'not-submitted',
        drawn: submitted,
        submit: submitDecisionOf(entity, root),
        authored,
        visibleMeshes: pooled ? pool.sourceMeshes : visibleMeshes,
        drawGroups: pooled ? pool.submittingChunks : drawGroups,
        triangles: pooled ? pool.trianglesPerInstance : Math.round(triangles),
        vertices: pooled ? pool.vertices : vertices,
        geometries: pooled ? pool.keys : geometries.size,
        materials: pooled ? pool.materials : materials.size,
        textures: pooled ? pool.textures : textures.size,
        programs: pooled ? pool.programs : programs.size,
        instancedMeshes,
        pool,
        residency: row ? {
          key: row.key,
          resident: true,
          refCount: row.refCount,
          resourceCount: row.resourceCount,
          gpuResidentBytes: row.gpuResidentBytes,
          cpuPackageBytes: row.cpuPackageBytes,
          gpuAccountingAuthoritative: row.gpuAccountingAuthoritative,
          unaccountedResources: row.unaccountedResources,
          roles: row.roles,
          sectors: row.sectors,
          presentationTiers: row.presentationTiers,
        } : { key: residencyKey, resident: false },
      };
    };
    const resourceSnapshot = (label, cycle, residencyKeysByIdentity) => {
      const renderer = state.render.renderer;
      const info = renderer.info;
      const diagnostics = residencyModule.getAssetResidency(renderer)?.canonicalDiagnostics?.() || state.render.assetResidency;
      let sceneObjects = 0;
      state.render.scene?.traverse?.(() => { sceneObjects += 1; });
      const heap = performance.memory;
      const identityResidency = {};
      for (const [key, residencyKey] of Object.entries(residencyKeysByIdentity || {})) {
        const row = (diagnostics?.assets || []).find((asset) => asset.key === residencyKey);
        identityResidency[key] = row ? {
          resident: true,
          refCount: row.refCount,
          gpuResidentBytes: row.gpuResidentBytes,
          cpuPackageBytes: row.cpuPackageBytes,
          roles: row.roles,
          sectors: row.sectors,
        } : { resident: false };
      }
      return {
        label,
        cycle,
        sectorId: state.world?.currentSectorId || null,
        atPerfMs: performance.now(),
        tick: finite(state.tick),
        geometries: finite(info.memory?.geometries),
        textures: finite(info.memory?.textures),
        programs: Array.isArray(info.programs) ? info.programs.length : null,
        residentAssets: finite(diagnostics?.residentAssets),
        residentResources: finite(diagnostics?.residentResources),
        gpuResidentBytes: finite(diagnostics?.gpuResidentBytes),
        cpuPackageBytes: finite(diagnostics?.cpuPackageBytes),
        pendingRequests: finite(diagnostics?.pendingRequests),
        ownerCount: finite(diagnostics?.ownerCount),
        unaccountedResources: finite(diagnostics?.unaccountedResources),
        gpuAccountingAuthoritative: diagnostics?.gpuAccountingAuthoritative === true,
        evictedAssets: finite(diagnostics?.evictedAssets),
        disposedResources: finite(diagnostics?.disposedResources),
        abandonedResources: finite(diagnostics?.abandonedResources),
        residencyCurrentSectorId: diagnostics?.currentSectorId ?? null,
        residencyWarmSectorId: diagnostics?.warmSectorId ?? null,
        heapUsedBytes: finite(heap?.usedJSHeapSize),
        heapTotalBytes: finite(heap?.totalJSHeapSize),
        entityCount: (state.entityList || []).filter((entity) => entity && entity.alive !== false).length,
        dressingRowCount: state.world?.dressing?.rows?.length ?? null,
        sceneObjects,
        residentSectorTiers: Object.fromEntries(Object.entries(state.world?.residentSectors || {})
          .filter(([, value]) => value && value.tier !== 'RECORD_ONLY')
          .map(([sectorId, value]) => [sectorId, value.tier])),
        dressingIdCollisions: (() => {
          const examples = [];
          let count = 0;
          for (const row of state.world?.dressing?.rows || []) {
            if (!row || row.alive === false || !shadowedByLiveEntity(row)) continue;
            count += 1;
            if (examples.length < 5) {
              const live = state.entities.get(row.id);
              examples.push({ id: row.id, placeId: row.data?.placeId || null, liveType: live?.type || null, liveDefId: live?.data?.defId || null });
            }
          }
          return { count, examples };
        })(),
        presentationIdCollisions: (() => {
          const stores = {
            farActor: state.world?.farActors?.byId,
            fieldRock: state.world?.asteroidField?.byId,
            dressing: state.world?.dressing?.byId,
          };
          const counts = { farActor: 0, fieldRock: 0, dressing: 0 };
          const examples = [];
          for (const entity of state.entityList || []) {
            if (!entity || entity.alive === false) continue;
            for (const [store, map] of Object.entries(stores)) {
              if (!(map instanceof Map) || !map.has(entity.id)) continue;
              const row = map.get(entity.id);
              if (row === entity) continue;
              counts[store] += 1;
              if (examples.length < 6) {
                examples.push({ id: entity.id, store, liveType: entity.type || null, liveRole: entity.data?.trafficRole || null, rowType: row?.type || null });
              }
            }
          }
          return { counts, examples };
        })(),
        identityResidency,
      };
    };
    const chooseFloorPose = () => {
      const player = state.entities.get(state.playerId);
      const sectorId = state.world.currentSectorId;
      const identityEntities = [];
      const colliders = [];
      for (const entity of pool()) {
        if (!entity || entity.alive === false || entity.id === state.playerId || !entity.pos) continue;
        if (identityForEntity(entity)) identityEntities.push(entity);
        if (entity.collides === true) colliders.push(entity);
      }
      const bounds = state.bounds || null;
      const origin = { x: player.pos.x, z: player.pos.z };
      // Candidates stay inside the current sector's own station/gate ring so a floor pose can never
      // trigger a free-flight membership handoff into a neighbouring sector.
      const anchors = (state.entityList || []).filter((entity) => entity && entity.alive !== false
        && entity.type === 'station' && homeOf(entity) === sectorId && entity.pos);
      let ring = null;
      if (anchors.length > 0) {
        const cx = anchors.reduce((total, entity) => total + entity.pos.x, 0) / anchors.length;
        const cz = anchors.reduce((total, entity) => total + entity.pos.z, 0) / anchors.length;
        const radius = anchors.reduce((max, entity) => Math.max(max, Math.hypot(entity.pos.x - cx, entity.pos.z - cz)), 0);
        ring = { x: cx, z: cz, radius };
      }
      const candidates = [];
      for (const radius of [0, 350, 700, 1050, 1400, 1750]) {
        const steps = radius === 0 ? 1 : 12;
        for (let step = 0; step < steps; step += 1) {
          const angle = (step / steps) * Math.PI * 2;
          candidates.push({ x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius });
        }
      }
      let best = null;
      for (const candidate of candidates) {
        if (bounds?.center && Number.isFinite(bounds.radius)
            && Math.hypot(candidate.x - bounds.center.x, candidate.z - bounds.center.z) > bounds.radius - 250) continue;
        if (ring && Math.hypot(candidate.x - ring.x, candidate.z - ring.z) > ring.radius) continue;
        let identityClearance = Infinity;
        for (const entity of identityEntities) {
          const clearance = Math.hypot(entity.pos.x - candidate.x, entity.pos.z - candidate.z) - (Number(entity.radius) || 0);
          if (clearance < identityClearance) identityClearance = clearance;
        }
        let colliderClearance = Infinity;
        for (const entity of colliders) {
          const clearance = Math.hypot(entity.pos.x - candidate.x, entity.pos.z - candidate.z) - (Number(entity.radius) || 0);
          if (clearance < colliderClearance) colliderClearance = clearance;
        }
        if (colliderClearance < 60) continue;
        if (!best || identityClearance > best.identityClearance + 1e-6) {
          best = { ...candidate, identityClearance, colliderClearance };
        }
      }
      return { sectorId, origin, ring, candidates: candidates.length, identityEntities: identityEntities.length, pose: best };
    };
    const pipelineSettle = async ({ stableMs = 3_000, timeoutMs = 90_000, horizonMs = 5_000 } = {}) => {
      const startedAt = performance.now();
      let lastKey = null;
      let stableSince = startedAt;
      let observations = 0;
      let transitions = 0;
      let last = null;
      while (performance.now() - startedAt < timeoutMs) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        const readiness = metrics.collectPerformancePipelineReadiness({
          state,
          registry: SF.registry,
          measurementHorizonMs: horizonMs,
        });
        const fingerprint = metrics.performancePipelineFingerprint(readiness);
        const key = JSON.stringify(fingerprint);
        observations += 1;
        if (key !== lastKey) {
          transitions += 1;
          lastKey = key;
          stableSince = performance.now();
        }
        last = fingerprint;
        if (metrics.isPerformancePipelineSettled(readiness) && performance.now() - stableSince >= stableMs) {
          return { settled: true, elapsedMs: performance.now() - startedAt, observations, transitions, fingerprint: last };
        }
      }
      return { settled: false, elapsedMs: performance.now() - startedAt, observations, transitions, fingerprint: last };
    };
    const admissionState = (id, releaseFile) => {
      const entity = resolve(id);
      const root = rootOf(entity);
      const data = root?.userData || {};
      const urls = slotUrls(root);
      return {
        exists: !!entity && entity.alive !== false,
        ready: !!entity && entity.presentationAdmission === 'ready'
          && data.authoredAssetState === 'authored'
          && data.authoredReadableFallbackRetained === false
          && urls.some((url) => url.endsWith(releaseFile)),
        admission: entity?.presentationAdmission ?? null,
        rawAssetState: data.authoredAssetState ?? null,
        atPerfMs: performance.now(),
        player: (() => {
          const player = state.entities.get(state.playerId);
          return player ? { x: player.pos.x, z: player.pos.z } : null;
        })(),
        sectorId: state.world?.currentSectorId || null,
      };
    };
    const requestExplicitUpgrade = (id) => {
      const entity = resolve(id);
      const root = rootOf(entity);
      const request = root?.userData?.requestAuthoredUpgrade;
      if (typeof request !== 'function') return false;
      request(state.render.renderer, state.render.scene);
      return true;
    };
    const ownerJob = (key, releaseFile = null) => {
      const subject = resolve(key);
      const id = subject ? subject.id : key;
      const jobs = state.render?.scene?.userData?.authoredUpgradeDiagnostics?.jobs || [];
      const matches = jobs.filter((job) => job && job.entityId === id);
      // Job diagnostics are keyed by the bare presentation id, which other tables can share. The subject's job is
      // the latest one that loaded its own release; jobs under the same id that loaded other bodies are reported
      // separately and never stand in for it.
      const releaseJobs = releaseFile
        ? matches.filter((job) => (job.assetUrls || []).some((url) => String(url).endsWith(releaseFile)))
        : matches;
      const foreignJobs = releaseFile
        ? matches.filter((job) => !releaseJobs.includes(job)).map((job) => ({
          sequence: job.sequence ?? null,
          status: job.status ?? null,
          assetUrls: (job.assetUrls || []).map((url) => String(url).split('/').slice(-3).join('/')),
        }))
        : [];
      const job = releaseJobs[releaseJobs.length - 1] || null;
      if (!job) {
        return matches.length > 0 ? {
          sequence: null,
          status: null,
          cacheStatus: null,
          estimatedBytes: null,
          transferBytes: null,
          durationMs: null,
          startedAtMs: null,
          endedAtMs: null,
          assetUrls: [],
          jobsForEntity: matches.length,
          releaseJobs: 0,
          foreignJobs,
        } : null;
      }
      return {
        sequence: job.sequence ?? null,
        status: job.status ?? null,
        cacheStatus: job.cacheStatus ?? null,
        estimatedBytes: finite(job.estimatedBytes),
        transferBytes: finite(job.transferBytes),
        durationMs: finite(job.durationMs),
        startedAtMs: finite(job.startedAtMs),
        endedAtMs: finite(job.endedAtMs),
        assetUrls: (job.assetUrls || []).map((url) => String(url).split('/').slice(-3).join('/')),
        jobsForEntity: matches.length,
        releaseJobs: releaseJobs.length,
        foreignJobs,
      };
    };
    const resourceEntries = (packageDir, releaseFile) => performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes(`/render-packages/${packageDir}/`) || entry.name.endsWith(releaseFile))
      .map((entry) => ({
        name: String(entry.name).split('/').slice(-3).join('/'),
        startTime: entry.startTime,
        durationMs: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      }));
    const locate = (identity, context = {}) => {
      const sectorId = state.world.currentSectorId;
      const subject = identity.subject || {};
      const live = pool().filter((entity) => entity && entity.alive !== false && homeOf(entity) === identity.sectorId);
      if (subject.kind === 'relay-fixture') {
        const relay = live.find((entity) => entity.data?.siteBeacon === context.relaySiteId);
        return relay ? keyOf(relay) : null;
      }
      if (subject.kind === 'traffic-fixture') {
        const id = context.trafficIds?.[subject.role];
        const entity = id != null ? resolve(`e:${id}`) : null;
        return entity && entity.alive !== false ? keyOf(entity) : null;
      }
      const matches = live.filter((entity) => {
        if (subject.type && entity.type !== subject.type) return false;
        const data = entity.data || {};
        if (subject.stationId && data.stationId !== subject.stationId) return false;
        if (subject.archetypeGlb && data.archetypeGlb !== subject.archetypeGlb) return false;
        if (subject.placeId && data.placeId !== subject.placeId) return false;
        if (subject.poiId && data.poiId !== subject.poiId) return false;
        if (subject.isGate != null && (data.isGate === true) !== subject.isGate) return false;
        return true;
      });
      if (matches.length === 0) return null;
      if (identity.key === 'station-billboard') {
        // Same asset identity, the Coalition Station instance: the Helios Station instance sits in the
        // trade hub's docking and collision neighbourhood, where measurement poses were relocated.
        const core = live.find((entity) => entity.type === 'station' && entity.data?.stationId === 'station_coalition')
          || live.find((entity) => entity.type === 'station' && entity.data?.stationId === 'station_helios');
        if (core) {
          matches.sort((a, b) => Math.hypot(a.pos.x - core.pos.x, a.pos.z - core.pos.z)
            - Math.hypot(b.pos.x - core.pos.x, b.pos.z - core.pos.z));
        }
      }
      return sectorId === identity.sectorId ? keyOf(matches[0]) : null;
    };
    const trafficFixtureIntact = (role, entityId, recordId, releaseFile) => {
      const entity = state.entities.get(entityId);
      if (!entity || entity.alive === false) return { intact: false, reason: 'missing' };
      if (entity.data?.worldRecordId !== recordId) return { intact: false, reason: `worldRecordId ${entity.data?.worldRecordId ?? null}` };
      if (entity.data?.trafficRole !== role) return { intact: false, reason: `trafficRole ${entity.data?.trafficRole ?? null}` };
      // Held through the owner's record wait (miner records step as waiting hauler records); a hull a
      // job or the priority courier service adopted, or whose record or defId changed, is not the fixture.
      const record = (state.traffic?.freighters || []).find((row) => row && row.id === entityId) || null;
      if (!record) return { intact: false, reason: 'traffic owner record missing' };
      const expectedRecordRole = role === 'miner' ? 'hauler' : role;
      if (record.role !== expectedRecordRole || !(Number(record.waitT) > 0)) {
        return { intact: false, reason: `record role ${record.role} waitT ${record.waitT}` };
      }
      if (entity.data?.jobId || entity.data?.itinerary || record.itinerary || record.priorityCourierService) {
        return { intact: false, reason: 'adopted by a job or the priority courier service' };
      }
      const expectedDefId = { courier: 'ship_kestrel', hauler: 'ship_mule', miner: 'ship_pelican' }[role];
      if (entity.data?.defId !== expectedDefId) return { intact: false, reason: `defId ${entity.data?.defId ?? null}` };
      let file = null;
      try { file = partsLibrary.wholeShipVisualForEntity(entity)?.file || null; } catch (_) { file = null; }
      if (file !== releaseFile) return { intact: false, reason: `visual ${file}` };
      const tables = [state.world?.farActors?.byId, state.world?.asteroidField?.byId, state.world?.dressing?.byId];
      if (tables.some((map) => map instanceof Map && map.has(entityId))) return { intact: false, reason: 'id held by a presentation table' };
      return { intact: true, reason: null };
    };
    // Presentation id ownership. Entities, far-actor rows, asteroid-field rocks, and dressing rows share one
    // numeric id space, and the renderer keys meshes, presentation slots, and upgrade jobs by that bare id. A
    // subject is bound to its own body only when no other table holds its id, the id is not on the free list,
    // and any mesh or slot under the id belongs to the subject.
    const shortUrl = (url) => String(url).split('/').slice(-2).join('/');
    const describeOwner = (row) => (row ? {
      type: row.type ?? null,
      defId: row.data?.defId ?? row.data?.hullDefId ?? row.hullDefId ?? null,
      trafficRole: row.data?.trafficRole ?? row.trafficRole ?? null,
      placeId: row.data?.placeId ?? null,
      siteBeacon: row.data?.siteBeacon ?? null,
      pos: row.pos ? { x: Math.round(row.pos.x), z: Math.round(row.pos.z) } : null,
    } : null);
    const idOwnership = (id, releaseFile = null, ownStore = 'live') => {
      const numericId = Number(id);
      const render = renderSystem();
      const live = state.entities?.get?.(numericId) || null;
      const liveAlive = !!live && live.alive !== false;
      const far = state.world?.farActors?.byId?.get?.(numericId) || null;
      const farAlive = !!far && far.alive !== false;
      const rock = state.world?.asteroidField?.byId?.get?.(numericId) || null;
      const rockPresented = !!rock && rock.alive !== false && rock.liveEntityId == null;
      const dressing = state.world?.dressing?.byId?.get?.(numericId) || null;
      const dressingAlive = !!dressing && dressing.alive !== false;
      const storeOf = (row) => (!row ? null : row === live ? 'live' : row === dressing ? 'dressing'
        : row === far ? 'far' : row === rock ? 'rock' : 'other');
      const resolvedStore = storeOf(presentationSources.resolveWorldPresentationEntity(state, numericId));
      const mesh = render?._meshes?.get?.(numericId) || null;
      const meshUrls = mesh ? slotUrls(mesh) : [];
      const meshBody = !mesh ? 'none'
        : meshUrls.length === 0 ? 'unadmitted'
          : releaseFile && meshUrls.some((url) => url.endsWith(releaseFile)) ? 'release' : 'foreign';
      const world = render?._presentationWorld || null;
      let slotStore = null;
      let slotMeshIsMesh = null;
      if (world?.entityIds && world?.alive) {
        for (let slot = 0; slot < world.entityIds.length; slot += 1) {
          if (world.entityIds[slot] !== numericId || world.alive[slot] !== 1) continue;
          slotStore = storeOf(world.entityRefs?.[slot] ?? null);
          slotMeshIsMesh = (world.meshRefs?.[slot] ?? null) === mesh;
          break;
        }
      }
      const localOf = (pos) => {
        if (!pos || typeof render?._frameMembrane?.toLocal !== 'function') return null;
        try {
          const out = { x: 0, z: 0 };
          const local = render._frameMembrane.toLocal(pos, out) || out;
          return Number.isFinite(local.x) && Number.isFinite(local.z) ? local : null;
        } catch (_) { return null; }
      };
      const meshDistanceTo = (row) => {
        const local = mesh && row?.pos ? localOf(row.pos) : null;
        return local ? Math.round(Math.hypot(mesh.position.x - local.x, mesh.position.z - local.z)) : null;
      };
      const frame = render?._activityFrame || state.render?.activityFrame || null;
      const named = (collection) => !!collection && (typeof collection.has === 'function'
        ? collection.has(numericId) : Array.isArray(collection) && collection.includes(numericId));
      const jobs = (state.render?.scene?.userData?.authoredUpgradeDiagnostics?.jobs || [])
        .filter((job) => job && job.entityId === numericId)
        .map((job) => ({ sequence: job.sequence ?? null, status: job.status ?? null, urls: (job.assetUrls || []).map(shortUrl) }));
      const inFreeIds = Array.isArray(state.freeIds) && state.freeIds.includes(numericId);
      const otherHolders = [];
      if (ownStore !== 'live' && liveAlive) otherHolders.push('live');
      if (ownStore !== 'dressing' && dressingAlive) otherHolders.push('dressing');
      if (ownStore !== 'far' && farAlive) otherHolders.push('far');
      if (ownStore !== 'rock' && rockPresented) otherHolders.push('rock');
      const clean = otherHolders.length === 0 && !inFreeIds && meshBody !== 'foreign'
        && (slotStore === null || slotStore === ownStore);
      return {
        id: numericId,
        ownStore,
        clean,
        otherHolders,
        live: liveAlive ? describeOwner(live) : null,
        far: farAlive ? describeOwner(far) : null,
        rock: rock ? { presented: rockPresented, liveEntityId: rock.liveEntityId ?? null } : null,
        dressing: dressingAlive ? describeOwner(dressing) : null,
        resolvedStore,
        inFreeIds,
        mesh: mesh ? {
          body: meshBody,
          urls: meshUrls.map(shortUrl),
          name: mesh.name || null,
          kind: mesh.userData?.kind ?? null,
          assetId: mesh.userData?.assetId ?? mesh.userData?.authoredCompositionId ?? null,
          assetState: mesh.userData?.authoredAssetState ?? null,
          visible: mesh.visible !== false,
          presentationEntityId: mesh.userData?.presentationEntityId ?? null,
          distanceToDressing: meshDistanceTo(dressingAlive ? dressing : null),
          distanceToFar: meshDistanceTo(farAlive ? far : null),
          distanceToLive: meshDistanceTo(liveAlive ? live : null),
        } : null,
        slotStore,
        slotMeshIsMesh,
        onGlass: named(frame && (frame.renderGlassIds || frame.glassIds)),
        onRunway: named(frame && (frame.renderRunwayIds || frame.runwayIds)),
        jobs,
      };
    };
    const subjectIdOwnership = (key, releaseFile = null) => {
      const text = String(key);
      const separator = text.indexOf(':');
      const store = separator > 0 ? text.slice(0, separator) : 'e';
      const id = separator > 0 ? text.slice(separator + 1) : text;
      return idOwnership(id, releaseFile, store === 'd' ? 'dressing' : 'live');
    };
    const ownershipSignature = (row) => JSON.stringify([
      row.otherHolders, row.live && [row.live.type, row.live.defId, row.live.trafficRole],
      row.far && [row.far.type, row.far.defId, row.far.trafficRole], row.rock && row.rock.presented,
      row.dressing && [row.dressing.placeId, row.dressing.siteBeacon], row.resolvedStore, row.inFreeIds,
      row.mesh && [row.mesh.body, row.mesh.urls.join('|'), row.mesh.assetState, row.mesh.visible, row.mesh.presentationEntityId],
      row.slotStore, row.slotMeshIsMesh, row.onGlass, row.onRunway, row.jobs.length,
    ]);
    const idWatches = new Map();
    const stopIdWatch = (key, reason = null) => {
      const watch = idWatches.get(key);
      if (!watch) return null;
      clearInterval(watch.timer);
      idWatches.delete(key);
      return {
        key,
        releaseFile: watch.releaseFile,
        startedAtPerfMs: Math.round(watch.startedAtPerfMs),
        stoppedAtPerfMs: Math.round(performance.now()),
        stopReason: reason,
        samples: watch.samples,
        transitions: watch.transitions,
        heartbeats: watch.heartbeats,
        truncated: watch.truncated,
      };
    };
    // Samples one subject's id ownership twice a second from issue until its target window opens (never during
    // a timing window) and keeps each change with its full census.
    const startIdWatch = (key, releaseFile = null, intervalMs = 500) => {
      stopIdWatch(key);
      const watch = {
        key, releaseFile, startedAtPerfMs: performance.now(), samples: 0, transitions: [], heartbeats: [],
        truncated: false, lastSignature: null, timer: null,
      };
      const sample = () => {
        let row;
        try { row = subjectIdOwnership(key, releaseFile); } catch (error) { row = { error: String(error?.message || error) }; }
        watch.samples += 1;
        // A 10 s heartbeat keeps sim tick, sim time, and present pacing on the timeline even while ownership does
        // not change, so a stalled admission shows whether the simulation stalled with it.
        if (watch.samples % 20 === 1 && watch.heartbeats.length < 400) {
          watch.heartbeats.push({
            atPerfMs: Math.round(performance.now()),
            tick: finite(state.tick),
            simTime: finite(state.simTime),
            lastPresentDtMs: finite(state.render?.lastPresentDtMs),
            meshState: row.mesh?.assetState ?? null,
            jobs: Array.isArray(row.jobs) ? row.jobs.length : null,
          });
        }
        const signature = row.error ? `error:${row.error}` : ownershipSignature(row);
        if (signature === watch.lastSignature) return;
        watch.lastSignature = signature;
        if (watch.transitions.length >= 160) { watch.truncated = true; return; }
        watch.transitions.push({ atPerfMs: Math.round(performance.now()), tick: finite(state.tick), ownership: row });
      };
      sample();
      watch.timer = setInterval(sample, intervalMs);
      idWatches.set(key, watch);
      return { key, startedAtPerfMs: Math.round(watch.startedAtPerfMs) };
    };
    const relayBindingIntact = (key, siteId, releaseFile) => {
      const entity = resolve(key);
      const ownership = subjectIdOwnership(key, releaseFile);
      if (!entity || entity.alive === false) return { intact: false, reason: 'relay dressing row missing', ownership };
      if (entity.data?.siteBeacon !== siteId) {
        return { intact: false, reason: `dressing row siteBeacon ${entity.data?.siteBeacon ?? null}`, ownership };
      }
      if (!ownership.clean) {
        const parts = [];
        if (ownership.otherHolders.length > 0) parts.push(`id ${ownership.id} also held by ${ownership.otherHolders.join('+')}`);
        if (ownership.inFreeIds) parts.push(`id ${ownership.id} is on the free list`);
        if (ownership.mesh?.body === 'foreign') parts.push(`mesh under id ${ownership.id} is ${ownership.mesh.urls.join(', ') || 'another body'}`);
        if (ownership.slotStore && ownership.slotStore !== ownership.ownStore) parts.push(`presentation slot bound to ${ownership.slotStore}`);
        return { intact: false, reason: parts.join('; ') || 'presentation id not clean', ownership };
      }
      return { intact: true, reason: null, ownership };
    };
    const stationPositions = () => (state.entityList || [])
      .filter((entity) => entity && entity.alive !== false && entity.type === 'station'
        && homeOf(entity) === state.world.currentSectorId)
      .map((entity) => ({
        id: entity.id,
        stationId: entity.data?.stationId || null,
        archetypeGlb: entity.data?.archetypeGlb || null,
        isGate: entity.data?.isGate === true,
        x: Math.round(entity.pos.x),
        z: Math.round(entity.pos.z),
      }));

    window.__PQ022_H3__ = Object.freeze({
      impacts: () => ({ count: playerImpacts, last: lastPlayerImpact }),
      census,
      subjectFacts,
      placePlayer,
      planFraming,
      identityResources,
      resourceSnapshot,
      chooseFloorPose,
      pipelineSettle,
      admissionState,
      requestExplicitUpgrade,
      ownerJob,
      resourceEntries,
      locate,
      stationPositions,
      trafficFixtureIntact,
      destroyedEvents,
      idOwnership,
      subjectIdOwnership,
      startIdWatch,
      stopIdWatch,
      relayBindingIntact,
    });
  }, identityRows);
}

export async function waitForAnimationFrames(targetPage, count = 8) {
  await targetPage.evaluate(async (frames) => {
    for (let index = 0; index < frames; index += 1) {
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
  }, count);
}

export async function waitForSubjectAdmission(targetPage, {
  subjectId,
  releaseFile,
  approachStartedAtPerfMs,
  anchorPose = null,
  sectorId = null,
  naturalWaitMs = PQ022_H3_NATURAL_ADMISSION_WAIT_MS,
  ceilingMs = PQ022_H3_ADMISSION_CEILING_MS,
}) {
  const movedFrom = (facts) => {
    if (sectorId && facts.sectorId !== sectorId) return `sector changed to ${facts.sectorId}`;
    if (anchorPose && facts.player
        && Math.hypot(facts.player.x - anchorPose.x, facts.player.z - anchorPose.z) > 200) {
      return `player relocated to ${Math.round(facts.player.x)},${Math.round(facts.player.z)} from ${Math.round(anchorPose.x)},${Math.round(anchorPose.z)}`;
    }
    return null;
  };
  const first = await targetPage.evaluate(({ id, file }) => window.__PQ022_H3__.admissionState(id, file), {
    id: subjectId,
    file: releaseFile,
  });
  if (movedFrom(first)) {
    throw new Error(`subject ${subjectId} (${releaseFile}) approach pose lost before admission: ${movedFrom(first)}`);
  }
  if (!first.exists) {
    throw new Error(`subject ${subjectId} (${releaseFile}) no longer exists at approach: ${JSON.stringify(first)}`);
  }
  if (first.ready) {
    return {
      path: 'already-admitted',
      readyAtPerfMs: first.atPerfMs,
      approachToReadyMs: Math.max(0, first.atPerfMs - approachStartedAtPerfMs),
      explicitRequestAtPerfMs: null,
    };
  }
  const waitReady = async (timeoutMs) => {
    let facts;
    try {
      const handle = await targetPage.waitForFunction(({ id, file, pose, sector }) => {
        const current = window.__PQ022_H3__.admissionState(id, file);
        const moved = (sector && current.sectorId !== sector)
          || (pose && current.player && Math.hypot(current.player.x - pose.x, current.player.z - pose.z) > 200);
        return current.ready || !current.exists || moved ? current : false;
      }, { id: subjectId, file: releaseFile, pose: anchorPose, sector: sectorId }, { timeout: timeoutMs, polling: 100 });
      facts = await handle.jsonValue();
    } catch (error) {
      if (/Timeout/i.test(String(error?.message || error))) return null;
      throw error;
    }
    if (movedFrom(facts)) {
      throw new Error(`subject ${subjectId} (${releaseFile}) approach pose lost during admission: ${movedFrom(facts)}`);
    }
    if (!facts.exists) {
      throw new Error(`subject ${subjectId} (${releaseFile}) disappeared before admission: ${JSON.stringify(facts)}`);
    }
    return facts;
  };
  const natural = await waitReady(naturalWaitMs);
  if (natural) {
    return {
      path: 'natural',
      readyAtPerfMs: natural.atPerfMs,
      approachToReadyMs: Math.max(0, natural.atPerfMs - approachStartedAtPerfMs),
      explicitRequestAtPerfMs: null,
    };
  }
  const explicit = await targetPage.evaluate((id) => ({
    requested: window.__PQ022_H3__.requestExplicitUpgrade(id),
    atPerfMs: performance.now(),
  }), subjectId);
  const late = await waitReady(Math.max(1_000, ceilingMs - naturalWaitMs));
  if (!late) {
    const facts = await targetPage.evaluate(({ id, file }) => window.__PQ022_H3__.admissionState(id, file), {
      id: subjectId,
      file: releaseFile,
    });
    // Relocation, a sector change, or a vanished subject is a harness failure. A subject still present,
    // posed, and pending at the ceiling is a measured product outcome: the caller records an admission
    // timeout for this identity and cycle instead of voiding the whole route.
    if (movedFrom(facts)) {
      throw new Error(`subject ${subjectId} (${releaseFile}) approach pose lost at the admission ceiling: ${movedFrom(facts)}`);
    }
    if (!facts.exists) {
      throw new Error(`subject ${subjectId} (${releaseFile}) disappeared at the admission ceiling: ${JSON.stringify(facts)}`);
    }
    // Ownership of the subject's presentation id at the ceiling separates a real admission timeout from a
    // subject whose id another table holds (its own body can then never be built).
    const idOwnership = await targetPage.evaluate(({ id, file }) => window.__PQ022_H3__.subjectIdOwnership(id, file), {
      id: subjectId,
      file: releaseFile,
    }).catch((error) => ({ error: String(error?.message || error) }));
    return {
      path: 'timeout',
      readyAtPerfMs: null,
      approachToReadyMs: null,
      timedOutAfterMs: Math.max(0, Number(facts.atPerfMs) - approachStartedAtPerfMs),
      ceilingMs,
      explicitRequestAtPerfMs: explicit.atPerfMs,
      explicitRequestAccepted: explicit.requested,
      lastState: { ...facts, idOwnership },
    };
  }
  return {
    path: 'explicit-request',
    readyAtPerfMs: late.atPerfMs,
    approachToReadyMs: Math.max(0, late.atPerfMs - approachStartedAtPerfMs),
    explicitRequestAtPerfMs: explicit.atPerfMs,
    explicitRequestAccepted: explicit.requested,
  };
}

// Transcribed from scripts/capture-pq020-h3-performance.mjs: timing windows run with GPU timer queries
// off, then a separate 150-frame attribution segment drains its queries before the next transition.
export async function attachSeparatedGpuAttribution(targetPage, timingWindow) {
  const gpuCapture = await targetPage.evaluate(async ({ requiredFrames }) => {
    const state = window.SF?.state;
    const timers = state?.render?.gpuTimers;
    if (!timers
        || typeof timers.reset !== 'function'
        || typeof timers.setEnabled !== 'function'
        || typeof timers.drainPending !== 'function'
        || typeof timers.getReport !== 'function') {
      throw new Error('PQ-022 H3 requires the live GPU timer capability');
    }
    const raf = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const settingsSlice = () => JSON.stringify({
      video: state?.settings?.video || null,
      dynResScale: Number.isFinite(state?.render?.dynResScale) ? state.render.dynResScale : null,
      timeScale: Number.isFinite(state?.timeScale) ? state.timeScale : null,
    });
    const routeSlice = () => JSON.stringify({
      mode: state?.mode || null,
      docked: state?.ui?.docked === true,
      jumpState: state?.jump?.state || null,
      visibility: document.visibilityState,
    });
    const settingsStart = settingsSlice();
    const routeStart = routeSlice();
    const startedAt = performance.now();
    let frameCount = 0;
    let drain = null;
    let report = null;
    try {
      timers.reset();
      timers.setEnabled(true);
      while (frameCount < requiredFrames) {
        await raf();
        frameCount += 1;
      }
      drain = await timers.drainPending({ maxPolls: 120, timeoutMs: 2_000, yieldFn: raf });
      report = timers.getReport();
    } finally {
      timers.setEnabled(false);
    }
    return {
      frameCount,
      durationMs: performance.now() - startedAt,
      settingsStable: settingsSlice() === settingsStart,
      routeStable: routeSlice() === routeStart,
      gpuTimers: {
        available: report?.available === true,
        status: report?.status || (report?.available ? 'available' : 'unavailable'),
        reason: report?.reason || null,
        extension: report?.extension || null,
        enabled: report?.enabled === true,
        lastDisjoint: report?.lastDisjoint === true,
        pending: report?.pending,
        lastInvalidation: report?.lastInvalidation || null,
        queryCounts: report?.queryCounts || null,
        captureValid: report?.captureValid === true,
        drain,
        terminals: report?.terminals || null,
        passes: report?.passes || null,
      },
    };
  }, { requiredFrames: 150 });

  timingWindow.attribution.gpuTimers = gpuCapture.gpuTimers;
  timingWindow.attribution.measurementIsolation = {
    frameTimingGpuTimersEnabled: false,
    gpuAttributionSeparated: true,
    gpuAttributionFrameCount: gpuCapture.frameCount,
    gpuAttributionDurationMs: gpuCapture.durationMs,
    settingsStable: gpuCapture.settingsStable,
    routeStable: gpuCapture.routeStable,
  };
}
