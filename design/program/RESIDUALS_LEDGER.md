<!-- LIFETIME: VOLATILE -->
# Residuals ledger

Every named follow-up left behind by a landed receipt or a `NOW.md` result row, with its source,
a one-line outcome, and where the work goes next. This is a **collection point, not a queue**: a row
here does not reserve files and does not imply acceptance. Admissions land in
[`roadmap/program-queue.json`](./roadmap/program-queue.json); global status stays in
[`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md).

Maintained 2026-09-19. Method: swept every file under `design/program/roadmap/receipts/` and every
`NOW.md` row for explicit follow-up markers (`residual`, `follow-up`, `not done`, `unproven`,
`honesty gap`, `remaining open`, `deferred`, `out of scope`), then kept the entries that name
actionable work. Receipts whose only residual is a headed capture or a percentage they refused to
invent are recorded under §F, not carried as production work — the owner ruled on 2026-09-16 that a
heading/capture is not the proof and agents review by reading the live owner.

## A. Named residuals carried into this ledger

### A1. Ordnance bombs refinement follow-on — feel pass, economy, HUD, audio, NPC droppers

- Source: [`../ORDNANCE_BOMBS_REFINEMENT.md`](../ORDNANCE_BOMBS_REFINEMENT.md) §5–§6;
  [`../ORDNANCE_BOMBS_SPEC.md`](../ORDNANCE_BOMBS_SPEC.md); `NOW.md` row **Drift-bomb bay combat verb**.
- Outcome: the eight-payload bomb bay is live and routable; its presentation layer is source-fit but
  never reviewed on the default route, its audio cues are only partly adopted, NPCs do not drop
  bombs, the capsule is not shootable, and the economy/loadout question is deliberately unresolved.
- Follow-ups named: (a) route acceptance and look/feel of all eight states plus gravity/tar fields,
  at combat zoom and reduced motion/flash, with a fixed-seed hitch and frame-pacing number;
  (b) audio catalog adoption for the real cue IDs, source-following slug inhale/collapse, loop
  termination on every `bombs:fieldEnded` path, victim-attached thermite burn sharing the status
  owner; (c) one telegraphed NPC pursuit-lane doctrine calling `bombs.drop`/`commandDetonate`, plus a
  moving projectile-sweep proxy for shootable bombs; (d) rack economy/combat resupply and
  selection-persistence decision.
- Proposed queue leaf: `PQ-205.00`–`.03` (§E).

### A2. Boss 2v2 ~12-second kill question

- Source: [`roadmap/receipts/combat-audit/2026-09-18-combat-variety-vertical.md`](./roadmap/receipts/combat-audit/2026-09-18-combat-variety-vertical.md) §Known honest gaps.
- Outcome: the dreadnought 2v2 cell resolves in ~12 s in **both** arms (stock doctrine, pre-existing);
  the capital dies to something other than pilot DPS in wing fights. Explicitly out of the combat
  vertical's file ownership (`combat.js`/`missions.js` stat owners).
- Proposed queue leaf: `PQ-206.00` (§E) — investigate the wing-fight kill source, then decide whether
  it is authored (a wing gank) or a bug (non-DPS capital resolution), and add a fixed-seed pin.

### A3. Mining-prop stragglers — CLOSED 2026-09-19

- Source: [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) §Verified-open findings (row `TODO`,
  verify-open 2026-08-18).
- Outcome: **stale — not a real residual.** The V3 material-truth re-author of both props had already
  landed (manifest note "Opening-route industrial prop V3 2026-08-18"; builders
  `tools/blender/remaster_opening_mining_drone_v3.py` / `remaster_opening_conveyor_barge_v3.py`).
  The finding's "580 tris / 4 meshes / 4 KB flat normal" and "1,144 tris / 4 KB stub normal/ORM"
  measured the pre-V3 bevel pass, not the live release.
- Live evidence 2026-09-19: drone release `79cffc2f…` = 17,924 tris / 7 materials / 22 KTX2, LOD
  8716/6704/2504; barge release `73e83200…` = 37,332 tris / 9 materials / 29 KTX2, LOD
  19500/12608/5224. Source + release hashes match the release manifest; both render-packages were
  compiled from these exact release GLBs.
- Action: `PQ-210` withdrawn (admitted in error on the stale finding); packet retained under
  [`roadmap/retired/PQ-210.md`](./roadmap/retired/PQ-210.md). No asset or code change was needed.
- Receipt: [`roadmap/receipts/MINING-PROP-V3-VERIFY-2026-09-19.md`](./roadmap/receipts/MINING-PROP-V3-VERIFY-2026-09-19.md).

## B. Four landed verticals — follow-ups

### B1. Combat variety vertical

- Source: [`roadmap/receipts/combat-audit/2026-09-18-combat-variety-vertical.md`](./roadmap/receipts/combat-audit/2026-09-18-combat-variety-vertical.md).
- Landed: six maneuver identities + boss choreography; 92.4% of pairs differ on 3+ dimensions;
  mines counterplay now fires.
- Residuals: the ~12 s boss 2v2 (§A2); wasp swarm 1v1 deals ~0 damage (one-pass lifespan, not a
  broken fire gate); degenerate flee cells in both arms (tether 2v2 s13502 ~10k WU, PD 2v2 s4242
  ~5.3k WU); B13's full pass still needs a headed jitter measurement; `test/combat-ecology-roles.test.mjs`
  has 2 pre-existing failures (ghost `preferredRange` data vs test pin, reads only `src/data/enemies.js`
  + `makeEnemySpawnSpec`).
- Proposed queue leaf: `PQ-206.00`–`.03` (§E). Same-identity roster mates reading alike is by design
  and is **not** carried.

### B2. People who remember

- Sources: [`roadmap/receipts/PQ-150.00-REPORT.md`](./roadmap/receipts/PQ-150.00-REPORT.md),
  [`PQ-150.01-REPORT.md`](./roadmap/receipts/PQ-150.01-REPORT.md),
  [`PQ-150.02-REPORT.md`](./roadmap/receipts/PQ-150.02-REPORT.md),
  [`PQ-150.03-REPORT.md`](./roadmap/receipts/PQ-150.03-REPORT.md).
- Landed: `.00` aces escalate against the player's kill style; `.01` the berth mechanic reads real
  hull scars/repairs/rap; `.02` the radio fires all eight bark classes + four Band deeds headless;
  `.03` all fifteen depth people are graph-reachable and remember a talk.
- Residuals: `.01` **gap 1** (clean-plate line contradicted itself once the player traded) is
  **fixed** by the 2026-09-09 follow-up — not carried. **Gap 2** the berth names the `Mechanic`
  speaker on two stacked articles. **Gap 3** `leftoverRapLine` adds an unmeasured `buildShipLedger`
  call to the 18-frame berth refresh loop, landing on the clean common case. **Gap 4** no headed
  capture and no playtest %, and the packet test was not re-run in the review environment. `.02`'s
  radio is headless-only and the actual-game compass measured **`bark:shown`: 0 events in 10 hours**
  (all sessions) while comms popups run ~50/hour — the "people who remember" layer never reached a
  live session.
- Proposed queue leaf: `PQ-207.00`–`.03` (§E).

### B3. Build identities

- Sources: [`PROGRESSION_VERTICAL_2026-09-18.md`](./PROGRESSION_VERTICAL_2026-09-18.md),
  [`PROGRESSION_VERTICAL_AUDIT.md`](./PROGRESSION_VERTICAL_AUDIT.md),
  [`build-identities-receipt-2026-09-18.md`](./build-identities-receipt-2026-09-18.md),
  `scripts/check-progression-verb-audit.mjs`, `scripts/check-build-identities.mjs`.
- Landed: six verb-granting items; four build identities proven by deterministic pilots; massline
  head counters surfaced. `check:progression:verbs` is green and fails on vocabulary drift.
- Drift guard + declared-but-unwired keys: two declared verb keys are classified as verbs but name no
  implemented behaviour — `microJumpBlink` (`unique_pale_coil_warp_drive`) and `reactiveMissileKnockback`
  (`unique_choir_bell_aegis`). The audit classifies them, but nothing wires them to a shipped
  capability, and no guard prevents a future module from declaring a verb key nothing implements.
- Proposed queue leaf: `PQ-208.00`–`.01` (§E).

### B4. Actual-game compass top-10

- Source: [`../../docs/program-compass/2026-09-ACTUAL-GAME.md`](../../docs/program-compass/2026-09-ACTUAL-GAME.md).
- Landed: the playthrough instrument and the ranked defect list. This is measured open-world shape,
  not a capture.
- Dispositions: (1) encounter spawns 0 from h5 both seeds — open, `PQ-209.00`. (2) signature
  combat→salvage→economy→law chain 0 in ~60 h — open, `PQ-209.01`. (3) income is a first-hour cliff
  — open, `PQ-209.02`. (4) progression never triggers (≤1 mission, 0 purchases/tech) — open, folded
  into `PQ-209.01`/`PQ-209.02`. (5) combat single-flavoured and the law never fired — open; the law
  half connects to `PQ-206.00`. (6) sling combat value is seed luck — open, relates to `PQ-206.01`.
  (7) sector boundaries flap — **closed by `3e84b438e`** (hysteresis on free-flight sector
  membership, `test/sector-membership-hysteresis.test.mjs`); verify only, no leaf. (8) ambient radio
  silent **`bark:shown` 0** — **resolved by `PQ-207.02`** (phantom event name; real seams
  `barkDirector:voice`/`voice:surface{channel}`/`band:tune` measured non-zero on the same session
  JSONs — see `roadmap/receipts/PQ-207.02-REPORT.md`). (9) decisions/hour below bar — measurement
  consequence of (1)/(2), no separate leaf. (10) mining is a click-farm (~92 shots/rock) — open,
  relates to `PQ-209.02`.
- Proposed queue leaf: `PQ-209.00`–`.02` (§E).

## C. Receipt sweep — explicit residual sections

Entries with actionable named follow-ups that no current queue row owns. Receipts whose residual is
only an unrun headed capture or a refused percentage are in §F.

| Receipt | Named residual (one line) | Proposed leaf / disposition |
|---|---|---|
| `roadmap/receipts/DEEP-FIELD-STRUCTURE-ART-2026-09-15.md` §Not done | Five of six deep-field recipes still have an empty middle layer | retained product decision — no leaf until assigned |
| `roadmap/receipts/DIRTY-TREE-ADOPTION-2026-08-22-REPORT.md` §9 | Hornet stays a wired REVISE candidate; rover unaccepted/unwired | art verdict call — owner/art lane, not this ledger |
| `roadmap/receipts/PQ-013-planet-REPORT.md` §Honesty | Strict `check:perf` rows still fail (spatialHash, p95, hitches) | performance lane; superseded by `PQ-204` work, verify against witness |
| `roadmap/receipts/PQ-018-asset-admission-REPORT.md` §Follow-ups | Repair `place_debris_chunk` + four `ede16953` remasters at source | asset lane; unblocks `check:visual-stability`/`check:art` |
| `roadmap/receipts/PQ-018-world-site-REPORT.md` §Follow-ups | Cathedral lore-canon placement + Phase-4 route/perf | asset/route lane |
| `roadmap/receipts/PQ-018-cathedral-reauthor-REPORT.md` §Residual | Cathedral h1/review + authored bow-wedge/engine-bell notes | asset acceptance follow-up |
| `roadmap/receipts/PQ-019B-seams-REPORT.md` §5 | Seams explicitly not done | review individually; likely superseded |
| `roadmap/receipts/PQ-021-ledger-wiring-REPORT.md` §Follow-ups | Ledger Phase-4 route + bespoke-vs-fallback glyph decision | UI/route lane |
| `roadmap/receipts/PQ-022-relay-reauthor-REPORT.md` §Residual | Relay h1 capture + causal review | asset acceptance follow-up |
| `roadmap/receipts/PQ-023-propulsion-family-REPORT.md` §Follow-ups | vp220 Browser/Electron visual evidence; idle nozzle-glow decision | route evidence + design decision |
| `roadmap/receipts/PQ-025-performance-owner-facts-REPORT.md` §Residuals | `PQ-025.calibration-qualification` blocked on promote units | perf/acceptance lane |
| `roadmap/receipts/PQ-034-candidate-audit-REPORT.md` §Residuals | GPU query terminal identity + scenario-driver extension | performance lane (`PQ-034.native-closure`) |
| `roadmap/receipts/PQ-045-npc-identity-REPORT.md` §Follow-ups | Headed `check:assets:live` + whole-asset review of `npc_work_fleet` | asset acceptance follow-up |
| `roadmap/receipts/PQ-047-composition-REPORT.md` §Follow-ups | Multi-hauler predation convoys drop only the selected target's cargo | economy/encounter design leaf |
| `roadmap/receipts/PQ-133.02.md` §7 | No p95 frame budget measured; fight not proven fun | measurement follow-up |
| `roadmap/receipts/PQ-136-01-space-kit-props-REPORT.md` §Residual | 30 source-only identities need release-pipeline promotion | asset pipeline job (shared with wreck pack) |
| `roadmap/receipts/PQ-137-07-REPORT.md` §What this does not do | Straight radial pull (tug of war) regime not integrable at 60 Hz | physics/feel follow-up |
| `roadmap/receipts/PQ-137-10-smoke-REPORT.md` §What this does not claim | B2/B3/B4/B5/B6-damage/B8/B11 still OPEN in the contract | massline contract lane |
| `roadmap/receipts/PQ-150.01-REPORT.md` §gaps 2–4 | Double speaker, unmeasured berth cost, no headed/playtest | `PQ-207.00`–`.03` |
| `roadmap/receipts/PQ-178.01-REPORT.md` §Follow-up | `47a-bigger-boat.beat.json` five `sling_in` clauses + `BEAT-STANDARD.md:78` stale | docs/worldbuilding fix — narrow, unowned |
| `roadmap/receipts/PQ-180-00-REPORT.md` §What this does not claim | Nine UI surfaces never open under the probe | UI reachability lane (`PQ-180 .00`) |
| `roadmap/receipts/PQ-195.01-REPORT.md` §Residuals | Legacy custom backend `maskOf(fx)=0` broadphase-invisible; arrestor overlap | physics follow-up, contract holds on default route |
| `roadmap/receipts/CHECK-ALL-REPAIR-ROUND2-2026-09-18.md` §Residuals | `check:all:smoke` 22/27; 5 reds are foreign defects/host load | filed here; owners fix in their lanes |

## D. `NOW.md` result rows with a named next action

The board's own `Next terminal action` / `NEXT` columns, captured so a released row's promise is not
lost. Rows whose terminal action was "pathspec commit" or "receipt written" are omitted.

| `NOW.md` row | Named next action |
|---|---|
| Onboarding vertical: thesis-first first hour | fix far-field body sleep for scripted input, then re-run fixed-seed metrics twice |
| PQ-033.02 min-spec floors and soak | Electron host evidence; median-frame/hitch floors remain host-load-limited |
| PQ-194 packet refit + S2 embark | S2 frame composition + twelve prototypes (P03/P04/P16) |
| Finish-game fleet / next-20 dispatch pipeline | Chromium walks timed out (GPU); headed stills residual |
| PQ-150.01 receipt NEXT | integrator updates the queue (mechanic berth is frontend, skip) |
| Drift-bomb bay combat verb | cloud agent continues from `ORDNANCE_BOMBS_SPEC.md` §5 — carried as `PQ-205` |

## E. Admissions to `roadmap/program-queue.json`

Additive rows only; no other lane's row, state, or priority was changed. Each packet carried at least
one `ready` dispatch unit so `program-dispatch --ready` surfaces it. `PQ-210` was withdrawn on
2026-09-19 after its premise proved stale (§A3); it is no longer in the queue.

| Queue id | Priority | Packet | Leaves (dispatch ids) |
|---|---|---|---|
| `PQ-205` | 1002 | Ordnance bombs refinement follow-on | `PQ-205.00` route acceptance/look-feel (ready), `.01` audio + victim statuses, `.02` NPC mirror + shootable proxy, `.03` rack economy/loadouts |
| `PQ-206` | 1003 | Combat variety residuals | `PQ-206.00` boss 2v2 ~12 s (ready), `.01` swarm one-pass lifespan, `.02` degenerate flee egress, `.03` B13 jitter + ecology-roles pin |
| `PQ-207` | 1004 | People-who-remember residuals | `PQ-207.00` berth refresh cost (ready), `.01` double speaker/crowding, `.02` bark/radio online census, `.03` blind mechanic playtest |
| `PQ-208` | 1005 | Build-identity drift guard | `PQ-208.00` verb-drift guard (ready), `.01` wire or reclassify declared-but-unwired keys |
| `PQ-209` | 1006 | Actual-game defects (compass) | `PQ-209.00` encounter supply hours 5–9 (ready), `.01` close the combat→salvage→economy chain, `.02` income curve past hour 0 |
| `PQ-210` | 1007 | Mining-prop stragglers — **WITHDRAWN 2026-09-19** (§A3) | None: the V3 re-author already landed; task + units removed from the queue |

Compass defects 4, 5, 6, 9, 10 are deliberately folded into the rows above rather than cloned as
separate packets (§B4). Compass defect 7 is closed by `3e84b438e`.

## F. Recorded, not carried as production work

Residuals whose only content is an unrun headed capture, a refused playtest percentage, or a
reviewer verdict. Per the owner's 2026-09-16 capture ruling and the 2026-09-15 `NEEDS HUMAN`
clarification, these are agent-reviewable or optional and do not open a production unit. They stay
listed so the receipt trail is complete.

`PQ-018-world-site` / `PQ-019-surface-heist` / `PQ-023-cues` / `PQ-024-survey` H2/H3 verdicts;
`PQ-038` presentation broker matrices; `PQ-040` dirty-range native span; `PQ-041` Electron
provisioning; `PQ-045-vfx-recipes` missing recipe families; `PQ-047` composed-state single-run
proof; `PQ-136-00` wreck-field still pass; `PQ-150.00/.02/.03` headed strips; `PQ-158.01` headed A/B;
`PQ-163.04` playtest retention; `PQ-164.00` Chromium pad walk; `PQ-177.01` playtest %; `PQ-178.02`
reviewed-but-not-committed sheets; `PQ-194.01` GPU captures; onboarding stranger full-hour metrics.

## G. Maintenance

- Add a row the moment a receipt or `NOW.md` row names follow-up work; keep it one line.
- When a row's work lands, delete it from here — Git and the receipt own history.
- Admissions go through `roadmap/program-queue.json`; never flip another lane's row or priority.
- Re-run this sweep after a large multi-lane wave (this one followed the 2026-09-18/19 verticals).
