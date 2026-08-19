import { hash32 } from '../core/rng.js';
import { REASON_TO_CAUSE } from '../data/repReasons.js';

export const PROVENANCE_VERSION = 1;
export const PROVENANCE_CHAIN_CAP = 48;
export const PROVENANCE_NODE_CAP = 12;
export const PROVENANCE_OPEN_INCIDENT_CAP = 16;

const ROOT_KINDS = new Set(['act', 'incident', 'orphan', 'merged']);
const NODE_KINDS = new Set(['act', 'incident', 'standing', 'spillover', 'consequence']);
const EDGE_KINDS = new Set(['caused', 'spillover', 'stub']);
const CONTRABAND_REASONS = new Set(['contraband', 'caught_contraband']);
const OUTCOME_TYPES = new Set([
  'destroyed',
  'surrendered_secured',
  'surrendered_escaped',
  'surrendered_lost',
  'disengaged',
  'recovered',
  'abandoned',
  'repelled',
  'raided',
  'witnessed_only',
]);

const MERGE_NOTE = 'Older incidents in this sector folded together.';

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asInteger(value, fallback = 0) {
  return Math.trunc(asNumber(value, fallback));
}

function asString(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean : null;
}

function nowTick(state) {
  return asInteger(state && state.tick, 0);
}

function nowTime(state) {
  return asNumber(state && state.simTime, 0);
}

function currentSectorId(state) {
  return asString(state && state.world && state.world.currentSectorId);
}

function freshState() {
  return {
    v: PROVENANCE_VERSION,
    chains: [],
    openIncidents: {},
    nextSeq: 0,
  };
}

export function ensureState(state) {
  if (!state) return null;
  if (!isObject(state.provenance)) state.provenance = freshState();
  const own = state.provenance;
  if (own.v !== PROVENANCE_VERSION) own.v = PROVENANCE_VERSION;
  if (!Array.isArray(own.chains)) own.chains = [];
  if (!isObject(own.openIncidents)) own.openIncidents = {};
  if (!Number.isFinite(Number(own.nextSeq)) || Number(own.nextSeq) < 0) own.nextSeq = 0;
  return own;
}

function chainById(own, chainId) {
  if (!own || !Array.isArray(own.chains) || !chainId) return null;
  for (const chain of own.chains) {
    if (chain && chain.id === chainId) return chain;
  }
  return null;
}

function latestNodeTick(chain) {
  if (!chain || !Array.isArray(chain.nodes) || chain.nodes.length === 0) return asInteger(chain && chain.tick, 0);
  let best = asInteger(chain.tick, 0);
  for (const node of chain.nodes) best = Math.max(best, asInteger(node && node.tick, best));
  return best;
}

function latestNodeTime(chain) {
  if (!chain || !Array.isArray(chain.nodes) || chain.nodes.length === 0) return asNumber(chain && chain.t, 0);
  let best = asNumber(chain.t, 0);
  for (const node of chain.nodes) best = Math.max(best, asNumber(node && node.t, best));
  return best;
}

function chainRootFactionId(chain) {
  if (!chain || !Array.isArray(chain.nodes)) return null;
  for (const node of chain.nodes) {
    const factionId = asString(node && node.factionId);
    if (factionId) return factionId;
  }
  return null;
}

function sanitizeOutcome(outcome) {
  const value = asString(outcome);
  return value && OUTCOME_TYPES.has(value) ? value : null;
}

function sanitizeRootKind(rootKind) {
  const value = asString(rootKind);
  return value && ROOT_KINDS.has(value) ? value : 'orphan';
}

function normalizeReason(reason) {
  const raw = asString(reason);
  if (!raw) return null;
  if (raw.startsWith('spillover:')) {
    const base = raw.slice('spillover:'.length);
    return base ? base : null;
  }
  return raw;
}

function incidentOutcome(outcome) {
  const raw = asString(outcome);
  if (!raw) return 'witnessed_only';
  if (raw === 'sanctuary_withdrawal' || raw === 'protected_withdrawal') return 'disengaged';
  return 'witnessed_only';
}

function serializeNode(node) {
  return {
    k: node.k,
    t: asNumber(node.t, 0),
    tick: asInteger(node.tick, 0),
    factionId: asString(node.factionId),
    delta: Number.isFinite(Number(node.delta)) ? Number(node.delta) : null,
    newRep: Number.isFinite(Number(node.newRep)) ? Number(node.newRep) : null,
    newTier: asString(node.newTier),
    tierChanged: node.tierChanged === true,
    reason: asString(node.reason),
    srcFaction: asString(node.srcFaction),
    stationId: asString(node.stationId),
    targetId: asString(node.targetId),
    aceId: asString(node.aceId),
    bodyId: asString(node.bodyId),
    lossId: asString(node.lossId),
    outcome: sanitizeOutcome(node.outcome),
    text: asString(node.text),
    sectorId: asString(node.sectorId),
    incidentId: asString(node.incidentId),
    cause: asString(node.cause),
  };
}

function sanitizeNode(raw) {
  if (!isObject(raw)) return null;
  const kind = asString(raw.k);
  if (!kind || !NODE_KINDS.has(kind)) return null;
  return serializeNode({ ...raw, k: kind });
}

function sanitizeEdge(raw, nodeCount) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const from = asInteger(raw[0], -1);
  const to = asInteger(raw[1], -1);
  const edgeKind = asString(raw[2]);
  if (!edgeKind || !EDGE_KINDS.has(edgeKind)) return null;
  if (edgeKind === 'stub') {
    if (from !== -1) return null;
    if (to < 0 || to >= nodeCount) return null;
    return [from, to, edgeKind];
  }
  if (from < 0 || from >= nodeCount) return null;
  if (to < 0 || to >= nodeCount) return null;
  return [from, to, edgeKind];
}

function sanitizeChain(raw) {
  if (!isObject(raw)) return null;
  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes = [];
  for (const entry of nodesRaw) {
    const node = sanitizeNode(entry);
    if (node) nodes.push(node);
    if (nodes.length >= PROVENANCE_NODE_CAP) break;
  }
  if (nodes.length === 0) return null;
  const edgesRaw = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = [];
  for (const entry of edgesRaw) {
    const edge = sanitizeEdge(entry, nodes.length);
    if (edge) edges.push(edge);
  }
  return {
    id: asString(raw.id),
    t: asNumber(raw.t, asNumber(nodes[0].t, 0)),
    tick: asInteger(raw.tick, asInteger(nodes[0].tick, 0)),
    sectorId: asString(raw.sectorId),
    rootKind: sanitizeRootKind(raw.rootKind),
    outcome: sanitizeOutcome(raw.outcome) || 'witnessed_only',
    nodes,
    edges,
    open: raw.open === true,
    settledAt: Number.isFinite(Number(raw.settledAt)) ? Number(raw.settledAt) : null,
    bountyPending: raw.bountyPending === true,
    amendsActive: raw.amendsActive === true,
  };
}

function sanitizeOpenIncidents(raw, validIds) {
  if (!isObject(raw)) return {};
  const entries = [];
  for (const [incidentId, info] of Object.entries(raw)) {
    if (!isObject(info)) continue;
    const chainId = asString(info.chainId);
    if (!chainId || !validIds.has(chainId)) continue;
    entries.push([
      incidentId,
      {
        tick: asInteger(info.tick, 0),
        cause: asString(info.cause),
        stationId: asString(info.stationId),
        factionId: asString(info.factionId),
        chainId,
      },
    ]);
  }
  entries.sort((a, b) => b[1].tick - a[1].tick);
  const out = {};
  for (const [incidentId, info] of entries.slice(0, PROVENANCE_OPEN_INCIDENT_CAP)) {
    out[incidentId] = info;
  }
  return out;
}

function serializeState(own) {
  const chains = [];
  for (const chain of own.chains || []) {
    const clean = sanitizeChain(chain);
    if (clean) chains.push(clean);
    if (chains.length >= PROVENANCE_CHAIN_CAP) break;
  }
  const ids = new Set(chains.map((chain) => chain.id).filter(Boolean));
  return {
    v: PROVENANCE_VERSION,
    chains,
    openIncidents: sanitizeOpenIncidents(own.openIncidents, ids),
    nextSeq: Math.max(0, asInteger(own.nextSeq, 0)),
  };
}

function trimChainNodes(chain) {
  while (chain.nodes.length > PROVENANCE_NODE_CAP) {
    const dropIndex = chain.nodes.length > 1 ? 1 : 0;
    chain.nodes.splice(dropIndex, 1);
    const nextEdges = [];
    for (const edge of chain.edges) {
      const kind = edge[2];
      if (kind === 'stub') {
        const to = edge[1];
        if (to === dropIndex) continue;
        const shiftedTo = to > dropIndex ? to - 1 : to;
        nextEdges.push([-1, shiftedTo, kind]);
        continue;
      }
      let from = edge[0];
      let to = edge[1];
      if (from === dropIndex || to === dropIndex) continue;
      if (from > dropIndex) from -= 1;
      if (to > dropIndex) to -= 1;
      nextEdges.push([from, to, kind]);
    }
    chain.edges = nextEdges;
  }
}

function addNode(chain, node) {
  chain.nodes.push(node);
  trimChainNodes(chain);
  return chain.nodes.length - 1;
}

function addEdge(chain, from, to, edgeKind = 'caused') {
  if (!EDGE_KINDS.has(edgeKind)) return;
  if (edgeKind === 'stub') {
    if (from !== -1) return;
    if (!(to >= 0 && to < chain.nodes.length)) return;
  } else if (!(from >= 0 && from < chain.nodes.length && to >= 0 && to < chain.nodes.length)) {
    return;
  }
  for (const edge of chain.edges) {
    if (edge[0] === from && edge[1] === to && edge[2] === edgeKind) return;
  }
  chain.edges.push([from, to, edgeKind]);
}

function newestNodeIndex(chain, predicate) {
  for (let i = chain.nodes.length - 1; i >= 0; i -= 1) {
    if (predicate(chain.nodes[i], i)) return i;
  }
  return -1;
}

function factionAggro(state, factionId) {
  if (!factionId) return false;
  const faction = state && state.factions && state.factions[factionId];
  return !!(faction && faction.aggro);
}

function recomputeOpen(chain, state) {
  const factionIds = new Set();
  for (const node of chain.nodes) {
    const factionId = asString(node && node.factionId);
    if (factionId) factionIds.add(factionId);
    const srcFaction = asString(node && node.srcFaction);
    if (srcFaction) factionIds.add(srcFaction);
  }
  let hasAggro = false;
  for (const factionId of factionIds) {
    if (factionAggro(state, factionId)) {
      hasAggro = true;
      break;
    }
  }
  const hasBounty = chain.bountyPending === true && asNumber(state && state.player && state.player.bounty, 0) > 0;
  const open = hasAggro || hasBounty || chain.amendsActive === true;
  chain.open = open;
  if (open) chain.settledAt = null;
  else if (!Number.isFinite(Number(chain.settledAt))) chain.settledAt = nowTime(state);
}

function recomputeAllOpen(own, state) {
  for (const chain of own.chains) recomputeOpen(chain, state);
}

function dropIncidentsForChain(own, chainId) {
  for (const incidentId of Object.keys(own.openIncidents || {})) {
    const row = own.openIncidents[incidentId];
    if (row && row.chainId === chainId) delete own.openIncidents[incidentId];
  }
}

function chooseEvictionIndex(own) {
  let index = -1;
  let bestStamp = Infinity;
  for (let i = 0; i < own.chains.length; i += 1) {
    const chain = own.chains[i];
    if (!chain || chain.open) continue;
    const stamp = Number.isFinite(Number(chain.settledAt))
      ? Number(chain.settledAt)
      : latestNodeTime(chain);
    if (stamp < bestStamp) {
      bestStamp = stamp;
      index = i;
    }
  }
  return index;
}

function mergedNodesFrom(a, b, state) {
  const all = [...(a.nodes || []), ...(b.nodes || [])]
    .map((node) => sanitizeNode(node))
    .filter(Boolean)
    .sort((left, right) => {
      const tickDelta = asInteger(left.tick, 0) - asInteger(right.tick, 0);
      if (tickDelta !== 0) return tickDelta;
      return asNumber(left.t, 0) - asNumber(right.t, 0);
    });
  if (all.length === 0) return [];
  const first = all[0];
  let tailConsequence = null;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    if (all[i].k === 'consequence') {
      tailConsequence = all[i];
      break;
    }
  }
  const pool = all.slice(1);
  const nodes = [first];
  while (nodes.length < PROVENANCE_NODE_CAP - 1 && pool.length) nodes.push(pool.shift());
  if (tailConsequence) nodes.push(tailConsequence);
  nodes.push({
    k: 'consequence',
    t: nowTime(state),
    tick: nowTick(state),
    text: MERGE_NOTE,
    outcome: 'witnessed_only',
    factionId: chainRootFactionId(a) || chainRootFactionId(b),
    sectorId: asString(a.sectorId) || asString(b.sectorId) || currentSectorId(state),
    delta: null,
    newRep: null,
    newTier: null,
    tierChanged: false,
    reason: null,
    srcFaction: null,
    stationId: null,
    targetId: null,
    aceId: null,
    bodyId: null,
    lossId: null,
    incidentId: null,
    cause: null,
  });
  while (nodes.length > PROVENANCE_NODE_CAP) nodes.splice(1, 1);
  return nodes;
}

function mergeOpenPair(state, own) {
  if (own.chains.length < 2) return false;
  const open = own.chains
    .map((chain, index) => ({ chain, index }))
    .filter((entry) => entry.chain && entry.chain.open);
  if (open.length < 2) return false;
  open.sort((left, right) => latestNodeTick(left.chain) - latestNodeTick(right.chain));
  let pair = null;
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      const left = open[i].chain;
      const right = open[j].chain;
      if (asString(left.sectorId) !== asString(right.sectorId)) continue;
      if (chainRootFactionId(left) !== chainRootFactionId(right)) continue;
      pair = [open[i], open[j]];
      break;
    }
    if (pair) break;
  }
  if (!pair) return false;
  const [first, second] = pair;
  const older = latestNodeTick(first.chain) <= latestNodeTick(second.chain) ? first : second;
  const newer = older === first ? second : first;
  const merged = {
    id: older.chain.id,
    t: asNumber(older.chain.t, nowTime(state)),
    tick: asInteger(older.chain.tick, nowTick(state)),
    sectorId: asString(older.chain.sectorId) || asString(newer.chain.sectorId) || currentSectorId(state),
    rootKind: 'merged',
    outcome: sanitizeOutcome(newer.chain.outcome) || sanitizeOutcome(older.chain.outcome) || 'witnessed_only',
    nodes: mergedNodesFrom(older.chain, newer.chain, state),
    edges: [],
    open: true,
    settledAt: null,
    bountyPending: older.chain.bountyPending === true || newer.chain.bountyPending === true,
    amendsActive: older.chain.amendsActive === true || newer.chain.amendsActive === true,
  };
  for (let i = 1; i < merged.nodes.length; i += 1) addEdge(merged, i - 1, i, 'caused');

  const remove = [older.index, newer.index].sort((a, b) => b - a);
  for (const index of remove) {
    const removed = own.chains[index];
    own.chains.splice(index, 1);
    dropIncidentsForChain(own, removed && removed.id);
  }
  own.chains.push(merged);
  own.chains.sort((left, right) => latestNodeTick(right) - latestNodeTick(left));
  return true;
}

function makeRoomForChain(state, own) {
  if (own.chains.length < PROVENANCE_CHAIN_CAP) return;
  const index = chooseEvictionIndex(own);
  if (index >= 0) {
    const removed = own.chains[index];
    own.chains.splice(index, 1);
    dropIncidentsForChain(own, removed && removed.id);
    return;
  }
  if (!mergeOpenPair(state, own)) {
    const oldest = own.chains[own.chains.length - 1];
    if (oldest) {
      oldest.rootKind = 'merged';
      addNode(oldest, {
        k: 'consequence',
        t: nowTime(state),
        tick: nowTick(state),
        text: MERGE_NOTE,
        outcome: 'witnessed_only',
        factionId: chainRootFactionId(oldest),
        sectorId: asString(oldest.sectorId) || currentSectorId(state),
        delta: null,
        newRep: null,
        newTier: null,
        tierChanged: false,
        reason: null,
        srcFaction: null,
        stationId: null,
        targetId: null,
        aceId: null,
        bodyId: null,
        lossId: null,
        incidentId: null,
        cause: null,
      });
      oldest.bountyPending = false;
      oldest.amendsActive = false;
      recomputeOpen(oldest, state);
      const drop = chooseEvictionIndex(own);
      if (drop >= 0) {
        const removed = own.chains[drop];
        own.chains.splice(drop, 1);
        dropIncidentsForChain(own, removed && removed.id);
      }
    }
  }
}

function nextChainId(state, own, rootTick, rootKind, actorKey) {
  const seed = asInteger(state && state.meta && state.meta.seed, 1) || 1;
  const seq = asInteger(own.nextSeq, 0);
  own.nextSeq = seq + 1;
  const hash = hash32(seed, rootTick, rootKind, actorKey || 'none', seq).toString(16);
  return `pv:${hash}`;
}

function createChain(state, own, rootKind, rootNode) {
  makeRoomForChain(state, own);
  const actorKey = asString(rootNode.targetId)
    || asString(rootNode.factionId)
    || asString(rootNode.stationId)
    || String(own.nextSeq || 0);
  const chain = {
    id: nextChainId(state, own, asInteger(rootNode.tick, nowTick(state)), rootKind, actorKey),
    t: asNumber(rootNode.t, nowTime(state)),
    tick: asInteger(rootNode.tick, nowTick(state)),
    sectorId: asString(rootNode.sectorId) || currentSectorId(state),
    rootKind: sanitizeRootKind(rootKind),
    outcome: sanitizeOutcome(rootNode.outcome) || 'witnessed_only',
    nodes: [serializeNode(rootNode)],
    edges: [],
    open: false,
    settledAt: null,
    bountyPending: false,
    amendsActive: false,
  };
  own.chains.unshift(chain);
  return chain;
}

function registerIncident(own, row, chainId) {
  const incidentId = asString(row && row.incidentId);
  if (!incidentId) return;
  own.openIncidents[incidentId] = {
    tick: asInteger(row.tick, 0),
    cause: asString(row.cause),
    stationId: asString(row.stationId),
    factionId: asString(row.factionId),
    chainId,
  };
  const entries = Object.entries(own.openIncidents).sort((a, b) => asInteger(b[1] && b[1].tick, 0) - asInteger(a[1] && a[1].tick, 0));
  own.openIncidents = {};
  for (const [id, info] of entries.slice(0, PROVENANCE_OPEN_INCIDENT_CAP)) own.openIncidents[id] = info;
}

function findIncidentByVictim(own, victimId) {
  if (!victimId) return null;
  const incidents = Object.values(own.openIncidents || [])
    .filter((row) => row && row.chainId)
    .sort((left, right) => asInteger(right.tick, 0) - asInteger(left.tick, 0));
  for (const row of incidents) {
    const chain = chainById(own, row.chainId);
    if (!chain) continue;
    const incidentIndex = newestNodeIndex(chain, (node) => node.k === 'incident' && asString(node.targetId) === victimId);
    if (incidentIndex >= 0) return { chain, incidentIndex };
  }
  for (const chain of own.chains) {
    const incidentIndex = newestNodeIndex(chain, (node) => node.k === 'incident' && asString(node.targetId) === victimId);
    if (incidentIndex >= 0) return { chain, incidentIndex };
  }
  return null;
}

function findActByVictim(own, victimId, factionId = null) {
  for (const chain of own.chains) {
    const actIndex = newestNodeIndex(chain, (node) => (
      node.k === 'act'
      && asString(node.targetId) === victimId
      && (factionId ? asString(node.factionId) === factionId : true)
    ));
    if (actIndex >= 0) return { chain, actIndex };
  }
  return null;
}

function findStandingParentForSpillover(own, srcFaction, tick) {
  for (const chain of own.chains) {
    const standingIndex = newestNodeIndex(chain, (node) => (
      node.k === 'standing'
      && asInteger(node.tick, -1) === tick
      && asString(node.factionId) === srcFaction
    ));
    if (standingIndex >= 0) return { chain, standingIndex };
  }
  return null;
}

function findStandingJoin(own, standingNode, mappedCauses) {
  const standingTick = asInteger(standingNode.tick, -1);
  const standingFaction = asString(standingNode.factionId);
  for (const chain of own.chains) {
    const actIndex = newestNodeIndex(chain, (node) => (
      node.k === 'act'
      && asInteger(node.tick, -1) === standingTick
      && (!standingFaction || asString(node.factionId) === standingFaction)
    ));
    if (actIndex < 0) continue;
    if (Array.isArray(mappedCauses) && mappedCauses.length > 0) {
      const incidentIndex = newestNodeIndex(chain, (node) => (
        node.k === 'incident'
        && (!standingFaction || asString(node.factionId) === standingFaction)
        && mappedCauses.includes(asString(node.cause))
      ));
      if (incidentIndex < 0) continue;
      return { chain, fromIndex: incidentIndex, actIndex };
    }
    return { chain, fromIndex: actIndex, actIndex };
  }
  return null;
}

function findContrabandChain(own, tick, factionId) {
  for (const chain of own.chains) {
    const actIndex = newestNodeIndex(chain, (node) => (
      node.k === 'act'
      && asInteger(node.tick, -1) === tick
      && asString(node.reason) === 'contraband_scan'
      && asString(node.factionId) === factionId
    ));
    if (actIndex >= 0) return { chain, actIndex };
  }
  return null;
}

function latestConsequenceAnchor(chain, factionId = null) {
  const index = newestNodeIndex(chain, (node) => (
    (node.k === 'standing' || node.k === 'spillover' || node.k === 'incident' || node.k === 'act')
    && (!factionId || asString(node.factionId) === factionId || asString(node.srcFaction) === factionId)
  ));
  return index >= 0 ? index : Math.max(0, chain.nodes.length - 1);
}

function latestChainForSector(own, sectorId) {
  for (const chain of own.chains) {
    if (asString(chain.sectorId) === sectorId) return chain;
  }
  return null;
}

export const provenanceLedger = {
  name: 'provenanceLedger',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureState(this.state);

    this._listen('law:incidentReceipt', (payload) => this._onIncidentReceipt(payload || {}));
    this._listen('faction:repChanged', (payload) => this._onRepChanged(payload || {}));
    this._listen('faction:repSpillover', (payload) => this._onRepSpillover(payload || {}));
    this._listen('faction:aggro', (payload) => this._onFactionAggro(payload || {}));
    this._listen('law:custodyTransfer', (payload) => this._onActOutcome(payload || {}, 'surrendered_secured'));
    this._listen('combat:nonlethalResolution', (payload) => this._onActOutcome(payload || {}, 'surrendered_secured'));
    this._listen('surrender:secured', (payload) => this._onActOutcome(payload || {}, 'surrendered_secured'));
    this._listen('surrender:escaped', (payload) => this._onActOutcome(payload || {}, 'surrendered_escaped'));
    this._listen('surrender:recoveryLost', (payload) => this._onActOutcome(payload || {}, 'surrendered_lost'));
    this._listen('freight:recovery', (payload) => this._onActOutcome(payload || {}, 'recovered'));
    this._listen('freight:recoveryAbandoned', (payload) => this._onActOutcome(payload || {}, 'abandoned'));
    this._listen('claim:raided', (payload) => this._onClaimOutcome(payload || {}, 'raided'));
    this._listen('claim:raidRepelled', (payload) => this._onClaimOutcome(payload || {}, 'repelled'));
    this._listen('claim:defenseResolved', (payload) => this._onClaimDefense(payload || {}));
    this._listen('lossLedger:recorded', (payload) => this._onLossRecorded(payload || {}));
    this._listen('namedAce:appeared', (payload) => this._onAceEvent(payload || {}, 'appeared'));
    this._listen('namedAce:fled', (payload) => this._onAceEvent(payload || {}, 'fled'));
    this._listen('namedAce:defeated', (payload) => this._onAceEvent(payload || {}, 'defeated'));
    this._listen('encounter:namedCaptainDefeated', (payload) => this._onAceEvent(payload || {}, 'captain_defeated'));
    this._listen('massline:tumbled', (payload) => this._onMassline(payload || {}));
    this._listen('entity:killed', (payload) => this._onEntityKilled(payload || {}));
    this._listen('bounty:cleared', (payload) => this._onBountyCleared(payload || {}));
    this._listen('game:new', () => this.newGame());
  },

  _listen(eventName, handler) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(eventName, handler);
    if (typeof off === 'function') {
      this._subs.push(off);
      return;
    }
    this._subs.push(() => {
      if (this.bus && typeof this.bus.off === 'function') this.bus.off(eventName, handler);
    });
  },

  update() {},

  newGame() {
    if (!this.state) return;
    this.state.provenance = freshState();
  },

  serialize() {
    const own = ensureState(this.state);
    return serializeState(own || freshState());
  },

  deserialize(data) {
    if (!this.state) return;
    const own = ensureState(this.state);
    const incoming = isObject(data) ? data : freshState();
    own.v = PROVENANCE_VERSION;
    own.nextSeq = Math.max(0, asInteger(incoming.nextSeq, 0));
    own.chains = [];
    const sourceChains = Array.isArray(incoming.chains) ? incoming.chains : [];
    for (const row of sourceChains) {
      const chain = sanitizeChain(row);
      if (chain) own.chains.push(chain);
      if (own.chains.length >= PROVENANCE_CHAIN_CAP) break;
    }
    const validIds = new Set(own.chains.map((chain) => chain.id).filter(Boolean));
    own.openIncidents = sanitizeOpenIncidents(incoming.openIncidents, validIds);
    recomputeAllOpen(own, this.state);
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (_) { /* listener teardown must not throw */ }
    }
    this._subs = [];
  },

  _onEntityKilled(payload) {
    if (!payload || payload.killerId !== this.state.playerId) return;
    const victimId = asString(payload.id);
    if (!victimId) return;
    const own = ensureState(this.state);
    const tick = nowTick(this.state);
    const time = nowTime(this.state);
    const factionId = asString(payload.factionId);
    const sectorId = asString(payload.sectorId) || currentSectorId(this.state);
    const actNode = {
      k: 'act',
      t: time,
      tick,
      targetId: victimId,
      factionId,
      outcome: 'destroyed',
      reason: null,
      sectorId,
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      srcFaction: null,
      stationId: null,
      aceId: null,
      bodyId: null,
      lossId: null,
      incidentId: null,
      cause: null,
      text: null,
    };

    const incidentMatch = findIncidentByVictim(own, victimId);
    let chain = incidentMatch && incidentMatch.chain;
    if (!chain) {
      const existing = findActByVictim(own, victimId, factionId);
      chain = existing && existing.chain;
    }
    if (!chain) chain = createChain(this.state, own, 'act', actNode);
    const exists = newestNodeIndex(chain, (node) => (
      node.k === 'act'
      && asString(node.targetId) === victimId
      && asInteger(node.tick, -1) === tick
      && sanitizeOutcome(node.outcome) === 'destroyed'
    ));
    if (exists < 0) {
      const actIndex = addNode(chain, actNode);
      if (incidentMatch && incidentMatch.chain === chain) addEdge(chain, actIndex, incidentMatch.incidentIndex, 'caused');
    }
    chain.sectorId = chain.sectorId || sectorId;
    chain.outcome = 'destroyed';
    if (asNumber(this.state.player && this.state.player.bounty, 0) > 0) chain.bountyPending = true;
    recomputeOpen(chain, this.state);
  },

  _onIncidentReceipt(payload) {
    if (payload && payload.attackerId != null && payload.attackerId !== this.state.playerId) return;
    const own = ensureState(this.state);
    const tick = nowTick(this.state);
    const time = nowTime(this.state);
    const victimId = asString(payload.targetId);
    const factionId = asString(payload.factionId);
    const incidentId = asString(payload.incidentId);
    const sectorId = asString(payload.sectorId) || currentSectorId(this.state);
    const node = {
      k: 'incident',
      t: asNumber(payload.t, time),
      tick: Number.isFinite(Number(payload.tick)) ? asInteger(payload.tick, tick) : tick,
      targetId: victimId,
      factionId,
      stationId: asString(payload.stationId),
      text: asString(payload.text),
      outcome: incidentOutcome(payload.outcome),
      incidentId,
      cause: asString(payload.cause),
      reason: null,
      sectorId,
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      srcFaction: null,
      aceId: null,
      bodyId: null,
      lossId: null,
    };

    let chain = null;
    if (victimId) {
      const actMatch = findActByVictim(own, victimId, factionId);
      chain = actMatch && actMatch.chain;
    }
    if (!chain) {
      for (const entry of own.chains) {
        const existing = newestNodeIndex(entry, (n) => (
          n.k === 'incident' && incidentId && asString(n.incidentId) === incidentId
        ));
        if (existing >= 0) {
          chain = entry;
          break;
        }
      }
    }
    if (!chain) chain = createChain(this.state, own, 'incident', node);

    let incidentIndex = newestNodeIndex(chain, (n) => (
      n.k === 'incident'
      && (
        (incidentId && asString(n.incidentId) === incidentId)
        || (victimId && asString(n.targetId) === victimId && asString(n.cause) === asString(node.cause))
      )
    ));
    if (incidentIndex < 0) incidentIndex = addNode(chain, node);

    const actIndex = newestNodeIndex(chain, (n) => n.k === 'act' && victimId && asString(n.targetId) === victimId);
    if (actIndex >= 0) addEdge(chain, actIndex, incidentIndex, 'caused');

    if (asNumber(this.state.player && this.state.player.bounty, 0) > 0) chain.bountyPending = true;
    chain.sectorId = chain.sectorId || sectorId;
    updateChainOutcome(chain, node.outcome);
    registerIncident(own, node, chain.id);
    recomputeOpen(chain, this.state);
  },

  _onRepChanged(payload) {
    const own = ensureState(this.state);
    const tick = nowTick(this.state);
    const time = nowTime(this.state);
    const factionId = asString(payload.factionId);
    const reasonRaw = asString(payload.reason);
    if (!factionId || !reasonRaw) return;
    if (reasonRaw.startsWith('spillover:')) return;

    const reason = normalizeReason(reasonRaw);
    const standingNode = {
      k: 'standing',
      t: time,
      tick,
      factionId,
      delta: Number.isFinite(Number(payload.delta)) ? Number(payload.delta) : null,
      newRep: Number.isFinite(Number(payload.newRep)) ? Number(payload.newRep) : null,
      newTier: asString(payload.newTier),
      tierChanged: payload.tierChanged === true,
      reason: reasonRaw,
      outcome: 'witnessed_only',
      sectorId: currentSectorId(this.state),
      srcFaction: null,
      stationId: null,
      targetId: null,
      aceId: null,
      bodyId: null,
      lossId: null,
      incidentId: null,
      cause: null,
      text: null,
    };

    let join = null;
    if (reason && CONTRABAND_REASONS.has(reason)) {
      join = findContrabandChain(own, tick, factionId);
      if (!join) {
        const synthetic = {
          k: 'act',
          t: time,
          tick,
          factionId,
          reason: 'contraband_scan',
          outcome: 'witnessed_only',
          sectorId: currentSectorId(this.state),
          delta: null,
          newRep: null,
          newTier: null,
          tierChanged: false,
          srcFaction: null,
          stationId: null,
          targetId: null,
          aceId: null,
          bodyId: null,
          lossId: null,
          incidentId: null,
          cause: null,
          text: 'Contraband scan recorded.',
        };
        const chain = createChain(this.state, own, 'act', synthetic);
        join = { chain, actIndex: 0, fromIndex: 0 };
      }
    } else {
      const mapped = reason ? REASON_TO_CAUSE[reason] : null;
      join = findStandingJoin(own, standingNode, Array.isArray(mapped) ? mapped : null);
    }

    if (!join) {
      const chain = createChain(this.state, own, 'orphan', standingNode);
      addEdge(chain, -1, 0, 'stub');
      recomputeOpen(chain, this.state);
      return;
    }

    if (reason && CONTRABAND_REASONS.has(reason)) {
      const existingIndex = newestNodeIndex(join.chain, (node) => (
        node.k === 'standing'
        && asInteger(node.tick, -1) === tick
        && asString(node.factionId) === factionId
        && CONTRABAND_REASONS.has(normalizeReason(node.reason))
      ));
      if (existingIndex >= 0) {
        const existing = join.chain.nodes[existingIndex];
        const existingDelta = Number.isFinite(Number(existing.delta)) ? Number(existing.delta) : 0;
        const delta = Number.isFinite(Number(standingNode.delta)) ? Number(standingNode.delta) : 0;
        existing.delta = existingDelta + delta;
        existing.reason = 'caught_contraband';
        existing.newRep = standingNode.newRep;
        existing.newTier = standingNode.newTier;
        existing.tierChanged = existing.tierChanged === true || standingNode.tierChanged === true;
        recomputeOpen(join.chain, this.state);
        return;
      }
    }

    const nodeIndex = addNode(join.chain, standingNode);
    addEdge(join.chain, join.fromIndex, nodeIndex, 'caused');
    if (asNumber(this.state.player && this.state.player.bounty, 0) > 0 && reason && CONTRABAND_REASONS.has(reason)) {
      join.chain.bountyPending = true;
    }
    updateChainOutcome(join.chain, standingNode.outcome);
    recomputeOpen(join.chain, this.state);
  },

  _onRepSpillover(payload) {
    const own = ensureState(this.state);
    const tick = nowTick(this.state);
    const time = nowTime(this.state);
    const factionId = asString(payload.factionId);
    const srcFaction = asString(payload.srcFaction);
    if (!factionId || !srcFaction) return;

    const parent = findStandingParentForSpillover(own, srcFaction, tick);
    if (!parent) return;

    const duplicate = newestNodeIndex(parent.chain, (node) => (
      node.k === 'spillover'
      && asString(node.factionId) === factionId
      && asString(node.srcFaction) === srcFaction
      && asInteger(node.tick, -1) === tick
    ));
    if (duplicate >= 0) return;

    const node = {
      k: 'spillover',
      t: time,
      tick,
      factionId,
      srcFaction,
      delta: Number.isFinite(Number(payload.delta)) ? Number(payload.delta) : null,
      reason: 'spillover',
      outcome: 'witnessed_only',
      sectorId: currentSectorId(this.state),
      newRep: null,
      newTier: null,
      tierChanged: false,
      stationId: null,
      targetId: null,
      aceId: null,
      bodyId: null,
      lossId: null,
      incidentId: null,
      cause: null,
      text: null,
    };
    const nodeIndex = addNode(parent.chain, node);
    addEdge(parent.chain, parent.standingIndex, nodeIndex, 'spillover');
    recomputeOpen(parent.chain, this.state);
  },

  _onFactionAggro(payload) {
    const own = ensureState(this.state);
    const factionId = asString(payload.factionId);
    if (!factionId) return;
    if (payload.isAggro !== true) {
      recomputeAllOpen(own, this.state);
      return;
    }
    let chain = null;
    for (const candidate of own.chains) {
      const match = newestNodeIndex(candidate, (node) => (
        asString(node.factionId) === factionId || asString(node.srcFaction) === factionId
      ));
      if (match >= 0) {
        chain = candidate;
        break;
      }
    }
    if (!chain) return;
    const duplicate = newestNodeIndex(chain, (node) => (
      node.k === 'consequence'
      && asString(node.factionId) === factionId
      && asString(node.text) === 'Patrol hostility active.'
      && asInteger(node.tick, -1) === nowTick(this.state)
    ));
    if (duplicate >= 0) return;
    const anchor = latestConsequenceAnchor(chain, factionId);
    const consequence = {
      k: 'consequence',
      t: nowTime(this.state),
      tick: nowTick(this.state),
      factionId,
      text: 'Patrol hostility active.',
      outcome: 'witnessed_only',
      sectorId: asString(chain.sectorId) || currentSectorId(this.state),
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      reason: null,
      srcFaction: null,
      stationId: null,
      targetId: null,
      aceId: null,
      bodyId: null,
      lossId: null,
      incidentId: null,
      cause: null,
    };
    const nodeIndex = addNode(chain, consequence);
    addEdge(chain, anchor, nodeIndex, 'caused');
    recomputeOpen(chain, this.state);
  },

  _onActOutcome(payload, outcome) {
    const own = ensureState(this.state);
    const targetId = asString(payload.entityId) || asString(payload.targetId) || asString(payload.id) || asString(payload.victimId);
    if (!targetId) return;
    const factionId = asString(payload.factionId);
    let chain = null;
    const act = findActByVictim(own, targetId, factionId);
    if (act) chain = act.chain;
    if (!chain) {
      const incident = findIncidentByVictim(own, targetId);
      if (incident) chain = incident.chain;
    }
    const node = {
      k: 'act',
      t: asNumber(payload.t, nowTime(this.state)),
      tick: Number.isFinite(Number(payload.tick)) ? asInteger(payload.tick, nowTick(this.state)) : nowTick(this.state),
      targetId,
      factionId,
      outcome: sanitizeOutcome(outcome) || 'witnessed_only',
      reason: asString(payload.reason),
      stationId: asString(payload.stationId),
      sectorId: asString(payload.sectorId) || currentSectorId(this.state),
      text: asString(payload.text),
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      srcFaction: null,
      aceId: null,
      bodyId: null,
      lossId: null,
      incidentId: asString(payload.id),
      cause: null,
    };
    if (!chain) chain = createChain(this.state, own, 'act', node);
    const duplicate = newestNodeIndex(chain, (entry) => (
      entry.k === 'act'
      && asString(entry.targetId) === targetId
      && sanitizeOutcome(entry.outcome) === node.outcome
      && asInteger(entry.tick, -1) === asInteger(node.tick, -1)
    ));
    if (duplicate < 0) addNode(chain, node);
    updateChainOutcome(chain, node.outcome);
    chain.sectorId = chain.sectorId || node.sectorId;
    recomputeOpen(chain, this.state);
  },

  _onClaimOutcome(payload, outcome) {
    const own = ensureState(this.state);
    const bodyId = asString(payload.bodyId);
    let chain = bodyId
      ? own.chains.find((entry) => newestNodeIndex(entry, (node) => asString(node.bodyId) === bodyId) >= 0)
      : null;
    if (!chain) chain = latestChainForSector(own, currentSectorId(this.state));
    const node = {
      k: 'consequence',
      t: nowTime(this.state),
      tick: nowTick(this.state),
      bodyId,
      outcome: sanitizeOutcome(outcome) || 'witnessed_only',
      text: asString(payload.text) || (outcome === 'repelled' ? 'Claim raid repelled.' : 'Claim raid succeeded.'),
      sectorId: asString(payload.sectorId) || asString(chain && chain.sectorId) || currentSectorId(this.state),
      factionId: null,
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      reason: null,
      srcFaction: null,
      stationId: null,
      targetId: null,
      aceId: null,
      lossId: null,
      incidentId: null,
      cause: null,
    };
    if (!chain) chain = createChain(this.state, own, 'orphan', node);
    else {
      const anchor = latestConsequenceAnchor(chain);
      const nodeIndex = addNode(chain, node);
      addEdge(chain, anchor, nodeIndex, 'caused');
      updateChainOutcome(chain, node.outcome);
      recomputeOpen(chain, this.state);
      return;
    }
    recomputeOpen(chain, this.state);
  },

  _onClaimDefense(payload) {
    const outcome = asString(payload.outcome);
    if (!outcome) return;
    if (outcome === 'defended') this._onClaimOutcome(payload, 'repelled');
    else this._onClaimOutcome(payload, 'raided');
  },

  _onLossRecorded(payload) {
    const own = ensureState(this.state);
    const sectorId = asString(payload.sectorId) || currentSectorId(this.state);
    let chain = latestChainForSector(own, sectorId);
    const node = {
      k: 'consequence',
      t: asNumber(payload.t, nowTime(this.state)),
      tick: asInteger(payload.tick, nowTick(this.state)),
      lossId: asString(payload.lossId),
      factionId: asString(payload.factionId),
      sectorId,
      text: asString(payload.line) || 'Loss recorded in this sector.',
      outcome: 'witnessed_only',
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      reason: null,
      srcFaction: null,
      stationId: null,
      targetId: null,
      aceId: null,
      bodyId: null,
      incidentId: null,
      cause: null,
    };
    if (!chain) chain = createChain(this.state, own, 'orphan', node);
    else {
      const anchor = latestConsequenceAnchor(chain);
      const idx = addNode(chain, node);
      addEdge(chain, anchor, idx, 'caused');
    }
    recomputeOpen(chain, this.state);
  },

  _onAceEvent(payload, kind) {
    const own = ensureState(this.state);
    const sectorId = asString(payload.sectorId) || currentSectorId(this.state);
    let chain = latestChainForSector(own, sectorId);
    const aceId = asString(payload.aceId) || asString(payload.captainId);
    const textByKind = {
      appeared: 'Named ace sighted.',
      fled: 'Named ace escaped.',
      defeated: 'Named ace defeated.',
      captain_defeated: 'Named captain defeated.',
    };
    const node = {
      k: 'consequence',
      t: asNumber(payload.t, nowTime(this.state)),
      tick: asInteger(payload.tick, nowTick(this.state)),
      aceId,
      sectorId,
      text: asString(payload.text) || textByKind[kind] || 'Named ace event.',
      outcome: kind === 'defeated' || kind === 'captain_defeated' ? 'destroyed' : 'witnessed_only',
      factionId: asString(payload.factionId),
      delta: null,
      newRep: null,
      newTier: null,
      tierChanged: false,
      reason: null,
      srcFaction: null,
      stationId: null,
      targetId: asString(payload.entityId),
      bodyId: null,
      lossId: null,
      incidentId: null,
      cause: null,
    };
    if (!chain) chain = createChain(this.state, own, 'orphan', node);
    else {
      const anchor = latestConsequenceAnchor(chain);
      const idx = addNode(chain, node);
      addEdge(chain, anchor, idx, 'caused');
      updateChainOutcome(chain, node.outcome);
    }
    recomputeOpen(chain, this.state);
  },

  _onMassline(payload) {
    const victimId = asString(payload.victimId);
    if (!victimId) return;
    this._onActOutcome({
      entityId: victimId,
      factionId: null,
      reason: asString(payload.cause) || 'massline_tumble',
      tick: payload.tick,
      t: payload.time,
    }, 'witnessed_only');
  },

  _onBountyCleared(payload) {
    const own = ensureState(this.state);
    const amount = asNumber(payload.amount, 0);
    for (const chain of own.chains) {
      if (chain.bountyPending !== true) continue;
      chain.bountyPending = false;
      const node = {
        k: 'consequence',
        t: nowTime(this.state),
        tick: nowTick(this.state),
        outcome: 'witnessed_only',
        text: amount > 0 ? `Bounty cleared (${Math.round(amount)} cr).` : 'Bounty cleared.',
        factionId: null,
        sectorId: asString(chain.sectorId) || currentSectorId(this.state),
        delta: null,
        newRep: null,
        newTier: null,
        tierChanged: false,
        reason: null,
        srcFaction: null,
        stationId: null,
        targetId: null,
        aceId: null,
        bodyId: null,
        lossId: null,
        incidentId: null,
        cause: null,
      };
      const anchor = latestConsequenceAnchor(chain);
      const idx = addNode(chain, node);
      addEdge(chain, anchor, idx, 'caused');
      recomputeOpen(chain, this.state);
    }
    recomputeAllOpen(own, this.state);
  },
};

function updateChainOutcome(chain, outcome) {
  const clean = sanitizeOutcome(outcome);
  if (!clean) return;
  chain.outcome = clean;
}
