# PQ-186.02 — Retired assertion guard

<!-- LIFETIME: ACTIVE_RECEIPT -->

Implemented a narrow text guard driven by the Feel Contract's phrase list. It rejects the retired earned-speed brake and unconditional hard-impact immunity assertions, while preserving valid scrape behavior. Historical comments and test fixture directories are excluded. This is a warning about known bad assertion wording, not semantic analysis or proof that every bar passes.

The guard runs in both the broad check chain and smoke runner, and its reachability is pinned. Three direct tests pass, including a subprocess test that inserts the old brake assertion and observes exit 1. The current test tree passes; the gate-reachability and program-doc checks pass.

PQ-186.00 (all reachable bars) and PQ-186.01 (all static/runtime rulings) remain open. This receipt closes only .02.
