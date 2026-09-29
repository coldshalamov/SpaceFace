# PB-SLICE-E — quiet return visit + investigation payoff

Rows: `build_map.md` #80. Plans: SF-294 (a quiet return visit reveals what the player changed),
SF-295 (an investigation changes the next physical choice). Both were implemented by connecting
existing machinery whose payoff seams dead-ended on the bus — no new systems, no new markers.

## SF-294 — the worked claim greets a return

The returnable place already existed: anchored asteroid sites tick while the player is elsewhere
(`update` → `_tickSite`/`_resolvePods` are pure record math over production, export buffers, and
courier flights), the rock rematerializes on re-entry through `_repairAnchors`, and the record
survives saves. What was missing: `site:rematerialized` had no player-facing consumer, so the
stored consequence was restored silently.

- `site.returnBaseline` — `{exportedU, delivered, lost, bufferU}` — snapshots the witnessed state
  at anchor, at `sector:exit`, at `serialize()` (the save boundary is a witnessed moment), and
  again after each return line. Plain fields on the site record; they ride the existing
  JSON-clone save path.
- `_returnVisitLine` emits one `comms:log` (from `CLAIM`, kind `site`) on rematerialize, diffing
  current counters against the baseline: "Your claim at <sector> kept working — Nu shipped, N
  couriers home, Nu in the hopper." No delta, or no baseline at all (pre-packet saves never
  witnessed a reference state), reads "still stands — N machines on the face." Lifetime totals
  are never restated as news.
- `_repairAnchors` now honors `_worldRestoreActive` like its sibling sweeps, so a restore-ordering
  window can never rematerialize stale records or speak a line.

## SF-295 — scanning an ambush tell changes the approach

The layered discovery already existed: pending ambushes plant passive tells that sit on the signal
board as staged uncertainty ('SHIP SIGNATURE' → 'UNCERTAIN TRAFFIC' → 'MULTIPLE DRIVE ECHOES'), and
`scan:pulse` within 1200 resolved the tell into `ambushSignature:scanned` carrying the authored
label + warning hint. What was missing: that event had zero consumers — `tell.scanned` was
write-only and the warning never reached the player.

- `ambushSignatures._onScanPulse` now routes the authored hint through `comms:log` (from `SCOPE`,
  kind `scan`) — the same bus channel missions/encounters/barks already use.
- `scanner` tell candidates carry `resolvedLabel`/`resolvedDetail` only when `tell.scanned ===
  true`; `_scanSignals` applies them as the row's `classification`/`detail`. Unresolved tells keep
  the vague traffic classes — the authored name cannot leak before the pulse that earns it.
- The physical choice: the signature-bearing proximity shapes (`ambush_snare`, `pirate_toll`,
  `field_anchor_controller`) spring only inside their killbox, so holding clear of the warned
  position starves the spring. Hunter shapes (`named_hunter`, `bounty_hunter`) are contact-driven,
  so there the warning is foreknowledge, not a bypass — the uninformed route stays walkable with
  its authored risk either way.
- Dead write-only fields `tell.scannedAt`/`tell.revealUntil` were removed; `tell.scanned` is now
  live state read by the signal projection.

## Verification

- `node --test test/pb-slice-e-return-investigation.test.mjs` — 5/5. Covers: authored warning +
  resolved row from the real `scanPulse` input path; an in-signal-range-but-unscanned tell keeping
  its uncertain class (geometry bound between 1200 and 2000, asserted unconditionally);
  once-per-tell warning across re-pulses; return-line delta math through the real
  `sector:enter` → `update()` → `_repairAnchors` chain; save/load boundary with a witnessed
  pre-save counter (asserts '3u shipped', explicitly not '8u'); no fabricated deltas.
- `scripts/check-ambush-signatures.mjs` — 3 sections PASS.
- `node --test test/scanner-signal-investigation.test.mjs test/planet-state-scanner-signals.test.mjs` — 24/24.
- `node --test test/asteroid-sites.test.mjs test/pq-145-01-durable-site-loop.test.mjs
  test/pq024-asteroid-claim-manifest.test.mjs test/site-lane-network-contract.test.mjs` — 57/57.
- Independent review: first pass FAIL (fabricated lifetime deltas on baseline-less saves, missing
  save-time snapshot, dead no-leak assertion, blind roundtrip assertion, missing
  `_worldRestoreActive` gate, write-only fields); all fixed; second pass PASS.
