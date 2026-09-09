# Detail Gold Packets — Combat Readability & Encounter Aftermath (Lane C)

> **Clusters:** F (combat readability & anatomy, brainstorm §F items 81-100 + 128-137) · G (encounter verbs, §G items 101-127).
> **Destinations:** **BP-02.1** (combat-readability addendum to BP-02_COMBAT_CEILING) · **BP-01** (encounter aftermath, extends BP-01_WORLD_ALIVE).
> **Governing law:** `DETAIL_DOCTRINE.md`. THE ONE FILTER applied to every item below — *see it / predict it / change it, or it's cost.*
>
> **The lane's thesis in one line:** SpaceFace's SG-06 AI stack already *computes* enemy intent, the scanner already *resolves* wrecks, and `contactThreatTier` already *ranks* mass — the player just can't SEE any of it. This lane is almost entirely a HUD/readability pass over shipped state, plus one genuinely-orphaned momentum toy (subsystem targeting) and the missing feedback loop on encounter aftermath.

## Ground truth this lane surfaces (verified in source)

| Shipped fact | File:line | What it lets us surface without new AI |
|---|---|---|
| `data.ai.fsm` written every tick: `idle/patrol/pursue/attack/strafe/flee` | `src/systems/ai.js:11,161,230` | the **intent banner** — a HUD read, not new AI |
| `ai._attackTelegraph {kind, until}` + `bus.emit('ai:telegraph')` | `src/systems/ai.js:290-301` | pre-attack **telegraph** already fires; needs a visible tell + a counter window |
| `bus.emit('ai:flee')`, `ai.forceFlee`, pirate cargo-jettison-on-flee | `src/systems/ai.js:235,473`, `onboarding.js:730` | **scare-off / disable** as a legible outcome, kills-less-central |
| reinforcement request path + `'Reinforcements have arrived!'` toast | `src/systems/ai.js:120-134`, `director.js:141-147` | **Calling-Reinforcements** intent state |
| `contactMass`, `contactThreatTier(e,hostile)`, `contactStateWord` | `src/systems/scanner.js:234-298` | **threat-tier badge** — the math already exists, unused by targetPanel |
| scanner resolves wrecks → `data.scanned`, `manifest`, `weakPoint` | `src/systems/scanner.js:190-196` | **scan-reveals-loadout** — same pattern, extend from wrecks to ships |
| targetPanel gimmick tags (MASSLINE CUTTER / PD SCREEN / RAM-PLATE) | `src/ui/targetPanel.js:20-35,160-168` | bounty **signature-trick** readout already partly shipped |
| tether attaches to `ship`/`drone` (ATTACHABLE_TYPES) via SG-02 momentum | `src/systems/tetherGameplay.js:22` | **subsystem targeting** rides the existing attachment seam |
| salvage plans wreck POIs from `derelict_field` zones on sector-enter | `src/systems/salvage.js:72-100` | **battle-aftermath persistence** — extend to spawn from actual kills |
| encounterDirector resolves shapes (convoy/patrol/ambush/distress/miniboss) on zones | `src/systems/encounterDirector.js:243-286`, `src/data/encounters.js` | **encounter verbs** are new *shapes*, not new machinery |
| squad roster forms from `ai.squadId` (SG-06) | `REVAMP_MASTER §3.6`, `encounterDirector.js:117` | **wing morale** reads squad cohesion, doesn't rebuild it |

---

# BP-02.1 — Combat Readability Addendum

*Applied after Wave 2 combat lands (hard-freeze §7). All packets are new files + orchestrator-integrated read hooks; none edit `combat.js`/`ai.js`/`uiRoot.js` directly.*

---

### C1. Intent Banner  ★ TOP-3
- **fantasy:** I glance at a hostile and *know* it's about to run, not fight — so I chase instead of brace.
- **pillar:** glance · one-voice
- **wave/BP:** W3 / BP-02.1
- **reuses:** `ai.js` (`data.ai.fsm`, `ai._attackTelegraph`, `ai.forceFlee`), reinforcement path (`ai.js:120`), `scanner.isHostileToPlayer`, tether attachment index (`aiPorts.js:358`), weapon `_heat` (`weapons.js`)
- **newFiles:** `src/ui/intentBanner.js` (world-space label layer over the target + on-screen hostiles), `src/data/intentGlyphs.js` (state→{label,glyph} map)
- **noTouch:** `ai.js`, `combat.js`, `uiRoot.js`, `hud.js` (orchestrator mounts the layer + wires the per-frame read)
- **budget:** spawn:none · voice:none (pure glyph, no `voiceArbiter` traffic) · draw:+1 label layer (cap = 8 concurrent banners, only nearest/target + on-screen hostiles)
- **rng:** none / pure UI
- **states (all read from shipped signals, priority order):** `Calling-Reinforcements` (reinforcement pending) > `Overheating` (all weapons `_heat`≥heatMax) > `Tethering` (has active attachment to player-side object) > `Fleeing` (`fsm===flee`||`forceFlee`) > `Scanning` (`fsm===idle/patrol` && targetsPlayer && not-yet-attacking) > `Intercepting` (`fsm===pursue`) > `Attacking` (`fsm===attack/strafe`). Falls through to no banner for pure ambient.
- **acceptance:** headless `SF` probe: spawn a pirate on `forceFlee`, tick, assert banner reads `FLEEING`; drive one to `heatMax`, assert `OVERHEATING`; screenshot test shows one banner per hostile, ≤8.
- **failureModes:** flicker on 1-tick FSM churn → debounce (min-hold 0.4 s, matches `ATTACK_TELEGRAPH_S`); banner spam in a brawl → cap 8, prefer target + nearest; reading intent the AI can't act on → every state maps to an existing `fsm`/flag, none invented.
- **size:** M

### C2. Threat-Tier + Class Badge  ★ TOP-3
- **fantasy:** the bracket tells me *trivial / fair / dangerous / lethal* before I commit — I pick my fights.
- **pillar:** glance
- **reuses:** `contactThreatTier`, `contactMass`, `contactStateWord` (`scanner.js:234-298`), `SHIPS` role table + `ROLE_LABEL` (`targetPanel.js:13`), scanner reveal gate (C3)
- **newFiles:** `src/ui/threatBadge.js` (renders `⟦glyph⟧ Lv·N · TIER`), `src/data/threatTiers.js` (tier labels + colors + the player-relative math: tier vs player mass/level → trivial/fair/dangerous/lethal)
- **noTouch:** `targetPanel.js`, `hud.js`, `scanner.js`
- **budget:** spawn:none · voice:none · draw:+0 (folds into target bracket + targetPanel head)
- **rng:** none / pure UI
- **relative-threat:** compute `contactThreatTier(target, hostile)` vs the player's own tier → `TRIVIAL/FAIR/DANGEROUS/LETHAL`; **`UNKNOWN`** (grey) until scan-resolved (C3), preserving "unscanned = unknown-threat."
- **acceptance:** target a light interceptor as a heavy player → `TRIVIAL`; target a miniboss → `LETHAL`; target an unscanned contact → `UNKNOWN`, resolves on scan. Colors respect the colorblind palette (BP-10).
- **failureModes:** tier reads as raw HP (it's mass-anchored by design — say "how much hull is pointed at you"); double source of truth vs targetPanel → badge is the *only* tier renderer, panel imports it.
- **size:** S

### C3. Scan-Reveals-Loadout  ★ TOP-3
- **fantasy:** one scan pulse turns a `??? UNSCANNED` bracket into *"Corvette · twin rail · bounty 4k · false manifest?"* — knowledge is the weapon.
- **pillar:** glance · world-was-here
- **reuses:** the wreck-scan pattern (`scanner.js:190-196` sets `data.scanned/manifest/weakPoint`) extended to `ship` contacts; `SHIPS` loadout defs; `data.bountyCr`; smuggler false-manifest hook (`ai.js` pirate cargo)
- **newFiles:** `src/systems/scanReveal.js` (on `scan:pulse`, for in-range live ships set `data.scanRevealed = {loadout, cargoHint, bountyCr, factionId, weakPoint, manifestTrust}`), `src/data/scanReveal.js` (quality-by-distance/sensors/nebula table)
- **noTouch:** `scanner.js`, `targetPanel.js`, `combat.js`
- **budget:** spawn:none · voice:none (a `▪ scan resolved` toast may route through `voiceArbiter` at kind:info, one line) · draw:+0
- **rng:** seeded — `state.scan.rng`; only for false-manifest *presentation* jitter, deterministic per entity id (mirror `weakPointFor` hashing at `scanner.js:83`)
- **scan quality:** full loadout within `NEAR_SCAN_RADIUS`; degrades to class-only at range / in nebula; smuggler shows a **false manifest** until a deep-scan (second pulse in close) flips `manifestTrust:'suspect'` — the 47-A "manifests lie" motif in miniature.
- **acceptance:** unscanned ship shows `UNKNOWN` badge (C2) + no loadout; after pulse, targetPanel lists weapons + bounty; smuggler shows `MANIFEST: SUSPECT`. Golden sim unperturbed (reveal is UI-state only, gated to entities the player scans).
- **failureModes:** reveal leaks into sim decisions → it writes only `data.scanRevealed` (read by UI, never by AI); nebula table hard-coded twice → single source in `src/data/scanReveal.js`.
- **size:** M

### C4. Silhouette Threat Language
- **fantasy:** I read the *shape* before the label — the long triangle is a sniper, the fat wedge is a brawler.
- **pillar:** glance
- **reuses:** ship-class GLB silhouettes (BP-08 assets), `ROLE_LABEL` roles, `contactThreatTier`
- **newFiles:** `src/data/silhouetteRoles.js` (role → silhouette-family + one-word tell: swarmer=darting-dot, sniper=long-triangle, brawler=fat-wedge, hauler=wide-slab, carrier=spoked)
- **noTouch:** render mesh selection (`world.js`), `ships.js`
- **budget:** spawn:none · voice:none · draw:none (uses meshes already spawned; this is a *data contract* the Blender manifest + radar-glyph honor, not new geometry)
- **rng:** none
- **acceptance:** five-second-screenshot test (doctrine §T telemetry gate) — a tester names each on-screen ship's role from silhouette alone ≥80%. Radar glyph family matches the mesh family.
- **failureModes:** decorative only if it informs nothing → each family carries a *tactical* tell (sniper = keep-close, brawler = keep-distance) surfaced in the codex; risk of new geometry → this packet ships **zero meshes**, it's the contract BP-08 fills.
- **size:** S

### C5. Subsystem Targeting (the orphaned momentum toy)
- **fantasy:** I tether-cut a fleeing pirate's *engine* and he drifts helpless — I chose to disable, not kill.
- **pillar:** momentum-toy · glance
- **reuses:** `tetherGameplay.js` attachment seam (ships already ATTACHABLE, `:22`), SG-02 momentum exchange, `data.combat` on target, `weakPointFor` naming (`scanner.js:83`), disable-outcome path (`ai.forceFlee`)
- **newFiles:** `src/systems/subsystemTargeting.js` (a midgame-unlocked mode: while a subsystem is selected on the locked target, a hit/tether on that facing applies a **status** — engines→`drift` (thrust cut), weapons→`disarm` (forces flee/surrender), scanner→`lose-lock`, cargo-clamps→`spill`, tether-spool→`free-object`), `src/data/subsystems.js` (subsystem list + status durations + unlock gate)
- **noTouch:** `combat.js`, `tetherGameplay.js`, `ai.js` (orchestrator wires the status read into damage routing + a UI selector)
- **budget:** spawn:none · voice:none · draw:+1 (subsystem selector ring on target) · **status writes go through the existing damage/status packet (`combat.onHit` `statuses[]`), not a parallel path**
- **rng:** none (deterministic status application; subsystem facing from geometry)
- **acceptance:** select ENGINES on a target, land the hit → target gains `drift` status, thrust reads 0, banner flips to `FLEEING`/drifting; select TETHER-SPOOL on a tug holding a container → container frees. Golden sim: mode is off by default + player-only, so 47-A telemetry stable.
- **failureModes:** parallel status system (determinism risk) → reuse `combat` `statuses[]` only; makes kills trivial → statuses are *timed* and read as an alternative *outcome*, not a damage multiplier; unlock dumped in a menu → unlocked by a mission, revealed by doing (doctrine §P).
- **size:** L

### C6. Telegraph Tell + Counter Window
- **fantasy:** the enemy's guns spool with a bright flare — a half-second where a brake or a tether-break *cancels the shot*.
- **pillar:** glance · momentum-toy
- **reuses:** shipped `ai:telegraph` event + `_attackTelegraph.until` + `ALPHA_TELEGRAPH_S/ATTACK_TELEGRAPH_S` (`ai.js:290-313`), `weapons:vent`, tether-break, brake input
- **newFiles:** `src/ui/telegraphTell.js` (on `ai:telegraph`, draw a spool-glow + a shrinking counter-window arc over that enemy for `until - now`), `src/systems/counterWindow.js` (if the player brakes hard / breaks a tether / hits the weak-point during the window, emit `combat:counter` → the pending telegraph is cancelled by clearing `_attackTelegraph`-equivalent via an event the ai.js already honors)
- **noTouch:** `ai.js`, `combat.js`
- **budget:** spawn:none · voice:none (a `▪` chime via audio-signatures, not a bark) · draw:+1 (glow, pooled)
- **rng:** none
- **acceptance:** trigger an alpha-strike telegraph; a brake within the window emits `combat:counter` and the strike does not fire; no counter → strike lands. Timing == `ALPHA_TELEGRAPH_S`.
- **failureModes:** counter changes sim determinism → the *cancel* is a legitimate AI input the ai.js telegraph loop already models (holding fire); if wiring the cancel back into ai.js is a hot-file conflict, ship the **tell only** (read-only) in W3 and defer the cancel to a BP-02 stop-the-line note.
- **size:** M

### C7. Post-Hit Readability
- **fantasy:** every hit *tells* — shield ripple, armor sparks, hull venting, engine cough, cargo spill — I read damage state without a bar.
- **pillar:** glance
- **reuses:** `combat.onHit` result (`shieldBroke`, layer routed), existing `camera:shake`, `loot:drop`/pickup spawn on kill, pirate cargo-jettison
- **newFiles:** `src/systems/hitFeedback.js` (subscribes to the damage-result bus event → maps `{shieldBroke, layer, overkill}` to a VFX-per-significance cue: shield=ripple, armor=sparks, hull=venting-jet, dying=engine-cough)
- **noTouch:** `combat.js`, render core
- **budget:** spawn:none · voice:none · draw:VFX-per-significance (hard cap: one cue per hit-event, pooled; no per-frame emitters)
- **rng:** cosmetic `Math.random` allowed (guarded by `typeof window`, doctrine contract §1)
- **acceptance:** break a shield → ripple + distinct tone (audio-sig lane); armor hit → sparks; hull venting persists while hull<30%. No cue exceeds the VFX budget under a 6-ship brawl (hitch-budget gate).
- **failureModes:** unbounded VFX (perf) → one cue per significant event, pooled, `typeof window`-gated; cosmetic drift into sim → reads results only, writes nothing to state.
- **size:** M

### C8. Posture / Stability (separate from HP)
- **fantasy:** I ram a heavy brawler and it *staggers* — knocked off its firing line even though its hull is fine.
- **pillar:** momentum-toy · glance
- **reuses:** SG-02 impulse/momentum (ram, tether-strain, explosive-push already move ships), mass (`contactMass`), `data.combat`
- **newFiles:** `src/systems/posture.js` (a per-ship `stability` 0..1 that *drains* from impulse events (ram/tether-strain/blast) and *recovers* over time; heavy ships resist (mass-scaled), skilled/named pilots recover faster; at 0 the ship is **staggered** — a short window where it can't hold a firing line, surfaced by the banner + a wobble)
- **noTouch:** `combat.js`, `ai.js`, `flightV3.js`
- **budget:** spawn:none · voice:none · draw:+0 (banner state + wobble anim) · **stability is a new field, one source of truth in `src/data/posture.js`**
- **rng:** none (deterministic from impulse magnitude + mass)
- **acceptance:** tether-slingshot a light skiff into a wall → `staggered`, banner shows it, it holds fire ~1 s; do the same to a capital → barely dents stability. Golden sim: posture only reacts to impulses the sim already produces; feed it via a read hook, assert byte-stable 47-A if NPC-vs-NPC posture is left inert (player-involved only) — otherwise document the new domain in the merge checklist.
- **failureModes:** second HP bar (cost, not detail) → it must *change* a fight (staggered = counter window), never just decorate; determinism → if it touches NPC-vs-NPC it needs a seeded domain + golden re-baseline; ship **player-target-only** first to stay off the golden path.
- **size:** L

### C9. Kills-Less-Central: Disable / Scare-Off Outcomes
- **fantasy:** a beaten pirate *runs* — dumps cargo and flees — and that's a win, not a failed kill.
- **pillar:** world-was-here · one-voice
- **reuses:** shipped `ai:flee` + `forceFlee` + pirate cargo-jettison (`ai.js:235,473`), `spawnBudget.release` on despawn, salvage of dumped cargo, `voiceArbiter` for the one-line outcome
- **newFiles:** `src/systems/combatOutcome.js` (classifies how a hostile *left* the fight — `killed` / `disabled` (C5 status) / `fled` / `surrendered` — and emits one outcome line + a rep/economy consequence hook)
- **noTouch:** `combat.js`, `ai.js`, `missions.js`
- **budget:** spawn:none (release only) · voice:1 line via `voiceArbiter` (`kind:combat`, post-combat) · draw:none
- **rng:** none (classification is deterministic from terminal state)
- **acceptance:** drop a pirate to flee-threshold → it flees, `combatOutcome` emits `FLED` (one line), no kill-credit but a rumor-heat/rep tick; disable via C5 → `DISABLED`, capturable. First-15 ritual (doctrine §P) shows a pirate that tolls then flees at low hull.
- **failureModes:** two voices (kill toast + outcome line) → route both through `voiceArbiter`, outcome supersedes; flee exploited as farming → fled hostiles "return bigger if spared" is BP-13's job, this packet only *reports* the outcome.
- **size:** M

---

# BP-01 — Encounter Aftermath & Verbs

*Extends BP-01_WORLD_ALIVE via `encounterDirector` shapes + `salvage` provenance. All new shapes; no new spawner (spawnBudget stays the arbiter).*

---

### C10. Encounter-Verb Shapes  ★ (highest BP-01 leverage)
- **fantasy:** every fight teaches a *physical verb* — I clear a minefield by whipping tethered debris through it, I win a tug-of-war over a container.
- **pillar:** momentum-toy · glance
- **reuses:** `encounterDirector` shape resolution (`encounters.js` catalogue), `sectorZones` placement, tether + SG-02 momentum, `spawnBudget` (all shapes are budget clients), `salvage` props
- **newFiles:** `src/data/encounterVerbs.js` (four new shapes appended to the catalogue pattern: **mass-duel** (asteroid cover, one brawler + rocks), **cargo-tug-of-war** (an opposed tug both-tether a container), **rescue-under-fire** (a drifting pod into a hazard ring + a harasser), **minefield-billiards** (mine zone + tetherable debris)), `src/systems/encounterVerbProps.js` (spawns the *props* — container/pod/mines/debris — deterministically per encounter)
- **noTouch:** `encounterDirector.js`, `spawnBudget.js`, `world.js`
- **budget:** spawn:≤3 ships per shape **via spawnBudget** (well under MAX 12) · voice:1 setup bark (`kind:encounter`) · draw:+props (pooled, cap per shape)
- **rng:** seeded — the director's existing sim RNG (each shape declares no local RNG, per `encounters.js` header)
- **acceptance:** enter a zone that fires `minefield-billiards`; a tethered rock detonates a mine chain; `cargo-tug-of-war` — winning the tether pull claims the container. Each shape = one verb + one prop set + one AI behavior + one consequence (doctrine §T gold-packet gate).
- **failureModes:** spawn-budget war → strictly `request()`/`release()`, ≤3 each; verb not teachable → each shape has exactly one prop that *demands* the verb; props orphan on teardown → props tracked like salvage points, culled on sector exit.
- **size:** L

### C11. Battle-Aftermath Persistence (wrecks → salvage POIs, with provenance)  ★ TOP-3
- **fantasy:** the debris where I won an hour ago is still there — a scavengeable wreck field that *remembers* the fight.
- **pillar:** world-was-here
- **reuses:** `salvage.js` derelict-field POI planner (`:72-100`), `entity:killed` event (`combat.kill`), `sectorSim` offscreen-loss ledger (doctrine §1 "who died here"), `wreckMissions`, tether-haul
- **newFiles:** `src/systems/aftermathWrecks.js` (on `entity:killed` in a zone, drop a **persistent wreck marker** with provenance `{victimClass, killerId, tick}`; on re-entry, `salvage` treats these markers as ad-hoc salvage points alongside derelict zones)
- **noTouch:** `salvage.js`, `combat.js`, `sectorSim`
- **budget:** spawn:none (wreck entities are non-hostile world props, not spawnBudget ships) · voice:none · draw:+wrecks (cap N per sector, LRU-cull oldest — memory-per-sector budget)
- **rng:** seeded — `state.salvage.rng` for loot pools (mirrors existing salvage determinism)
- **acceptance:** kill 3 ships in a zone, leave, return → a wreck field with matching classes; scan a wreck (C3 pattern) → manifest + "who died here" provenance line; station news echoes the loss (marketNews hook). Provenance answers doctrine §1 "no random spawn without provenance."
- **failureModes:** unbounded wreck accumulation (memory) → hard cap + LRU per sector; wrecks read as random litter → each carries provenance surfaced on scan; double-spawn with derelict fields → aftermath markers and zone salvage share one point list.
- **size:** M

### C12. Wing Morale (surface squad cohesion)
- **fantasy:** I kill the squad *leader* and the rest scatter — targeting priority becomes a tactic.
- **pillar:** glance · world-was-here
- **reuses:** SG-06 squad roster (`ai.squadId`, `squad.js`), `entity:killed`, `ai:formationBroken` event (`ai.js:404`), `ai.forceFlee`, `ai:flee`
- **newFiles:** `src/systems/wingMorale.js` (subscribes to `entity:killed`; on a squad's *leader* death, sets surviving members' `forceFlee`/scatter and emits a one-line "SQUAD BROKEN" cue; on escort death, marks the ward `enraged`; on comms-disable, blocks that squad's reinforcement request)
- **noTouch:** `ai.js`, `squad.js`, `director.js`
- **budget:** spawn:none · voice:1 cue via `voiceArbiter` (`kind:combat`) · draw:none (reads into the intent banner C1 — scattered members flip to `FLEEING`)
- **rng:** none
- **acceptance:** kill a flagged leader → survivors flee within 1 s, banner confirms, "SQUAD BROKEN" once; disable-comms on a squad → no reinforcement toast fires. Reuses the shipped formation-broken event, adds no formation logic.
- **failureModes:** rebuilding squads (forbidden, §3.6) → this only *reads* roster + writes `forceFlee`; leader undefined → falls back to highest-mass member; two cues → single `voiceArbiter` line.
- **size:** M

---

## CUT / DEFER (no packets written)

| Item (brainstorm §) | Action | One-line reason |
|---|---|---|
| Boarding / slaver / disable-and-board branches (§D,F) | **DEFER** | doctrine §8 gold-plating; no walking-interior scope this decade |
| Newtonian trick medals / drift-kill medals (§H via F) | **DEFER** | doctrine §8 named gold-plating |
| Bribe-to-escape / surrender-if-disarmed *branch trees* (§D,F) | **DEFER** | C9 ships the *outcome report*; full branch economy is BP-13 pirate ecology |
| Combat-court after reckless secure-space kills (§G) | **DEFER** | belongs to BP-12 customs/law, not combat readability |
| Revenge contracts from repeatedly-hit factions (§G) | **DEFER** | contracts engine (BP-12/13); C11 leaves the wreck breadcrumb it would read |
| Named-ace flee-and-remember + faction news (§D,F) | **DEFER to BP-13** | BP-13 owns pirate ecology + aces; C9/C11 provide the hooks (outcome + wrecks) |
| Any combat spawn not via `spawnBudget` | **HARD CUT** | contract §3 — all C10 shapes are budget clients |
| Any combat bark bypassing `voiceArbiter` | **HARD CUT** | contract §4 — C9/C10/C12 route one line each |
| Per-frame flavor damage rolls without a seeded domain (§F) | **CUT/RESHAPE** | C7 uses `typeof window`-guarded cosmetic RNG only; sim path stays seeded |

## VALIDATED — already shipped, do NOT rebuild

- **Ambush-from-cover / ambush signatures** (§D,F) ≡ `encounterDirector` `ambush` shape on ambush-lane zones (`encounters.js:53`). C10 adds *new* verbs beside it, doesn't reinvent ambush.
- **Pre-attack telegraph exists** (§F) ≡ `ai._attackTelegraph` + `ai:telegraph` (`ai.js:290-301`). C6 makes it *visible* + adds the counter; the telegraph itself is shipped.
- **Bounty signature-trick readout** (§E,F) ≡ targetPanel gimmick tags MASSLINE CUTTER / PD SCREEN / RAM-PLATE (`targetPanel.js:20-35`). Already surfaced; C2 sits beside it.
- **Wreck scan-resolve to manifest + weak-point** (§F,K) ≡ `scanner.js:190-196` (`data.scanned/manifest/weakPoint`). C3 extends the *same pattern* to live ships.
- **Contact threat tier math** (§F) ≡ `contactThreatTier`/`contactMass` (`scanner.js:234-248`). C2 renders it; the ranking is shipped.
- **One-word contact state** (§F,N overview intent) ≡ `contactStateWord` HOSTILE/PATROL/TRADER/MINER/WINGMAN (`scanner.js:280-298`). C1 is its world-space richer sibling for the *target*, one voice at a time.
- **Reinforcement escalation** (§F,G) ≡ director `reinforce` action + `'Reinforcements have arrived!'` (`director.js:141`, `ai.js:132`). C1 surfaces the *pending* state as an intent.

---

## Ranking (distance-from-shipped × first-15 / 47-A visibility)

**Top 3 this lane:**
1. **C1 Intent Banner** — transforms every hostile encounter, visible in the first-15 first-combat beat; pure read over `ai.fsm`.
2. **C11 Battle-Aftermath Persistence** — the strongest "world was here" proof, directly answers doctrine §1 provenance, and is the salvage POI the 47-A "who died here" slice reads.
3. **C3 Scan-Reveals-Loadout** — the scan pulse is a first-15 taught verb; turning `??? UNSCANNED` into a manifest (with the false-manifest 47-A motif) is high visibility for low new machinery.

*(C2 Threat Badge is a close 4th — S-size, first-bracket-you-ever-see, but it renders C3's reveal so it ranks just under it.)*
