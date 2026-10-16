// Foreman Alin's radio encounter runs beside the authoritative bark director.
// Only scalar voice receipts cross the worker boundary; no custody is granted here.
import { playerBearingLetter } from '../core/playerCompass.js';
import { resolveOrchardForecast } from './anvilOrchardForecast.js';
import { normalizeOrchardRecord, orchardPhase } from '../data/anvilOrchard.js';
import { PLANET_SITE } from '../data/planets.js';
import { ANVIL_ORCHARD_GUST_PROFILE } from '../data/environmentalMachinery.js';

export const ALIN_LINES = Object.freeze({
  intro: 'The orchard is ready. The weather has not agreed to help.',
  forecast: 'Gust in two. Hold outside the band.',
  safe: 'You are clear. Let the pod settle before the next burn.',
  loss: 'Lost the harvest, not the lesson. Come back cold.',
  repeat: 'Same sky. Different bad idea. Show me.',
});
const KEY = 'anvilOrchardAlin';
function memory(state) {
  const hints = state.player.hints ||= {};
  return hints[KEY] ||= { version: 1, heard: {}, lastFlavorAt: null };
}
function direction(dir) { return playerBearingLetter(dir.x, dir.z); }
function podCold(state, pod) {
  const savedDescriptor = Object.getOwnPropertyDescriptor(pod, 'orchardThermalExposure');
  const live = state.planet?.ships?.[pod.id];
  if (!savedDescriptor) return live === undefined || (live.occupantGeneration === pod.occupantGeneration
    && live.heat === 0 && Number.isFinite(live.lastThermalAt) && live.lastThermalAt <= state.simTime);
  const saved = savedDescriptor.value;
  if (!('value' in savedDescriptor) || !saved || Object.getPrototypeOf(saved) !== Object.prototype) return false;
  const keys = ['schemaVersion', 'siteId', 'lotId', 'savedAt', 'region', 'heat', 'stage', 'stageAt', 'outwardS', 'burnNextAt'];
  if (Object.keys(saved).length !== keys.length || !keys.every(key => {
    const d = Object.getOwnPropertyDescriptor(saved, key); return d && 'value' in d;
  })) return false;
  return saved.schemaVersion === 1 && saved.siteId === PLANET_SITE.id && saved.lotId === pod.data.worldRecordId
    && ['outside', 'influence', 'sling', 'skim', 'danger', 'reentry'].includes(saved.region)
    && [null, 'skim', 'commit', 'breakup', 'descent'].includes(saved.stage)
    && Number.isFinite(saved.stageAt) && saved.stageAt >= 0 && saved.stageAt <= saved.savedAt
    && Number.isFinite(saved.outwardS) && saved.outwardS >= 0 && saved.outwardS <= 60
    && Number.isFinite(saved.burnNextAt) && saved.burnNextAt >= 0 && saved.burnNextAt <= saved.savedAt + 0.500001
    && saved.heat === 0 && Number.isFinite(saved.savedAt) && saved.savedAt >= 0 && saved.savedAt <= state.simTime
    && live?.occupantGeneration === pod.occupantGeneration && live.heat === 0
    && Number.isFinite(live.lastThermalAt) && live.lastThermalAt >= saved.savedAt && live.lastThermalAt <= state.simTime;
}
export function createOrchardEncounter(ctx) {
  let state = ctx.state;
  let pending = null;
  const scratch = {};
  const facts = () => resolveOrchardForecast(state, scratch);
  const cancel = () => {
    if (pending) ctx.helpers?.voice?.cancel?.(pending.id);
    pending = null;
  };
  const onLoad = () => cancel();
  const onSurface = receipt => {
    if (!pending || receipt?.id !== pending.id || receipt.kind !== 'anvil-orchard-alin' || !pending.valid()) return;
    const m = memory(state);
    if (pending.milestone) m.heard[pending.milestone] = true;
    m.lastSpokeAt = state.simTime;
    if (pending.flavor) m.lastFlavorAt = state.simTime;
    pending.heard = true;
    pending.deadline = state.simTime + 5;
    if (pending.forecastCycle != null) m.forecastCycle = pending.forecastCycle;
  };
  ctx.bus?.on?.('voice:surface', onSurface);
  ctx.bus?.on?.('save:loaded', onLoad);
  let safeWitness = null;
  function safeLot(lotId, fact) {
    if (fact.phase !== 'calm') return false;
    const center = state.planet?.center;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) return false;
    const physics = ctx.registry?.get?.('physics');
    const player = state.entities.get(fact.playerId);
    const clear = e => e && e.alive !== false
      && Math.hypot(e.pos.x - center.x, e.pos.z - center.z) - (e.radius || 0) > PLANET_SITE.bands.skim
      && (e === player ? state.planet?.player?.heat === 0
        : podCold(state, e));
    if (!clear(player)) return false;
    for (const pod of state.entities.values()) {
      if (pod.data?.worldRecordId === lotId && clear(pod) && physics?.readOrchardPodReady?.(pod)) {
        safeWitness = { pod, generation: pod.occupantGeneration, data: pod.data, body: pod.physicsBody };
        return true;
      }
    }
    return false;
  }
  return {
    update(nextState) {
      state = nextState || state;
      const f = facts();
      if (!f) { cancel(); return; }
      if (pending && pending.valid() && state.simTime < pending.deadline) return;
      cancel();
      const row = normalizeOrchardRecord(state.sites?.anvilOrchard);
      if (!row || !state.player) return;
      const m = memory(state), now = state.simTime;
      const cycle = Math.floor((state.tick - row.phaseAnchorTick) / 1020);
      let kind, milestone, text, flavor = false, lotId;
      if (f.phase === 'forecast' && m.forecastCycle !== cycle) {
        kind = 'forecast';
        // The exact countdown lives in the HUD; this line remains truthful across queue delay.
        text = 'Gust approaching. Hold outside the band.';
        text += ` Wind toward ${direction(f.dir)}.`;
      } else if (!m.heard.intro) {
        kind = 'intro'; milestone = 'intro'; flavor = true; text = ALIN_LINES.intro;
      } else {
        const lost = row.lots.find(lot => lot.outcome === 'lost' && !m.heard[`loss:${lot.id}`]);
        const safe = row.lots.find(lot => lot.outcome === 'retained' && !m.heard[`safe:${lot.id}`] && safeLot(lot.id, f));
        if (lost) { kind = 'loss'; lotId = lost.id; milestone = `loss:${lotId}`; text = ALIN_LINES.loss; }
        else if (safe) { kind = 'safe'; lotId = safe.id; milestone = `safe:${lotId}`; text = ALIN_LINES.safe; }
        else if (Number.isFinite(now) && Number.isFinite(m.lastSpokeAt) && now - m.lastSpokeAt >= 90) {
          kind = 'repeat'; flavor = true; text = ALIN_LINES.repeat;
        }
      }
      if (!text) return;
      const frame = state.entities.get(f.frameId), player = state.entities.get(f.playerId);
      const sourceRow = state.sites.anvilOrchard, sourcePlayer = state.player;
      const witness = kind === 'safe' ? safeWitness : null;
      const frameData = frame.data, frameBody = frame.physicsBody;
      const fx = frame.pos.x, fz = frame.pos.z, rot = frame.rot;
      const valid = () => {
        if (state.playerId !== f.playerId || state.player !== sourcePlayer || state.sites?.anvilOrchard !== sourceRow
          || state.entities?.get(f.frameId) !== frame || state.entities?.get(f.playerId) !== player) return false;
        // Per-arbiter-step cancellation is O(1): no entity census, native pose
        // enumeration, field sampling or full ledger projection on the voice clock.
        if (state.mode !== 'flight' || state.world?.currentSectorId !== f.sectorId
          || frame.alive === false || player.alive === false
          || frame.occupantGeneration !== f.frameGeneration || player.occupantGeneration !== f.playerGeneration
          || frame.data !== frameData || frame.physicsBody !== frameBody
          || frame.pos.x !== fx || frame.pos.z !== fz || frame.rot !== rot
          || Math.hypot(player.pos.x - fx, player.pos.z - fz) > ANVIL_ORCHARD_GUST_PROFILE.observationRadius
          || sourceRow.frameStatus !== 'intact'
          || orchardPhase(sourceRow, state.tick)?.phase !== f.phase
          || Math.floor((state.tick - row.phaseAnchorTick) / 1020) !== cycle) return false;
        const currentRow = normalizeOrchardRecord(state.sites.anvilOrchard);
        if (!currentRow) return false;
        if (kind === 'loss') return currentRow.lots.some(l => l.id === lotId && l.outcome === 'lost');
        if (kind === 'safe') {
          const pod = witness?.pod, center = state.planet?.center;
          if (!pod || !center || state.entities.get(pod.id) !== pod || pod.alive === false
            || pod.occupantGeneration !== witness.generation || pod.data !== witness.data
            || pod.physicsBody !== witness.body || pod.physicsBody.dynamic !== true) return false;
          return currentRow.lots.some(l => l.id === lotId && l.outcome === 'retained')
            && state.planet?.player?.heat === 0 && podCold(state, pod)
            && [player, pod].every(e => Math.hypot(e.pos.x - center.x, e.pos.z - center.z) - e.radius > PLANET_SITE.bands.skim);
        }
        return true;
      };
      const id = `alin:${kind}:${milestone || state.tick}`;
      pending = { id, valid, milestone, flavor, heard: false, deadline: now + 6.5,
        forecastCycle: kind === 'forecast' ? cycle : null };
      if (!ctx.helpers?.voice?.say?.({ id, channel: kind === 'forecast' ? 'alert' : 'bark',
        kind: 'anvil-orchard-alin', text: `Foreman Alin: ${text}`, ttl: 5, valid })) pending = null;
    },
    reset: cancel,
    destroy() { cancel(); ctx.bus?.off?.('voice:surface', onSurface); ctx.bus?.off?.('save:loaded', onLoad); },
  };
}
