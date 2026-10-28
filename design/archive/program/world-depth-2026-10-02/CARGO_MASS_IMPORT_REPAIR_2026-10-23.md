# Restore upstream cargo mass read contracts

Date: 2026-10-23. Integration repair for PR532; full Rope Scale completion is not claimed.

## Reproduced failure and attribution
Hosted PR532 merge af2ec27dfdfa06528c70d509f0c53ebe01eed544 has parents master30bf3d57f416a9482f4ca565d20e0c7444da0846 and PR0f7f288248301991a611f9ec771f87686676aa4a. Both actual master economyContracts blob10ee18253edc6725a82d1284a4ed8fe17ead7985 and merged blob940b4bda52a443469a29317a654b1ce24ff97d9e import massDeclarationForTarget, massDiscrepancy, normalizeMassScaleState and physicalMassT. CargoCustody blob82f937bf8a607ce3ddfba739567f7a296207b82c is identical in parent, merge and PR head and exports none. The PR-head economy blob9102a76bb36c58e409cec0ebf92896b7255b7240 has no such imports.

Exact paired Node ESM link probes reproduce the missing-export failure in the master parent and synthetic merge. Introducing upstream commit904204f47f3c7b36ccd06ffea05cc892f88ae0e9 added callers without these helpers. This establishes narrow attribution for that import failure only, not unrelated workflow failures.

## Additive repair
Preserve all4584 original cargoCustody bytes and all eight shipment exports. Add four real read/normalization helpers, not empty stubs. Physical mass follows real body then entity precedence and returns null when unknown, never a fabricated1t. Declaration requires the current live mapped target, one active tow mission, authored kind/version/positive mass and exact target slot/provenance. Discrepancy provides finite absolute delta and measured/declared ratio;1e-6 is numerical consistency epsilon, not a claimed authored gameplay margin. Save normalization produces detached plain data, recomputes derived quantities, rejects malformed identity/non-finite/prototype keys, preserves supported filing/story fields and bounds notices to8.

These helpers do not move cargo, create a weighing event, mint a slip, file customs or award a reward. Newer economy and HUD callers remain untouched; no reverting them to old clinic source.

## Validation
Matched focused baseline1/28 passes and27 fail; candidate28/28 passes. Independent reviewer and root repeat28/28. Exact four-name static import fails on original and succeeds on candidate. Existing public cargo custody test004c9fad480fcd73b3cb23fe884994659dee052d passes7/7 with both original and candidate using the recovered3e5 loader composition. That compatibility run is not current30bf/af2ec merged-graph qualification. Earlier loader recursion was corrected by preserving symlink URLs; a separate fail-closed missing-input attempt made no test claim.

The focused publishable test has no scratch baseline dependency. The new check:cargo-mass-read-contract alias is explicitly appended to scripts.check, preserving all clinic gates. No aggregate local suite or excluded anvil receiver test was run. Hosted merged clinic/runtime results remain pending on the repaired head.

## Still open
Upstream Rope Scale also lacks producers/filing integration in masslineTelemetry, lawSecurity and missions expected by its broader authored suite. Those owners were not modified. Restoring imports and read contracts is not completion of that feature, a full save/custody acceptance or whole-game acceptance. Continue coordinated implementation rather than invent measurements or silently drop newer economy work. All larger goals remain open.
