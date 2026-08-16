// Pure progression rules for Plan 46. Runtime systems supply canonical event payloads; this module
// only normalizes durable player state, reduces those payloads into quiet feat records, and answers
// visibility/respec/economy questions. It has no bus or Three.js dependency.

export const TECH_PROGRESSION_VERSION = 1;
export const TECH_BRANCH_IDS = Object.freeze(['kinesis', 'bond', 'industry', 'ghost']);

export const TECH_BRANCHES = Object.freeze([
  Object.freeze({ id: 'kinesis', label: 'Kinesis', color: '#ff6f66', fantasy: 'Turn momentum and gravity into weapons.' }),
  Object.freeze({ id: 'bond', label: 'Bond', color: '#7af7d0', fantasy: 'Make the Massline a relationship between bodies.' }),
  Object.freeze({ id: 'industry', label: 'Industry', color: '#ffb347', fantasy: 'Turn discovered matter into durable capacity.' }),
  Object.freeze({ id: 'ghost', label: 'Ghost', color: '#8fa8ff', fantasy: 'See first, choose the contact, leave no clean answer.' }),
]);

function feat(id, branch, label, counter, threshold) {
  return Object.freeze({ id, branch, label, counter, threshold });
}

// These are deliberately absent from the pre-unlock UI. Once all three records in a branch exist,
// its capstone appears and may explain what the tree noticed.
export const TECH_FEATS = Object.freeze([
  feat('feat_terrain_smashes', 'kinesis', 'Rockbreaker record', 'terrainSmashes', 3),
  feat('feat_well_collapses', 'kinesis', 'Wellhand record', 'wellCollapses', 2),
  feat('feat_chain_three', 'kinesis', 'Three-body chain', 'chainThree', 1),

  feat('feat_tether_kills', 'bond', 'Kills on the line', 'tetherKills', 3),
  feat('feat_capital_tow', 'bond', 'Capital hulk tow', 'capitalTows', 1),
  feat('feat_slingshot_deployments', 'bond', 'Clean slingshot releases', 'slingshots', 3),

  feat('feat_perfect_resonance', 'industry', 'Perfect crystal resonance', 'perfectResonance', 1),
  feat('feat_cores_cracked', 'industry', 'Bulk cores cracked', 'coresCracked', 3),
  feat('feat_raid_defended', 'industry', 'Working claim defended', 'raidsDefended', 1),

  feat('feat_scans_run', 'ghost', 'Productive scan record', 'scansRun', 12),
  feat('feat_ambushes_survived', 'ghost', 'Ambushes survived', 'ambushesSurvived', 2),
  feat('feat_ghost_discovered', 'ghost', 'Ghost ship resolved', 'ghostShipsDiscovered', 1),
]);

export const TECH_FEAT_BY_ID = new Map(TECH_FEATS.map((entry) => [entry.id, entry]));
export const TECH_EVENT_NAMES = Object.freeze([
  'entity:killed',
  'capital:resolved',
  'tether:cut',
  'mining:resonanceResolved',
  'asteroid:chunked',
  'claim:raidRepelled',
  'scan:completed',
  'encounter:resolved',
  'scanner:ghostRevealed',
]);

export const TECH_CAPSTONES = Object.freeze({
  kinesis: 'tech_flagship_command',
  bond: 'tech_fire_control',
  industry: 'tech_outpost_charter',
  ghost: 'tech_long_range_survey',
});

const RECEIPT_LIMIT = 96;

export function initialTechProgression() {
  return {
    schemaVersion: TECH_PROGRESSION_VERSION,
    counters: {},
    feats: {},
    receipts: [],
  };
}

export function normalizeTechProgression(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const counters = source.counters && typeof source.counters === 'object' && !Array.isArray(source.counters)
    ? source.counters : {};
  const feats = source.feats && typeof source.feats === 'object' && !Array.isArray(source.feats)
    ? source.feats : {};
  const out = initialTechProgression();
  for (const def of TECH_FEATS) {
    const value = Math.max(0, Math.trunc(Number(counters[def.counter]) || 0));
    if (value > 0) out.counters[def.counter] = Math.min(value, def.threshold);
    if (feats[def.id]) {
      const record = feats[def.id];
      out.feats[def.id] = record && typeof record === 'object'
        ? {
            atTick: Math.max(0, Math.trunc(Number(record.atTick) || 0)),
            sourceEvent: String(record.sourceEvent || 'legacy'),
          }
        : { atTick: 0, sourceEvent: 'legacy' };
      out.counters[def.counter] = def.threshold;
    }
  }
  out.receipts = Array.isArray(source.receipts)
    ? source.receipts.filter((entry) => typeof entry === 'string' && entry).slice(-RECEIPT_LIMIT)
    : [];
  return out;
}

export function featGateStatus(node, player) {
  const ids = Array.isArray(node && node.featGate) ? node.featGate : [];
  if (!ids.length) return { gated: false, revealed: true, feats: [] };
  const researched = new Set(Array.isArray(player && player.researchedNodes) ? player.researchedNodes : []);
  const progress = normalizeTechProgression(player && player.techProgression);
  const feats = ids.map((id) => ({
    ...(TECH_FEAT_BY_ID.get(id) || { id, label: id, branch: node.branch, threshold: 1 }),
    unlocked: !!progress.feats[id],
  }));
  return {
    gated: true,
    // Grandfather already-researched stable IDs: a pre-Plan-46 save never loses an owned unlock.
    revealed: researched.has(node.id) || feats.every((entry) => entry.unlocked),
    feats,
  };
}

export function techNodeVisible(node, player) {
  return featGateStatus(node, player).revealed;
}

export function branchFeatStatus(branch, player) {
  const progress = normalizeTechProgression(player && player.techProgression);
  const feats = TECH_FEATS.filter((entry) => entry.branch === branch).map((entry) => ({
    ...entry,
    count: Math.min(entry.threshold, Math.max(0, progress.counters[entry.counter] || 0)),
    unlocked: !!progress.feats[entry.id],
  }));
  return { branch, revealed: feats.length > 0 && feats.every((entry) => entry.unlocked), feats };
}

/** Reduce one canonical production event. A caller supplies playerId/tick and current tether target
 * because those are live owner facts, not facts the event payload is required to duplicate. */
export function reduceTechProgression(raw, eventName, payload = {}, context = {}) {
  const before = normalizeTechProgression(raw);
  const after = normalizeTechProgression(before);
  const increments = featIncrements(eventName, payload || {}, context || {});
  if (!increments.length) return { progression: before, changed: false, newlyUnlocked: [], newlyRevealedBranches: [] };
  const actionable = increments.filter((increment) => {
    const def = TECH_FEAT_BY_ID.get(increment.featId);
    return def && !after.feats[def.id];
  });
  if (!actionable.length) {
    return { progression: before, changed: false, newlyUnlocked: [], newlyRevealedBranches: [] };
  }

  const receipt = eventReceipt(eventName, payload || {}, context || {});
  if (receipt && after.receipts.includes(receipt)) {
    return { progression: before, changed: false, newlyUnlocked: [], newlyRevealedBranches: [] };
  }
  const branchWasRevealed = new Map(TECH_BRANCH_IDS.map((branch) => [branch, branchUnlocked(before, branch)]));
  const newlyUnlocked = [];
  for (const increment of actionable) {
    const def = TECH_FEAT_BY_ID.get(increment.featId);
    if (!def || after.feats[def.id]) continue;
    const next = Math.min(def.threshold, Math.max(0, after.counters[def.counter] || 0) + Math.max(1, increment.amount || 1));
    after.counters[def.counter] = next;
    if (next >= def.threshold) {
      after.feats[def.id] = {
        atTick: Math.max(0, Math.trunc(Number(context.tick) || 0)),
        sourceEvent: eventName,
      };
      newlyUnlocked.push(def.id);
    }
  }
  if (receipt) {
    after.receipts.push(receipt);
    if (after.receipts.length > RECEIPT_LIMIT) after.receipts.splice(0, after.receipts.length - RECEIPT_LIMIT);
  }
  const newlyRevealedBranches = TECH_BRANCH_IDS.filter((branch) => !branchWasRevealed.get(branch) && branchUnlocked(after, branch));
  return { progression: after, changed: true, newlyUnlocked, newlyRevealedBranches };
}

function branchUnlocked(progress, branch) {
  const ids = TECH_FEATS.filter((entry) => entry.branch === branch).map((entry) => entry.id);
  return ids.length > 0 && ids.every((id) => !!progress.feats[id]);
}

function featIncrements(eventName, payload, context) {
  const rows = [];
  const playerId = context.playerId;
  if (eventName === 'entity:killed' && payload.killerId === playerId) {
    const style = payload.presentation && payload.presentation.style || {};
    if (style.id === 'terrain_smash') rows.push({ featId: 'feat_terrain_smashes' });
    if (style.id === 'well_collapse') rows.push({ featId: 'feat_well_collapses' });
    if (style.id === 'chain' && Math.max(0, Number(style.chainDepth) || 0) >= 3) rows.push({ featId: 'feat_chain_three' });
    if (context.tetherTargetId != null && payload.id === context.tetherTargetId) rows.push({ featId: 'feat_tether_kills' });
  } else if (eventName === 'capital:resolved'
      && payload.outcome === 'towed'
      && (payload.actorId == null || payload.actorId === playerId)) {
    rows.push({ featId: 'feat_capital_tow' });
  } else if (eventName === 'tether:cut' && payload.slingshot === true) {
    rows.push({ featId: 'feat_slingshot_deployments' });
  } else if (eventName === 'mining:resonanceResolved'
      && (payload.grade === 'perfect' || payload.classification === 'perfect')
      && (payload.minerId == null || payload.minerId === playerId)) {
    rows.push({ featId: 'feat_perfect_resonance' });
  } else if (eventName === 'asteroid:chunked' && payload.bulkCore === true && payload.minerId === playerId) {
    rows.push({ featId: 'feat_cores_cracked' });
  } else if (eventName === 'claim:raidRepelled') {
    rows.push({ featId: 'feat_raid_defended' });
  } else if (eventName === 'scan:completed') {
    const found = payload.found && typeof payload.found === 'object' ? payload.found : {};
    const productive = Math.max(0, Number(payload.signalCount) || 0)
      + Math.max(0, Number(found.asteroids) || 0)
      + Math.max(0, Number(found.wrecks) || 0)
      + Math.max(0, Number(found.anomalies) || 0);
    if (productive > 0) rows.push({ featId: 'feat_scans_run' });
  } else if (eventName === 'encounter:resolved'
      && (payload.outcome === 'cleared' || payload.outcome === 'escaped')
      && isAmbushResolution(payload)) {
    rows.push({ featId: 'feat_ambushes_survived' });
  } else if (eventName === 'scanner:ghostRevealed') {
    rows.push({ featId: 'feat_ghost_discovered' });
  }
  return rows;
}

function isAmbushResolution(payload) {
  const identity = [payload.shape, payload.kind, payload.zoneId].filter(Boolean).join(' ').toLowerCase();
  return /ambush|snare|minefield_wake|ghost_on_the_bearing/.test(identity);
}

function eventReceipt(eventName, payload, context) {
  const tick = Math.max(0, Math.trunc(Number(context.tick) || 0));
  if (eventName === 'entity:killed' && payload.id != null) return `${eventName}:${payload.id}`;
  if (eventName === 'capital:resolved' && payload.entityId != null) return `${eventName}:${payload.entityId}:${payload.outcome || ''}`;
  if (eventName === 'asteroid:chunked' && payload.chunkId != null) return `${eventName}:${payload.chunkId}`;
  if (eventName === 'claim:raidRepelled' && payload.defenseId != null) return `${eventName}:${payload.defenseId}`;
  if (eventName === 'encounter:resolved' && payload.encounterId != null) return `${eventName}:${payload.encounterId}`;
  if (eventName === 'scanner:ghostRevealed' && payload.entityId != null) return `${eventName}:${payload.entityId}`;
  if (eventName === 'mining:resonanceResolved' && payload.asteroidId != null) {
    return `${eventName}:${payload.asteroidId}:${payload.cycleId ?? tick}`;
  }
  return `${eventName}:tick:${tick}`;
}

export const TECH_RESPEC_BASE_CR = 3500;
export const TECH_RESPEC_PER_NODE_CR = 1500;

export function techRespecPlan(researchedNodes, branch, nodes) {
  if (!TECH_BRANCH_IDS.includes(branch)) return { branch, removed: [], kept: Array.isArray(researchedNodes) ? researchedNodes.slice() : [], costCr: 0 };
  const researched = new Set(Array.isArray(researchedNodes) ? researchedNodes : []);
  const byId = new Map((nodes || []).map((node) => [node.id, node]));
  const removed = new Set((nodes || []).filter((node) => node.branch === branch && researched.has(node.id)).map((node) => node.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of researched) {
      if (removed.has(id)) continue;
      const node = byId.get(id);
      if (node && (node.prereqs || []).some((prereq) => removed.has(prereq))) {
        removed.add(id);
        changed = true;
      }
    }
  }
  const removedList = [...removed];
  return {
    branch,
    removed: removedList,
    kept: [...researched].filter((id) => !removed.has(id)),
    costCr: removedList.length ? TECH_RESPEC_BASE_CR + removedList.length * TECH_RESPEC_PER_NODE_CR : 0,
  };
}

// A concrete receipt mix based on the current positive-RP edges: styled hostile kills pay 3 RP at
// baseline; productive fitted scans pay 2; recon/salvage contracts pay 4-7. The audit proves both
// playstyles can buy one complete branch in the mid-game envelope, not two, and two by endgame.
export const TECH_RP_PLAYSTYLE_AUDIT = Object.freeze({
  combat: Object.freeze({ midgame: 246, endgame: 510, source: '72 baseline hostile kills + 6 five-RP field contracts' }),
  industry: Object.freeze({ midgame: 250, endgame: 520, source: '80 productive fitted scans + 18 five-RP field contracts' }),
});

export function techEconomyAudit(nodes) {
  const totals = Object.fromEntries(TECH_BRANCH_IDS.map((branch) => [
    branch,
    (nodes || []).filter((node) => node.branch === branch).reduce((sum, node) => sum + Math.max(0, Number(node.cost && node.cost.rp) || 0), 0),
  ]));
  const ordered = Object.values(totals).sort((a, b) => a - b);
  const cheapestTwo = (ordered[0] || 0) + (ordered[1] || 0);
  const mostExpensive = ordered.at(-1) || 0;
  return {
    branchTotals: totals,
    cheapestTwo,
    mostExpensive,
    playstyles: Object.fromEntries(Object.entries(TECH_RP_PLAYSTYLE_AUDIT).map(([id, budget]) => [id, {
      ...budget,
      midgameCapsOne: budget.midgame >= mostExpensive && budget.midgame < cheapestTwo,
      endgameCapsTwo: budget.endgame >= cheapestTwo,
    }])),
  };
}
