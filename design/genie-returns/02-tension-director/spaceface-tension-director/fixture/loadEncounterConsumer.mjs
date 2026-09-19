/** Test-only isolation loader for the ACTUAL delivered campaign consumer source.
 * Unrelated catalog/engine imports are explicit doubles; the controller, selection,
 * accrual, session rhythm, and admission-gate functions themselves are not copied.
 * This is focused consumer evidence, NOT a production-world playthrough.
 */
import vm from 'node:vm';
import fs from 'node:fs/promises';
import * as policy from '../repo/src/ai/tensionPolicy.js';

export async function loadEncounterConsumer({ catalog = {}, extra = {} } = {}) {
  if (!vm.SourceTextModule) throw new Error('Run with node --experimental-vm-modules for isolated consumer tests');
  const source = await fs.readFile(new URL('../repo/src/systems/encounterDirector.js', import.meta.url), 'utf8');
  const context = vm.createContext({ console });
  let publishedRhythm = null;
  const overrides = {
    ENCOUNTERS: catalog, ENCOUNTER_SCRIPTS: { fixture: { fire() {} } },
    ENEMY_TYPES: [], ENCOUNTER_MODULES: [], COMMODITIES: [], NAMED_CAPTAINS: [],
    SECTORS: [{ id: 'sector_test', security: 0.5, tier: 2 }],
    zoneAt: () => null, zoneThreat: () => 0.5, zonesForSector: () => [],
    globalToSectorLocalForSector: (p) => ({ ...p }),
    sectorLocalToGlobalForSector: (p) => ({ ...p }),
    effectiveRegionalSecurity: (_state, _sector, baseline) => baseline,
    regionalEcologyReadout: () => null,
    publishSessionRhythmPhase: (phase) => { publishedRhythm = phase; },
    publishEscalationSeeds: () => {},
    ...policy, ...extra,
  };
  const imports = new Map();
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g)) {
    imports.set(match[2], match[1].split(',').map((v) => v.trim()).filter(Boolean));
  }
  const module = new vm.SourceTextModule(source, { context, identifier: 'spaceface:actual-encounter-consumer' });
  await module.link((specifier) => {
    const names = imports.get(specifier);
    if (!names) throw new Error(`Unrecognized dependency ${specifier}`);
    return new vm.SyntheticModule(names, function () {
      for (const name of names) {
        const value = Object.hasOwn(overrides, name) ? overrides[name]
          : /^[A-Z_0-9]+$/.test(name) ? Object.freeze({})
          : () => { throw new Error(`Untested production dependency called: ${specifier}#${name}`); };
        this.setExport(name, value);
      }
    }, { context, identifier: `fixture-double:${specifier}` });
  });
  await module.evaluate();
  return { exports: module.namespace, publishedRhythm: () => publishedRhythm };
}
