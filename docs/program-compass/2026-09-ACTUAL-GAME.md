<!-- LIFETIME: VOLATILE — refreshed whenever a new battery runs -->
# The Actual Game — measured playthrough shape, 2026-09

**Instrument:** `scripts/run-actual-game-playthrough.mjs` + `scripts/lib/bench/playthroughLedger.mjs` +
`scripts/lib/bench/playthroughPilots.mjs`. Three scripted player archetypes play the real open-world
sim headlessly — full production system set (world materialization, mining, traffic, encounters,
tether family, economy, missions, heat/law, tactical AI, Rapier), driving the player input contract
(`state.input` axes, edge action flags, the massline command packet) and the live service paths
(`economy.execute`, `dock:docked`/`dock:undocked`) — and emit an hour-by-hour ledger.

**Battery:** prospector (miner-trader) · hunter (combat) · improviser (tether/physics), seeds 4242 and
8008, 10 sim-hours each. Raw ledgers: `.devshots/actual-game/*.json` (untracked evidence).
Roll-up helper: `node scratch-actual-game-report.mjs`.

**Evidence class:** focused-explicit headless sessions with production open-world systems. Fixed-seed
numbers are the proof; nothing here is a capture or a feel claim. Simple policies, deliberately: when
a *driven* player still can't find something to do, the finding is about the world, not the driver.

---

## The headline

**Hour 1 and hour 10 are the same game, and the middle is emptier than either.**

- Consecutive-hour verb-set similarity is 0.75–1.0 in every session: what the player *does* never
  changes across ten hours (hunter: 6 verbs, identical sets hour over hour).
- All income lands in hours 0–3. Prospector 8008: **+12,083 cr in hour 0, then 0 cr for nine
  straight hours.** Hunter 8008: +7,154 cr in hours 2–3, then 0 for seven hours.
- The encounter director stops offering fights: `encounter:spawned` runs 9–13/hour in hours 0–2, then
  1, 1, **0, 0, 0, 0, 0, 0, 0** — while its own command cadence stays ~160/hour. A hunter that roams
  to every danger tier (Helios→Sker Haven, tiers 0→5) finds zero hostiles in hours 4–10, both seeds.
- Progression systems are never touched: ≤1 mission accepted (0 completed), 0 module purchases,
  0 ship changes, 0 tech in ~60 measured hours.
- The complete VISION chain — combat→aftermath→salvage→economy→law — occurred **zero times**. The
  partial prefix (kill→salvage pickup, never sold) fired 5 times in one session.

This is the measured form of "which prototype is this?": not the first hour — the first hour works —
but hours 3–10, which is where a purchased game lives.

## Per-session roll-up (complete sessions)

| session | kills | income peak → final | docks | missions | verbs distinct | decisions/h | hours with zero kills |
|---|---|---|---|---|---|---|---|
| hunter s8008 | 14 | 7,154 @ h3 → flat 7 h | 0 | 0 | 6 | 1.1 | 7 of 10 |
| hunter s4242 | 14 | 4,643 @ h4 → flat 6 h | 0 | 0 | 6 | 1.6 | 6 of 10 |
| improviser s4242 | 1 | +158 total | 0 | 0 | 9 | 107 (loop-degenerate) | 9 of 10 |
| prospector s8008 | 0 | 12,083 in h0 → flat 9 h | 23 (all h0) | 1 | 6 | 5.7 | n/a (mines, doesn't fight) |

| improviser s8008 | 45 | +2,091 in h1 → flat 9 h | 0 | 0 | 8 | 92 (loop-heavy) | 6 of 10 |
| prospector s4242 | 2 | 10,638 total; h0 and h8 only | 15 | 1 | 6 | 240 (harass-loop) | 7 of 10 |

All six sessions are complete. The patterns held across every seed: income lands in 1–2 hours and
freezes; verb sets repeat; encounters stop.

## The ten biggest defects, ranked by player impact

1. **The world stops offering after the opening.** Encounter spawns: 9–13/hour (h0–2) → 0 from h5 in
   both hunter seeds, while the director keeps issuing ~160 commands/hour. Seven of ten play-hours
   contain no combat opportunity at any danger tier. *Number: 0 encounters spawned, hours 5–9, both
   seeds; 0 kills available hours 4–10.*
2. **The signature chain never completes.** Kill→salvage→sale→consequence: 0 occurrences in ~60
   hours. Salvage pickups happen (prospector: 683) but the mined/looted goods and the economy never
   meet the combat aftermath — the loop Vision.md calls "the whole game" does not close once.
3. **Income is a first-hour cliff, not a curve.** 100% of prospector income in hour 0 (starter field:
   131 rocks, 23 docks, 11,689 cr) and then nothing — the field depletes and the next reachable
   field is ~14,000 WU away with nothing on the way. 100% of hunter bounty in hours 2–3.
4. **Progression never triggers.** In ~60 hours: 1 mission accepted, 0 completed, 0 purchases, 0
   fit changes. The 83-module and 32-node trees are unreachable through play because nothing pushes
   the player to a station with a reason to spend.
5. **Combat is single-flavored and consequence-free.** All 28 kills across both hunters belong to one
   faction (faction_reach); 63–77 shots per kill; no hunter ever died, docked, or repaired. The
   WANTED/law system never fired once (0 heat/wanted/law events in ~63 measured hours — 76 player
   kills and 224k mining-beam shots drew no legal response). Worst case: prospector s4242 was pinned
   by a permanent harasser for seven straight hours — **29,535 damage taken, 330 flee-decisions/hour,
   and no resolution possible** because the pilot doesn't fight and the threat never leaves.
6. **The massline sling doesn't sling — or only by seed luck.** The improviser completed 4,290
   (s4242) and 1,758 (s8008) attach→cut cycles (~7/minute for ten hours, median release ~70 WU/s) on
   the same starter-field rocks. Swinging to release speed has no designed payoff: s4242 produced
   1 kill and 0 credits from ten hours of dedicated tether practice; s8008 lucked into 45 kills with
   the identical policy — same inputs, 45× outcome spread means the sling's combat value is
   accidental, not authored. The Vision's central fantasy ("the enemy becomes a projectile") is a
   coin flip.
7. **Sector boundaries flap.** Patrolling a border, hunter s4242's sector membership flipped 38
   times in one hour (charon_expanse↔ashfall_reach every ~90 s); prospector s4242 flipped
   helios↔ceres 10 times in its hour-8 mining run. Each flip re-runs residency materialization —
   a coherence hazard and wasted work in one.
8. **Ambient life is silent.** `bark:shown`: 0 events in 10 hours (every session), while comms popups
   run ~50/hour. The "people who remember" layer — aces, rivals, radio — never reached a single
   session, and named-captain content (3 entries in data) never fired.

   > **Correction (PQ-207.02, audio-bus census):** `bark:shown` is a phantom event name — nothing in
   > the tree emits it, so the zero proved only that the census listened on the wrong seam. Reading
   > the same session JSONs on the real seams: `barkDirector:voice` (queue admission; audioSystem
   > plays its squelch on this receipt) fired 93 / 31 / 32 times in hunter-s4242, hunter-s8008, and
   > improviser-s4242, and `voice:surface{channel:'bark'}` — the arbiter actually taking the floor —
   > fired 45 / 36 / 58 times. **Every session that had the layer registered measured barks (3 of
   > 3).** The three silent sessions (prospector ×2, improviser-s8008) ran a harness that predates
   > the bark layer — `runMetadata.systems` lists no `barkDirector`/`voiceArbiter` — so they cannot
   > speak to the question either way. The band radio's `band:*` silence is a different fact: the
   > tuner is opt-in (Shift+O / HUD chip → `band:cycle`) and no scripted pilot ever invoked it —
   > never switched on, not unwired. `bandRadio` was also missing from the harness system list;
   > it is registered now, and the ledger counts `barksSurfaced`/`bandLinesSurfaced`/`bandTunes`
   > so future batteries measure the real seams.
9. **Decisions/hour sits at or below the bar even measured generously.** Hunter 1.1–1.6/h against the
   ≥6 bar (PQ-177.05). The improviser posts 107/h but 99% are the same latch decision inside a
   degenerate loop — volume without viability. The prospector's honest 5.7/h is the closest any
   archetype comes to the bar.
10. **Mining is a click-farm, not a verb.** 12,034 mining-beam shots for 131 rocks in one hour —
    ~92 shots per rock with no failure, no choice, no variance; the beam is an incantation, not a
    physical problem.

## What is NOT broken (so nobody re-litigates it)

- The first hour works: both prospectors dock and sell within 2 sim-minutes; first kill ≤2.9 h for a
  hunter that starts in a protected sector; the tether attaches in the first 3 minutes. The
  improviser even strung together 45 tether kills on one seed — the capability exists; the designed
  payoff around it does not.
- The world is reachable: one hunter walked the full ladder Helios→Ceres→Vesta→Pallas→Nyx→Sker and
  survived it (0 deaths across all sessions except ambient attrition).
- Determinism and the harnesses held: 2.16M-tick sessions completed; the sim froze correctly while
  docked; save/`game:started` boot works headless.
- Performance is not the bottleneck for content: these sessions run ~2,500 ticks/s headless; the
  constraint is what the world offers, not what the engine can simulate.

## Instrumentation gaps (honest)

- `damageDealt` reads 0 in the four ledgers recorded before the attackerId field fix (damage taken is
  correct; raw events confirm player shots land — 1072 shots, kills credited via `killerId`).
- Hour-10 rows in the hourly tables are partial-bucket artifacts (the bucket opens at h10.0 as the
  session ends); ignore the zeros there.
- Bark/radio capture depended on events named `bark:shown`/`band:*` — corrected by PQ-207.02: the
  shown seam is `voice:surface` by channel, the tuner invocation seam is `band:tune`/`band:cycle`,
  and the ledger now counts all three per hour.
- Policies are simple heuristics by design. A stronger pilot would find *more* to do, not less; the
  zero-encounter hours 4–10 would need the world to change, not the policy.

## How to rerun — and when NOT to

```bash
node scripts/run-actual-game-playthrough.mjs --archetype=prospector --seed=4242 --hours=10
node scratch-actual-game-report.mjs   # after sessions land in .devshots/actual-game/
```

**This battery is a diagnostic instrument, not a verification gate.** It earned its keep once:
the 2026-09 survey found the hour-3 collapse, which no focused fixture could have surfaced. It
does not earn a rerun "after any change" — that is hours of compute and log-mountains to
re-prove what focused fixtures already prove in seconds.

Run it ONLY when all three hold: (1) the change alters session SHAPE — encounter pacing, spawn
policy, economy phase targets, director cadence, law-event wiring; (2) no focused fixture can
express the claim; (3) the question is narrowed to the affected window — one archetype, one
seed, hours capped to the window (default 3), not six sessions. Everything else is the normal
ladder: focused owner tests and `check:baseline`. The two numbers that moved first after the
fixes — `encounter:spawned` in hours 5–9 and the first complete `combat_salvage_economy` chain —
are asserted by focused checks in the owning lanes' suites, where they run in seconds.
