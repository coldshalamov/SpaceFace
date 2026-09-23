// Ledger D21 / PQ-210.00 — the bounded roster warm instantiates every decoded render package once
// so its program families link behind the loading shell. Census records are only
// cache/bootstrap-owned, so a package can be released or evicted between listDecodedAuthoredParts
// and createInstance ("must be retained before creating an instance"). This helper owns the
// dedicated warm retain, re-acquires a stale record through the normal loader path, and drains
// package + instance leases with one releaseOwner when the warm roster tears down.
// Pure bookkeeping — injected residency and loadPart keep it free of renderer/THREE imports.

export function createCrucibleWarmPackageResidency({ residency = null, profile = 'crucible' } = {}) {
  const owner = { type: 'crucible-roster-warm', profile };
  let retained = false;
  return Object.freeze({
    owner,
    get retained() { return retained; },
    // Retain the record's render package under the warm owner before instantiation; the caller
    // instantiates whatever record this returns. When the stale package cannot be retained,
    // loadPart — the normal authored loader bound to the renderer — re-acquires it (a cache hit
    // re-establishes the package owner, an eviction decodes fresh).
    async retainForInstance({ record, url, slot }, { loadPart, sectorId = null } = {}) {
      const pkg = record && record.renderPackage;
      if (!pkg || typeof pkg.retain !== 'function') return record;
      if (pkg.retain(owner, { role: 'crucible-roster-warm', sectorId })) {
        retained = true;
        return record;
      }
      const fresh = typeof loadPart === 'function'
        ? await loadPart(url, {
          slot: slot === '*' ? null : slot,
          residencyOwner: owner,
          residencyRole: 'crucible-roster-warm',
          sectorId,
        })
        : null;
      if (fresh && fresh.renderPackage) {
        retained = true;
        return fresh;
      }
      return record;
    },
    // Instances retain under the same warm owner, so the single release at teardown drains
    // package and instance leases together instead of leaking per-instance owners.
    instanceOptions(options = {}) {
      return { ...options, residencyOwner: owner };
    },
    release(reason = 'crucible-roster-warm-released') {
      retained = false;
      if (residency && typeof residency.releaseOwner === 'function') {
        residency.releaseOwner(owner, reason);
      }
    },
  });
}
