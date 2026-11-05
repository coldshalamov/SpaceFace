<!-- LIFETIME: ACTIVE_PROGRAM -->
# SWARM configuration audit — what I would have set differently

Companion to [`README.md`](./README.md). Read 2026-11-05 against HEAD `8f02eae2bb39`+. Every row
names the live setting, **why it was set that way** (the original comment — do not skip it, it is
what a reviewer will cite to revert you), what Swarm should do instead, the risk, and the check.

**The rule for every row:** change it **through the Swarm feel profile** (Plan S1), not by editing
the shared constant, unless the row says *global*. The profile is applied only during a live Swarm
run and must reach the simulation when it runs in the worker (`src/core/simLaneMain.js`,
`wholeSimBrowserWorker.js`). Swarm determinism references will legitimately change — follow the
repo's precedent for intentional changes (versioned references, as `d79f80309801` did for
save-v23); **never overwrite the old references**.

Already fixed by the Feel Contract (`design/FEEL_CONTRACT.md` §A, Sept 2026) — **do not
re-propose**: governor eating earned speed (A1/A2), NPC speed truncation (A4), slams never taking
the helm (A5), terrain damage from capped momentum (A6), sluggish thrust/turn ratio (A7), weak
starter impulse (A8), bungee Massline (A9), no hit-stop on collisions (A11).

---

## A. Physics — the demolition derby

| # | Setting (file:line) | Now | Why it was set | Swarm should be | Risk | Measure |
|---|---|---|---|---|---|---|
| P1 | Craft contact material, `src/core/sg02DynamicBodyOwner.js` ~150 (`CONTACT_MATERIALS`), `src/core/physics.js:68-78` | Craft restitution 0, **Min** combine; asteroid 0.24, station 0.05 | A piloted ship glancing a rock should scrape, not bounce onto a new heading (player control) | Player: unchanged. **Enemy hulls in Swarm:** restitution 0.3, **average** combine vs rock/plates; ship-vs-ship 0.35 | Enemies jitter along walls; AI loses its line | Throw fixture: Wasp at 120 WU/s into rock → rebound 30–45 WU/s; AI path test still passes |
| P2 | `MAX_CONTACT_DV = 40` wu/s per tick (`sg02DynamicBodyOwner.js:171`) | Every non-tumbling body's contact response capped | Solver spikes from deep overlap launched hulls "like a cannon" (measured flings to −1.27 MWU) | Keep for overlap recovery. When the **other** body in the contact is tumbling or thrown (has impulse provenance) and the closing speed is a real impact (> 30 WU/s pre-solve), use the tumble bound (160) for the **victim** too — the bowling-pin rule | Rare solver spikes escape the clamp | Pin test: tumbling Wasp at 150 WU/s into a 5-Wasp cluster → ≥ 3 victims leave at > 40 WU/s; overlap-spawn test still bounded |
| P3 | `TUMBLE_RESTITUTION = 0.6`, `TUMBLE_ANGULAR_DAMPING = 0.05` (`sg02…:189-196`) | "Placeholders; nothing has tuned them" | Slice A of the hull-burst overhaul; tuning was owed | Tune under the profile by feel: try 0.55–0.75; spin decay so a thrown hull still spins visibly after 2 s | Pinball reads as random | Capture 10 throws; judge "readable ricochet" against README §4 |
| P4 | Pull = gravity well, `src/data/fields.js:155-180` | strength 240, damping 5.33 → bodies **converge at 45 WU/s**; radius 190; lasts 9 s; cooldown 7 s | PQ-137.09 "convergence, not a clamp" — pile loose mass gently; heavies shrug | Two beats: **yank** (1.2 s: strength ×3, damping ×0.35 → convergence ~150 WU/s so bodies collide above the crumple threshold of 30 and damage each other) then **hold** (2 s at today's law). Cooldown 6 s | Overkill; the pile becomes a mess | Wave-3 fixture: one well on a Brood tide → ≥ 8 credited kills; on 5 Wasps → ≥ 2 kills by collision |
| P5 | Shove = repulsor, `fields.js:183-195` | strength 300, lasts **7 s**, cooldown 8 s | "The Plow": a lingering berm you bowl into | A **punch**: 0.35 s burst at ×3 strength, then a 1.5 s fading berm. Cooldown 5 s | Too strong vs the player's own throws | Shove at 5 Wasps in 120 WU → all leave ≥ 90 WU/s, ≥ 2 tumble |
| P6 | Dying window, `src/combat/lifecycle.js:39-55` | Wasp (mass 16) explodes **0.55 s** after the kill; up to 3 s for heavies | A kill is a hull failing physically, then one rupture (design/combat-convergence/08) | **Light (≤ 32 t): burst on the kill tick** (window 0) in Swarm. Medium: 0.5 s. Heavy/boss: keep — that is spectacle | Kill credit/loot ordering assumptions | Kill → burst VFX within 1 tick in the fixture; heavy unchanged |
| P7 | Terrain crumple threshold 30 WU/s (`src/combat/impulseKernel.js` `TERRAIN_CRUMPLE_LAW`) | Below 30 WU/s nothing is damaged | Gentle scrapes stay soft | Keep 30. P4/P5 must deliver bodies **well above** it; that is the actual fix | — | Covered by P4/P5 checks |

## B. Combat — mowing the horde

| # | Setting | Now | Why | Swarm should be | Risk | Measure |
|---|---|---|---|---|---|---|
| C1 | Starter pulse laser, `src/data/weapons.js:46-59` | 5 dmg × 5.5/s = 27.5 DPS | Row 482: guns are "the nudge and the finisher"; physics should be the weapon | Superseded for Swarm (README §6). Fodder must die in ≤ 0.5 s of focused fire from **any** starter build | Physics stops mattering | TTK table for every starter build vs Wasp, Zealot, Dart, Mite |
| C2 | Wasp Swarmer, `src/data/enemies.js:31-42` | hull 55 + shield 25 (regen 5) + armor 8 | A readable approach; answerable by movement and recoil | In Swarm: **fodder carries no shield**; hull scaled so C1 holds (≈ 20–25 vs the pulse). Shields belong to support/elite types where the blue hit-flash *means* something | Waves too easy; the chain trivial | Tune via wave length (Plan S9): 60–90 s per round |
| C3 | Ship roster spread, `enemies.js` + `SWARM_ROSTER` (`src/data/swarmMode.js:319`) | maxSpeed 105–126 for nearly all; radius 10–20; mass 16–70 | Each archetype was authored alone, balanced against the player | **Spread for silhouette and role**: darts r 8 / 170 WU/s; fodder r 12 / 120; bruiser r 34 / 75 WU/s / mass ≥ 150 (= `HEAVY_AS_TERRAIN_MASS`, can't be thrown, *is* a wall); sniper slow and far; one giant per boss wave. Swarm overrides via the profile at materialisation (`src/systems/waveMaterialization.js`) | Collision radius changes AI spacing and pathing | Silhouette lineup screenshot; AI spacing tests |
| C4 | Four defensive layers on fodder (hull, armor, armorFlat, shield + regen) | Every enemy uses the full RPG stack | One damage model for the whole game | Swarm fodder: hull only. Elites: + armor. Supports: + shield. A layer must be **visible** (plating, a bubble) or it should not exist on a Swarm body | — | Visual check: every protected enemy shows its layer |
| C5 | NPC weapon damage overrides (wasp 6 @ 8 rps etc.) | Many weak bolts | Fair Adventure fights | Swarm danger comes from **telegraphed abilities and numbers**, not chip damage: fewer, slower, more visible enemy shots (bigger bolts, brighter, ~60% speed) | Swarm becomes too easy | Death-cause table from 10 runs: ≥ 50% of deaths from a telegraphed ability or the room |

## C. Enemy character

| # | Setting | Now | Swarm should be |
|---|---|---|---|
| E1 | Brood draw size, `src/render/broodPresentation.js:55` | Nose-to-tail ~5 WU; dark materials | ×1.5 draw scale (collision unchanged); one saturated emissive per family; death pop |
| E2 | Brood population, `src/data/swarmBrood.js:52-55` | 100 at wave 1 → 400 at wave **21** | Reach ~300 by wave 6 (profile curve); the horde must be visible early. Gate on the laptop A/B (README guardrail) |
| E3 | Ship telegraphs, `enemies.js` `telegraph:` fields | Mostly a bark line + cue id | A visible in-world tell per ability (charge line, target ring, sniper beam, engine flare) ≥ 0.6 s before it lands |
| E4 | Arrival, `SWARM_SPAWN_DISTANCE = 165` (`swarmMode.js:301`) | Ships appear 165 WU from the player — about one screen; they pop in just off-frame | Arrive through **gates** at the arena edge with a 1 s gate flare and a visible group; never materialise within 1.3 screens |
| E5 | Last enemies, `leashRadius` 2200–3000 on every roster ship | The last Wasp idles ~340 WU away | When ≤ 3 remain: pursue the player (`pack_pursuit` stamp) + edge pointers |

## D. Controls and UX

| # | Setting | Now | Swarm should be |
|---|---|---|---|
| U1 | `src/ui/bindings.js` | "Every letter already owns a flight verb" | Swarm control set: WASD move, mouse aim, LMB fire, RMB Line, 1–5 powers (kept), Space boost/dash, Q/E dedicated call-in and bomb, Esc pause. Every other Adventure verb is inert in Swarm, and the help card shows only these |
| U2 | Power rail (ORRERY cluster) | Shows `DRIVE F8` (travel drive) + word labels | Six icons, key number, cooldown fill; no travel drive |
| U3 | Readout | "SCORE 0 · CR 779 · LV 1" during the round | Chain + round progress only; credits on the shop; score on Run Over |
| U4 | Setup flow | Splash → motion → First light → Encounter → Ship & Kit → Armory | Title **SWARM** button straight to round 1; first-run prompts once per machine |
| U5 | Shop | `offerDraft` pool includes the generated catalog (`swarmCatalogOffers`) | Three authored cards; catalog behind "Browse all" |
| U6 | Camera | Pushes in on the Line move and stays in | Swarm framing shows the horde; brief punch only for pile-ups, boss entrance/death |
| U7 | Chatter | No Swarm gate in `barkDirector.js`, `faction_archive.js` | Swarm glass admits only fight sources (Plan S2) |

## E. Presentation and spectacle

| # | Setting | Now | Swarm should be |
|---|---|---|---|
| V1 | Bomb flash | Whited out ~40% of the screen (observed) | **Global**: flashes ≤ 15% area, ≤ 0.2 s; the size moves into the world (shockwave ring, debris, light) |
| V2 | Light-hull death | Burst after 0.55 s; `DYING_FRAGMENTS.light = 0` | Instant directional burst along the killing impulse, 4–8 sparks, short smoke puff, a chunk or two for anything ≥ 30 t |
| V3 | Heavy-hull death | Dying window + rupture + 2 fragments | Keep the window; add a real **break-up**: 3–6 chunks as throwable bodies, a fire trail, a shockwave that shoves nearby bodies (the shove *is* gameplay) |
| V4 | Kill audio | One collision sample family; mass term exists for collisions | Kill pop pitched by enemy size; multi-kill pitch ladder; pile-up boom + sting |
| V5 | Music | ~36 s of authored music (`REPORT_CARD.md`) | A Swarm loop with intensity stems that rise with wave pressure and drop in the shop; a boss layer. If no new music can be authored, stem the existing score engine (phases, 25 keys) by wave state |
| V6 | Arena identity | The Foundry plays as open space beside a flat painted planet | Each arena's own props, lighting and backdrop in the round; the menu picture must match the round |
