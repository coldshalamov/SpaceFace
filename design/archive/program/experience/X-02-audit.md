# X-02 audit — P1 raid beat teeth

Row: build_map §1P 559/560 — "staged hostile that shoots and flees at ≤30% hull" (rail staging is X-02's; hour-1 outcome is X-01's).
Authored by: read-only catalog agent (e08e669d), recorded by devin-lanea 2026-10-24.

## What the player perceives today

- The rail's raid beat (`src/systems/onboarding.js:3172-3440`) stages a "Claim Jumper" (`reaver_pirate`) as a
  passive, unarmed, driveless hulk (`data.weapons = []`, `ai.passive`, `roe:'hold_fire'`, `onboarding.js:3236-3259`)
  beside a "Nervous Hauler" and a throw rock. The lesson is latch → swing → release into the rock.
- Completion paths: whip impact solid/crushing on the throw rock (`:3324-3341`), throw-kill inside
  `RAID_WHIP_KILL_WINDOW_S` (`:3359-3372`), tow-slam ≥40 wu/s (`:3417-3429`), gun kill → one restage then resolve
  (`:3374-3381`), player death → restage (`:3395-3400`), drift >3000 → restage.
- Nothing on the rail shoots the player. Encounter 344 (`344-opening-hauler-raid.js:40-64, 249-254`) fires a real
  armed raid in the first 1–3 min, but its raiders target the hauler and answer the player only if shot.

## Constraints found

- An armed AI cannot be made "armed but not driving": every live AI writes thrust each tick and latched hostiles
  run `escape_tether`/`cut_tether` reflexes (`contracts.js:45`, `tacticalAI.js:382,1221`). The comment at
  `onboarding.js:3254` is accurate — arming the Claim Jumper itself would break the tow lesson.
- Flee machinery exists: `ai.forceFlee = true` → `doctrine.js:111-121` FLEE activity; `egressExit.js:18-72` stamps
  `despawnAt` once ≥960 wu from the player (skips encounter-owned and `moraleImmune` hulls). No shared
  "flee at ≤X hull" helper — 1207 hand-rolls it (`1207-the-witnessed-price.js:47,322-327`).
- Time-to-kill: reaver full kit ≈ 32 effective dps at Standard vs Hitch 55 shield + 7/s regen + 140 hull ≈ 6–7 s.
  The weakest single gun (pulse override) ≈ 12 s. Too lethal for a learner mid-swing at stock numbers.
- Pinning tests: `inf-061-raid-discovery`, `rescue-opening:299`, `pq-163-03/04`, `pq-163-opening-choice-pacing`,
  `rc-458-first-half-hour`, `missing-three`, `first-hour-choice-contracts`, `wave-b10-throw-determinism`,
  `rc-458-round1-budget` (spawn budget `{raider:2}`).

## Already true vs missing

- Already true: a day-0 armed hostile encounter (344) during the rail; forceFlee/egress despawn; restage logic.
- Missing: a hostile on the rail that shoots the player and visibly breaks off when hurt to ≤30 %.

## Approvals

- audit-gate reviewer 27464a4d — APPROVE (2026-10-24)
- audit-gate reviewer 98e62e20 — APPROVE (2026-10-24)
- audit-gate reviewer 03b56769 — APPROVE (2026-10-24) — audit✓3
