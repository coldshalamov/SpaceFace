import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FAIL_RECOVERY_COOLDOWN_S } from '../src/story/campaign47a/campaignData.js';

const FLIGHT_TIMEOUT_MS = 120_000;
const STORY_TIMEOUT_MS = 20_000;
const SAVE_SLOT = 'm5-story-embodied-proof';

export async function runEmbodiedStoryRoute(page, { root, routeName }) {
  assert.equal(new URL(page.url()).search, '', `${routeName}: player route must be canonical root`);
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus && window.SF?.registry), null, {
    timeout: FLIGHT_TIMEOUT_MS,
  });

  await clearStoryProofSaves(page);
  await startNewGameThroughUi(page, routeName);
  await page.evaluate(() => window.SF.eventTrace?.clear?.());

  const descriptors = await readReachableDescriptors(page);
  assert.deepEqual(descriptors.beats, [0, 1, 2, 3, 4, 5, 6, 7], `${routeName}: B0-B7 descriptors`);
  assert.equal(descriptors.allPhysical, true, `${routeName}: every beat needs a physical contact seam`);
  assert.equal(descriptors.allLocated, true, `${routeName}: every beat needs an authored location`);
  assert.equal(descriptors.allDialogued, true, `${routeName}: every beat needs a reachable contact line`);

  await completeB0(page);
  const b1 = await waitForStoryContract(page, 1, routeName);
  assertStoryContract(b1, 1, routeName);
  await acceptIfBoarded(page, b1, routeName);
  await completeCargoStoryContract(page, 1, routeName);
  await waitForBeat(page, 2, routeName);

  let b2 = await waitForStoryContract(page, 2, routeName);
  assertStoryContract(b2, 2, routeName);
  await acceptIfBoarded(page, b2, routeName);
  b2 = await waitForActiveStoryContract(page, 2, routeName);

  const failure = await failAndRecoverB2(page, b2, routeName);
  assert.equal(failure.failedReceipt.kind, 'encounter_fail', `${routeName}: failure receipt`);
  assert.equal(failure.recoveredReceipt.kind, 'encounter_recover', `${routeName}: recovery receipt`);
  assert.equal(failure.beatAfterRecovery, 2, `${routeName}: recovery must not skip B2`);

  b2 = await waitForStoryContract(page, 2, routeName);
  await acceptIfBoarded(page, b2, routeName);
  b2 = await waitForActiveStoryContract(page, 2, routeName);
  assert.equal(b2.type, 'rescue_under_fire', `${routeName}: live B2 is the pod rescue under fire`);
  const aftermath = await completeB2PodRescue(page, b2, routeName);
  assert.equal(aftermath.source, 'entity:killed', `${routeName}: aftermath source`);
  assert.ok(aftermath.markerId, `${routeName}: aftermath marker id`);
  await waitForBeat(page, 3, routeName);

  const drifter = await buyDrifterAtTethys(page, routeName);
  assert.equal(drifter.activeDefId, 'ship_drifter', `${routeName}: Drifter is active after purchase`);
  const b3 = await waitForStoryContract(page, 3, routeName);
  assertStoryContract(b3, 3, routeName);
  assert.equal(b3.type, 'tow_recovery', `${routeName}: live B3 is the long slag-core tow`);
  await acceptIfBoarded(page, b3, routeName);
  const b3Active = await waitForActiveStoryContract(page, 3, routeName);
  const tow = await completeLongTow(page, b3Active, routeName);
  assert.equal(tow.completionMethod, 'tow_in', `${routeName}: B3 settles by towing the core in`);
  await waitForBeat(page, 4, routeName);

  const branch = {
    branch: 'traders', factionId: 'faction_mts', stationId: 'station_tethys',
    sectorId: 'sector_tethys_junction',
  };
  await acceptAndCompleteAuthoredTrade(page, {
    stationId: branch.stationId,
    storyTagPrefix: 'story.branch_intro',
    routeName,
  });
  await waitForBeat(page, 5, routeName);
  for (let step = 1; step <= 3; step++) {
    await acceptAndCompleteAuthoredTrade(page, {
      stationId: branch.stationId,
      storyTagPrefix: `campaign47a:b5:traders:${step}`,
      routeName,
    });
  }
  await waitForBeat(page, 6, routeName);

  const seedAsset = await buyAndProgramSeedDrone(page, routeName);
  assert.equal(seedAsset.templateId, 'mine_to_depot', `${routeName}: seed drone program`);
  await waitForBeat(page, 7, routeName);
  // PQ-032.02: the legacy net-worth/standing gate must NOT close a live save — the run
  // ends only by flying the authored Ashfall operation. Prove it with the sim actually
  // ticking (undocked) while the old prerequisites are satisfied.
  if (await page.evaluate(() => window.SF.state.ui?.docked === true)) {
    await undockThroughUi(page, routeName);
  }
  await satisfyEndgamePrerequisites(page, branch);
  const gateSimStart = await page.evaluate(() => window.SF.state.simTime || 0);
  await page.waitForFunction((t0) => (
    Number.isFinite(window.SF?.state?.simTime) && window.SF.state.simTime >= t0 + 0.75
  ), gateSimStart, { timeout: STORY_TIMEOUT_MS });
  assert.equal(await page.evaluate(() => window.SF.state.story.flags?.endgame === true), false,
    `${routeName}: live route ignores the legacy net-worth gate`);
  const op = await acceptAndCompleteDeepReachOperation(page, {
    storyTagPrefix: 'campaign47a:b7:force:',
    operationId: 'ashfall_siege',
    operationType: 'demolition',
    routeName,
  });
  assert.equal(op.storyOperation, 'ashfall_siege', `${routeName}: traders branch runs the siege`);
  await undockThroughUi(page, routeName);
  await page.waitForFunction(() => {
    const story = window.SF?.state?.story;
    const flags = window.SF?.state?.story?.flags;
    return flags?.deep_reach_operation_complete === true
      && flags?.endgame === true
      && story?.endgameOffered === true;
  }, null, { timeout: STORY_TIMEOUT_MS });
  assert.equal(await page.evaluate(() => window.SF.state.story.beatIndex), 7,
    `${routeName}: ending must not invent B8 cursor`);

  const beforeSave = await storySnapshot(page);
  assert.equal(beforeSave.story.beatIndex, 7, `${routeName}: canonical B7 remains ending authority`);
  assert.equal(beforeSave.story.flags.endgame, true, `${routeName}: B7 gate reached`);
  assert.equal(beforeSave.story.flags.elroy_outcome, undefined,
    `${routeName}: live pod-rescue route never stamps an Elroy outcome`);
  assert.equal(beforeSave.story.flags.elroy_outcome_legacy, undefined,
    `${routeName}: live pod-rescue route never stamps the legacy mark`);
  assert.equal(beforeSave.story.flags.embodied_route, 'rescue',
    `${routeName}: authored B1–B3 settlement marked the live route`);
  assert.equal(beforeSave.story.flags.deep_reach_variant, 'ashfall_siege',
    `${routeName}: traders branch completed its authored operation`);
  assert.equal(beforeSave.sidecarOwnsBeatIndex, false, `${routeName}: sidecar cannot own beatIndex`);
  assert.equal(beforeSave.sidecarOwnsEnding, false, `${routeName}: sidecar cannot own ending`);
  assert.ok(beforeSave.contactBeatCount >= 6, `${routeName}: beat transitions must surface story contacts`);
  assert.ok(beforeSave.aftermathMarkerIds.includes(aftermath.markerId), `${routeName}: B2 aftermath remains visible`);
  assert.equal(beforeSave.ownership.activeShipDefId, 'ship_drifter', `${routeName}: Drifter owned and active`);
  assert.equal(beforeSave.ownership.seedDrone.id, seedAsset.id, `${routeName}: real seed drone retained`);
  assert.equal(beforeSave.ownership.seedDrone.templateId, 'mine_to_depot', `${routeName}: seed program retained`);

  const shotDir = resolve(root, '.devshots', 'alpha', 'm5-story-embodied');
  await mkdir(shotDir, { recursive: true });
  const beforeShot = resolve(shotDir, `${routeName}-b7.png`);
  await page.screenshot({ path: beforeShot, fullPage: false });

  const saved = await saveStoryState(page, SAVE_SLOT, routeName);
  assert.equal(saved.story.beatIndex, beforeSave.story.beatIndex, `${routeName}: save cursor`);
  assert.equal(saved.missionsStory.beatIndex, beforeSave.story.beatIndex, `${routeName}: missions save cursor`);
  assert.ok(saved.aftermathMarkerIds.includes(aftermath.markerId), `${routeName}: aftermath serialized`);
  assert.ok(saved.ownership.ownedShipDefIds.includes('ship_drifter'), `${routeName}: Drifter serialized`);
  assert.equal(saved.ownership.seedDrone?.id, seedAsset.id, `${routeName}: seed drone serialized`);
  assert.equal(saved.ownership.seedDrone?.templateId, 'mine_to_depot', `${routeName}: seed program serialized`);

  await continueThroughUi(page, routeName);
  const continued = await storySnapshot(page);
  assert.deepEqual(compactStory(continued.story), compactStory(beforeSave.story), `${routeName}: story Continue restoration`);
  assert.deepEqual(compactSidecar(continued.story.campaign47a), compactSidecar(beforeSave.story.campaign47a),
    `${routeName}: sidecar Continue restoration`);
  assert.ok(continued.aftermathMarkerIds.includes(aftermath.markerId), `${routeName}: aftermath Continue restoration`);
  assert.deepEqual(continued.ownership, beforeSave.ownership, `${routeName}: ship and automation Continue restoration`);

  const continuedShot = resolve(shotDir, `${routeName}-continued.png`);
  await page.screenshot({ path: continuedShot, fullPage: false });

  return {
    routeName,
    descriptors,
    branch,
    failure,
    aftermath,
    beforeSave: compactSnapshot(beforeSave),
    continued: compactSnapshot(continued),
    screenshots: [beforeShot, continuedShot],
  };
}

async function clearStoryProofSaves(page) {
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('sf.save.')) localStorage.removeItem(key);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
}

async function startNewGameThroughUi(page, routeName) {
  const newGame = page.getByRole('button', { name: 'New Game', exact: true });
  await newGame.waitFor({ state: 'visible', timeout: 30_000 });
  await newGame.click();
  const launch = page.getByRole('button', { name: /^Launch$/i });
  await launch.waitFor({ state: 'visible', timeout: 30_000 });
  await launch.click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player && player.alive !== false;
  }, null, { timeout: FLIGHT_TIMEOUT_MS });
  assert.equal(new URL(page.url()).search, '', `${routeName}: New Game changed player route`);
}

async function readReachableDescriptors(page) {
  return page.evaluate(async () => {
    const missions = await import('/src/story/campaign47a/embodiedMissions.js');
    const dialogue = await import('/src/story/campaign47a/embodiedDialogue.js');
    const rows = missions.listEmbodiedMissions();
    return {
      beats: rows.map((row) => row.beat),
      allPhysical: rows.every((row) => row.physicalContact?.mode
        && (row.physicalContact.mode === 'observe' || row.physicalContact?.steps?.length > 0)),
      allLocated: rows.every((row) => row.location?.sectorId),
      allDialogued: rows.every((row) => dialogue.commsForBeat(row.beat).length > 0),
      storyTags: rows.map((row) => row.missionBoardContract?.storyTag || null),
    };
  });
}

async function completeB0(page) {
  await page.evaluate(() => window.SF.bus.emit('dock:docked', { stationId: 'station_helios' }));
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.SF.state.story.beatIndex), 0, 'dock-before-mine cannot clear B0');
  await page.evaluate(() => window.SF.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, source: 'm5-story-embodied-proof',
  }));
  await page.evaluate(() => window.SF.bus.emit('dock:docked', { stationId: 'station_helios' }));
  await waitForBeat(page, 1, 'runtime');
}

async function waitForStoryContract(page, beat, routeName) {
  await page.waitForFunction((wanted) => {
    const state = window.SF?.state;
    const active = state?.missions?.active || [];
    const boards = Object.values(state?.missions?.boards || {}).flatMap((board) => board?.slots || []);
    return [...active, ...boards].some((row) => row?.campaign47aBeat === wanted && row?.storyContractId);
  }, beat, { timeout: STORY_TIMEOUT_MS });
  return page.evaluate((wanted) => {
    const state = window.SF.state;
    const active = state.missions.active || [];
    const boards = Object.values(state.missions.boards || {}).flatMap((board) => board?.slots || []);
    const row = active.find((item) => item?.campaign47aBeat === wanted && item?.storyContractId)
      || boards.find((item) => item?.campaign47aBeat === wanted && item?.storyContractId);
    return { ...row, placement: active.includes(row) ? 'active' : 'board' };
  }, beat);
}

function assertStoryContract(contract, beat, routeName) {
  assert.equal(contract.campaign47aBeat, beat, `${routeName}: B${beat} contract beat tag`);
  assert.ok(contract.storyContractId, `${routeName}: B${beat} deterministic contract id`);
  assert.ok(contract.stationId, `${routeName}: B${beat} physical origin`);
  assert.ok(contract.destSectorId, `${routeName}: B${beat} physical destination`);
}

async function acceptIfBoarded(page, contract, routeName) {
  if (contract.placement !== 'board') return;
  const sectorId = contract.stationId === 'station_helios'
    ? 'sector_helios_prime'
    : contract.stationId === 'station_tethys'
      ? 'sector_tethys_junction'
      : null;
  assert.ok(sectorId, `${routeName}: known physical origin for ${contract.stationId}`);
  await travelAndDock(page, contract.stationId, sectorId, routeName);
  const currentMissionId = await page.evaluate(({ stationId, storyTag }) => {
    const board = window.SF?.state?.missions?.boards?.[stationId];
    return board?.slots?.find((row) => row?.storyTag === storyTag)?.id || null;
  }, { stationId: contract.stationId, storyTag: contract.storyTag });
  assert.ok(currentMissionId, `${routeName}: refreshed authored offer ${contract.storyTag}`);
  await acceptMissionThroughStationUi(page, currentMissionId, routeName);
}

async function acceptMissionThroughStationUi(page, missionId, routeName) {
  await page.waitForFunction(() => {
    const sf = window.SF;
    const stack = sf?.state?.ui?.screenStack || [];
    const overlay = document.getElementById('sf-dock-overlay');
    return sf?.state?.ui?.docked === true
      && stack.at(-1) === 'station'
      && overlay?.hidden === true;
  }, null, { timeout: STORY_TIMEOUT_MS });
  const missionsTab = page.locator('#st-tab-missions');
  await missionsTab.waitFor({ state: 'visible', timeout: STORY_TIMEOUT_MS });
  await missionsTab.click();
  const accept = page.locator(`button[data-act="accept"][data-mid=${JSON.stringify(missionId)}]`).first();
  await accept.waitFor({ state: 'visible', timeout: STORY_TIMEOUT_MS });
  assert.equal(await accept.isEnabled(), true, `${routeName}: authored mission must be player-acceptable`);
  await accept.click();
}

async function waitForActiveStoryContract(page, beat, routeName) {
  await page.waitForFunction((wanted) => (window.SF?.state?.missions?.active || [])
    .some((row) => row?.campaign47aBeat === wanted && row?.storyContractId), beat, { timeout: STORY_TIMEOUT_MS });
  const contract = await page.evaluate((wanted) => ({ ...(window.SF.state.missions.active || [])
    .find((row) => row?.campaign47aBeat === wanted && row?.storyContractId) }), beat);
  assertStoryContract(contract, beat, routeName);
  return contract;
}

async function completeCargoStoryContract(page, beat, routeName) {
  const contract = await waitForActiveStoryContract(page, beat, routeName);
  await page.evaluate((m) => {
    const sf = window.SF;
    const cargo = sf.registry.get('cargo');
    const qty = Math.max(1, Number(m.params?.qty) || 1);
    if (cargo?.addCargo && m.params?.cmdtyId) cargo.addCargo(m.params.cmdtyId, qty);
  }, contract);
  await travelAndDock(page, contract.destStationId, contract.destSectorId, routeName);
}

async function failAndRecoverB2(page, contract, routeName) {
  if (await page.evaluate(() => window.SF.state.ui?.docked === true)) {
    await undockThroughUi(page, routeName);
  }
  await page.evaluate((missionId) => window.SF.bus.emit('ui:abandonMission', { missionId }), contract.id);
  await page.waitForFunction(() => window.SF.state.story?.campaign47a?.beatStatus === 'failed', null, {
    timeout: STORY_TIMEOUT_MS,
  });
  const failed = await page.evaluate(() => {
    const own = window.SF.state.story.campaign47a;
    return { failedAtS: own.failedAtS, receipt: own.receipts.findLast((row) => row?.kind === 'encounter_fail') };
  });
  assert.ok(failed.receipt, `${routeName}: B2 failure must enter sidecar ledger`);
  try {
    await page.waitForFunction(({ failedAtS, cooldownS }) => (
      Number.isFinite(window.SF?.state?.simTime)
        && window.SF.state.simTime >= failedAtS + cooldownS
    ), {
      failedAtS: failed.failedAtS,
      cooldownS: FAIL_RECOVERY_COOLDOWN_S,
    }, { timeout: FLIGHT_TIMEOUT_MS });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      simTime: window.SF?.state?.simTime,
      timeScale: window.SF?.state?.timeScale,
      effectiveScale: window.SF?.timeEffects?.getEffectiveScale?.(),
      mode: window.SF?.state?.mode,
      docked: window.SF?.state?.ui?.docked,
      dockedStationId: window.SF?.state?.ui?.dockedStationId,
      screenStack: [...(window.SF?.state?.ui?.screenStack || [])],
      overlayHidden: document.getElementById('sf-dock-overlay')?.hidden,
      trace: (window.SF?.eventTrace?.snapshot?.() || []).filter((row) => (
        row?.type === 'dock:docked' || row?.type === 'dock:undocked'
          || row?.type === 'sim:pause' || row?.type === 'sim:resume'
      )).slice(-20),
    }));
    throw new Error(`${routeName}: B2 recovery cooldown did not advance: ${JSON.stringify({
      failedAtS: failed.failedAtS,
      targetS: failed.failedAtS + FAIL_RECOVERY_COOLDOWN_S,
      diagnostic,
    })}`, { cause: error });
  }
  await travelAndDock(page, 'station_tethys', 'sector_tethys_junction', routeName);
  await page.waitForFunction(() => {
    const own = window.SF.state.story?.campaign47a;
    return own?.beatStatus === 'tracking' && own.receipts?.some((row) => row?.kind === 'encounter_recover');
  }, null, { timeout: STORY_TIMEOUT_MS });
  return page.evaluate((failedReceiptId) => {
    const own = window.SF.state.story.campaign47a;
    return {
      failedReceipt: own.receipts.find((row) => row.id === failedReceiptId),
      recoveredReceipt: own.receipts.findLast((row) => row?.kind === 'encounter_recover'),
      beatAfterRecovery: window.SF.state.story.beatIndex,
    };
  }, failed.receipt.id);
}

// PQ-032.02: the live B2 is a pod rescue under fire — escorts must be fought off the
// pod line, then one life pod physically delivered to the authored destination dock.
// It never resolves Elroy; `state.story.flags.elroy_outcome` must remain unset.
async function completeB2PodRescue(page, contract, routeName) {
  if (await page.evaluate(() => window.SF.state.ui?.docked === true)) {
    await undockThroughUi(page, routeName);
  }
  await page.evaluate((m) => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (world?.enterSector && m.destSectorId && sf.state.world.currentSectorId !== m.destSectorId) {
      world.enterSector(m.destSectorId, {
        fromJump: true, via: 'proof', fromSectorId: sf.state.world.currentSectorId,
      });
    }
  }, contract);
  await page.waitForFunction((storyContractId) => {
    const mission = (window.SF.state.missions.active || [])
      .find((row) => row.storyContractId === storyContractId);
    if (!mission?.targetEntityIds?.length) return false;
    const roles = mission.targetEntityIds
      .map((id) => window.SF.state.entities.get(id))
      .map((entity) => entity?.data?.physicalRole);
    return roles.includes('life_pod') && roles.includes('rescue_escort');
  }, contract.storyContractId, { timeout: STORY_TIMEOUT_MS });

  // Fight the escort cordon off the pod line — real kills, real aftermath wrecks.
  const cordon = await page.evaluate((storyContractId) => {
    const sf = window.SF;
    const mission = sf.state.missions.active.find((row) => row.storyContractId === storyContractId);
    const escorts = mission.targetEntityIds
      .map((id) => sf.state.entities.get(id))
      .filter((entity) => entity && entity.data?.physicalRole === 'rescue_escort' && entity.alive !== false);
    for (const escort of escorts) {
      escort.alive = false;
      sf.bus.emit('entity:killed', {
        id: escort.id, type: escort.type,
        pos: { x: escort.pos?.x || 0, z: escort.pos?.z || 0 },
        sectorId: mission.destSectorId,
        killerId: sf.state.playerId,
        label: escort.data?.scanLabel || escort.data?.name || 'RESCUE ESCORT',
      });
    }
    return { escortIds: escorts.map((row) => row.id) };
  }, contract.storyContractId);
  assert.ok(cordon.escortIds.length > 0, `${routeName}: B2 must spawn a live escort cordon`);
  const wreckVictimId = cordon.escortIds[0];
  await page.waitForFunction((victimId) => Object.values(window.SF.state.aftermathWrecks?.bySector || {})
    .flat().some((row) => row?.victimId === victimId && row?.source === 'entity:killed'), wreckVictimId, {
    timeout: STORY_TIMEOUT_MS,
  });
  const aftermath = await page.evaluate((victimId) => Object.values(window.SF.state.aftermathWrecks.bySector)
    .flat().find((row) => row.victimId === victimId), wreckVictimId);

  // Latch a pod, put it on the destination dock the way a tow delivery ends, then dock.
  const delivery = await page.evaluate((storyContractId) => {
    const sf = window.SF;
    const mission = sf.state.missions.active.find((row) => row.storyContractId === storyContractId);
    if (!mission) return { missing: 'mission' };
    const pod = mission.targetEntityIds
      .map((id) => sf.state.entities.get(id))
      .find((entity) => entity && entity.data?.physicalRole === 'life_pod' && entity.alive !== false);
    const station = [...sf.state.entities.values()].find((entity) => (
      entity?.data?.stationId === mission.destStationId && entity.pos
    ));
    if (!pod || !station) return { missing: !pod ? 'life_pod' : 'dest_station' };
    const player = sf.state.entities.get(sf.state.playerId);
    if (player?.pos && station.pos) player.pos = { x: station.pos.x, z: station.pos.z };
    sf.state.player.tether = { active: true, targetId: pod.id, phase: 'loaded' };
    sf.bus.emit('tether:latched', { targetId: pod.id });
    pod.pos = { x: station.pos.x, z: station.pos.z };
    sf.bus.emit('dock:docked', { stationId: mission.destStationId, source: 'm5-story-embodied-proof' });
    return {
      podId: pod.id,
      podLabel: pod.data?.scanLabel || pod.data?.name || null,
      completionMethod: mission.params?.completionMethod || null,
      stillActive: mission.status === 'active',
    };
  }, contract.storyContractId);
  assert.equal(delivery.missing, undefined, `${routeName}: B2 needs a live pod and the destination dock (${delivery.missing})`);
  assert.match(String(delivery.podLabel || ''), /life pod/i, `${routeName}: B2 must embody a life pod, not Elroy`);
  assert.equal(delivery.stillActive, false, `${routeName}: pod delivery completes the rescue`);
  assert.equal(delivery.completionMethod, 'stage_tow', `${routeName}: pod arrives staged on the dock`);

  const liveFlags = await page.evaluate(() => ({
    elroyOutcome: window.SF.state.story?.flags?.elroy_outcome,
    legacyMark: window.SF.state.story?.flags?.elroy_outcome_legacy,
    embodiedRoute: window.SF.state.story?.flags?.embodied_route,
  }));
  assert.equal(liveFlags.elroyOutcome, undefined, `${routeName}: pod rescue writes no Elroy outcome`);
  assert.equal(liveFlags.legacyMark, undefined, `${routeName}: pod rescue writes no legacy mark`);
  assert.equal(liveFlags.embodiedRoute, 'rescue', `${routeName}: authored B2 settlement marks the live route`);
  return aftermath;
}

// Live B3 is the long tow: latch the slag core and bring it to the authored yard dock.
async function completeLongTow(page, contract, routeName) {
  if (await page.evaluate(() => window.SF.state.ui?.docked === true)) {
    await undockThroughUi(page, routeName);
  }
  await page.evaluate((m) => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (world?.enterSector && m.destSectorId && sf.state.world.currentSectorId !== m.destSectorId) {
      world.enterSector(m.destSectorId, {
        fromJump: true, via: 'proof', fromSectorId: sf.state.world.currentSectorId,
      });
    }
  }, contract);
  await page.waitForFunction((storyContractId) => {
    const mission = (window.SF.state.missions.active || [])
      .find((row) => row.storyContractId === storyContractId);
    return !!mission?.targetEntityIds?.some((id) => (
      window.SF.state.entities.get(id)?.data?.physicalRole === 'slag_core'
    ));
  }, contract.storyContractId, { timeout: STORY_TIMEOUT_MS });

  const tow = await page.evaluate((storyContractId) => {
    const sf = window.SF;
    const mission = sf.state.missions.active.find((row) => row.storyContractId === storyContractId);
    if (!mission) return { missing: 'mission' };
    const core = mission.targetEntityIds
      .map((id) => sf.state.entities.get(id))
      .find((entity) => entity && entity.data?.physicalRole === 'slag_core' && entity.alive !== false);
    const station = [...sf.state.entities.values()].find((entity) => (
      entity?.data?.stationId === mission.destStationId && entity.pos
    ));
    if (!core || !station) return { missing: !core ? 'slag_core' : 'dest_station' };
    const player = sf.state.entities.get(sf.state.playerId);
    if (player?.pos && station.pos) player.pos = { x: station.pos.x, z: station.pos.z };
    sf.state.player.tether = { active: true, targetId: core.id, phase: 'loaded' };
    sf.bus.emit('tether:latched', { targetId: core.id });
    core.pos = { x: station.pos.x, z: station.pos.z };
    sf.bus.emit('dock:docked', { stationId: mission.destStationId, source: 'm5-story-embodied-proof' });
    return {
      completionMethod: mission.params?.completionMethod || null,
      stillActive: mission.status === 'active',
    };
  }, contract.storyContractId);
  assert.equal(tow.missing, undefined, `${routeName}: B3 needs the slag core and the yard dock (${tow.missing})`);
  assert.equal(tow.stillActive, false, `${routeName}: delivering the core completes the long tow`);
  return tow;
}

// Live B7 is the authored Ashfall operation posted by the recovered Empire Seed — a
// physical contract on the station_ashcache board, not a trade and not a menu entry.
async function acceptAndCompleteDeepReachOperation(page, { storyTagPrefix, operationId, operationType, routeName }) {
  await travelAndDock(page, 'station_ashcache', 'sector_ashfall_reach', routeName);
  await page.waitForFunction((prefix) => {
    const board = window.SF?.state?.missions?.boards?.station_ashcache;
    return !!board?.slots?.some((candidate) => String(candidate?.storyTag || '').startsWith(prefix));
  }, storyTagPrefix, { timeout: STORY_TIMEOUT_MS });
  const offers = await page.evaluate((prefix) => {
    const board = window.SF.state.missions.boards.station_ashcache;
    return board.slots
      .filter((candidate) => String(candidate?.storyTag || '').startsWith(prefix))
      .map((row) => ({
        id: row.id, storyTag: row.storyTag, type: row.type,
        storyOperation: row.storyOperation || null, destSectorId: row.destSectorId,
      }));
  }, storyTagPrefix);
  assert.equal(offers.length, 1, `${routeName}: exactly one authored Deep Reach operation posts`);
  const offer = offers[0];
  assert.equal(offer.storyOperation, operationId, `${routeName}: authored operation id`);
  assert.equal(offer.type, operationType, `${routeName}: ${offer.storyTag} keeps its authored physical verb`);

  await acceptMissionThroughStationUi(page, offer.id, routeName);
  await page.waitForFunction((storyTag) => (window.SF?.state?.missions?.active || [])
    .some((row) => row?.storyTag === storyTag), offer.storyTag, { timeout: STORY_TIMEOUT_MS });
  await undockThroughUi(page, routeName);

  await page.waitForFunction((storyTag) => {
    const mission = (window.SF.state.missions.active || []).find((row) => row.storyTag === storyTag);
    return !!mission?.targetEntityIds?.some((id) => window.SF.state.entities.get(id));
  }, offer.storyTag, { timeout: STORY_TIMEOUT_MS });
  await page.evaluate(({ storyTag, sectorId }) => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (world?.enterSector && sectorId && sf.state.world.currentSectorId !== sectorId) {
      world.enterSector(sectorId, {
        fromJump: true, via: 'proof', fromSectorId: sf.state.world.currentSectorId,
      });
    }
    const mission = sf.state.missions.active.find((row) => row.storyTag === storyTag);
    const tower = mission.targetEntityIds
      .map((id) => sf.state.entities.get(id))
      .find((entity) => entity && entity.data?.physicalRole === 'demolition_tower' && entity.alive !== false);
    if (tower) {
      sf.bus.emit('tether:whipImpact', {
        victimId: tower.id, targetId: sf.state.playerId, rating: 'solid', relSpeed: 80,
      });
    }
  }, { storyTag: offer.storyTag, sectorId: offer.destSectorId });
  await page.waitForFunction((storyTag) => {
    const mission = (window.SF.state.missions.active || []).find((row) => row.storyTag === storyTag);
    return !mission || mission.status !== 'active';
  }, offer.storyTag, { timeout: STORY_TIMEOUT_MS });
  // The ending desk is at the cache — dock back at Ashfall the way the live route does.
  await page.evaluate(() => {
    const sf = window.SF;
    sf.bus.emit('dock:docked', { stationId: 'station_ashcache', source: 'm5-story-embodied-proof' });
  });
  await page.waitForFunction(() => (
    window.SF?.state?.ui?.docked === true
    && window.SF?.state?.ui?.dockedStationId === 'station_ashcache'
  ), null, { timeout: STORY_TIMEOUT_MS });
  return offer;
}

async function buyDrifterAtTethys(page, routeName) {
  await travelAndDock(page, 'station_tethys', 'sector_tethys_junction', routeName);
  const result = await page.evaluate(() => {
    const sf = window.SF;
    const economy = sf.registry.get('economy');
    const ships = sf.registry.get('ships');
    if (sf.state.player.credits < 110_000) {
      economy.grantCredits(110_000 - sf.state.player.credits, 'm5-story-embodied-proof');
    }
    const creditsBefore = sf.state.player.credits;
    const ownedBefore = sf.state.player.ownedShips.length;
    const ok = ships.buyShip({ defId: 'ship_drifter', setActive: true });
    const active = sf.state.player.ownedShips[sf.state.player.activeShipIndex];
    const entity = sf.state.entities.get(sf.state.playerId);
    return {
      ok, creditsBefore, creditsAfter: sf.state.player.credits,
      ownedBefore, ownedAfter: sf.state.player.ownedShips.length,
      activeDefId: active?.defId || null, entityDefId: entity?.data?.defId || null,
    };
  });
  assert.equal(result.ok, true, `${routeName}: authoritative Drifter purchase`);
  assert.equal(result.ownedAfter, result.ownedBefore + 1, `${routeName}: Drifter added to ownedShips`);
  assert.ok(result.creditsAfter < result.creditsBefore, `${routeName}: Drifter charged real credits`);
  assert.equal(result.entityDefId, 'ship_drifter', `${routeName}: active player entity is Drifter`);
  return result;
}

async function buyAndProgramSeedDrone(page, routeName) {
  const result = await page.evaluate(() => {
    const sf = window.SF;
    const economy = sf.registry.get('economy');
    const automation = sf.registry.get('automation');
    if (sf.state.player.credits < 10_000) {
      economy.grantCredits(10_000 - sf.state.player.credits, 'm5-story-embodied-proof');
    }
    const creditsBefore = sf.state.player.credits;
    const beforeIds = new Set((sf.state.automation?.drones || []).map((row) => row.id));
    const bought = automation.buyDrone('drone_mk1');
    const drone = (sf.state.automation?.drones || []).find((row) => !beforeIds.has(row.id));
    const assigned = !!drone && automation.assignProgram(drone.id, 'mine_to_depot');
    return {
      bought, assigned, creditsBefore, creditsAfter: sf.state.player.credits,
      id: drone?.id || null, defId: drone?.defId || null,
      templateId: drone?.program?.templateId || null,
      entityIds: [...(drone?.entityIds || [])],
      entitiesAlive: (drone?.entityIds || []).every((id) => sf.state.entities.get(id)?.alive !== false),
    };
  });
  assert.equal(result.bought, true, `${routeName}: authoritative drone purchase`);
  assert.equal(result.assigned, true, `${routeName}: authoritative drone program assignment`);
  assert.ok(result.creditsAfter < result.creditsBefore, `${routeName}: drone charged real credits`);
  assert.equal(result.defId, 'drone_mk1', `${routeName}: durable drone definition`);
  assert.ok(result.entityIds.length > 0 && result.entitiesAlive, `${routeName}: drone materialized live entities`);
  return result;
}

async function travelAndDock(page, stationId, sectorId, routeName) {
  const currentDock = await page.evaluate(() => ({
    docked: window.SF?.state?.ui?.docked === true,
    stationId: window.SF?.state?.ui?.dockedStationId || null,
    sectorId: window.SF?.state?.world?.currentSectorId || null,
  }));
  if (currentDock.docked && (currentDock.stationId !== stationId || currentDock.sectorId !== sectorId)) {
    // A station hub retains its resolved station while it is mounted. Close the current berth
    // through the player-facing control before moving to another sector/station, otherwise the
    // state board can advance while the visible DOM still renders the previous station's board.
    await undockThroughUi(page, routeName);
  }
  const result = await page.evaluate(({ stationId: targetStation, sectorId: targetSector }) => {
    const sf = window.SF;
    const world = sf.registry.get('world');
    if (sf.state.world.currentSectorId !== targetSector) {
      world.enterSector(targetSector, {
        fromJump: true, via: 'proof', fromSectorId: sf.state.world.currentSectorId,
      });
    }
    sf.bus.emit('dock:docked', { stationId: targetStation, source: 'm5-story-embodied-proof' });
    return {
      sectorId: sf.state.world.currentSectorId,
      docked: sf.state.ui?.docked === true,
      dockedStationId: sf.state.ui?.dockedStationId || null,
    };
  }, { stationId, sectorId });
  assert.equal(result.sectorId, sectorId, `${routeName}: reached ${sectorId}`);
  assert.equal(result.docked, true, `${routeName}: docked at ${stationId}`);
  assert.equal(result.dockedStationId, stationId, `${routeName}: dock authority retained station`);
}

async function undockThroughUi(page, routeName) {
  const button = page.locator('.st-undock').first();
  await button.waitFor({ state: 'visible', timeout: STORY_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const stack = sf?.state?.ui?.screenStack || [];
    const overlay = document.getElementById('sf-dock-overlay');
    return sf?.state?.ui?.docked === true
      && stack.at(-1) === 'station'
      && overlay?.hidden === true;
  }, null, { timeout: STORY_TIMEOUT_MS });
  const before = await page.evaluate(() => ({
    simTime: window.SF.state.simTime,
    timeScale: window.SF.state.timeScale,
    effectiveScale: window.SF.timeEffects?.getEffectiveScale?.(),
    mode: window.SF.state.mode,
    docked: window.SF.state.ui?.docked,
    dockedStationId: window.SF.state.ui?.dockedStationId,
    screenStack: [...(window.SF.state.ui?.screenStack || [])],
    overlayHidden: document.getElementById('sf-dock-overlay')?.hidden,
  }));
  await button.focus();
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction((simBefore) => {
      const sf = window.SF;
      const stack = sf?.state?.ui?.screenStack || [];
      return sf?.state?.ui?.docked === false
        && sf.state.ui?.dockedStationId == null
        && !stack.includes('station')
        && sf.state.mode === 'flight'
        && sf.state.timeScale > 0
        && sf.timeEffects?.getEffectiveScale?.() > 0
        && sf.state.simTime >= simBefore + 0.1;
    }, before.simTime, { timeout: STORY_TIMEOUT_MS });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      simTime: window.SF?.state?.simTime,
      timeScale: window.SF?.state?.timeScale,
      effectiveScale: window.SF?.timeEffects?.getEffectiveScale?.(),
      mode: window.SF?.state?.mode,
      docked: window.SF?.state?.ui?.docked,
      dockedStationId: window.SF?.state?.ui?.dockedStationId,
      screenStack: [...(window.SF?.state?.ui?.screenStack || [])],
      overlayHidden: document.getElementById('sf-dock-overlay')?.hidden,
      trace: (window.SF?.eventTrace?.snapshot?.() || []).filter((row) => (
        row?.type === 'dock:docked' || row?.type === 'dock:undocked'
          || row?.type === 'sim:pause' || row?.type === 'sim:resume'
      )).slice(-20),
    }));
    throw new Error(`${routeName}: committed Undock did not resume simulation: ${JSON.stringify({ before, diagnostic })}`, {
      cause: error,
    });
  }
  assert.equal(await page.evaluate(() => window.SF.state.ui.dockedStationId), null,
    `${routeName}: public Undock cleared station authority`);
}

async function acceptAndCompleteAuthoredTrade(page, { stationId, storyTagPrefix, routeName }) {
  await travelAndDock(page, stationId, 'sector_tethys_junction', routeName);
  await page.waitForFunction(({ origin, prefix }) => {
    const board = window.SF?.state?.missions?.boards?.[origin];
    return !!board?.slots?.some((candidate) => String(candidate?.storyTag || '').startsWith(prefix));
  }, { origin: stationId, prefix: storyTagPrefix }, { timeout: STORY_TIMEOUT_MS });
  const offer = await page.evaluate(({ stationId: origin, storyTagPrefix: prefix }) => {
    const board = window.SF.state.missions.boards[origin];
    const row = board.slots.find((candidate) => String(candidate?.storyTag || '').startsWith(prefix));
    return row ? { id: row.id, storyTag: row.storyTag, type: row.type } : null;
  }, { stationId, storyTagPrefix });
  assert.ok(offer?.id, `${routeName}: authored offer ${storyTagPrefix} at ${stationId}`);
  assert.equal(offer.type, 'bulk_trade', `${routeName}: ${offer.storyTag} must use its authored trade verb`);

  await acceptMissionThroughStationUi(page, offer.id, routeName);
  await page.waitForFunction((storyTag) => (window.SF?.state?.missions?.active || [])
    .some((row) => row?.storyTag === storyTag), offer.storyTag, { timeout: STORY_TIMEOUT_MS });

  const prepared = await page.evaluate((storyTag) => {
    const sf = window.SF;
    const economy = sf.registry.get('economy');
    const mission = (sf.state.missions.active || []).find((row) => row.storyTag === storyTag);
    if (!mission) return null;
    const qty = Math.max(1, Number(mission.objectiveTarget) || Number(mission.params?.qty) || 1);
    if (sf.state.player.credits < 50_000) {
      economy.grantCredits(50_000 - sf.state.player.credits, 'm5-story-embodied-proof');
    }
    economy.ensureMarket(mission.stationId);
    economy.ensureMarket(mission.destStationId);
    const commodityId = mission.params?.cmdtyId;
    const cargoBefore = sf.state.player.cargo.items[commodityId] || 0;
    const creditsBefore = sf.state.player.credits;
    const ledgerBefore = sf.state.player.tradeLedger?.length || 0;
    const originStockBefore = sf.state.economy.markets[mission.stationId][commodityId].stock;
    const destStockBefore = sf.state.economy.markets[mission.destStationId][commodityId].stock;
    const buy = economy.execute(mission.stationId, commodityId, 'buy', qty);
    return {
      missionId: mission.id, storyTag: mission.storyTag, commodityId, qty,
      originStationId: mission.stationId, destStationId: mission.destStationId,
      destSectorId: mission.destSectorId, cargoBefore, creditsBefore, ledgerBefore,
      originStockBefore, destStockBefore, buy,
      cargoAfterBuy: sf.state.player.cargo.items[commodityId] || 0,
      originStockAfterBuy: sf.state.economy.markets[mission.stationId][commodityId].stock,
    };
  }, offer.storyTag);
  assert.ok(prepared?.missionId, `${routeName}: active authored trade ${offer.storyTag}`);
  assert.equal(prepared.buy?.ok, true, `${routeName}: real market buy for ${offer.storyTag}`);
  assert.equal(prepared.buy.qty, prepared.qty, `${routeName}: bought full mission cargo`);
  assert.equal(prepared.cargoAfterBuy, prepared.cargoBefore + prepared.qty, `${routeName}: cargo increased on buy`);
  assert.ok(prepared.originStockAfterBuy < prepared.originStockBefore, `${routeName}: origin stock decreased`);

  await travelAndDock(page, prepared.destStationId, prepared.destSectorId, routeName);
  const completion = await page.evaluate((trade) => {
    const sf = window.SF;
    const economy = sf.registry.get('economy');
    const sell = economy.execute(trade.destStationId, trade.commodityId, 'sell', trade.qty);
    return {
      ...trade, sell,
      cargoAfterSell: sf.state.player.cargo.items[trade.commodityId] || 0,
      creditsAfter: sf.state.player.credits,
      ledgerAfter: sf.state.player.tradeLedger?.length || 0,
      destStockAfter: sf.state.economy.markets[trade.destStationId][trade.commodityId].stock,
    };
  }, prepared);
  assert.equal(completion.sell?.ok, true, `${routeName}: real market sell for ${offer.storyTag}`);
  assert.equal(completion.cargoAfterSell, completion.cargoBefore, `${routeName}: cargo cleared by sale`);
  assert.equal(completion.ledgerAfter, completion.ledgerBefore + 2, `${routeName}: buy and sell ledger receipts`);
  assert.ok(completion.destStockAfter > completion.destStockBefore, `${routeName}: destination stock increased`);
  assert.notEqual(completion.creditsAfter, completion.creditsBefore, `${routeName}: credits changed through trade`);
  await page.waitForFunction((missionId) => !(window.SF?.state?.missions?.active || [])
    .some((row) => row?.id === missionId), completion.missionId, { timeout: STORY_TIMEOUT_MS });
  return completion;
}

async function satisfyEndgamePrerequisites(page, branch) {
  await page.evaluate((choice) => {
    const sf = window.SF;
    const credits = sf.state.player.credits | 0;
    if (credits < 100_000) sf.bus.emit('economy:grantCredits', {
      amount: 100_000 - credits, reason: 'm5-story-embodied-proof',
    });
    const rep = sf.state.factions?.[choice.factionId]?.rep || 0;
    if (rep < 60) sf.bus.emit('faction:repDelta', {
      factionId: choice.factionId, delta: 60 - rep, reason: 'm5-story-embodied-proof',
    });
  }, branch);
}

async function saveStoryState(page, slot, routeName) {
  await page.evaluate((saveSlot) => window.SF.bus.emit('game:save', { slot: saveSlot }), slot);
  await page.waitForFunction((saveSlot) => !!localStorage.getItem(`sf.save.${saveSlot}`), slot, {
    timeout: STORY_TIMEOUT_MS,
  });
  const saved = await page.evaluate((saveSlot) => {
    const env = JSON.parse(localStorage.getItem(`sf.save.${saveSlot}`));
    const bySector = env?.data?.aftermathWrecks?.bySector || {};
    return {
      version: env?.version,
      story: env?.data?.story || env?.data?.missions?.story,
      missionsStory: env?.data?.missions?.story,
      aftermathMarkerIds: Object.values(bySector).flat().map((row) => row.markerId).sort(),
      ownership: {
        ownedShipDefIds: (env?.data?.player?.ownedShips || []).map((row) => row.defId),
        activeShipIndex: env?.data?.player?.activeShipIndex,
        seedDrone: (env?.data?.automation?.drones || []).map((row) => ({
          id: row.id, defId: row.defId, templateId: row.program?.templateId || null,
        })).find((row) => row.templateId === 'mine_to_depot') || null,
      },
    };
  }, slot);
  assert.ok(saved.version >= 11, `${routeName}: current save schema`);
  assert.ok(saved.story && saved.missionsStory, `${routeName}: story serialized through missions authority`);
  return saved;
}

async function continueThroughUi(page, routeName) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 60_000 });
  assert.equal(new URL(page.url()).search, '', `${routeName}: Continue route must remain canonical root`);
  const button = page.getByRole('button', { name: 'Continue', exact: true });
  await button.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')]
    .some((row) => row.textContent?.trim() === 'Continue' && !row.disabled), null, { timeout: 30_000 });
  await button.click();
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player && player.alive !== false;
  }, null, { timeout: FLIGHT_TIMEOUT_MS });
}

async function waitForBeat(page, beat, routeName) {
  await page.waitForFunction((wanted) => window.SF?.state?.story?.beatIndex === wanted, beat, {
    timeout: STORY_TIMEOUT_MS,
  });
  assert.equal(await page.evaluate(() => window.SF.state.story.beatIndex), beat, `${routeName}: B${beat} reached`);
}

async function storySnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const story = JSON.parse(JSON.stringify(state.story || {}));
    const sidecar = story.campaign47a || {};
    const activeShip = (state.player.ownedShips || [])[state.player.activeShipIndex || 0];
    const seedDrone = (state.automation?.drones || []).find((row) => (
      row.id === state.story?.flags?.empire_seed_asset_id
    ));
    const trace = window.SF.eventTrace?.snapshot?.() || [];
    const contactEvents = trace.filter((row) => row.type === 'comms:popup'
      && (row.payload?.category === 'story' || row.payload?.category === 'personal'));
    return {
      story,
      sidecarOwnsBeatIndex: Object.prototype.hasOwnProperty.call(sidecar, 'beatIndex'),
      sidecarOwnsEnding: Object.prototype.hasOwnProperty.call(sidecar, 'endingId'),
      contactBeatCount: new Set(contactEvents.map((row) => row.payload?.campaign47aBeat)
        .filter(Number.isInteger)).size || contactEvents.length,
      aftermathMarkerIds: Object.values(state.aftermathWrecks?.bySector || {})
        .flat().map((row) => row.markerId).sort(),
      ownership: {
        activeShipDefId: activeShip?.defId || null,
        ownedShipDefIds: (state.player.ownedShips || []).map((row) => row.defId),
        seedDrone: seedDrone ? {
          id: seedDrone.id,
          defId: seedDrone.defId,
          templateId: seedDrone.program?.templateId || null,
          entityCount: (seedDrone.entityIds || []).length,
        } : null,
      },
    };
  });
}

function compactStory(story) {
  return {
    beatIndex: story.beatIndex,
    branch: story.branch,
    flags: story.flags,
    chainProgress: story.chainProgress,
    endgameOffered: story.endgameOffered,
    endgameChoice: story.endgameChoice,
  };
}

function compactSidecar(sidecar = {}) {
  return {
    schemaVersion: sidecar.schemaVersion,
    observedBeatIndex: sidecar.observedBeatIndex,
    beatStatus: sidecar.beatStatus,
    failureCount: sidecar.failureCount,
    failuresByBeat: sidecar.failuresByBeat,
    receiptIds: (sidecar.receipts || []).map((row) => row.id),
  };
}

function compactSnapshot(snapshot) {
  return {
    story: compactStory(snapshot.story),
    sidecar: compactSidecar(snapshot.story.campaign47a),
    aftermathMarkerIds: snapshot.aftermathMarkerIds,
    contactBeatCount: snapshot.contactBeatCount,
    ownership: snapshot.ownership,
  };
}
