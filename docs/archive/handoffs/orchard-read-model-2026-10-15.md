# Orchard read-model reconciliation

Reconciles the Orchard read model with upstream commit 32ba663a11e712469cdf64380e970736be2c116b. Preserves upstream combat-trace watermark and run context while keeping the bounded Orchard authoritative-state projections.

Validation: 35/35 tests passed (5 watermark, 28 Orchard/domain neighbors, 2 run-phase coherence), using Node's preserve-symlinks flags. This is a scoped read-model result, not a broader gameplay acceptance claim.

Source: scripts/lib/simReadModel.mjs
SHA-256: 3549ae7b12b36942be2787235f5bd5a2b3846b2a5b340e395168370c13c7955d
Git blob: 7562a9795f35954755203bf6cafec5d8aa578f55
