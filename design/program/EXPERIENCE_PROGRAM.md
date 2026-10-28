<!-- LIFETIME: ACTIVE_PROGRAM -->
# EXPERIENCE PROGRAM — establishing the game, first boot to mastery

Owner direction 2026-10-24: plan the establishment of a game out of this repo,
with massive attention on the player experience from the very beginning.
Where [`ATTENTION_PROGRAM.md`](./ATTENTION_PROGRAM.md) owns *density* (detail
on every surface a player can reach), this program owns the *journey* — the
sequence of moments every player lives, in order, each with a bar it must hit.

## The spine

Every player walks the same opening path before the sandbox forks. Phases are
ordered by when they happen; weight is roughly how much of a first session
they occupy. A phase is "established" when its bar is met by evidence, not by
hope.

| phase | window | what must be true | weight |
|-------|--------|-------------------|--------|
| P0 boot→play | 0–60 s | title → ship in space, zero friction, cold open lands | small, every player |
| P1 rail | 0–15 min | tutorial teaches through doing; every verb lands once | all first sessions |
| P2 first hour | 15–60 min | open world is alive: traffic, offers, one fight, one loop closed | all first sessions |
| P3 first session | 1–3 h | a goal forms, a purchase happens, a jump is taken | most players |
| P4 early arc | 3–10 h | loop pays: mine/trade/fight → upgrade → further reach | retained players |
| P5 mid arc | 10–30 h | factions matter, arcs open, the world remembers you | invested players |
| P6 late arc | 30 h+ | boss/campaign payoffs, secrets, mastery content | long-tail |

## The bar for each phase

- **P0**: under 60 s from launch to control; the cold-open line and the first
  camera are reviewed against their shots; nothing blocks on settings.
- **P1**: every core verb (thrust, latch, brake, fire, dock, read) is exercised
  once against a real object; the raid beat has teeth (a hostile that shoots
  and flees); no dead air >20 s between beats.
- **P2**: *consequential* traffic from minute 15 onward — legal/hostile
  tier-0 encounters, not just ambient spawns (ambient already measures
  9–13/h in hours 0–2 per the dossier); the combat→salvage→sell loop
  closes at least once before the rail ends; a guided gate jump lands
  inside spec2/03's <30 min first-jump target; a purchasable module
  exists inside earned credits.
- **P3**: the board offers something reachable and worth taking; first
  purchase lands inside session one; a named NPC or thread begins.
- **P4–P6**: every loop family has a payoff and a next-rung; consequence
  surfaces (law, factions, ledger) visibly respond; arcs pay off.

## How a phase gets worked

1. **Walk the phase** — an agent maps exactly what the player perceives
   minute-by-minute. Read the standing first-session law
   [`FIRST_SESSION_MAP.md`](./FIRST_SESSION_MAP.md) first (it documents
   already-true guarantees — e.g. encounter 344's real day-0 pirate,
   the 585 wonder, the Ceres run — don't re-litigate them), then code,
   dossiers in `design/archive/program/attention/`, and renders.
2. **Persona drafts + tribunal** — same personas and rubric as the attention
   program (`ATTENTION_PROGRAM.md`); synthesize one plan for the phase.
3. **3× rule** — audit, plan, and implementation each need three consecutive
   subagent approvals; approvals recorded in the artifact.
4. **Implement + land** — normal pathspec flow; board row + LANDED_REVIEW
   entry per standing law.

**Artifacts live in `design/archive/program/experience/`** (tracked). P0–P2 rows
share minutes 0–60 with the M1 First Hour Gold integration lane (board row
454, seam `m1-first-hour`, claimed claude-beta-oct23) — coordinate exact
paths against its per-sitting claims before starting an early-phase row:
`<row>-audit.md`, `<row>-draft-<persona>.md`, `<row>-plan.md` with its
`## Approvals` footer, `<row>-impl-note.md`. **Claim a row by editing its
§1P status cell** (`open → audit✓3 → plan✓3 → impl✓3 → landed`), same
stage grammar as the attention ledger.

## Seeded rows (build_map §1P continues §1O's numbering)

| id | work |
|----|------|
| X-01 | P2 first-hour life — tier-0 encounter deck, one real fight, loop-closure beat (dossier directions 1-3; direction 1's rail staging is X-02's — X-01 carries the post-rail fight outcome) — joint with ledger E-01 |
| X-02 | P1 raid beat teeth — staged hostile that shoots and flees (dossier direction 1 — split: X-02 owns the rail staging, X-01 the hour-1 outcome; raid beat joint with ledger E-01) |
| X-03 | P2/P3 first purchase — stage the "spend the payout" offer around an existing sub-5k module (`mod_thruster_stripped_s` 4,000 cr already exists); do not author a new module (direction 6) |
| X-04 | P2 gate jump beat — guided jump + return, toll math lands, <30 min (direction 7) — guided beat joint with ledger E-01 |
| X-05 | P3-P5 law/consequence — heat/wanted persist past the tutorial (dossier: law never fires after rail); coordinates with board row 462 (RC-CHASE witness machinery) |
| X-06 | P3+ ambient barks — per-sector bark banks so comms register (joint with ledger V-01) |
| X-07 | P4+ mining payoff surface — seam/overheat skill variance (direction 4) |
| X-08 | P3+ sling income verb — authored thrown-mass payoff (direction 5) |
| X-09 | P0/P3 death lessons — per-cause lessons beyond massline-snap (direction 8) — joint with ledger V-04 |

## Anti-goals

- No new systems to "feel" complete — every row lands through existing
  schemas (encounters, barks, modules, contracts, stages).
- No cutting the rail to fix P2 — the rail is good; the sandbox behind it
  is what's empty (dossier evidence).
- Frontend layout stays ORRERY's; audio pipeline work stays scoped to
  recipes the engine can already play.
