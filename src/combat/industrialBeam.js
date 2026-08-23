// src/combat/industrialBeam.js — PQ-016 Contextual Industrial Beam Verb Resolver & Handlers
// Pure module & single-writer helper for industrial beam verbs (cut, extract, repair, transfer) and payload lifecycle.

import { removeCargo, addCargo } from '../systems/cargo.js';
import { allocateEntityId, makeEntity } from '../core/entity.js';

export function resolveBeamVerb(descriptor, toolState = {}) {
  const mode = toolState.mode || 'auto';
  
  if (!descriptor || descriptor.alive === false) {
    return { verb: mode === 'auto' ? 'extract' : mode, ok: false, reason: 'not-alive', receiverHints: null };
  }

  // 1. Determine target verb
  let verb = mode;
  if (mode === 'auto') {
    if (toolState.receiver && toolState.receiver.type) {
      verb = 'transfer';
    } else if (isRepairOnlyTarget(descriptor)) {
      verb = 'repair';
    } else if (hasCuttableComponent(descriptor, toolState.selectedComponentId)) {
      verb = 'cut';
    } else {
      verb = 'extract';
    }
  }

  // 2. Validate targeted verb
  switch (verb) {
    case 'cut': {
      const compId = toolState.selectedComponentId;
      const isCuttable = hasCuttableComponent(descriptor, compId);
      if (!isCuttable) {
        return { verb: 'cut', ok: false, reason: 'no-cuttable-component', receiverHints: null };
      }
      return { verb: 'cut', ok: true, reason: null, componentId: compId || null, receiverHints: null };
    }

    case 'extract': {
      // CRITICAL: No silent extract on repair-only target
      if (isRepairOnlyTarget(descriptor)) {
        return { verb: 'extract', ok: false, reason: 'wrong-type', receiverHints: null };
      }
      const caps = descriptor.capabilities || {};
      const type = descriptor.type;
      const isExtractableType = type === 'asteroid' || type === 'wreck' || caps.mineable || caps.beamExtractable;
      if (!isExtractableType) {
        return { verb: 'extract', ok: false, reason: 'wrong-type', receiverHints: null };
      }
      
      const d = descriptor.data || {};
      if (d.respawnAt != null || descriptor.minedOut) {
        return { verb: 'extract', ok: false, reason: 'mined-out', receiverHints: null };
      }
      if (d.siteAnchored || descriptor.siteAnchored) {
        return { verb: 'extract', ok: false, reason: 'beam-locked', receiverHints: null };
      }
      return { verb: 'extract', ok: true, reason: null, receiverHints: null };
    }

    case 'repair': {
      if (descriptor.type === 'asteroid' || descriptor.wreckLike) {
        return { verb: 'repair', ok: false, reason: 'wrong-type', receiverHints: null };
      }
      const isDamaged = checkIsDamaged(descriptor);
      if (!isDamaged) {
        return { verb: 'repair', ok: false, reason: 'hull-intact', receiverHints: null };
      }
      const credits = typeof toolState.credits === 'number' ? toolState.credits : 0;
      const cargo = toolState.cargo || {};
      const hasScrap = (cargo.cmdty_scrap_metal || 0) > 0;
      if (credits <= 0 && !hasScrap) {
        return { verb: 'repair', ok: false, reason: 'insufficient-resources', receiverHints: null };
      }
      return {
        verb: 'repair',
        ok: true,
        reason: null,
        componentId: selectedDamagedSubsystemId(descriptor, toolState.selectedComponentId),
        receiverHints: null,
      };
    }

    case 'transfer': {
      const rx = toolState.receiver;
      if (!rx || !rx.type || rx.type === 'wingman' || (descriptor && descriptor.data && descriptor.data.isWingman)) {
        return { verb: 'transfer', ok: false, reason: 'invalid-receiver', receiverHints: null };
      }
      const cargo = toolState.cargo || {};
      const totalQty = Object.values(cargo).reduce((a, b) => a + (Number(b) || 0), 0);
      if (totalQty <= 0) {
        return { verb: 'transfer', ok: false, reason: 'no-cargo', receiverHints: null };
      }
      return {
        verb: 'transfer',
        ok: true,
        reason: null,
        receiverHints: {
          type: rx.type,
          siteId: rx.siteId || null,
          machineId: rx.machineId || null,
          bodyId: rx.bodyId || null
        }
      };
    }

    default:
      return { verb, ok: false, reason: 'wrong-type', receiverHints: null };
  }
}

function isRepairOnlyTarget(descriptor) {
  if (!descriptor) return false;
  const type = descriptor.type;
  if (type === 'asteroid' || descriptor.wreckLike || type === 'wreck') return false;
  return type === 'ship' || type === 'drone' || type === 'station';
}

function hasCuttableComponent(descriptor, selectedComponentId) {
  if (!descriptor) return false;
  const comps = descriptor.components || [];
  if (selectedComponentId) {
    const matched = comps.find((c) => c.componentId === selectedComponentId);
    if (matched) return true;
  }
  if (descriptor.wreckLike || descriptor.type === 'wreck') return true;
  return comps.some((c) => c.kind === 'weakpoint' || c.kind === 'subsystem');
}

function checkIsDamaged(descriptor) {
  if (!descriptor) return false;
  const comps = descriptor.components || [];
  let checkedAny = false;
  for (const c of comps) {
    if (c.kind === 'subsystem') {
      checkedAny = true;
      if (c.destroyed || c.damaged) return true;
    }
  }
  let hasHullOrArmor = false;
  if (typeof descriptor.hull === 'number' && typeof descriptor.hullMax === 'number') {
    hasHullOrArmor = true;
    if (descriptor.hull < descriptor.hullMax) return true;
  }
  if (typeof descriptor.armorHp === 'number' && typeof descriptor.armorMax === 'number') {
    hasHullOrArmor = true;
    if (descriptor.armorHp < descriptor.armorMax) return true;
  }
  if (checkedAny || hasHullOrArmor) return false;
  return false;
}

function selectedDamagedSubsystemId(descriptor, selectedComponentId) {
  if (!selectedComponentId) return null;
  const components = descriptor && Array.isArray(descriptor.components) ? descriptor.components : [];
  const selected = components.find((component) => component && component.componentId === selectedComponentId);
  if (!selected || selected.kind !== 'subsystem') return null;
  const healthDamaged = Number.isFinite(selected.health) && Number.isFinite(selected.maxHealth)
    && selected.health < selected.maxHealth;
  return selected.destroyed || selected.damaged || healthDamaged ? selected.componentId : null;
}

// -----------------------------------------------------------------------------
// Payload Entity Factory (Ruling 2 & 6)
// Physical entity class 'payload' with stamped ownership & contents metadata.
// -----------------------------------------------------------------------------
export function spawnPayloadEntity(state, spec = {}) {
  const nextId = allocateEntityId(state);
  const radius = Math.max(3, Math.min(25, Number(spec.radius) || 8)); // host-relative radius
  const mass = Math.max(20, Number(spec.mass) || radius * 12);
  const ownerId = spec.ownerId != null ? spec.ownerId : (state.playerId || null);
  const factionId = spec.factionId || 'player';

  const payloadEntity = makeEntity({
    id: nextId,
    type: 'payload',
    alive: true,
    collides: true,
    radius,
    mass,
    pos: { x: spec.pos ? spec.pos.x : 0, z: spec.pos ? spec.pos.z : 0 },
    vel: { x: spec.vel ? spec.vel.x : 0, z: spec.vel ? spec.vel.z : 0 },
    hull: spec.hull || 100,
    hullMax: spec.hullMax || 100,
    data: {
      kind: 'payload',
      payloadType: spec.payloadType || 'cut_panel',
      salvagePool: spec.salvagePool ? { ...spec.salvagePool } : { cmdty_scrap_metal: 4 },
      ownerId,
      factionId,
      ownership: { ownerId, factionId },
      worldRecordId: spec.worldRecordId || null,
      transientSector: spec.transientSector !== false, // despawns on sector transition if transient
    },
  });

  if (state.entities && typeof state.entities.set === 'function') {
    state.entities.set(payloadEntity.id, payloadEntity);
  }
  if (Array.isArray(state.entityList)) {
    state.entityList.push(payloadEntity);
  }

  return payloadEntity;
}

// -----------------------------------------------------------------------------
// Sector Transition Despawn Policy for Payloads (Ruling 6)
// Despawns un-anchored transient payloads on sector transition while preserving
// anchored/saved payloads.
// -----------------------------------------------------------------------------
export function handlePayloadSectorTransition(state) {
  if (!state || !state.entities || !state.entities.values) return 0;
  let removed = 0;
  for (const entity of Array.from(state.entities.values())) {
    if (entity.type === 'payload' && entity.data) {
      // Anchored or worldRecord payloads survive sector transition
      if (entity.data.anchored || entity.data.worldRecordId != null) continue;
      // Active tethered payload survives sector transition if tethered by player
      if (state.player && state.player.tether && state.player.tether.targetId === entity.id) continue;
      
      entity.alive = false;
      if (typeof state.entities.delete === 'function') state.entities.delete(entity.id);
      removed++;
    }
  }
  return removed;
}

// Presentation cue IDs mapping per verb (Ruling 7)
export const BEAM_CUE_IDS = Object.freeze({
  cut: 'industrial.beam.cut',
  extract: 'industrial.beam.extract',
  repair: 'industrial.beam.repair',
  transfer: 'industrial.beam.transfer',
});

export default {
  resolveBeamVerb,
  spawnPayloadEntity,
  handlePayloadSectorTransition,
  BEAM_CUE_IDS,
};
