# V-01 catalog — Comms popups/barks (joint with ATT-V01 and §1P X-06)

Ledger register: sector voice. Sanctioned detail: per-sector bark banks, traffic flavor.
Surface files: `src/data/barks.js`, `src/systems/barkDirector.js`.

## What the player literally hears
- The ambient layer is `patrol-greeting`: a passing hull inside `PASS_HAIL_RANGE_SQ`
  hails once per entity per situation (`rec.said['patrol-greeting']`), gated by the
  per-sector ambient gap (`ambientRecord`/`ambientWindow`/`noteAmbientBark`).
- The line picked comes from `barkFor(factionId, 'patrol-greeting', index)` where
  index = `hash32(seed, 'barkDirector', entityId, situation)` — a deterministic
  per-hull pick. The corpus is keyed by FACTION only. The same hail in Helios Prime
  and in Sedna Dark is drawn from the same pool.
- Sector-keyed speech exists only as EVENT lines (witness/pursuit/surrender/taunt/
  pod-hunt/ore-flood/deed/tumble/law-step banks) — reactive flavor, not ambient
  traffic. Ambient hails have zero sector knowledge.
- The specialized hail paths (`_speakTouristHail`, `_speakGrandeeHail`, work-role
  register hails, rescue thanks) bypass the stock pool entirely — a tourist sounds
  like a tourist everywhere.

## What is thin
- `BARKS[faction]['patrol-greeting']` is the ONLY ambient bank. Twenty-five sectors,
  one voice. The ledger's "traffic flavor" is absent: nothing in an ambient hail
  knows where it is spoken — no landmark, hazard, local work, or local rumor ever
  crosses the radio outside authored events.
- The sector data model already carries identity (names, security, landmarks, the
  Shift machine-people, memorial markers) — none of it is audible on comms.

## Law and seams checked
- The pick must stay deterministic per hull: `index` is `hash32(seed, 'barkDirector',
  entityId, situation)` — folding sector choice INTO that index keeps the mix
  stable across save/load and avoids consuming the entity's one-time situation
  budget differently per sector.
- `_speak` is the single funnel: mark-on-acceptance, suppression, faction
  resolution, `barkDirector:voice` receipts — a sector line must enter at the
  text-selection point (line ~1089), not as a parallel speak path, so dedupe,
  voice-say acceptance, and history recording all stay shared.
- Sector banks must be voice-neutral: the speaker's faction varies; a local hail
  cannot lean on one house's register.
