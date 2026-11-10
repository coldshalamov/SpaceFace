<!-- LIFETIME: VOLATILE -->
# Living Warfare — scoped work-ticket ledger

Program directive: turn the enemy catalog into distinctive, intelligible, physical encounters.
Base SHA: `3713cd0923d0eebe5fe920df5da3accc1546c775` (`master`, shared checkout).
Controller: Finish Program (`design/program/finish/README.md`); this ledger is the LW lead's
scoped record, not a competing queue. NOW.md active claims respected: `src/systems/aiPorts.js`
and `src/ai/perception.js` are owned by another agent — read-only for this program.

## Ground-truth summary (six read-only scouts, 2026-11-04)

- 34 canonical enemy IDs — **all reachable**; no dead data. Plus ~30 Brood families, all
  telegraphed with authored counters (`src/data/enemies.js`, `src/data/swarmBrood.js`).
- Commit tiers: capital casts / brood / specialists / mines lock shapes at commit and damage
  reads the same shapes (Tier A, the target contract). Stock doctrine fire telegraphs but
  re-solves lead every tick (Tier B). Ranged doctrines already aim-commit
  (`combatDoctrine.js:1015,1035` `aimCommitBearing` → `aiFireIntent.js:397` `committedCorridorAim`).
- No global attack budget; squad tokens + specialist commit-locks + `SWARM_SHOOTERS_BY_WAVE`
  wave-indexed cap (`survivalWave.js:93`) exist.
- AI sensors have **no asteroid LOS** (contacts ignore rocks; `combat/lineOfSight.js` unused
  there). `aiPorts.js` contact builder is foreign-claimed — deferred.
- Swarm authored-act seam exists: `SWARM_ACT`/`swarmActIssues`/`swarmActPackages`
  (`src/data/swarmMode.js:989-1120`), prior art `mooring_line` waves 25-27. Flag-free
  windows: 32-34.
- Iron Kraken: reachable Swarm waves 7H/19H/31C/37H+ (`ironKrakenForSwarmWave`,
  `src/data/ironKraken.js:87`); full 3-act score with committed beats, weak-point aperture,
  subsystem plates (`src/data/encounters/capital-boss/iron-kraken.js`,
  `src/combat/ironKraken.js`). Gaps: `swarm.character` written but never announced
  (`survivalAnnounce.js` reads `newcomer`/`boss` only); no grasp/hold beat; act 3 reshuffles
  the same three beats; `ballastOffsets` empty; only arms 1↔2 clearance-tested.
- Adventure encounter pipeline: `planEncounters` seeded schedule → script phases → durable
  `state.story.depthProgramEncounters`; `d.` facade gives `setPassive`, `offerChoices`,
  `spawnShips` (per-member passive/doctrine), `spawnProp` (tetherable payload bodies),
  `reportFreightTheft`, `grant/charge/rep`, `resolve`. Script registry
  `ENCOUNTER_SCRIPTS` (`encounterScripts.js:4174`).
- Site: `zone_tethys_checkpoint` (Tethys Junction, `border_checkpoint`) — working customs
  weir cone (`src/world/customsWeir.js:39-55`), 6 authored activity pockets incl.
  `tethys_checkpoint_queue` / `tethys_customs_log` salvors.
- Test runner `node --test <file>`; baseline `npm run check:baseline` (15 links, 90 s);
  wave-15 fixture `node scripts/sim-crowd-stress.mjs` (latest: p95 39.2 ms vs 20 ms floor —
  pre-existing miss, Lane 2 F2); route gate `npm run player-truth -- --mode=swarm|adventure`.

## Top redundancy verdict (census)

`bruiser_armor`/`ship_bastion` shared by 8 roles with mutually exclusive counters (bruiser,
pd_screen, warden, anchor, foreman, regent, furnace_maw, yardmaster) — highest comprehension
gap. `patrol_lawman ≡ customs_cutter` (same hull/silhouette/doctrine/faction). `wasp ≡ choir`
(fodder twins). Fix = role-distinct silhouettes for the specialist trio + patrol/customs
(LW-06), not new species.

## Tickets

### LW-02 — Cargo Weir Ambush (Adventure slice A)
- baseSha `3713cd09`; claimOwner: lead (LW program)
- allowedPaths: `src/systems/encounterScripts/weirAmbush.js` (new),
  `src/systems/encounterScripts.js` (registry hunk only),
  `src/data/encounters/1400-cargo-weir-ambush.js` (new),
  `src/data/encounters/index.generated.js` (regen only), `test/lwf-*.test.mjs` (new)
- forbiddenPaths: `aiPorts.js`, `perception.js`, all foreign-dirty files, `*.expected.json`
- playerOutcome: at the Tethys customs weir, the player meets a salvage crew stripping a
  seized hulk under SCN patrol watch; chooses to hand the hulk to law or steal it through
  the cordon (or refuse/fight); a hostile snare/tether specialist threatens the work; two
  materially different resolutions each write durable story/law/rep/credit consequences.
- sourceOwners: encounterDirector, encounterScripts, customsWeir, lawSecurity, massline/tether
- dependencyIds: none
- hypotheses: a new `weirAmbush` script + deck shape in `border_checkpoint` zones reaches the
  ordinary route; script `fire()` reads `state.player.tether`/prop pose for the physical task;
  `field_anchor_controller`/`tether_control_raider` spawn hostile while salvor+patrol stay
  passive/lawful.
- acceptanceChecks: (a) planner/director test proves the shape fires in-zone via ordinary
  schedule; (b) sim test: tow-hulk-to-patrol → lawful outcome + durable row + rep/grant;
  (c) tow-hulk-through-gap → theft outcome + incident + credit; (d) raider commits its
  native attack; displacement/cut counter works; (e) refuse/attack paths resolve cleanly.
- negativeControls: fire while patrol dead (no lawful witness credit); kill salvors in
  patrol sight (law evaluates, not free); drop the line mid-task (no payout); player leaves
  before choice (timeout); save mid-encounter → outcome not double-minted.
- testCommands: `node --test test/lwf-cargo-weir-ambush.test.mjs`; plus encounter director
  replan + save fixtures.
- evidencePaths: `design/program/lw/evidence/`
- risks: mixed passive/hostile squad semantics; lawful never-fires-on-clean-player gate;
  encounter schedule randomness; prop body lifetime vs stragglers.
- status: designed

### LW-03 — Committed fire for two doctrine roles
- allowedPaths: `src/ai/combatDoctrine.js` (flyby+brawler hunks),
  `src/systems/aiFireIntent.js` (corridor consumption), `test/lwf-*.test.mjs`
- playerOutcome: bruiser passes and interceptor flybys telegraph a committed lane — the
  drawn warning is the actual firing corridor; an early dodge beats it, a late dodge eats it.
- hypotheses: grant `brawler_commit` and `interceptor_flyby` an `aimCommitBearing` at
  telegraph (existing machinery `combatDoctrine.js:1015/1035`, `aiFireIntent.js:397`), and
  make `attackLine` render the committed bearing instead of hull×preferredRange.
- acceptanceChecks: focused doctrine tests — early lateral dodge misses; late dodge hits;
  corridor clamps retarget; telegraph line equals damage line.
- negativeControls: target leaves sensor range mid-cue (abort, no ghost shot); second target
  swap during commit; damaged drive during windup; slow framerate equivalent (tick-exact).
- status: designed

### LW-04 — Swarm act `breaker_yard` waves 32-34 (+ act shooterCap)
- allowedPaths: `src/data/swarmMode.js` (act entries + optional shooterCap field),
  `src/systems/survivalWavePlanner.js` (stamp cap into swarm block),
  `src/systems/survivalWave.js` (honor cap in `_shapeSwarmFire`), `test/lwf-*.test.mjs`
- playerOutcome: three consecutive authored waves — W32 warden screen (break the link),
  W33 jackal mine-lane on debris (shoot/throw the mines), W34 warden+jackal+anchor
  composition with a finite fire gate — each asks a different kill order.
- hypotheses: `SWARM_ACT` pure-data entries pass `swarmActIssues`; optional `shooterCap`
  stamps through `swarmPlanBlock` to `_shapeSwarmFire` (3 touch points, existing seams).
- acceptanceChecks: planWave(32|33|34) returns act packages, distinct gates, ≤24 total;
  shooterCap honored; deterministic across seeds; specialists actually run their cycles
  under the act (sim test); no spawn on escape lane.
- negativeControls: roster-locked enemyId rejected by validator; shooterCap absent → wave
  default; plan identical across two seeds; wave cleared → mines released, no carryover.
- status: designed

### LW-05 — Iron Kraken maturity (announce + trawl beat + act-3 climax)
- allowedPaths: `src/systems/survivalAnnounce.js` (character announce hunk),
  `src/data/encounters/capital-boss/iron-kraken.js` (new beat + act patterns),
  `src/render/ironKrakenVisuals.js`/`ironKrakenMotion.js` (grasp pose channel, if needed),
  `test/lwf-*.test.mjs`, `test/iron-kraken-motion.test.mjs` (arm-pair extension)
- playerOutcome: the wave names the Kraken before contact; a new `mantle_trawl` beat applies
  a real `status_momentum_sink` hold inside a painted bounded sector with the standard
  leave-the-shape escape; act 3 fields the trawl + heavier finale pattern.
- hypotheses: `survivalAnnounce` wave line consumes `swarm.character.name`; a 4th beat is
  pure score data (packet statuses exist: `status_momentum_sink`, yardmaster:75); pose
  channel may be reusable (`maw.*` cues).
- acceptanceChecks: announce line emits on kraken waves; trawl beat locks shape at commit,
  sinks the player only inside, recovers into THROW_WINDOW; death/wreck/receipt unchanged;
  all adjacent arm pairs clearance-tested.
- negativeControls: pause mid-rake (frozen ticks no retro hits — existing `observe` gate);
  sink expires on teardown; interrupted trawl → named cancel; save mid-phase → no duplicate
  fight; second fight after Continue doesn't resurrect.
- status: designed

### LW-06 — Role-distinct silhouettes (warden / anchor / jackal / customs)
- allowedPaths: `src/render/enemyRoleVariants.js` (new builders),
  `src/render/visualFactory.js` (ENEMY_FAMILY_BUILDERS entries only),
  `src/data/enemies.js` (silhouette fields), `test/lwf-*.test.mjs`
- playerOutcome: at gameplay zoom, warden (emitter pylons), anchor (field dish), jackal
  (mine racks) read as different machines without labels; customs cutter shows a plated prow.
  HONEST SCOPE (R2 finding): all four ids ride REQUIRED_WHOLE_SHIP_DEF_IDS authored GLBs —
  the variants render only on the dev/asset-missing fallback seam. The production read
  comes from the authored hulls; this ticket ships resilience art, not a new normal-route
  silhouette. Residual identity hole recorded: tether_control_raider still maps to the
  generic ashline_rig.glb (same as reaver_pirate) — needs an authored variant, not
  procedural.
- hypotheses: builders consume ctx {g,R,pal,hm,accent,cockpit,vis,tier,hints,seed,blinkers};
  variants reuse bastion-proportion hull + signature parts; seed includes enemyId so no two
  roles collide.
- acceptanceChecks: mesh census per silhouette key; no authored-asset regression
  (`check:assets:live` unaffected); distinct silhouettes at 960×540 in a render probe.
- negativeControls: unknown silhouette key falls back (existing); missing variant file →
  factory tolerates; enemy rows without silhouette unchanged.
- status: designed

### LW-07 — Evidence + performance
- allowedPaths: `test/lwf-*.test.mjs`, `design/program/lw/evidence/` artifacts
- playerOutcome: honest proof each slice works on the ordinary route and does not regress
  the wave-15 sim floor.
- acceptanceChecks: `sim-crowd-stress.mjs` baseline vs candidate same-session; player-truth
  swarm + adventure runs (or documented UNKNOWN if harness unavailable); focused suites green.
- status: designed

### LW-R1 / LW-R2 — independent red teams
- LW-R1 physics/fairness critic (frozen candidate, ≥5 attacks: telegraph truth, hitbox
  alignment, perception, reward proof, save mid-phase).
- LW-R2 creative/player critic (remove-one-role test, first-five-minute fun, alternative
  tactic check).
- status: pending slice completion

## Blocked/deferred (named, not dropped)

- **AI sensor LOS through asteroids**: `aiPorts.js`/`perception.js` are under an active
  foreign mutation claim (NOW.md). Deferred; revisit when the claim closes. Workaround for
  encounters: authored cover via spawn placement, not sensor occlusion.
- **Kraken grasp as true tether coupling**: genuine arm-attach physics would need hidden
  bodies — directive's own escape hatch used instead (`mantle_trawl` bounded volume +
  momentum_sink + window escape).
- **Colossus ballast**: `spawnSwarmCapitalBallast` is mission-route only; swarm path has no
  consumer — scoped out, arena rocks already present. UNKNOWN recorded.
