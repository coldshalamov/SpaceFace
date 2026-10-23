// Import-boundary-pure registration metadata for the local collector. The feature's default
// route requires both browser and node factory tables, the authoritative manifest, and save.
// Keeping these arrays pure lets the manifest use them without importing render or the sim.
export const INDUSTRIAL_DISASTERS_REGISTRATION = Object.freeze({
  id: 'industrialDisasters', clock: 'table', nodeSafe: true,
  initAfter: 'asteroidSites', updateAfter: 'tetherGameplay',
  factoryExport: 'industrialDisasters', factoryPath: 'src/features/industrialDisasters/runtime.js',
  encounterPath: 'src/data/encounters/8205-pro-industrial-disasters.js',
  saveKey: 'industrialDisasters', saveAdapterPath: 'src/features/industrialDisasters/saveAdapter.js',
  presentationPath: 'src/features/industrialDisasters/presentationAdapter.js',
  presentationExport: 'createIndustrialDisastersPresentation',
  statusEvent: 'industrialDisasters:status', poseEvent: 'industrialDisasters:poses',
});

/** Idempotent insertion for authoritative init/update/clock lists, not a new registry. */
export function withIndustrialDisasters(ids, phase = 'init') {
  if (!Array.isArray(ids)) throw new TypeError('Expected authoritative system ID array');
  if (!['init', 'update', 'clock'].includes(phase)) throw new TypeError('Expected init, update or clock phase');
  if (ids.includes(INDUSTRIAL_DISASTERS_REGISTRATION.id)) return ids.slice();
  const after = phase === 'update' || phase === 'clock' ? INDUSTRIAL_DISASTERS_REGISTRATION.updateAfter
    : INDUSTRIAL_DISASTERS_REGISTRATION.initAfter;
  const index = ids.indexOf(after);
  if (index < 0) throw new Error(`Industrial disaster registration requires ${after}`);
  return [...ids.slice(0, index + 1), INDUSTRIAL_DISASTERS_REGISTRATION.id, ...ids.slice(index + 1)];
}

/** Add to both existing lookup-table entry arrays. Runtime instances remain host-owned. */
export function industrialDisastersFactoryEntry(definition) {
  if (definition?.name !== INDUSTRIAL_DISASTERS_REGISTRATION.id || typeof definition.update !== 'function') {
    throw new TypeError('Expected the industrialDisasters system definition');
  }
  return [INDUSTRIAL_DISASTERS_REGISTRATION.id, definition];
}
