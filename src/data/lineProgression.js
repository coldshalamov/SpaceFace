// THE WEIGHT — Line progression, provenance, and the Line-head catalog.
// Data only: systems decide the physical outcome; these rows name stable ids, marks,
// and the one behaviour each stamped history is allowed to change.

export const LINE_CLASSES = Object.freeze([
  Object.freeze({ index: 1, label: 'I', fullControlMassT: 20, unlockTonnageT: 0, hardware: Object.freeze({ winch: 'light_spool', cableWidth: 1, anchorPads: 1, cableColor: '#7bd7ff' }) }),
  Object.freeze({ index: 2, label: 'II', fullControlMassT: 100, unlockTonnageT: 2_000, hardware: Object.freeze({ winch: 'twin_spool', cableWidth: 1.15, anchorPads: 2, cableColor: '#78d8c8' }) }),
  Object.freeze({ index: 3, label: 'III', fullControlMassT: 400, unlockTonnageT: 15_000, hardware: Object.freeze({ winch: 'drum_winch', cableWidth: 1.3, anchorPads: 2, cableColor: '#9be47a' }) }),
  Object.freeze({ index: 4, label: 'IV', fullControlMassT: 2_000, unlockTonnageT: 80_000, hardware: Object.freeze({ winch: 'slate_rebuild', cableWidth: 1.5, anchorPads: 3, cableColor: '#e4cf72' }) }),
  Object.freeze({ index: 5, label: 'V', fullControlMassT: 10_000, unlockTonnageT: 400_000, hardware: Object.freeze({ winch: 'shepherd_drum', cableWidth: 1.75, anchorPads: 3, cableColor: '#f0a85e' }) }),
  Object.freeze({ index: 6, label: 'VI', fullControlMassT: 40_000, unlockTonnageT: 1_500_000, hardware: Object.freeze({ winch: 'holdfast_drum', cableWidth: 2, anchorPads: 4, cableColor: '#f0785f' }) }),
  Object.freeze({ index: 7, label: 'VII', fullControlMassT: 100_000, unlockTonnageT: 6_000_000, hardware: Object.freeze({ winch: 'measure_drum', cableWidth: 2.25, anchorPads: 4, cableColor: '#d678ff' }) }),
  // VIII is the authored end of the ladder: the Maw is the answer when a save asks what the Line can hold.
  // Keep it finite so comparisons, JSON saves and render shaders never see Infinity.
  Object.freeze({ index: 8, label: 'VIII', fullControlMassT: 1_000_000, unlockTonnageT: 10_000_000, hardware: Object.freeze({ winch: 'the_line', cableWidth: 2.5, anchorPads: 5, cableColor: '#ffffff' }) }),
]);

export const LINE_CLASS_BY_INDEX = Object.freeze(Object.fromEntries(
  LINE_CLASSES.map((row) => [row.index, row]),
));

export const PROVENANCE_TIERS = Object.freeze({
  stock: Object.freeze({ index: 0, label: 'Stock', mark: 'plain', behavior: null }),
  worked: Object.freeze({ index: 1, label: 'Worked', mark: 'copper', behavior: 'shop_tuned' }),
  named: Object.freeze({ index: 2, label: 'Named', mark: 'silver', behavior: 'maker_signature' }),
  storied: Object.freeze({ index: 3, label: 'Storied', mark: 'gold', behavior: 'history_acts' }),
  relic: Object.freeze({ index: 4, label: 'Relic', mark: 'pearl', behavior: 'rule_break' }),
  // Backordered is flavour/status layered over a real tier: the rim stays the tier's, while
  // orderText carries the original receipt. It is deliberately not tier 5/progression.
  backordered: Object.freeze({ index: -1, label: 'Backordered', mark: 'paper', behavior: 'remember_order' }),
});

// Head ids are stable sim stamps (`holder.data.lineHeadId`). `masslineHeadId` is only
// reused where the existing specialized-line owner already implements the same physical law.
export const LINE_HEADS = Object.freeze([
  Object.freeze({ id: 'head_standard', name: 'Standard Head', source: 'Tessera', rarityFloor: 'stock', behavior: 'standard', cableColor: '#7bd7ff', sentence: 'Latch, reel, swing and release.' }),
  Object.freeze({ id: 'head_coupler', name: 'Coupler Head', source: 'Meridian', rarityFloor: 'worked', behavior: 'train', cableColor: '#e8b45f', sentence: 'Chains held bodies into a train.' }),
  Object.freeze({ id: 'head_breaker', name: 'Breaker Head', source: 'Drift', rarityFloor: 'worked', behavior: 'split_on_slam', cableColor: '#d9d9d9', sentence: 'A slammed rock splits into throwable chunks.' }),
  Object.freeze({ id: 'head_barb', name: 'Barb Head', source: 'Reach', rarityFloor: 'worked', behavior: 'hook_ship', cableColor: '#f07f72', sentence: 'Hooks a light ship and drags it.' }),
  Object.freeze({ id: 'head_weld', name: 'Weld Head', source: 'Frontier', rarityFloor: 'worked', behavior: 'weld_on_touch', cableColor: '#ff9d5c', sentence: 'Sticks the held object where it touches.' }),
  Object.freeze({ id: 'head_hush', name: 'Hush Head', source: 'Quiet', rarityFloor: 'named', behavior: 'hide_mass', cableColor: '#8aa0a8', sentence: 'The held mass is hidden from scales.' }),
  Object.freeze({ id: 'head_override', name: 'Override Head', source: 'Vael', rarityFloor: 'named', behavior: 'fire_held_thrusters', cableColor: '#9fb7ff', sentence: 'Fires the thrusters of a held ship.' }),
  Object.freeze({ id: 'head_bell', name: 'Bell Head', source: 'Choir', rarityFloor: 'named', behavior: 'ring_on_slam', cableColor: '#d6b7ff', sentence: 'Slams ring and shatter nearby crystal.' }),
  Object.freeze({ id: 'head_spore', name: 'Spore Head', source: 'Understory', rarityFloor: 'named', behavior: 'sticky_rot', cableColor: '#8bd27a', sentence: 'Grows a sticky rot-skin on the held object.' }),
  Object.freeze({ id: 'head_index', name: 'Index Head', source: 'Archive', rarityFloor: 'storied', behavior: 'scan_provenance', cableColor: '#ffd36e', sentence: 'Scanning while holding reveals full provenance.' }),
  Object.freeze({ id: 'head_evidence_clamp', name: 'Evidence Clamp', source: 'Concord', rarityFloor: 'storied', behavior: 'staple_pair', cableColor: '#7ba9ff', sentence: 'Staples two objects together.' }),
  Object.freeze({ id: 'head_magnet', name: 'Magnet Head', source: 'Pitborn', rarityFloor: 'storied', behavior: 'accrete_junk', cableColor: '#f0a14f', sentence: 'Pulls nearby junk onto the held object.' }),
  Object.freeze({ id: 'head_seal', name: 'Seal Head', source: 'Helix', rarityFloor: 'relic', behavior: 'lawful_mark', cableColor: '#ff6ea8', sentence: 'Sticks a Directorate fine on an enemy; lawful ships hunt it.' }),
  Object.freeze({ id: 'head_multi_latch', name: 'Multi-latch Head', source: 'Verge', rarityFloor: 'relic', behavior: 'two_lines', masslineHeadId: 'twin_bridle', cableColor: '#ffffff', sentence: 'Two lines at once.' }),
  // Arsenal §7.3: Quantum Sympathy retires into this Relic head. It is intentionally not
  // a fifteenth shop verb: same outcome, different ownership.
  Object.freeze({ id: 'head_sympathy', name: 'Sympathy Head', source: 'Verge', rarityFloor: 'relic', behavior: 'share_momentum', cableColor: '#c9f7ff', sentence: 'Linked bodies share momentum.' }),
]);

export const LINE_HEAD_BY_ID = Object.freeze(Object.fromEntries(
  LINE_HEADS.map((head) => [head.id, head]),
));

const HEAD_PRICES = Object.freeze({
  head_standard: 0, head_coupler: 14_000, head_breaker: 16_000, head_barb: 18_000,
  head_weld: 20_000, head_hush: 28_000, head_override: 32_000, head_bell: 30_000,
  head_spore: 26_000, head_index: 46_000, head_evidence_clamp: 52_000,
  head_magnet: 58_000, head_seal: 92_000, head_multi_latch: 120_000, head_sympathy: 0,
});

const HEAD_TIERS = Object.freeze({ stock: 1, worked: 2, named: 3, storied: 4, relic: 5 });

export const LINE_HEAD_MODULES = Object.freeze(LINE_HEADS.map((head) => Object.freeze({
  id: `mod_line_${head.id}`,
  name: head.name,
  slotType: 'utility',
  size: 'M',
  tier: HEAD_TIERS[head.rarityFloor] || 1,
  mass: head.rarityFloor === 'relic' ? 8 : 5,
  price: HEAD_PRICES[head.id] || 0,
  energyDraw: head.rarityFloor === 'relic' ? 8 : 4,
  purchasable: head.id !== 'head_sympathy' && (HEAD_PRICES[head.id] || 0) > 0,
  rarityFloor: head.rarityFloor,
  mods: {
    lineHeadId: head.id,
    ...(head.masslineHeadId ? { masslineHeadId: head.masslineHeadId } : {}),
  },
  visuals: { glow: head.cableColor },
  sentence: head.sentence,
})));

export function lineHeadDef(headId) {
  return LINE_HEAD_BY_ID[headId] || null;
}

function provenanceTier(tier) {
  const key = typeof tier === 'string' ? tier.toLowerCase() : 'stock';
  return PROVENANCE_TIERS[key] || null;
}

function provenanceTierKey(tier) {
  return Object.keys(PROVENANCE_TIERS).find((key) => PROVENANCE_TIERS[key] === tier) || 'stock';
}

/** Normalize the stamped history on ONE owned module instance. Stock stays absent/plain;
 * non-stock returns a bounded object with the rim mark and at most one behaviour hook. */
export function normalizeModuleProvenance(instance, def = null) {
  const raw = instance && typeof instance === 'object' ? instance.provenance : null;
  const fallbackTier = def && typeof def.rarityFloor === 'string' ? def.rarityFloor : 'stock';
  const requested = raw && (raw.tier || raw.rarity);
  const backordered = requested === 'backordered' || raw?.backordered === true
    || (typeof raw?.orderText === 'string' && !!raw.orderText.trim());
  const tier = requested === 'backordered'
    ? provenanceTier(raw?.behindTier) || provenanceTier(raw?.rarity) || provenanceTier(fallbackTier)
    : provenanceTier(requested) || provenanceTier(fallbackTier);
  if (!tier || tier.index === 0) return null;
  const out = {
    tier: provenanceTierKey(tier),
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : tier.label,
    mark: tier.mark,
    source: typeof raw?.source === 'string' && raw.source.trim() ? raw.source.trim() : 'recorded',
  };
  if (typeof raw?.maker === 'string' && raw.maker.trim()) out.maker = raw.maker.trim();
  if (typeof raw?.deed === 'string' && raw.deed.trim()) out.deed = raw.deed.trim();
  if (backordered) {
    out.backordered = true;
    out.orderText = typeof raw?.orderText === 'string' && raw.orderText.trim()
      ? raw.orderText.trim()
      : 'BACKORDERED';
  }
  return out;
}

/** Behaviour payload attached to derived ship data. Never stats: only flags/counts/readable ids. */
export function lineHeadBehavior(headId, provenance = null) {
  const head = lineHeadDef(headId);
  if (!head) return null;
  const requested = provenance && (provenance.tier || provenance.rarity);
  const tier = requested === 'backordered'
    ? provenanceTier(provenance.behindTier) || provenanceTier(head.rarityFloor)
    : provenanceTier(requested) || provenanceTier(head.rarityFloor);
  const tierIndex = tier ? tier.index : 0;
  const behavior = {
    kind: head.behavior,
    headId: head.id,
    tier: tier ? Object.keys(PROVENANCE_TIERS).find((key) => PROVENANCE_TIERS[key] === tier) : 'stock',
    mark: tier ? tier.mark : 'plain',
    cableColor: head.cableColor,
    label: provenance?.label || head.name,
  };
  if (head.id === 'head_breaker') behavior.chunkCount = tierIndex >= 1 ? 4 : 3;
  if (head.id === 'head_barb' && tierIndex >= 3) behavior.panicWingmen = true;
  if (head.id === 'head_index' && tierIndex >= 3) behavior.fullProvenance = true;
  if (head.id === 'head_evidence_clamp') behavior.stapleTimeS = tierIndex >= 1 ? 1.4 : 2.0;
  if (head.id === 'head_magnet') behavior.accretionRadius = tierIndex >= 3 ? 220 : 160;
  if (head.id === 'head_multi_latch') behavior.maxLines = 2;
  if (head.id === 'head_sympathy') behavior.shareMomentum = true;
  if (provenance?.backordered) behavior.orderText = provenance.orderText;
  return behavior;
}

export function lineClassForTonnage(tonnageLoggedT, grantedSteps = 0) {
  const tonnes = Math.max(0, Number(tonnageLoggedT) || 0);
  let index = 1;
  for (const row of LINE_CLASSES) {
    if (Number.isFinite(row.unlockTonnageT) && tonnes >= row.unlockTonnageT) index = row.index;
  }
  return Math.min(LINE_CLASSES.length, Math.max(index, 1 + Math.max(0, Math.trunc(Number(grantedSteps) || 0))));
}

export function lineClassForIndex(index) {
  return LINE_CLASS_BY_INDEX[Math.min(LINE_CLASSES.length, Math.max(1, Math.trunc(Number(index) || 1)))] || LINE_CLASSES[0];
}

export function defaultLineProgression() {
  return {
    schemaVersion: 1,
    tonnageLoggedT: 0,
    highestHeldMassT: 0,
    classIndex: 1,
    grantedClassSteps: 0,
    trialClassSteps: 0,
    recordStamps: [],
    stamps: {},
    winchHeat: 0,
  };
}

export function normalizeLineProgression(raw) {
  const base = defaultLineProgression();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.schemaVersion = 1;
  out.tonnageLoggedT = Math.max(0, Number(raw.tonnageLoggedT) || 0);
  out.highestHeldMassT = Math.max(0, Number(raw.highestHeldMassT) || 0);
  out.grantedClassSteps = Math.max(0, Math.trunc(Number(raw.grantedClassSteps) || 0));
  out.trialClassSteps = Math.max(0, Math.trunc(Number(raw.trialClassSteps) || 0));
  out.recordStamps = Array.isArray(raw.recordStamps) ? raw.recordStamps.slice(-32) : [];
  out.stamps = raw.stamps && typeof raw.stamps === 'object' && !Array.isArray(raw.stamps) ? { ...raw.stamps } : {};
  out.winchHeat = Math.max(0, Math.min(1, Number(raw.winchHeat) || 0));
  out.classIndex = lineClassForTonnage(out.tonnageLoggedT, out.grantedClassSteps + out.trialClassSteps);
  return out;
}

export function stampLineRecord(progress, kind, text, atS, detail = null) {
  const p = progress || (progress = defaultLineProgression());
  const key = `${kind}:${text}`;
  if (p.stamps[key]) return null;
  const stamp = { kind, text, atS: Math.max(0, Number(atS) || 0), ...(detail ? { detail } : {}) };
  p.stamps[key] = stamp;
  p.recordStamps.push(stamp);
  if (p.recordStamps.length > 32) p.recordStamps.shift();
  return stamp;
}

// §33 row 489 meta progression between runs. These are unlock records, not stat boosts.
export const LINE_META_UNLOCKS = Object.freeze([
  Object.freeze({ id: 'line_head_coupler', headId: 'head_coupler', kind: 'head', earn: Object.freeze({ kind: 'waves_cleared', min: 5 }), grants: Object.freeze({ heads: ['head_coupler'], startingRating: 150 }) }),
  Object.freeze({ id: 'line_head_barb', headId: 'head_barb', kind: 'head', earn: Object.freeze({ kind: 'waves_cleared', min: 8 }), grants: Object.freeze({ heads: ['head_barb'], arenas: ['reach_hook_pit'] }) }),
  Object.freeze({ id: 'line_head_breaker', headId: 'head_breaker', kind: 'head', earn: Object.freeze({ kind: 'waves_cleared', min: 10 }), grants: Object.freeze({ heads: ['head_breaker'], startingRating: 250 }) }),
  Object.freeze({ id: 'line_head_magnet', headId: 'head_magnet', kind: 'head', earn: Object.freeze({ kind: 'cull_purse', min: 4000 }), grants: Object.freeze({ heads: ['head_magnet'], arenas: ['pitborn_scrapyard'] }) }),
  Object.freeze({ id: 'line_head_multi_latch', headId: 'head_multi_latch', kind: 'head', earn: Object.freeze({ kind: 'authored_victory' }), grants: Object.freeze({ heads: ['head_multi_latch'], startingRating: 400 }) }),
]);

export const LINE_META_UNLOCK_BY_ID = Object.freeze(Object.fromEntries(
  LINE_META_UNLOCKS.map((row) => [row.id, row]),
));

export function lineMetaUnlocksForRun(run = {}) {
  const waves = Math.max(0, Math.trunc(Number(run.wavesCleared ?? run.deepestWave) || 0));
  const purse = Math.max(0, Number(run.cullPurse ?? run.purse) || 0);
  const victory = run.authoredVictory === true || run.victory === true;
  return LINE_META_UNLOCKS.filter((row) => {
    const earn = row.earn || {};
    if (earn.kind === 'waves_cleared') return waves >= (earn.min || 0);
    if (earn.kind === 'cull_purse') return purse >= (earn.min || 0);
    if (earn.kind === 'authored_victory') return victory;
    return false;
  });
}
