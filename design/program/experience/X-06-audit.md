# X-06 audit — per-sector bark banks

Row: build_map §1P 564 (joint with attention ledger V-01). Catalog agent dad3c54b, recorded by devin-lanea 2026-10-24.

## What exists

- Barks are `BARKS[factionId][situation]` (`src/data/barks.js:63+`), picked by `barkFor(factionId, situation, rng)`
  (`barks.js:10-13`). barkDirector emits `barkDirector:voice` → voiceArbiter 'bark' channel (priority 50,
  `voiceArbiter.js:51`) → toast + audio (`audioSystem.js:3131`).
- Only a per-sector gap clock exists (`ambientBySector`, `barkDirector.js:3267-3280`): `AMBIENT_BASE_GAP_S=12`
  growing +12 s per quiet step to `AMBIENT_MAX_GAP_S` (`:72-73,3282-3286`), applied to `patrol-greeting` only
  (`:2426-2440`).
- No sector-keyed content: no `sectorBark`/`barksBySector`. Closest is Maera's Helios `sector:enter` line
  (`barks.js:1657-1662`).

## Missing

- Every first-hour sector speaks the same faction corpus; nothing ambient tells you *where* you are.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
