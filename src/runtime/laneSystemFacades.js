import { laneRpc, laneDomEvent } from '../core/simLaneCommands.js';
import { economyReadView } from '../systems/economy.js';
import { claimsReadView } from '../systems/claimsReadModel.js';
import { drillReadView, CHARGE_PAYLOAD_ORDER } from '../systems/drill.js';
import { asteroidSites, canInstallAsteroidSiteFromState, findAsteroidSiteFromState, getAsteroidSiteFromState, projectAsteroidSiteFromState } from '../systems/asteroidSites.js';
import { careerLadders, listLadderDefinitions } from '../careers/ladders/careerLadders.js';
import { getCareerOfferViewReadOnly, getCareerProgress } from '../careers/origins/careerOrigins.js';
import { computeDiscoveredRoute, activeDriveForState, wormholeGateCheck, machineRouteStanding } from '../systems/routePlanner.js';

// Presentation-lane facades must hand callers detached data.  Keep the clone small and local so
// read selectors cannot acquire a reference to the mirrored authority object.  The JSON fallback
// is for older probe hosts that do not expose structuredClone; all mirrored values are save-safe
// plain data at this boundary.
function cloneReadValue(value) {
  if (value === undefined || value === null) return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch (_) { /* fall through to the plain-data fallback */ }
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
}

// asteroidSites' projection/preview methods use its transient runtime caches.  Run those methods
// against an isolated prototype view over one cloned mirrored site so a presentation read cannot
// normalize or reconcile the main-lane mirror.  Volatile survey state is deliberately absent here;
// durable survey records still read correctly and an unknown volatile assay stays unknown.
function asteroidReadViewFor(state, siteId) {
  const source = getAsteroidSiteFromState(state, siteId);
  if (!source || typeof source !== 'object') return null;
  const sites = state && state.sites && typeof state.sites === 'object' ? state.sites : {};
  const isolated = {
    ...(state || {}),
    sites: {
      ...sites,
      byId: { ...(sites.byId || {}), [siteId]: cloneReadValue(source) },
    },
  };
  const view = Object.create(asteroidSites);
  view.state = isolated;
  view._rt = new Map();
  view._surveyByAsteroid = new Map();
  view._accessCache = null;
  view.siteForAsteroid = (asteroidId) => findAsteroidSiteFromState(view.state, asteroidId);
  return view;
}

export function createLaneSystemFacade(ctx) {
  let nextSaveToken = 0;
  function durableSaveCommand(op, args = {}) {
    const bus = ctx?.bus;
    if (typeof bus?.on !== 'function') return Promise.resolve({ ok: false, reason: 'save-events-unavailable' });
    const token = `save-durable-${++nextSaveToken}`;
    return new Promise((resolve) => {
      let settled = false;
      let off = () => {};
      const finish = (result) => {
        if (settled) return;
        settled = true; clearTimeout(timer); off(); resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: 'save-durability-timeout' }), 160000);
      off = bus.on('save:durabilitySettled', (payload) => {
        if (payload?.token === token) finish(payload);
      });
      Promise.resolve(laneRpc(op, { ...args, token })).then((ack) => {
        if (!ack?.ok || ack.result?.ok === false) finish({ ok: false, reason: ack?.reason || ack?.result?.reason || 'save-command-failed' });
      }, (error) => finish({ ok: false, reason: String(error?.message || error) }));
    });
  }
  // Facade-miss diagnostic: a sim-owned id with no facade resolves undefined
  // and every caller silently degrades — cargo:jettison proved that can mean
  // a dead feature. Name each miss once so it surfaces instead.
  const _laneFacadeMissNoted = new Set();
  function _noteLaneFacadeMiss(name) {
    if (!_laneFacadeMissNoted || _laneFacadeMissNoted.has(name)) return;
    _laneFacadeMissNoted.add(name);
    try { console.warn(`[lane] facade miss on sim-owned system '${name}' — registry.get resolves undefined`); } catch (_) {}
    const bus = ctx && ctx.bus;
    if (bus && typeof bus.emit === 'function') {
      try { bus.emit('lane:facadeMiss', { name }); } catch (_) {}
    }
  }

  function laneSystemFacade(name) {
    const st = ctx && ctx.state;
    switch (name) {
      case 'survivalDraft': {
        // Ephemeral stock and custody are computed by the native draft owner.
        // UI mutations continue through its existing run:* intents.
        const read = (key, fallback) => structuredClone(st?.survivalDraftPublic?.[key] ?? fallback);
        return {
          name: 'survivalDraft',
          currentOffers: () => read('offers', []),
          currentWave: () => read('wave', 0),
          lastNotice: () => read('notice', null),
          rerollState: () => read('reroll', null),
          recommendedOffers: () => read('recommended', []),
          preparationReceipt: () => read('preparation', null),
          preparationGeneration: () => read('generation', 0),
          refitRows: () => read('refitRows', []),
        };
      }
      case 'survivalResults': {
        // The worker owns the private receipt.  Its detached public snapshot is mirrored with
        // the worker lifecycle generation so a late result from a prior New Game/restore cannot
        // reopen the current plate. Keep the facade read-only; the worker publishes this
        // generation-matched snapshot before its run:resultsReady event reaches presentation.
        const readSnapshot = () => {
          const snapshot = st && st.survivalResultsPublic;
          if (!snapshot || typeof snapshot !== 'object') return null;
          const readGeneration = ctx && ctx.helpers && ctx.helpers.workerReadGeneration;
          if (typeof readGeneration === 'function') {
            const current = readGeneration();
            if (!Number.isSafeInteger(current) || current < 0
              || !Number.isSafeInteger(snapshot.generation)
              || snapshot.generation !== current) return null;
          }
          return snapshot;
        };
        return {
          name: 'survivalResults',
          lastResult: () => {
            const snapshot = readSnapshot();
            return snapshot ? cloneReadValue(snapshot.result || null) : null;
          },
          resultRevision: () => {
            const snapshot = readSnapshot();
            return snapshot && Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0;
          },
          resultGeneration: () => {
            const snapshot = readSnapshot();
            return snapshot && Number.isSafeInteger(snapshot.generation) ? snapshot.generation : 0;
          },
        };
      }
      case 'save':
        return {
          name: 'save',
          save: (slot) => durableSaveCommand('saveWrite', { slot: slot === undefined ? null : slot }),
          drainSharedStoreWrites: () => durableSaveCommand('saveDrain'),
          prepareForQuit: () => durableSaveCommand('savePrepareQuit'),
          cancelPreparedQuit: () => laneRpc('saveCancelPreparedQuit', {}),
          load: (slot) => laneRpc('saveLoad', { slot: slot === undefined ? null : slot }),
          delete: (slot) => laneRpc('saveDelete', { slot: slot === undefined ? null : slot }),
          // saveLoad.js's delete path — the delete must reach the worker's save
          // system (staged store + index), not just main's localStorage.
          deleteSlot: (slot) => laneRpc('saveDelete', { slot: slot === undefined ? null : slot }),
          // File import: the File lives main-side (DOM), the envelope load is
          // sim-owned. Reads the file here, then routes through saveImport.
          importFile: (file, cb) => {
            const finish = (ok) => { try { if (cb) cb(!!ok); } catch (_) {} };
            if (!file || typeof FileReader === 'undefined') { finish(false); return; }
            const reader = new FileReader();
            reader.onload = () => {
              try {
                Promise.resolve(laneRpc('saveImport', { json: String(reader.result || ''), slot: 'quick' }))
                  .then((ack) => finish(ack && ack.ok !== false))
                  .catch(() => finish(false));
              } catch (_) { finish(false); }
            };
            reader.onerror = () => finish(false);
            reader.readAsText(file);
          },
          get slots() { return (st && st.save && st.save.slots) || []; },
          get currentSlot() { return st && st.save ? st.save.currentSlot : null; },
          isSharedStoreSyncPending: () => {
            const value = st && st.save && st.save.sharedStoreStatus
              && st.save.sharedStoreStatus.syncPending;
            return typeof value === 'boolean' ? value : true;
          },
          isSharedStoreMirrorHealthy: () => {
            const value = st && st.save && st.save.sharedStoreStatus
              && st.save.sharedStoreStatus.mirrorHealthy;
            return typeof value === 'boolean' ? value : false;
          },
          deferRunTransition: () => false,
          deferLoadedGameRestore: () => false,
        };
      case 'physics':
        return {
          name: 'physics',
          prepareBackend: (_st, opts) => laneRpc('physicsPrep', {
            backend: (opts && opts.backend) || 'rapier-dynamic',
          }).then((ack) => (ack && ack.ok === false
            ? Promise.reject(new Error(ack.reason || 'physicsPrep failed'))
            : ack)),
          backend: () => (st && st.physicsBackend) || 'rapier-dynamic',
        };
      case 'input':
        return {
          name: 'input',
          releaseHeldControls: () => laneDomEvent({ type: 'blur' }),
          getInput: () => (st ? st.input : null),
          get gamepad() { return ctx.gamepad; },
          inputActivityStamp: () => null,
          // worldObjectInteraction cancels the m2 object gesture via this — the
          // gesture state is sim-owned, so it ships as a DOM descriptor.
          cancelWorldObjectGesture: (reason) => laneDomEvent({
            type: 'gestureCancel',
            reason: typeof reason === 'string' ? reason : 'lifecycle',
          }),
        };
      case 'economy': {
        // quote() is a synchronous read — the stage-5 census missed that the
        // market's trade console (selectedTradeQuote / contemplatedSaleQuote /
        // tradeQuantityLimit / unitPrice) calls it in the buy/sell path, so a
        // null stub left GO disabled and every trade dead on the lane. Run the
        // real implementation on a prototype view over the mirrored economy
        // root (claims/drill pattern). Mint paths can't run facade-side
        // (worker rng + authoritative writes): the view signals them and this
        // wrapper asks the worker to mint the real row — it arrives on the
        // next mirror apply; until then the quote reads 'untraded', same as a
        // main-lane quote on a genuinely untraded good.
        const readView = economyReadView(st);
        return {
          name: 'economy',
          quote: (stationId, commodityId, side, qty) => {
            readView.__mintNeeded = null;
            let q = null;
            try { q = readView.quote(stationId, commodityId, side, qty); } catch (_) { q = null; }
            if (readView.__mintNeeded) {
              laneRpc('economyMintListing', {
                stationId,
                commodityId,
                side,
                kind: readView.__mintNeeded.kind,
              });
              return { ok: false, reason: 'untraded', unitAvg: 0, total: 0, priceImpactPct: 0, stockAfter: 0 };
            }
            return q;
          },
        };
      }
      case 'cargo':
        return {
          name: 'cargo',
          // Async hop: resolves the worker cargo.jettison's dumped count — the
          // HUD toast awaits it (cargo:jettisoned bridges back for vfx/audio).
          jettison: (commodityId, qty) => Promise.resolve(
            laneRpc('cargoJettison', { commodityId, qty: qty || 1 })
          ).then((ack) => (ack && ack.ok !== false ? (ack.result || 0) : 0)),
        };
      case 'claims': {
        // Read names run the real implementations over the domain mirror via
        // a prototype view; mutating calls ride the claimsCall rpc (fire-and-
        // forget for the un-awaited sites, awaited at the confirm seams).
        const readView = claimsReadView(st);
        const call = (method, args) => Promise.resolve(laneRpc('claimsCall', { method, ...(args || {}) }))
          .then((ack) => (ack && ack.ok !== false && ack.result !== null && ack.result !== undefined
            ? ack.result.result : null));
        return {
          name: 'claims',
          isClaimed: (poiId) => readView.isClaimed(poiId),
          list: () => readView.list(),
          ledger: (bodyId) => readView.ledger(bodyId),
          _stationName: (stationId) => readView._stationName(stationId),
          // 'claim' resolves to the new body row (the rpc ships it back) so the
          // caller opens the Base screen without waiting on a mirror tick.
          claim: (poiDef) => Promise.resolve(laneRpc('claimsCall', { method: 'claim', poi: poiDef }))
            .then((ack) => (ack && ack.ok !== false && ack.result && ack.result.ok === true
              ? (ack.result.body || null) : null)),
          buildModule: (bodyId, modId) => call('buildModule', { bodyId, modId }),
          specialize: (bodyId, specId) => call('specialize', { bodyId, specId }),
          deliverToClaim: (bodyId, goodId, qty) => call('deliverToClaim', { bodyId, goodId, qty }),
          collectFromClaim: (bodyId) => call('collectFromClaim', { bodyId }),
          teleportFrom: (bodyId) => call('teleportFrom', { bodyId }),
        };
      }
      case 'crafting':
        return {
          name: 'crafting',
          // Async hop: the real build() commits worker-side; the fabricate
          // hold's accept cue + landing await the ack.
          build: (bpId, stationId) => Promise.resolve(laneRpc('craftingBuild', { bpId, stationId }))
            .then((ack) => (ack && ack.ok !== false && ack.result && ack.result.ok === true)),
          // Scrapping a committed run is the same writer hop — the Industry screen awaits the
          // ack before it re-reads the queue.
          cancel: (stationId) => Promise.resolve(laneRpc('craftingCancel', { stationId }))
            .then((ack) => (ack && ack.ok !== false && ack.result && ack.result.ok === true)),
        };
      case 'asteroidSites': {
        // Site reads run over the mirrored state.  Runtime-backed reads use an isolated clone;
        // writes stay on the worker through the narrow allowlist installed by simWorkerHost.
        const call = (method, args) => Promise.resolve(
          laneRpc('asteroidSitesCall', { method, args }),
        ).then((ack) => {
          if (!ack || ack.ok === false) {
            return { ok: false, reason: ack && (ack.reason || ack.error) || 'asteroid-sites-rpc-failed' };
          }
          const native = ack.result;
          // The worker handler returns { ok, result: nativeValue }; unwrap exactly that envelope
          // and leave the native denial/result untouched.  A native boolean (tickWorkbench) stays
          // a boolean so callers can distinguish a real answer from an absent response.
          if (native && typeof native === 'object'
            && Object.hasOwn(native, 'ok') && Object.hasOwn(native, 'result')) {
            return native.result;
          }
          if (native === undefined) return { ok: false, reason: 'asteroid-sites-empty-result' };
          return native;
        });
        const readView = (siteId) => asteroidReadViewFor(st, siteId);
        // These selectors are cheap identity reads used by the screen's dirty probe. Callers only
        // inspect the records; projection and preview paths below are the mutation-safe selectors
        // that run over isolated clones.
        const siteForAsteroid = (asteroidId) => findAsteroidSiteFromState(st, asteroidId);
        const getSite = (siteId) => getAsteroidSiteFromState(st, siteId);
        const projection = (siteId) => projectAsteroidSiteFromState(st, siteId);
        const canInstall = (request) => canInstallAsteroidSiteFromState(st, request || {});
        return {
          name: 'asteroidSites',
          state: st,
          bus: ctx && ctx.bus,
          getSite,
          siteForAsteroid,
          projection,
          canInstall,
          machineAt: (site, col, row) => asteroidSites.machineAt(site, col, row),
          hasCore: (site) => asteroidSites.hasCore(site),
          previewBreak: (siteId, col, row) => {
            const view = readView(siteId);
            return view ? view.previewBreak(siteId, col, row) : null;
          },
          previewMachineRemoval: (siteId, machineId) => {
            const view = readView(siteId);
            return view ? view.previewMachineRemoval(siteId, machineId) : { spilledTotal: 0, spilled: [], placed: [] };
          },
          previewOverlayRemoval: (siteId, kind, col, row) => {
            const view = readView(siteId);
            return view ? view.previewOverlayRemoval(siteId, kind, col, row) : { spilledTotal: 0, spilled: [], placed: [] };
          },
          surveyStatusFor: (asteroidId) => {
            const site = siteForAsteroid(asteroidId);
            const view = site ? readView(site.id) : null;
            return view ? view.surveyStatusFor(asteroidId) : null;
          },
          surveyCellRole: (asteroidId, index) => {
            const site = siteForAsteroid(asteroidId);
            const view = site ? readView(site.id) : null;
            return view ? view.surveyCellRole(asteroidId, index) : null;
          },
          _fundingStoresFor: (site, col, row) => {
            const view = site && readView(site.id);
            const isolatedSite = view && view.getSite(site.id);
            return view && isolatedSite ? view._fundingStoresFor(isolatedSite, col, row) : null;
          },
          _missingMaterials: (site, cost, stores) => {
            const view = site && readView(site.id);
            const isolatedSite = view && view.getSite(site.id);
            return view && isolatedSite ? view._missingMaterials(isolatedSite, cost, stores) : {};
          },
          installMachine: (request) => call('installMachine', [request]),
          removeMachine: (siteId, machineId, opts) => call('removeMachine', [siteId, machineId, opts]),
          setOverlay: (siteId, kind, col, row, on, opts) => call('setOverlay', [siteId, kind, col, row, on, opts]),
          setMachineMode: (siteId, machineId, mode) => call('setMachineMode', [siteId, machineId, mode]),
          setExportFlag: (siteId, goodId, exported) => call('setExportFlag', [siteId, goodId, exported]),
          setPodTarget: (siteId, target) => call('setPodTarget', [siteId, target]),
          setPodDestination: (siteId, stationId) => call('setPodDestination', [siteId, stationId]),
          transferGoods: (siteId, machineId, goodId, qty, dir) => call(
            'transferGoods', [siteId, machineId, goodId, qty, dir],
          ),
          tickWorkbench: (dt, siteId) => call('tickWorkbench', [dt, siteId]),
        };
      }
      case 'careerLadders': {
        // Definitions are process-local data. The presenter derives offers/progress from the
        // mirrored leaves; native getters hydrate state and must stay on the simulation owner.
        return {
          name: 'careerLadders',
          getDefinition: (careerId) => careerLadders.getDefinition(careerId),
          listLadderDefinitions,
        };
      }
      case 'careerOrigins': {
        // Origin reads must not call the native ensure/migrate path against a presentation mirror.
        // getCareerProgress is run on a detached careers tree because its legacy projection still
        // normalizes missing leaves; the normalization therefore cannot write worker-owned state.
        const readState = () => ({
          ...(st || {}),
          careers: cloneReadValue(st && st.careers ? st.careers : {}),
        });
        return {
          name: 'careerOrigins',
          getOfferView: (careerId) => getCareerOfferViewReadOnly(readState(), careerId),
          getProgress: (careerId) => getCareerProgress(readState(), careerId),
        };
      }
      case 'drill': {
        // The drill clock is the screen's rAF, not a sim tick — per-frame
        // held-state ships as ordered domEvent descriptors inside the tick
        // batch (never rpc: a promise per frame would queue orders worse than
        // a folded descriptor). Reads run over the mirror via the read view;
        // drill:* emits bridge back to bus subscribers (bridgeAll).
        const readView = drillReadView(st);
        const drillCall = (op, payload) => laneDomEvent({ type: 'drillCall', op, ...(payload || {}) });
        return {
          name: 'drill',
          bus: ctx.bus,
          state: st,
          tickInput: (held, dt, opts) => laneDomEvent({ type: 'drillTick', held, dt, opts }),
          begin: (asteroidId) => { if (asteroidId) drillCall('begin', { asteroidId }); return !!asteroidId; },
          pulseScan: () => {
            // Synchronous answer off the mirror (≤1-tick stale): a stale
            // cooldown edge ships a refused pulse the worker drops silently.
            const d = st && st.drill;
            const ready = !!(d && d.active && (!d.scan || (Number(d.scan.cooldown) || 0) <= 0));
            if (ready) drillCall('pulseScan');
            return ready;
          },
          end: (opts) => { drillCall('end', { opts }); return null; },
          // Bore-charge verbs ship as drillCall descriptors like begin/pulseScan; the
          // boolean answers mirror-read the lane's last-settled drill state (same
          // ≤1-tick staleness contract as pulseScan's ready).
          armCharge: () => {
            const d = st && st.drill;
            const ready = !!(d && d.active && !d.charge && !(Number(d.chargeCooldown) > 0));
            if (ready && !d.chargeArmed) drillCall('armCharge');
            return ready;
          },
          disarmCharge: () => {
            const armed = !!(st && st.drill && st.drill.chargeArmed);
            if (armed) drillCall('disarmCharge');
            return armed;
          },
          setChargeAim: (col, row) => { drillCall('setChargeAim', { col, row }); },
          cycleChargePayload: () => {
            const d = st && st.drill;
            if (!d || !d.active || !d.chargeArmed) return null;
            drillCall('cycleChargePayload');
            const idx = CHARGE_PAYLOAD_ORDER.indexOf(d.chargePayload);
            return CHARGE_PAYLOAD_ORDER[(idx + 1) % CHARGE_PAYLOAD_ORDER.length] || 'blast';
          },
          // The plant's own preview is the gate on the worker too: the op ships and the
          // worker-side plantCharge refuses+warns on the bridge if the mirror was stale.
          plantCharge: () => {
            const active = !!(st && st.drill && st.drill.active);
            if (active) drillCall('plantCharge');
            return active;
          },
          chargePreview: () => readView.chargePreview(),
          getDrillTier: () => readView.getDrillTier(),
          getDrillDPS: () => readView.getDrillDPS(),
          getTargetTelemetry: (col, row) => readView.getTargetTelemetry(col, row),
          isHazardRevealed: (col, row) => readView.isHazardRevealed(col, row),
          isTileSurveyed: (col, row) => readView.isTileSurveyed(col, row),
        };
      }
      case 'missions':
        return {
          name: 'missions',
          // armRacingContract folds the whole circuit arm into the racingArm
          // rpc on the lane; this keeps the capability surface honest.
          postAndAcceptAuthoredOffer: (offer) =>
            Promise.resolve(laneRpc('missionsCall', { method: 'postAndAcceptAuthoredOffer', offer }))
              .then((ack) => (ack && ack.ok !== false && ack.result !== null && ack.result !== undefined
                ? ack.result.result : null)),
        };
      case 'world':
        return {
          name: 'world',
          // galaxyMap's preview/alternatives calls are synchronous — the route
          // Dijkstra runs here over the mirrored world state (identical math,
          // shared module). A held handshake token counts as preview-open: the
          // route exists, and the burn happens when the jump executes.
          computeRoute: (targetSectorId, mode = 'fuel') => computeDiscoveredRoute(st, targetSectorId, mode, {
            drive: activeDriveForState(st),
            wormholeGate: (_st, sector) => {
              const g = wormholeGateCheck(st, sector, machineRouteStanding);
              return g.status === 'closed' ? 'closed' : 'open';
            },
          }),
          // Mutating seam — racingLaunch folds these into the racingArm rpc;
          // proof/lab paths tolerate the async hop (fire-and-forget).
          enterSector: (sectorId) => laneRpc('worldCall', { method: 'enterSector', sectorId }),
          relocatePlayerInSector: (pose, opts) =>
            laneRpc('worldCall', { method: 'relocatePlayerInSector', pose, opts }),
        };
      default:
        _noteLaneFacadeMiss(name);
        return undefined;
    }
  }

  return laneSystemFacade;
}
