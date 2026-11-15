// Rookside's close approach, using the actual garden and cargo owners. This scene
// owns only a transient circuit mark and saved dialogue memory, never feed or pay.
// Modeled on frontierReceivingTags.js: the ring is a transient circuit mark —
// nonphysical, non-tetherable, never saved — reconciled by the understory owner
// only on real transitions (line, feed, sector, save, dock), never rebuilt on a
// fixed tick. A held load's ring is sized to that load; the dialogue memory rides
// story.flags so a heard line never repeats after Continue.
import { UNDERSTORY_RECEIVER, gardenGrowthRadius, firstPlayerGardenGrowth } from '../data/understoryReceiver.js';
import { UNDERSTORY_GARDENS, UNDERSTORY_GARDEN_STAGES, UNDERSTORY_COMPOST_RUN } from '../data/factions/understory.js';

const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const amount = n => Number(n.toFixed(1)).toString();
const TAG = 'compostArrivalMouth';
const VOICE_RANGE2 = 1000 * 1000;

export function clearCompostArrival(owner) {
  const mark = owner._compostArrivalMark;
  owner._compostArrivalMark = null;
  if (mark && owner.state?.entities?.get(mark.id) === mark && mark.data?.[TAG] === true) {
    owner.helpers?.removeEntity?.(mark.id);
  }
}

function heldLoad(owner, garden) {
  const s = owner.state, line = s.player?.tether, player = s.entities?.get(s.playerId);
  const load = s.entities?.get(line?.targetId), a = s.combat?.attachments?.byId?.[line?.attachmentId];
  if (line?.active !== true || !load?.alive || !finite(load.pos)
    || !Number.isFinite(load.radius) || load.radius < 0 || !a || a.state !== 'active'
    || a.defId !== 'tether_standard' || a.id !== line.attachmentId
    || a.ownerId !== player.id || a.targetId !== load.id
    || !Number.isSafeInteger(player.occupantGeneration) || !Number.isSafeInteger(load.occupantGeneration)
    || a.ownerGeneration !== player.occupantGeneration || a.targetGeneration !== load.occupantGeneration) return null;
  const mass = owner.gardenFeedMass(load);
  if (!(Number.isFinite(mass) && mass > 0)) return null;
  const radius = gardenGrowthRadius(garden) * UNDERSTORY_GARDENS.absorbPadding + load.radius;
  return { load, mass, radius, gap: Math.hypot(load.pos.x - garden.pos.x, load.pos.z - garden.pos.z) - radius };
}

export function syncCompostArrival(owner, gardens) {
  const s = owner.state, p = s?.entities?.get(s.playerId), steps = s?.story?.campaign47a?.stepProgress?.['2']?.completed;
  const garden = gardens?.find(g => g?.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  if (owner._saveRestoring || s?.save?.restoring || s?.mode !== 'flight' || s.ui?.docked || s.player?.flags?.docked
    || s.physicsVenue?.active || (s.run?.kind && s.run.kind !== 'adventure')
    || s.world?.currentSectorId !== UNDERSTORY_RECEIVER.sectorId || s.story?.beatIndex !== 2
    || !Array.isArray(steps) || !steps.includes('cinder_board') || !s.story.flags
    || !p?.alive || !finite(p.pos) || !garden?.alive || s.entities.get(garden.id) !== garden
    || garden.type !== 'garden' || garden.factionId !== 'faction_understory' || !garden.flags?.persistent
    || garden.data.authoredUnderstoryReceiver !== true || garden.data.gardenDestroyed === true || !(garden.hull > 0)
    || !finite(garden.pos) || !Number.isFinite(garden.data.gardenBiomass) || !Number.isFinite(s.simTime)
    || Math.hypot(p.pos.x - garden.pos.x, p.pos.z - garden.pos.z) > 1000) {
    clearCompostArrival(owner); return;
  }
  const data = garden.data, next = UNDERSTORY_GARDEN_STAGES.find(row => row.massFloor > data.gardenBiomass);
  const needed = next ? Math.max(0, (next.massFloor - data.gardenBiomass) / UNDERSTORY_GARDENS.digestionYield) : 0;
  const held = !steps.includes('compost') ? heldLoad(owner, garden) : null;
  let mark = owner._compostArrivalMark;
  if (held) {
    // Circuit-zone geometry is fixed at admission. Replace only this transient
    // projection when the real intake changes; data mutation cannot resize it.
    if (mark && mark.data.ringRadius !== held.radius) {
      clearCompostArrival(owner); mark = null;
    }
    if (!mark || !mark.alive || s.entities.get(mark.id) !== mark) {
      mark = owner._compostArrivalMark = owner.helpers?.spawnEntity?.({ type: 'beacon',
        pos: { x: garden.pos.x, z: garden.pos.z }, vel: { x: 0, z: 0 }, radius: 1, mass: 0,
        hull: 1, hullMax: 1, collides: false, physicsBody: false, homeSectorId: UNDERSTORY_RECEIVER.sectorId,
        data: { [TAG]: true, parentType: 'story_prop', circuitMark: true,
          ringRadius: held.radius, visualRadius: held.radius, scannable: true,
          tetherable: false, masslineTetherable: false, scannerSignalKind: 'salvage' } });
    }
    if (mark) {
      mark.pos.x = garden.pos.x; mark.pos.z = garden.pos.z;
      mark.data.ringRadius = held.radius; mark.data.visualRadius = held.radius;
      const forecast = !next ? 'last stage; no further growth'
        : held.mass + 1e-9 >= needed ? 'enough for next growth'
        : `${amount(Math.ceil((needed - held.mass) * 10) / 10)}t more after this load`;
      mark.data.scanLabel = `ROOKSIDE INTAKE · ${amount(held.mass)}t edible feed · ${forecast} · load center crosses ring; keep cockpit outside`;
      mark.data.name = mark.data.scanLabel;
      mark.data.compostArrivalRead = { gardenId: data.gardenId, loadId: held.load.id,
        loadGeneration: held.load.occupantGeneration, feedMass: held.mass, radius: held.radius };
    }
  } else clearCompostArrival(owner);

  const old = s.story.flags.compost_arrival;
  const memory = old?.version === 1 && old.gardenId === data.gardenId ? old
    : { version: 1, gardenId: data.gardenId, heard: {} };
  const heard = memory.heard && typeof memory.heard === 'object' && !Array.isArray(memory.heard) ? memory.heard : {};
  if (Number.isFinite(memory.nextAt) && s.simTime < memory.nextAt) return;
  const growth = data.gardenFirstPlayerGrowth && !heard.growth ? firstPlayerGardenGrowth(s) : null;
  const grewHere = growth?.gardenId === data.gardenId || heard.growth === true;
  const fed = Number.isFinite(data.compostFedMass) ? Math.max(0, data.compostFedMass) : 0;
  let id, text, cue;
  if (grewHere && !heard.growth) {
    id = 'growth';
    text = `“That was yours. It is not yours now.” Your feed grew the garden from stage ${growth.fromStage} to ${growth.stage}. ${data.compostRunComplete === true ? 'The Compost run is already paid; no repeat.' : `Separate paid run: ${amount(fed)}/${UNDERSTORY_COMPOST_RUN.targetMass}t.`}`;
    cue = 'Rookside grew from your feed; the Journal has the next route';
  } else if (steps.includes('compost')) return;
  else if (!heard.arrival) {
    id = 'arrival';
    text = `“Rook counts what stops. We count what starts.” ${UNDERSTORY_RECEIVER.name} takes a load when it crosses the mouth. ${next ? `${amount(Math.ceil(needed * 10) / 10)}t of feed makes the next growth; the Journal marks where to find it.` : 'This garden is at its last stage; no further growth can show.'} Nothing is owed for arriving.`;
    cue = 'Rookside receives real loose feed; arrival alone changes nothing';
  } else if (fed > 0 && !heard.partial && !grewHere) {
    id = 'partial';
    text = `“We kept it.” The garden records ${amount(fed)}t; no growth yet. ${next ? `${amount(Math.ceil(needed * 10) / 10)}t more feed reaches the next stage.` : 'This garden is already at its last stage; no further growth can show here.'} The ${UNDERSTORY_COMPOST_RUN.targetMass}t paid run is a separate account.`;
    cue = next ? `Feed received; ${amount(Math.ceil(needed * 10) / 10)}t more for next growth`
      : 'Feed received; this garden has no further growth stage';
  } else if (fed > 0 && !grewHere && held && !heard.returnLoad) {
    id = 'returnLoad';
    text = `“Another load. We still have the first.” ${amount(fed)}t kept; ${amount(held.mass)}t new feed on your Line. ${!next ? 'This garden has no further growth stage.' : held.mass + 1e-9 >= needed ? 'This load can make the first growth if all of it reaches the mouth.' : `After this load, ${amount(Math.ceil((needed - held.mass) * 10) / 10)}t more is needed.`} Keep the Line attached until intake.`;
    cue = 'New load, same garden; only material actually received counts';
  } else if (fed > 0 && !grewHere && next && !held && heard.partial && !heard.resupply) {
    id = 'resupply';
    text = `“Bring what you can spare. Not promises.” Your ${amount(fed)}t stays with the garden; the Journal marks where more feed is.`;
    cue = 'Your feed is kept; check the Journal for the remaining supply';
  } else if (held && !heard.load) {
    id = 'load';
    text = `“We can use the ${amount(held.mass)}t on your Line.” Ease its center across from the west, cockpit outside. Keep the Line attached until intake; a pod dropped near a station goes to the Dump Chute instead. ${!next ? 'This garden is at its last stage; this load cannot produce a new growth here.' : held.mass + 1e-9 >= needed ? 'This load is enough for the next growth if all of it reaches us.' : `${amount(Math.ceil((needed - held.mass) * 10) / 10)}t will still be needed after this load.`}`;
    cue = 'Guide the load center across its receiving ring; keep cockpit outside';
  }
  if (!id) return;
  // Commit memory before publishing: synchronous listeners may restore or leave.
  heard[id] = true; memory.heard = heard; memory.nextAt = s.simTime + 8;
  s.story.flags.compost_arrival = memory;
  owner.bus?.emit('comms:popup', { id: `compost_arrival_${id}`, sender: 'ROOKSIDE RECEIVING GARDEN',
    category: 'story', storyReceipt: true, persist: true, ttl: 12, text });
  if (s.story?.flags?.compost_arrival !== memory || s.save?.restoring || owner._saveRestoring
    || s.mode !== 'flight' || s.ui?.docked || s.player?.flags?.docked
    || s.entities?.get(s.playerId) !== p || s.entities?.get(garden.id) !== garden) return;
  owner.bus?.emit('toast', { text: cue, kind: 'info', channel: 'objective', ttl: 6 });
}

/**
 * Per-tick rider for the transition-time reconcile above. It pins the retained
 * mark onto its garden (direct retained reference, no scan) and surfaces the one
 * transition no bus event carries: the player crossing the receiving range.
 * Constant-time — two position reads, no allocations.
 */
export function tickCompostArrival(owner, gardens) {
  const s = owner.state, mark = owner._compostArrivalMark;
  const garden = gardens?.find?.(g => g?.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  if (mark && garden?.alive && finite(garden.pos)) { mark.pos.x = garden.pos.x; mark.pos.z = garden.pos.z; }
  const p = s?.entities?.get(s.playerId);
  const near = !!(p?.alive && finite(p.pos) && garden?.alive && finite(garden.pos)
    && (p.pos.x - garden.pos.x) * (p.pos.x - garden.pos.x)
    + (p.pos.z - garden.pos.z) * (p.pos.z - garden.pos.z) <= VOICE_RANGE2);
  if (near !== owner._compostArrivalNear) {
    owner._compostArrivalNear = near;
    syncCompostArrival(owner, gardens);
  }
}
