<!-- LIFETIME: ACTIVE_PROGRAM -->
# SWARM — the game we are on the edge of

**Owner direction, 2026-11-05.** Swarm is the mode to perfect. Its fun is the most obvious, and
every system that makes Swarm more fun pays back into Adventure. This is a **taste audit and a
build program**: describe the great Swarm game this code is close to, name every place the live
game falls short of it (including configuration, controls and physics settings that are "set
differently than a good designer would set them"), and give agents plans specific enough that
weak taste cannot ruin them.

Performance is **not** this program's job (separate work owns it). Every plan here obeys one
guardrail instead: *no new per-frame cost without a matched before/after on the owner's laptop.*

| File | What it is |
|---|---|
| this README | the vision, the diagnosis, the taste bar, owner rulings this supersedes |
| [`AUDIT.md`](./AUDIT.md) | the configuration audit: every setting I would have set differently, with file, current value, why it was set, proposed value, risk, and how to measure |
| [`PLANS.md`](./PLANS.md) | the agent plans, in order, each with allowed paths, tests, look checks, and "how you will get this wrong" |
| [`LANES.md`](./LANES.md) | the two lanes (F — the fight, S — the show), exact file ownership, hand-offs, and both copy-paste agent prompts |

Read all of this README before taking any plan. The taste bar (§4) is the acceptance standard.

---

## 1. The vision — what Swarm should feel like

Think **Call of Duty Zombies** in a **physics demolition derby**, top-down, in space.

Wave after wave of enemies pour into an arena. You are blasting them — guns mow the small stuff —
but the real weapon is the arena: rocks, plates, machinery, wrecks, the enemies themselves. You
have a handful of powers (a gravity gun that drags the pack into a ball, a shove that bowls it
into a wall, a rope that lets you swing a heavy thing through the crowd, bombs, pins). Every
heavy thing in the room is a potential weapon and a potential threat. Between waves you take a
breath, buy one exciting upgrade, maybe fortify a choke point, and launch the next wave.

What makes it classic:

1. **A horde you can feel.** The screen genuinely fills: hundreds of small bodies (the Brood)
   plus a few dozen real ships. Mowing a crowd is satisfying in itself.
2. **The environment is the key — friend and enemy.** A pinball reef that bounces everything; an
   ice orchard that shatters into shrapnel; a crusher that eats whatever drifts into it, including
   you. Big kills come from using the room. Bad positioning near the room gets you killed.
3. **Enemies with character.** Each type is recognisable at a glance by shape, colour, size and
   motion, and each has one thing it does that you learn to fear or exploit: the dart that rams and
   explodes, the spitter that paints a target ring then lobs acid, the leecher that latches on and
   drags your speed down, the bruiser that is too heavy to throw, the sniper that kites from range
   with a visible charge line. You hear the round's composition and know what you're in for.
4. **Wave rhythm.** Pressure → release → choice → pressure. Rounds are short (60–90 s). Each new
   enemy type debuts alone so you learn it. Special rounds break the pattern. A boss every few
   waves.
5. **Spectacle that explains itself.** Big, directional, physical explosions; hulls that break
   into tumbling chunks; shockwave rings; fire and smoke that linger; impacts that thud with
   weight; slow-motion on a huge pile-up. Never a white screen. You always see what caused what.
6. **The run is a snowball.** Picks combine into build identities ("the gravity build", "the ram
   build"); late waves let you do absurd things you could not do at wave 1.
7. **Clean, confident presentation.** One readable HUD, plain words, one voice, no clutter.

## 2. The headline finding — it is mostly built, and buried

Almost every piece of that game already exists in this repo:

| Classic element | Already in code | What is wrong with it today |
|---|---|---|
| Horde | Brood engine: 100–400 flocking bodies, one draw call (`src/systems/swarmBrood.js`, `src/render/broodPresentation.js`) | Invisible at the gameplay camera — small, dark, no death pop |
| Enemy character | 9+ Brood families with telegraphed attacks (Mite, Spitter, Spore Drift, Charger, Lantern Cyst, Leecher, Glassback, Wake Eel, Bellows…); 16 ship archetypes on a roster clock (`src/data/swarmMode.js`) | Ships are one template (small strafing gunships, speeds 105–126, radius 10–20); character lives in comments and doctrine names, not silhouette/motion/ability |
| Arena as weapon | Arena ladder + cull rooms: Reef Pinball (high bounce), Ice Orchard (shard ricochet), Breaker Field (cut ammunition), crushers, bank plates | The room I played (Ricochet Foundry) read as open space next to a flat painted Saturn |
| Gravity gun etc. | Five powers on 1–5 (Pull/Shove/Pin/Bomb/Rig), the Line, Gyre | Pull converges bodies at 45 WU/s and brakes anything faster: things drift into a pile instead of slamming |
| Zombies staples | Supply drops, call-ins (smart bomb, orbital lance, turret drop, drone wing, shield dome), perks, special-round events, Fortify (4 build types, repair, rearm) | Hidden behind a 107-row price catalog and setup screens; no ceremony |
| Pick-one upgrades | `offerDraft()` returns 3 seeded offers; ~42 authored verb cards; Domino and Graviton Heart legendaries | The screen shows the catalog instead |
| Chain/juice | Chain owner, pile-up detector, hit-stop from collisions | Credits things the player did not do; jargon callouts |
| Boss | Iron Maw (plates to rip, ballast to throw), Foreman, Regent rotation | Wave 10+, no ceremony, dies without becoming ammunition |
| Big explosions | Bomb VFX, hull-burst modules, dying-hull rupture, fragment families | A bomb flash whited out ~40% of the screen; the rest is unmeasured |

**So the program is:** surface, retune, give character, clean the glass, and add very few new
things. Most of the work is taste and configuration, not systems.

## 3. What I saw (played 2026-11-05: title → Crucible → Quick Play → round 1)

The "before" pictures are committed in [`baseline/`](./baseline/) — look at them before you start
any plan; they are what "wrong" looks like: `01-round1-open-space`, `02-idle-chain9-pileup`
(ship at rest, no input), `03-jargon-and-line-panel`, `04-bomb-whiteout`,
`05-last-enemy-offscreen`, `06-armory-catalog`, `07-foundry-menu-art` (compare with 01).

1. **Six gates before the first shot**: splash → motion ask → "First light" prompt → Encounter
   tab (4 modes × 4 stakes × 7 arenas) → Ship & Kit (10+ starter builds) → an 81-item Armory
   opening on a "wager".
2. **The shop is a catalog**: 107 price-sorted rows ("Harbor Brake Set S", "Shield Liner S").
3. **The screen talks about things that are not the fight**: Adventure barks and faction news
   during the round (*"SKIFF-RECTO: The courier reaches its shelf. A page changes hands."* —
   `barkDirector.js` / `faction_archive.js` have no Swarm gate); a left-side jargon stack
   ("WINDOW CLOSED", "LINE RELEASED 16T — MESSY", "CLEAN SNAG 93", "IMPACT LOGGED — 504",
   "MASS 48672 · WON'T BUDGE"); an enemy detail card; "SCORE 0" next to rising credits.
4. **Credit for nothing**: ship at rest, no input, no ship dead — chain 9, "PILE-UP ×2",
   "ARENA: SHUNTED ×9".
5. **Specks and a hiding last enemy**: Brood not noticeable; the last Wasp idled off-screen.
6. **The arena is not the one advertised** (menu art: enclosed red-lit foundry; round: open space).
7. **A bomb flash whited out ~40% of the screen**; the camera pushed in on the Line and stayed in.
8. **Controls carry the whole Adventure keyboard**: "every letter already owns a flight verb"
   (`src/ui/bindings.js`); the Swarm power rail shows `DRIVE F8` (a travel drive, useless in an
   arena) and words for every power.

## 4. The taste bar (every plan is judged against this)

**References** — study the named quality; never copy art, names or UI:

| Game | The quality to study |
|---|---|
| Call of Duty Zombies | wave rhythm, round counter, breathers, special rounds, the boss, drops and perks that feel like events |
| Vampire Survivors | screen-filling horde; mowing is satisfying in itself; build snowball and evolutions |
| Geometry Wars | legibility at density: every enemy a bright distinct glowing shape; explosion particles that read as energy |
| Nova Drift | momentum flight + pick-one-of-three upgrades that change how you play |
| Burnout / Wreckfest (demolition) | impact weight, crunch, slow-mo on the big crash, wrecks that stay in the arena |
| Katamari Damacy | the snowball: grab, fling, more chaos |
| Hades | the between-round choice is a highlight |

**Always:**
- Fodder dies fast to guns (≤ 0.5 s of focused fire); physics makes the multi-kills and handles
  the heavies. *(Supersedes the 2026-10-2x "guns are the nudge and the finisher" ruling, row 482,
  for Swarm only — owner 2026-11-05: "you're blasting them".)*
- Every enemy type is identifiable by **shape + colour + motion** with the HUD hidden.
- Every big effect is **big in the world**: directional, physical debris, shockwave ring, dynamic
  light, lingering fire/smoke. Never a screen-wide white flash.
- Every cause is visible: you can always say what killed what.

**Never** (a plan that does any of these is not done):
- Adventure chatter, lore, news, landmark, codex, faction or contract text during a round.
- A word or number a spectator cannot understand (tonnage, mass, "SNAG", "MESSY", "WINDOW",
  "LOGGED", ids).
- Crediting, counting or celebrating what the player did not cause.
- A flash/overlay over ~15% of the screen or held over ~0.2 s.
- A new currency, item tier, menu layer or meta system (the plans name the few new things allowed).
- Tuning a shared constant globally when the change is for Swarm — use the Swarm feel profile
  (Plan S1). Adventure must not change unless a plan says "global".
- The fix in a dev flag, lab screen or test route. It must be on the ordinary route.
- Calling it done on green tests alone. Look work needs screenshots judged against this section.

**On-screen budget during a round:** persistent = chain number + round progress (top center),
hull/shield ring (bottom left), power bar as icons with key numbers and cooldown fill (bottom),
radar (bottom right). Transient callouts = top center, ≤ 3 visible, ≤ 3 words, plain English.
Larger text only for round title and boss name card (< 2.5 s).

**Enemy powers.** *(Updates the 2026-10-21 "enemy physics weapons rare only" ruling for Swarm —
owner 2026-11-05: "the enemies have powers and behaviors that make them recognizable and
formidable".)* Enemies get **telegraphed abilities and behaviours** (charge lines, target rings,
latches, shields, mines, sniper beams). Only one or two archetypes use a true physics weapon
(e.g. a tug that tows you, a shover that bowls rocks at you). Every ability telegraphs ≥ 0.6 s
before it lands and is dodgeable.

**Proof every plan supplies:** focused tests green; before/after screenshots at the gameplay
camera on the ordinary route (Browser pane visible — a hidden pane throttles to ~1 fps and stalls
loading at 87.8%) judged line by line against this section; one live round on the laptop; and
**one independent review** of the screenshots against this section by a different agent before
landing (Finish README §5.3 allows one claim-relevant review).

## 5. Global vs Swarm-only

Default: **Swarm-only**, gated on a live Swarm run (`state.run.kind === 'survival'` and
`isSwarmRuleset(state.run.ruleset)`), or on the Swarm feel profile. Marked **global** in a plan
only where the change is correct everywhere (e.g. the bomb flash cap, a broken credit rule, a
missing death pop). A global change needs an Adventure before/after.

## 6. Rulings this program supersedes (owner, 2026-11-05)

- Row 482 "guns become the nudge and the finisher" → **in Swarm, guns mow fodder**; physics
  owns multi-kills and heavies.
- 2026-10-21 "enemy physics weapons stay rare" → **Swarm enemies get telegraphed abilities**; true
  physics weapons stay limited to 1–2 archetypes.
- The five powers stay on 1–5 (owner ruling 2026-10-22). Plan S5 changes what the rest of the
  keyboard does in Swarm, not the powers' keys.

**Recommendation (not an owner ruling — the controller or owner may overrule):** Lane 2's queued
Swarm work that adds systems (W-HEADS, W-PROVENANCE, Circuit route map, Grudge Ledger, Trick Book,
Strategic Chaos) should wait until this program's S-plans land; it is breadth on a mode whose core
is not yet tight.

**What counts as "new".** The program allows very few new things (combo cards, boss break-up into
ammunition, one reserved). Enemy abilities in S7 built through existing owners — fields, mines,
tethers, impulse charges, shields, doctrines — are **not** new things; they are existing systems
pointed at enemies. A new owner, currency, menu, item tier or simulation system is.

## 7. Order

See `PLANS.md`. Phase A (feel and glass) → Phase B (character and spectacle) → Phase C (loop
and structure) → Phase D (showpiece and rehearsal). Plans touching disjoint files may run in
parallel. Before editing, run `git status --short`, read `design/program/NOW.md`, and preserve
concurrent work.

## 8. The game at large — what Swarm teaches Adventure

These are **follow-ups, not S-plans**. Each S-plan stays Swarm-only unless marked global; once its
Swarm version is proven, the same idea should be carried to Adventure as its own packet.

**What carries back from Swarm:**
- **The glass policy (S2)** → an Adventure flight glass that shows the fight and the objective,
  not prose. Adventure flight today overlays atmospheric lines on the action (*"The desk is open.
  The stacks already know what you carry."*), a jargon stack ("BAND OFF", "IMPACT LOGGED — 214",
  "MASS 20 · EVEN PULL"), a permanent seven-row power list with words, and chatter/news with no
  priority gate. One persistent set, ≤ 3 short transients, plain words — the same rule.
- **The feel profile idea (S1)** → Adventure keeps its own tuning, but in one profile file too,
  so nobody edits shared constants to tune one mode.
- **Enemy character (S7)** → the same silhouettes, hues and tells in Adventure encounters, so a
  Lancer is a Lancer everywhere.
- **Spectacle ladder (S8)** → global already for the flash cap; the rest should follow.
- **Controls (S5)** → the Adventure keyboard binds every letter; a context system (flight, combat,
  station) with a short visible set per context would make it learnable.

**Adventure-wide problems the audit found (not Swarm):**
- **Two different title screens** in a row (an older ring splash "DEEP SPACE FLIGHT SYSTEMS", then
  the ORRERY title). One brand, one title.
- **Three art styles in one frame**: flat painted planets (2D images) beside blocky/voxel cargo
  props beside detailed ships — different rendering and scale. One art direction, consistent scale.
- **Station screens are dense**: small type, clipped lines ("Idle hands will be…"), every panel
  competing. Menus outside flight are otherwise the game's most professional surface — keep that
  standard and give each screen one focus.
- **Writing voice** is cryptic and over-written in flight and station flavor text. Plain,
  punchy, characterful; flavor belongs in the bar and the codex, not over the action.
- **Breadth over depth**: ~430 data files and ~380 systems, many named one-offs. The program
  direction "depth, not bolt-ons" (owner 2026-10-21) applies everywhere; this audit is evidence for it.
