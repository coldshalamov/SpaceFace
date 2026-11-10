# Q5 - status

**Owner:** Lane 7 QUALITY & VERDICTS. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done

- Three tier files exist under `test/tiers/` with one runner (`scripts/test-tier.mjs`) and the
  append-only reference tool (`scripts/reference.mjs`).
- **Fast tier is green on the published tree:** 39/39, 32–90 s depending on host load.
- Route tier was executed end-to-end once; its Node entries pass. Its browser entries hit the 120 s
  per-command cap on this loaded host (a separate 11 s worker reply stall was observed), so the
  tier result is environmental, not a product verdict. Individual re-runs on the same tree:
  `check:playable` 18/18, `check:first-15-runtime`, `check:station-tabs`,
  `check:mission-accept-handoff-runtime`, `check:market-first-loop`, `check:new-game-layout`, and
  `check-trail-streak-instancing-webgl` all green.
- Reference tier is **not executed end-to-end**.

## Not done

- Full route tier on an idle host; reference tier end-to-end.
- The 33 legacy source-slice tests named in DIAGNOSIS.md are still source-reading, not behavior
  tests.
- The `shipworks-worker-fit` flake and the Tethys native hold test remain named reds.

## Next

1. Re-run `npm run test:route` and `npm run test:reference` on an idle host.
2. Convert or retire the 33 source-slice tests.
3. Keep the fast tier under two minutes.
