# E5 — Shared memory everywhere / Electron-first: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done (2026-11-06)
- `vercel.json`: COOP `same-origin` + COEP `credentialless` on `/(.*)` — the public build can
  now arm the SAB lane (values identical to the shared game server; JSON validated).
- Diagnosis correction with evidence: Electron's embedded server (shared `gameServer.cjs`)
  already sends both headers — the shell isolation gap named "[I]" in the master plan does not
  exist in code; dev server verified live (`crossOriginIsolated === true`, SAB journal armed).
- E5 probe landed: every E10 trace export now carries `crossOriginIsolated`,
  `SharedArrayBuffer` availability, and the sim-lane transport diagnostics (lane, SAB journal,
  worker clock) via `frameTruth.extraProviders`.
- iGPU switch audit table + signed-update-path status: [iGPU_SWITCH_AUDIT.md](iGPU_SWITCH_AUDIT.md)
  (honest: composite result verified from the 2026-11-05 live evidence; per-switch A/B not yet
  recorded; code signing not configured — owner decision flagged).

## Next
1. Live Electron-shell probe (`crossOriginIsolated === true` + SAB lane in the shell) — needs a
   machine-quiet window (shared with E1's live re-record).
2. Per-switch iGPU A/B where the table says "not separately A/B'd".
3. Signed update: owner decision on a signing certificate; then a real old→new update run.

## Evidence
- Dev-server probe: this session's E1 runs (SAB lane active, arena bound).
- vercel.json validated; no third-party boot-path origins (audited) so credentialless is safe.
