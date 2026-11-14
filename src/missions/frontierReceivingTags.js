// Frontier receiving tags — transient beacons that ring where a frontier ask wants
// the delivery: a barn frame taking modules, a stranded stead asking supplies, an
// aid debtor's doorstep, a claimant's filed-wreck ring. Modeled on
// furnaceReceivingLane.js: nonphysical, non-tetherable, never saved (no persistent
// flag), and reconciled by the frontier owner only on real transitions — its own
// board events, sector:enter, save:loaded — never on a fixed tick. This module
// never ticks itself and never scans the entity list: every wanted tag resolves
// through an id the frontier ledgers already recorded.
import {
  FRONTIER_FRAME,
  FRONTIER_HOMESTEAD,
  FRONTIER_MUTUAL_AID,
  FRONTIER_SALVAGE_CLAIMS,
} from '../data/factions/free.js';

const TAG_KIND = 'frontierReceivingTag';

function tagSpec(key, body, label, ringRadius, sectorId) {
  return {
    type: 'beacon', team: 0,
    pos: { x: body.pos.x, z: body.pos.z }, vel: { x: 0, z: 0 },
    radius: 8, mass: 1, hull: 1, hullMax: 1,
    collides: false, physicsBody: false,
    ...(sectorId ? { homeSectorId: sectorId } : {}),
    data: {
      [TAG_KIND]: true, frontierReceivingKey: key,
      frontierReceivingBody: body.id,
      frontierReceivingBodyGen: body.occupantGeneration ?? null,
      circuitMark: true, ringRadius, visualRadius: ringRadius,
      scannable: true, scanLabel: label, name: label,
      tetherable: false, masslineTetherable: false,
    },
  };
}

function isTag(e, key) {
  return !!(e && e.alive !== false && e.data?.[TAG_KIND] === true
    && e.data?.frontierReceivingKey === key);
}

function liveBody(state, e) {
  return e && e.alive !== false && Number.isFinite(e.pos?.x) && Number.isFinite(e.pos?.z) ? e : null;
}

/**
 * The wanted set, as a Map of key → {body, label, ringRadius}. Every entry
 * resolves a recorded ledger/site/attempt id — bounded reads, no entity-list
 * scan. Runs inside the transition-time reconcile, never per tick.
 */
function wantedFrontierReceivingTags(owner, state) {
  const wanted = new Map();
  const f = state.frontier;
  if (!f) return wanted;
  const sectorId = state.world?.currentSectorId || null;
  const add = (key, body, label, ringRadius) => {
    if (liveBody(state, body) && !wanted.has(key)) {
      wanted.set(key, { body, label, ringRadius, sectorId });
    }
  };

  // Barn frames still taking modules — recorded site rows plus the mission
  // attempt's dedicated frame. Generation guards pin each id to its occupant.
  const seen = new Set();
  const frameTag = (frame) => {
    frame = liveBody(state, frame);
    if (!frame || seen.has(frame.id)) return;
    const fd = frame.data;
    if (fd?.homesteadFrame !== true || fd.homestead === true || fd.barnDone === true) return;
    seen.add(frame.id);
    const snapped = Object.keys(fd.slots || {}).length;
    add(`frame:${frame.id}`, frame,
      `E-21 RECEIVING · ${snapped}/${FRONTIER_FRAME.moduleSlots}`, FRONTIER_FRAME.snapRange);
  };
  const attempt = f.barnAttempt;
  if (attempt?.status === 'active') {
    const frame = state.entities?.get(attempt.frameId);
    if (frame?.data?.frontierMissionId === attempt.missionId
        && frame.data?.frontierSite === attempt.siteId
        && (attempt.frameGen == null || frame.occupantGeneration === attempt.frameGen)) {
      frameTag(frame);
    }
  }
  if (f.sites && typeof f.sites === 'object') {
    for (const sid of Object.keys(f.sites)) {
      const site = f.sites[sid];
      const frame = site && state.entities?.get(site.frameId);
      // A stale row's id can name a recycled body — the site's own site tag and
      // recorded generation prove this is still the frame it planted.
      if (frame && (site.frameGen == null || frame.occupantGeneration === site.frameGen)
          && typeof frame.data?.frontierSite === 'string'
          && frame.data.frontierSite.startsWith(`site:${sid}:`)) {
        frameTag(frame);
      }
    }
  }

  // Stranded steads ask for stores — the ring is the pod's landing circle.
  for (const rec of f.homesteads || []) {
    if (!rec || rec.gone === true || rec.stranded !== true) continue;
    const ent = owner._steadEnt(state, rec);
    add(`stead:${rec.entityId}`, ent, 'SUPPLIES WANTED', FRONTIER_HOMESTEAD.supplyRadius);
  }

  // Open aid markers want the marker's CENTER inside the debtor's ring.
  for (const d of f.debts || []) {
    if (!d || d.state !== 'open') continue;
    const ent = owner._steadEnt(state, owner._steadRec(state, d.debtorId));
    add(`aid:${d.id}`, ent, 'AID RECEIVING · marker center inside ring',
      FRONTIER_MUTUAL_AID.settleR + (Number(ent?.radius) || 0));
  }

  // Each claimant on an open dispute draws a filed-wreck ring.
  for (const d of f.disputes || []) {
    if (!d || d.state !== 'open' || !Array.isArray(d.steadIds)) continue;
    for (const sid of d.steadIds) {
      const ent = owner._steadEnt(state, owner._steadRec(state, sid));
      add(`claim:${d.id}:${sid}`, ent, 'CLAIM RECEIVING · tow filed wreck here',
        FRONTIER_SALVAGE_CLAIMS.settleRadius + (Number(ent?.radius) || 0));
    }
  }
  return wanted;
}

/**
 * Transition-time reconcile: create missing tags, relabel changed ones, drop
 * stale ones. `owner._receivingTags` is the transient key → tag-entity-id map;
 * it is rebuilt, never serialized. Safe to call from any owner event seam.
 */
export function syncFrontierReceivingTags(owner) {
  const state = owner.state;
  if (!state || !state.entities) return;
  if (!(owner._receivingTags instanceof Map)) owner._receivingTags = new Map();
  const tags = owner._receivingTags;
  const wanted = wantedFrontierReceivingTags(owner, state);
  // Drop stale rows — and only OUR bodies. A recycled tag id can name a live
  // foreign entity; that one gets map-dropped, never removed.
  tags.forEach((tagId, key) => {
    const ent = state.entities.get(tagId);
    if (wanted.has(key) && isTag(ent, key)) return;
    if (isTag(ent, key)) owner.helpers?.removeEntity?.(tagId, { reason: 'frontier_tag_stale' });
    tags.delete(key);
  });
  wanted.forEach((w, key) => {
    let tag = state.entities.get(tags.get(key));
    if (!isTag(tag, key)) {
      tag = owner.helpers?.spawnEntity?.(tagSpec(key, w.body, w.label, w.ringRadius, w.sectorId));
      if (!tag) { tags.delete(key); return; }
      tags.set(key, tag.id);
      return;
    }
    // Relabel a changed ask and retune the ring; position is the mover's job.
    const d = tag.data;
    if (d.scanLabel !== w.label) { d.scanLabel = w.label; d.name = w.label; }
    if (d.ringRadius !== w.ringRadius) { d.ringRadius = w.ringRadius; d.visualRadius = w.ringRadius; }
    if (d.frontierReceivingBody !== w.body.id
        || d.frontierReceivingBodyGen !== (w.body.occupantGeneration ?? null)) {
      d.frontierReceivingBody = w.body.id;
      d.frontierReceivingBodyGen = w.body.occupantGeneration ?? null;
    }
  });
}

/**
 * Move one tag onto its receiving body — the per-tick rider the owner calls for
 * each live map entry. Cheap: two map lookups, no scans, no allocations.
 */
export function moveFrontierReceivingTag(owner, key, pos) {
  const state = owner.state;
  const tags = owner._receivingTags;
  const tagId = tags instanceof Map ? tags.get(key) : null;
  const tag = tagId != null ? state?.entities?.get(tagId) : null;
  if (!isTag(tag, key) || !Number.isFinite(pos?.x) || !Number.isFinite(pos?.z)) return false;
  tag.pos.x = pos.x;
  tag.pos.z = pos.z;
  return true;
}
