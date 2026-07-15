import { createHash } from 'node:crypto';

const MIN_ACCEPTANCE_RUNS = 1000;

export function buildStationAcquisitionIndex({
  commodities = [],
  modules = [],
  weapons = [],
  ships = [],
  blueprints = [],
} = {}) {
  const surfaces = new Map();
  const add = (id, surface) => {
    if (!id) return;
    if (!surfaces.has(id)) surfaces.set(id, []);
    surfaces.get(id).push(surface);
  };

  for (const item of commodities) add(item && item.id, 'market');
  for (const item of modules) if (Number(item && item.price) > 0) add(item.id, 'outfitting');
  for (const item of weapons) if (Number(item && item.price) > 0) add(item.id, 'outfitting');
  for (const ship of ships) add(ship && ship.id, 'shipyard');
  for (const blueprint of blueprints) {
    const surface = `manufacture:${blueprint && blueprint.id || '<unknown>'}`;
    for (const id of acquisitionOutputIds(blueprint && blueprint.outputs)) add(id, surface);
  }
  for (const [id, rows] of surfaces) surfaces.set(id, [...new Set(rows)].sort());
  return surfaces;
}

export function runDepthProgramLootAudit({
  runs = MIN_ACCEPTANCE_RUNS,
  seedStart = 1,
  manifest,
  declaredWrecks = [],
  enemyTypes = [],
  normalLootTables = {},
  combatRollLoot,
  makeCombatRng,
  catalogs = {},
} = {}) {
  const issues = [];
  const runCount = Number.isInteger(runs) ? runs : 0;
  const firstSeed = Number.isInteger(seedStart) ? seedStart : 1;
  if (runCount < MIN_ACCEPTANCE_RUNS) {
    issues.push(issue('audit.run-count', 'runs', `Acceptance requires at least ${MIN_ACCEPTANCE_RUNS} seeded runs; received ${runs}.`));
  }
  if (!manifest || !Array.isArray(manifest.wrecks)) {
    issues.push(issue('audit.manifest', 'manifest.wrecks', 'A unique-loot reservation manifest is required.'));
  }
  if (typeof combatRollLoot !== 'function') {
    issues.push(issue('audit.live-roller', 'combatRollLoot', 'The live combat.rollLoot function is required.'));
  }
  if (typeof makeCombatRng !== 'function') {
    issues.push(issue('audit.live-rng', 'makeCombatRng', 'The production combat RNG factory is required.'));
  }

  const { rows: reservedRows, byId: reservedById } = flattenUniqueDrops(
    manifest && manifest.wrecks || [],
    'reserved',
    issues,
  );
  if (!Array.isArray(declaredWrecks) || !declaredWrecks.length) {
    issues.push(issue('audit.declared-wrecks', 'declaredWrecks', 'The live unique-wreck registry is required.'));
  }
  const { rows: declaredRows, byId: declaredById } = flattenUniqueDrops(
    Array.isArray(declaredWrecks) ? declaredWrecks : [],
    'declared',
    issues,
  );
  for (const row of declaredRows) {
    const reserved = reservedById.get(row.id);
    if (!reserved) {
      issues.push(issue('audit.unique-declared-unreserved', row.id, `Live declaration in ${row.wreckId} is absent from the reservation manifest.`));
      continue;
    }
    if (reserved.wreckId !== row.wreckId
      || normalizedUniqueKind(reserved.kind) !== normalizedUniqueKind(row.kind)
      || (reserved.baseId || null) !== (row.baseId || null)) {
      issues.push(issue('audit.unique-declaration-drift', row.id, `Manifest reservation does not match the live ${row.wreckId} declaration.`));
    }
  }
  for (const row of reservedRows) {
    if (!declaredById.has(row.id)) {
      issues.push(issue('audit.unique-reserved-undeclared', row.id, `Manifest reservation in ${row.wreckId} has no live declaration.`));
    }
  }
  const uniqueIds = new Set([...reservedById.keys(), ...declaredById.keys()]);
  const authoritativeRows = declaredRows.length ? declaredRows : reservedRows;

  const modules = catalogs.modules || [];
  const weapons = catalogs.weapons || [];
  const equipmentById = new Map([...modules, ...weapons].map((entry) => [entry.id, entry]));
  for (const row of authoritativeRows) {
    const equipment = equipmentById.get(row.id);
    if (isStoryKind(row.kind)) {
      if (equipment) issues.push(issue('audit.story-catalogued', row.id, 'Story-only unique loot must not appear in an equipment catalog.'));
      continue;
    }
    if (!equipment) {
      issues.push(issue('audit.unique-missing', row.id, `Reserved ${row.kind} is absent from the live equipment catalogs.`));
      continue;
    }
    if (equipment.unique !== true || equipment.purchasable !== false || equipment.salvageOnly !== true || Number(equipment.price) !== 0) {
      issues.push(issue(
        'audit.unique-flags',
        row.id,
        'Unique equipment must set unique:true, purchasable:false, salvageOnly:true, and price:0.',
      ));
    }
  }
  for (const equipment of equipmentById.values()) {
    if (equipment && equipment.unique === true && !uniqueIds.has(equipment.id)) {
      issues.push(issue('audit.unique-unreserved', equipment.id, 'Live unique equipment has no wreck reservation.'));
    }
  }

  const acquisitionIndex = buildStationAcquisitionIndex(catalogs);
  const stationAcquisitionHits = [];
  for (const id of uniqueIds) {
    const surfaces = acquisitionIndex.get(id) || [];
    if (!surfaces.length) continue;
    stationAcquisitionHits.push({ id, surfaces });
    issues.push(issue('audit.unique-purchasable', id, `Unique loot appears on station acquisition surfaces: ${surfaces.join(', ')}.`));
  }
  stationAcquisitionHits.sort((a, b) => a.id.localeCompare(b.id));

  const normalSourceRows = [];
  const normalTableIndex = normalizeLootTableIndex(normalLootTables);
  const referencedNormalTableIds = new Set();
  const normalSourceIds = new Set();
  let enumeratedNormalItems = 0;
  for (const enemy of enemyTypes) {
    if (!enemy || !enemy.id) continue;
    if (normalSourceIds.has(enemy.id)) {
      issues.push(issue('audit.normal-source-duplicate', enemy.id, 'Normal loot source ids must be unique.'));
      continue;
    }
    const tableRef = typeof enemy.lootTableId === 'string' ? enemy.lootTableId : null;
    if (tableRef) referencedNormalTableIds.add(tableRef);
    const loot = enemy.loot || tableRef && normalTableIndex.get(tableRef);
    if (!loot) {
      if (tableRef) issues.push(issue('audit.loot-alias-unresolved', `${enemy.id}.${tableRef}`, 'Normal loot table alias could not be resolved.'));
      continue;
    }
    normalSourceIds.add(enemy.id);
    const enumerated = enumerateLootItems(loot, {
      sourceId: enemy.id,
      tableIndex: normalTableIndex,
      rootIsAlias: !enemy.loot,
      issues,
    });
    for (const ref of enumerated.references) referencedNormalTableIds.add(ref);
    enumeratedNormalItems += enumerated.items.length;
    for (const row of enumerated.items) {
      if (uniqueIds.has(row.id)) {
        issues.push(issue('audit.unique-normal-table', `${enemy.id}.${row.path}.${row.id}`, 'Declared unique loot appears in a normal combat loot table.'));
      }
    }
    if (!enumerated.rollable) {
      issues.push(issue(
        'audit.normal-table-not-rollable',
        enemy.id,
        'Nested or aliased item definitions are statically enumerated but are not exercised by combat.rollLoot; acceptance fails closed.',
      ));
    }
    normalSourceRows.push({ ...enemy, loot, _auditRollable: enumerated.rollable });
  }
  for (const [tableId, table] of [...normalTableIndex.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (referencedNormalTableIds.has(tableId)) continue;
    const enumerated = enumerateLootItems(table, {
      sourceId: `lootTable:${tableId}`,
      tableIndex: normalTableIndex,
      rootIsAlias: true,
      issues,
    });
    enumeratedNormalItems += enumerated.items.length;
    for (const row of enumerated.items) {
      if (uniqueIds.has(row.id)) {
        issues.push(issue('audit.unique-normal-table', `lootTable:${tableId}.${row.path}.${row.id}`, 'Declared unique loot appears in an unreferenced normal combat loot table.'));
      }
    }
    issues.push(issue('audit.normal-table-unreferenced', tableId, 'Declared normal loot tables must be reachable from a live source.'));
  }
  normalSourceRows.sort((a, b) => a.id.localeCompare(b.id));
  if (!normalSourceRows.length) {
    issues.push(issue('audit.normal-sources', 'enemyTypes', 'No live normal combat loot tables were found.'));
  }
  const rollableSourceRows = normalSourceRows.filter((row) => row._auditRollable);

  const hitCounts = new Map();
  const uniqueNormalLootHits = [];
  const rollHash = createHash('sha256');
  let normalLootRolls = 0;
  let normalItemDrops = 0;
  if (runCount > 0 && typeof combatRollLoot === 'function' && typeof makeCombatRng === 'function') {
    for (let offset = 0; offset < runCount; offset += 1) {
      const seed = firstSeed + offset;
      for (const enemy of rollableSourceRows) {
        const rng = makeCombatRng(seed, enemy.id);
        const rolled = combatRollLoot.call({ rng }, enemy.loot);
        normalLootRolls += 1;
        validateRoll({ enemy, rolled, seed, issues });
        const items = Array.isArray(rolled && rolled.items) ? rolled.items : [];
        normalItemDrops += items.length;
        for (const item of items) {
          const key = `${enemy.id}:${item.id}`;
          hitCounts.set(key, (hitCounts.get(key) || 0) + 1);
          if (uniqueIds.has(item.id)) uniqueNormalLootHits.push({ seed, enemyId: enemy.id, itemId: item.id });
        }
        rollHash.update(rollSignature(seed, enemy.id, rolled));
      }
    }
  }
  if (uniqueNormalLootHits.length) {
    issues.push(issue(
      'audit.unique-normal-hit',
      'seededRuns',
      `${uniqueNormalLootHits.length} reserved unique item drops appeared in normal combat rolls.`,
    ));
  }

  const normalDropRates = [];
  for (const enemy of rollableSourceRows) {
    for (const drop of enemy.loot.drops || []) {
      const hits = hitCounts.get(`${enemy.id}:${drop.id}`) || 0;
      normalDropRates.push({
        enemyId: enemy.id,
        itemId: drop.id,
        authoredChance: Number(drop.chance) || 0,
        hits,
        observedRate: runCount > 0 ? hits / runCount : 0,
      });
      if (runCount >= MIN_ACCEPTANCE_RUNS && Number(drop.chance) > 0 && hits === 0) {
        issues.push(issue('audit.normal-drop-unobserved', `${enemy.id}.${drop.id}`, 'A non-zero normal drop never appeared in the seeded acceptance sample.'));
      }
    }
  }
  normalDropRates.sort((a, b) => a.observedRate - b.observedRate || a.enemyId.localeCompare(b.enemyId) || a.itemId.localeCompare(b.itemId));

  const equipmentUniqueDrops = authoritativeRows.filter((row) => !isStoryKind(row.kind)).length;
  const storyUniqueDrops = authoritativeRows.length - equipmentUniqueDrops;
  const stationAcquisitionItems = acquisitionIndex.size;
  const stationAcquisitionSurfaces = [...acquisitionIndex.values()].reduce((sum, surfaces) => sum + surfaces.length, 0);
  const definitionHash = hashStable({
    declared: declarationReceipt(declaredRows),
    reserved: declarationReceipt(reservedRows),
    normalSources: normalSourceRows.map((row) => ({ id: row.id, loot: row.loot })),
    normalTables: [...normalTableIndex.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, table]) => ({ id, table })),
    stationAcquisition: [...acquisitionIndex.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, surfaces]) => ({ id, surfaces })),
  });
  const rollHashHex = rollHash.digest('hex');
  return {
    schema: 'spaceface.depth-program.loot-audit.v2',
    ok: issues.length === 0,
    runs: runCount,
    seedStart: firstSeed,
    normalLootSources: normalSourceRows.length,
    rollableNormalLootSources: rollableSourceRows.length,
    enumeratedNormalItems,
    normalLootRolls,
    normalItemDrops,
    reservedUniqueDrops: reservedRows.length,
    declaredUniqueDrops: declaredRows.length,
    equipmentUniqueDrops,
    storyUniqueDrops,
    stationAcquisitionItems,
    stationAcquisitionSurfaces,
    uniqueNormalLootHits: uniqueNormalLootHits.length,
    stationAcquisitionHits,
    definitionHash,
    rollHash: rollHashHex,
    rarestNormalDrops: normalDropRates.slice(0, 6),
    issues,
  };
}

export function formatLootAuditSummary(report) {
  const status = report && report.ok ? 'OK' : 'FAILED';
  const stationHits = report && Array.isArray(report.stationAcquisitionHits) ? report.stationAcquisitionHits.length : 0;
  return [
    `Depth Program loot audit ${status}: ${report.runs} seeds x ${report.rollableNormalLootSources} rollable live combat tables = ${report.normalLootRolls} rolls; ${report.enumeratedNormalItems} item definitions enumerated.`,
    `${report.declaredUniqueDrops} live-declared / ${report.reservedUniqueDrops} reserved uniques (${report.equipmentUniqueDrops} equipment, ${report.storyUniqueDrops} story); ${report.uniqueNormalLootHits} normal-loot hits; ${stationHits} station acquisition hits.`,
    `${report.stationAcquisitionItems} station-acquirable item ids across ${report.stationAcquisitionSurfaces} surfaces.`,
    `definitionHash:${report.definitionHash}`,
    `rollHash:${report.rollHash}`,
  ].join('\n');
}

function acquisitionOutputIds(value, out = [], seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) acquisitionOutputIds(entry, out, seen);
    return out;
  }
  if (typeof value.id === 'string' && value.id) out.push(value.id);
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'id') acquisitionOutputIds(child, out, seen);
  }
  return out;
}

function flattenUniqueDrops(wrecks, source, issues) {
  const rows = [];
  const byId = new Map();
  for (const wreck of wrecks) {
    for (const drop of wreck && wreck.uniqueDrops || []) {
      if (!drop || !drop.id) {
        issues.push(issue('audit.unique-id', wreck && wreck.id || '<unknown>', `Every ${source} unique drop needs an id.`));
        continue;
      }
      if (byId.has(drop.id)) {
        issues.push(issue(`audit.unique-${source}-duplicate`, drop.id, `Listed by both ${byId.get(drop.id).wreckId} and ${wreck.id}.`));
        continue;
      }
      const row = { ...drop, wreckId: wreck.id };
      rows.push(row);
      byId.set(drop.id, row);
    }
  }
  return { rows, byId };
}

function normalizedUniqueKind(kind) {
  return String(kind || '').startsWith('story') ? 'story' : String(kind || '');
}

function isStoryKind(kind) {
  return normalizedUniqueKind(kind) === 'story';
}

function normalizeLootTableIndex(tables) {
  if (tables instanceof Map) return new Map(tables);
  const index = new Map();
  if (Array.isArray(tables)) {
    for (const row of tables) if (row && row.id) index.set(row.id, row.loot || row.table || row);
    return index;
  }
  if (tables && typeof tables === 'object') {
    for (const [id, table] of Object.entries(tables)) index.set(id, table);
  }
  return index;
}

function enumerateLootItems(loot, { sourceId, tableIndex, rootIsAlias, issues }) {
  const items = [];
  const references = new Set();
  const seen = new WeakSet();
  const resolvingAliases = new Set();
  let rollable = !rootIsAlias;
  const aliasKeys = new Set(['lootTableId', 'tableId', 'dropTableId', 'poolId', 'alias']);
  const directRow = /^loot\.(?:guaranteed|drops)\[\d+\]$/;
  const itemRow = /(?:guaranteed|drops|entries|items|choices|rewards)\[\d+\]$/;

  for (const group of ['guaranteed', 'drops']) {
    const rows = loot && loot[group];
    if (rows != null && !Array.isArray(rows)) {
      rollable = false;
      issues.push(issue('audit.normal-table-shape', `${sourceId}.loot.${group}`, `${group} must be an array.`));
      continue;
    }
    for (let index = 0; index < (rows || []).length; index += 1) {
      const row = rows[index];
      if (!row || typeof row.id !== 'string' || !row.id) {
        rollable = false;
        issues.push(issue('audit.normal-item-id', `${sourceId}.loot.${group}[${index}]`, 'A flat combat-roll item row requires an id.'));
      }
    }
  }

  const visit = (value, path) => {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) visit(value[index], `${path}[${index}]`);
      return;
    }

    const candidateId = typeof value.itemId === 'string' ? value.itemId
      : typeof value.dropId === 'string' ? value.dropId
        : typeof value.item === 'string' ? value.item
          : itemRow.test(path) && typeof value.id === 'string' ? value.id
            : null;
    if (candidateId) {
      const direct = directRow.test(path);
      items.push({ id: candidateId, path, direct });
      if (!direct) rollable = false;
    }

    for (const [key, ref] of Object.entries(value)) {
      if (!aliasKeys.has(key) || typeof ref !== 'string' || !ref) continue;
      rollable = false;
      references.add(ref);
      const table = tableIndex.get(ref);
      if (!table) {
        issues.push(issue('audit.loot-alias-unresolved', `${sourceId}.${path}.${key}`, `Normal loot alias ${ref} could not be resolved.`));
        continue;
      }
      if (resolvingAliases.has(ref)) {
        issues.push(issue('audit.loot-alias-cycle', `${sourceId}.${ref}`, 'Normal loot aliases must not form a cycle.'));
        continue;
      }
      resolvingAliases.add(ref);
      visit(table, `${path}.${key}(${ref})`);
      resolvingAliases.delete(ref);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!aliasKeys.has(key)) visit(child, `${path}.${key}`);
    }
  };

  visit(loot, 'loot');
  return { items, references, rollable };
}

function declarationReceipt(rows) {
  return rows.map((row) => ({
    id: row.id,
    wreckId: row.wreckId,
    kind: normalizedUniqueKind(row.kind),
    baseId: row.baseId || null,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function hashStable(value) {
  return createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function canonicalValue(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '<cycle>';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry, seen));
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (typeof child !== 'undefined' && typeof child !== 'function' && typeof child !== 'symbol') {
      out[key] = canonicalValue(child, seen);
    }
  }
  return out;
}

function validateRoll({ enemy, rolled, seed, issues }) {
  if (!rolled || !Number.isFinite(rolled.credits) || !Array.isArray(rolled.items)) {
    issues.push(issue('audit.roll-shape', `${enemy.id}@${seed}`, 'combat.rollLoot returned an invalid result.'));
    return;
  }
  const [creditLo = 0, creditHi = 0] = enemy.loot.creditsRange || [];
  if (rolled.credits < creditLo || rolled.credits > creditHi) {
    issues.push(issue('audit.credit-range', `${enemy.id}@${seed}`, `Credits ${rolled.credits} fall outside [${creditLo}, ${creditHi}].`));
  }
  const allowed = new Map([...enemy.loot.guaranteed || [], ...enemy.loot.drops || []].map((row) => [row.id, row]));
  for (const item of rolled.items) {
    const source = allowed.get(item && item.id);
    if (!source) {
      issues.push(issue('audit.roll-item', `${enemy.id}@${seed}`, `combat.rollLoot produced undeclared item ${item && item.id || '<none>'}.`));
      continue;
    }
    const [qtyLo = 1, qtyHi = 1] = source.qtyRange || [];
    if (!Number.isInteger(item.qty) || item.qty < qtyLo || item.qty > qtyHi) {
      issues.push(issue('audit.qty-range', `${enemy.id}.${item.id}@${seed}`, `Quantity ${item.qty} falls outside [${qtyLo}, ${qtyHi}].`));
    }
  }
}

function rollSignature(seed, enemyId, rolled) {
  const items = (rolled && rolled.items || []).map((item) => `${item.id}:${item.qty}`).join(',');
  return `${seed}|${enemyId}|${rolled && rolled.credits}|${items}\n`;
}

function issue(code, path, message) {
  return { code, path, message };
}
