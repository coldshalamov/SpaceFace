<!-- LIFETIME: ACTIVE_PROGRAM -->
# SWARM — implementation plans

> **For the implementing agent:** read [`README.md`](./README.md) in full first — §4 (taste bar)
> is the acceptance standard for every plan — and the rows of [`AUDIT.md`](./AUDIT.md) your plan
> cites. Take one plan at a time, task by task: test-first where the behaviour is logic,
> screenshot-first where it is look. Each plan ends with **"How you will get this wrong"** — read
> it before you start, not after.

**Goal:** turn Crucible Swarm into a classic wave-horde mode: Zombies-style rounds in a physics
demolition derby, readable at a glance, with enemies of real character and spectacle that explains
itself.

**Architecture:** nearly everything exists (README §2). The plans retune through one **Swarm feel
profile**, clean the screen through one **Swarm glass** policy, give the existing enemies and
arenas visible character, re-present existing systems (draft, supply, call-ins, events, Fortify,
bosses), and add very few new things (combo cards; boss break-up into ammunition; one reserved).

**Tech stack:** ES modules; `node --test <file>` with `node:test` + `node:assert/strict`; Three.js
render; DOM UI; the simulation may run in a worker — profile values and gates must reach it.

## Phases

| Phase | Plans | Theme |
|---|---|---|
| A | S1 feel profile · S2 quiet glass · S3 fair credit · S4 one press · S5 controls | the guts: feel, screen, controls |
| B | S6 readable horde · S7 enemy character · S8 explosions and deaths · S9 arenas | character and spectacle |
| C | S10 round shape · S11 pick one · S12 Zombies staples · S13 payoff and sound | the loop |
| D | S14 bosses · S15 combo cards · S16 full-run rehearsal | the showpiece |

S1 lands first (others read it). S2–S5 can run in parallel with each other. Phase B needs S1.
Phase C needs S2/S3. S16 is last.

## Rules every plan follows

1. **Shared checkout.** `git status --short`; read `design/program/NOW.md`; read the live diff of
   any file you need — others edit concurrently (on 2026-11-05: `src/ui/orrery/*`, many
   `src/render/*`). Preserve foreign hunks. `git add -- <exact paths>`; `git commit -- <paths>`;
   never `-A`, reset, stash, clean, rebase or force-push. Fetch and **merge** before pushing.
2. **Swarm-only by default.** Gate on a live Swarm run or read the S1 profile. A change marked
   *global* needs an Adventure before/after screenshot and test.
3. **Ordinary route.** Title → SWARM (S4) or title → Crucible → Quick play. No dev flag, lab
   screen or test-only path counts.
4. **No per-frame cost** without a matched laptop before/after (alternate builds in one session;
   print host busy). No per-frame allocation; no per-frame scan of every entity.
5. **Determinism.** `state.rng`/`state.simTime` only. Swarm references change legitimately under
   S1: add versioned references next to the old ones (precedent `d79f80309801`); never overwrite.
   Adventure references must not move at all.
6. **Words** go through the localization catalog the surrounding code uses; regenerate catalogs
   with the repo's `loc:` script.
7. **Look proof.** Screens: `node scripts/ui-bench.mjs --shot=<id> [--walk]`. Live round: the
   `spaceface` preview, title → SWARM, **Browser pane visible** (hidden = ~1 fps, loading stalls at
   87.8%). Save to `.devshots/swarm/<plan>/`. Open every PNG; judge it against README §4 line by
   line in the commit body.
8. **One independent review** per plan: a different agent judges your before/after screenshots
   against README §4 and the plan's done-when. Fix material findings before landing.
9. **Commit message** names the player outcome (`swarm: a shove now bowls the pack into the wall`).

---

# Phase A — the guts

## S1 — The Swarm feel profile

**Player outcome:** in Swarm, things hit like a demolition derby — thrown hulls scatter packs like
bowling pins, the gravity power yanks bodies into a crunching ball, a shove punches, small kills
burst instantly, fodder melts under fire — while Adventure feels exactly as it does today.

**Why:** AUDIT rows P1–P7, C1–C2. Today the settings were tuned for Adventure piloting safety:
ships scrape instead of bouncing, contact transfer is capped at 40 WU/s, the well converges at
45 WU/s, the shove is a 7 s field, a Wasp explodes 0.55 s after you kill it, and fodder takes
1–3 s of fire.

**Allowed paths:** `src/data/swarmFeelProfile.js` (new), `src/core/sg02DynamicBodyOwner.js`
(profile reads only), `src/data/fields.js` (no edits — the profile overrides at deploy),
the field deploy owner (`grep -rn "field_well_standard" src/systems`), `src/combat/lifecycle.js`
(`dyingWindowS` profile input), `src/systems/waveMaterialization.js` (profile stat overrides),
`src/core/simLaneMain.js` / `wholeSimBrowserWorker.js` (profile transport, if needed),
`test/swarm-feel-profile*.test.mjs` (new), versioned Swarm references.

### Task 1: the profile module (pure data + one resolver)

```js
// src/data/swarmFeelProfile.js — every Swarm-only feel number in one place
// (design/program/finish/swarm/AUDIT.md). Read through swarmFeel(state): it returns
// this profile during a live Swarm run and null otherwise, so every owner keeps its Adventure
// value when it gets null. Values are starting points; tune by play and record changes here.
import { isSwarmRuleset } from '../systems/survivalSwarm.js';

export const SWARM_FEEL_PROFILE = Object.freeze({
  id: 'swarm_feel_v1',
  contact: Object.freeze({
    enemyRestitution: 0.3,          // P1 enemy hull vs rock/plate, average combine
    enemyVsEnemyRestitution: 0.35,  // P1
    impactTransferDv: 160,          // P2 victim bound when struck by a thrown/tumbling body
    impactMinClosing: 30,           // P2 below this it is a scrape, keep the 40 bound
    tumbleRestitution: 0.65,        // P3 tune by feel 0.55–0.75
    tumbleAngularDamping: 0.05,     // P3
  }),
  pull: Object.freeze({ yankS: 1.2, yankStrengthMult: 3, yankDampingMult: 0.35, holdS: 2, cooldownS: 6 }),   // P4
  shove: Object.freeze({ punchS: 0.35, punchStrengthMult: 3, bermS: 1.5, cooldownS: 5 }),                      // P5
  dying: Object.freeze({ instantBelowMassT: 32, mediumWindowS: 0.5 }),                                        // P6
  fodder: Object.freeze({ ids: ['wasp_swarmer', 'choir_zealot', 'detonator_dart'], hullMult: 0.4, shield: 0 }), // C1/C2
});

export function swarmFeel(state) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival' || run.phase === 'inactive' || !isSwarmRuleset(run.ruleset)) return null;
  return SWARM_FEEL_PROFILE;
}
```

Test: frozen; `swarmFeel` null for Adventure, scored arc, inactive run; returns the profile for an
active Swarm run. **Worker:** confirm `state.run` exists in the worker realm (read
`simLaneMain.js`); if the worker has its own state, the test must also run the resolver there.

### Task 2: bowling pins (P1–P3)

In the contact owner, when `swarmFeel(state)` is non-null: enemy hull materials use the profile
restitution with average combine (player keeps today's scrape); a contact whose partner is
tumbling or carries impulse provenance and whose pre-solve closing speed ≥ `impactMinClosing`
uses `impactTransferDv` as the victim's bound. Overlap recovery and the pose-jump sanity bound
(`SANE_MAX_SOLVER_POSE_JUMP`) are untouched.

Tests (fixtures in the style of the existing sg02 tests):
- tumbling Wasp at 150 WU/s into 5 resting Wasps → ≥ 3 leave above 40 WU/s;
- the same scene in Adventure → identical to today (snapshot first);
- deep-overlap spawn in Swarm → no body moves more than the sanity bound.

### Task 3: gravity yank and shove punch (P4, P5)

At deploy, the field owner applies the profile: Pull runs a yank phase then today's hold; Shove
runs a punch then a short berm. Implement as a **time-varying strength/damping on the same field
record** (the well's kernel already supports `strength`/`damping`), not a second field type.

Tests: wave-3 fixture with a Brood tide → one Pull yields ≥ 8 credited kills; 5 Wasps in a Pull
→ ≥ 2 collision kills; Shove on 5 Wasps within 120 WU → all leave ≥ 90 WU/s.

### Task 4: instant small kills (P6) and fodder that melts (C1, C2)

`dyingWindowS` takes the profile: mass ≤ `instantBelowMassT` → 0 (burst on the kill tick).
Materialisation applies `fodder.hullMult` and removes shields from the fodder ids.

TTK table test: for every starter build in the Crucible Ship & Kit list (read them from the data,
don't hard-code), time-to-kill a Wasp/Zealot/Dart under continuous fire ≤ 0.5 s at mid range.
Record the table in the commit body.

### Task 5: versioned references

Swarm digests move. Add `…swarm_feel_v1` references beside the old ones and select them for the
Swarm cases; Adventure cases must still match the old ones byte for byte.

**Done when:** all tests green; live: a throw into a pack scatters it, a Pull crunches a tide, a
Shove punches, Wasps pop instantly, fodder melts; two captures (before/after) of the same thrown
throw; Adventure flight capture unchanged.

**How you will get this wrong:**
- Editing `fields.js`, `physics.js` or `enemies.js` constants directly → Adventure changes. Use the profile.
- Raising `MAX_CONTACT_DV` globally → the old cannon-launch bug returns. Only the victim of a real impact gets the higher bound.
- Making everything bouncy, including the player → the owner's "knocked around by ghosts" complaint (FEEL_CONTRACT A13) returns. The player keeps the scrape.
- Re-recording the old references "because they changed" → forbidden. Version them.
- Tuning until tests pass and never playing. The numbers are starting points; feel decides, and the commit records what you felt.

## S2 — Quiet glass

**Player outcome:** during a round the screen shows only the fight, the chain and round progress,
hull/shield, the power icons, radar, and ≤ 3 short callouts.

**Allowed paths:** `src/ui/swarmGlass.js` (new), `src/ui/hudAttention.js`, `src/ui/comms.js`,
`src/ui/captions.js`, `src/ui/toasts.js`, `src/ui/stuntCallout.js`, `src/ui/masslineHud.js`,
`src/ui/targetPanel.js`, `src/ui/discoveryPlate.js`, `src/ui/hud.js` (Swarm gates only), the
Swarm readout owner (`grep -rn "HOSTILE SHIPS" src/ui`), the voice consumer of
`barkDirector:voice`, `test/swarm-glass*.test.mjs`. **Coordinate:** `src/ui/orrery/*` (power rail —
S5 owns it). **Do not touch:** `barkDirector.js`, `faction_archive.js` — silence at the glass.

### Task 1: the policy (pure)

```js
// src/ui/swarmGlass.js — what a live Swarm round may show (README §4). Pure. Outside a live
// Swarm run every rule admits, so Adventure is untouched.
import { isSwarmRuleset } from '../systems/survivalSwarm.js';

export const SWARM_CALLOUT_MAX = 3;
export const SWARM_CALLOUT_WORDS = 3;
const FIGHT_SOURCES = new Set(['swarm-callout', 'boss', 'danger', 'round']);
const JARGON = /\b(snag|messy|window|logged|mass|tonn|winch|strain|payload|ride|budge|shunted)\b|\d+\s*t\b/i;
const BARE_NUMBER = /(^|\s)\d{2,}(\s|$)/;

export function isSwarmGlass(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive' && isSwarmRuleset(run.ruleset));
}
export function swarmGlassAdmits(state, { source = '' } = {}) {
  return !isSwarmGlass(state) || FIGHT_SOURCES.has(String(source));
}
export function swarmCalloutText(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  if (!line || JARGON.test(line) || BARE_NUMBER.test(line)) return null;
  const words = line.split(' ').filter((w) => !/^[—–-]$/.test(w));
  return words.length > SWARM_CALLOUT_WORDS ? null : line.toUpperCase();
}
```

Tests: Swarm-only; refuses bark/chatter/news/comms/faction/codex/landmark/contract/massline-detail/
target-card/physics-log; admits swarm-callout/boss/danger/round; Adventure admits everything;
`'PILE-UP ×7'` passes, `'LINE RELEASED 16T — MESSY'` and `'Clean snag 93'` fail, `'double kill'`
→ `'DOUBLE KILL'`.

### Task 2: chatter, news, comms, captions, toasts, codex, landmark

`admitReceipt` refuses in Swarm when `!swarmGlassAdmits(state, { source: channel || kind })`
(reason `'swarm-glass'`); stunt receipts must also pass `swarmCalloutText`. `comms.js`,
`captions.js`, the toast renderer and `discoveryPlate.js` return early in Swarm for non-fight
sources. Voice: mute non-fight barks in Swarm; boss barks stay. Test each gate with a Swarm and an
Adventure state (Adventure result identical to today).

### Task 3: the jargon stack and Line diagnostics

`stuntCallout.js`: in Swarm, route moments to the S13 callout lane only when `swarmCalloutText`
accepts them; "IMPACT LOGGED", "CLEAN SNAG", "RIDE", "ARENA: SHUNTED" never draw. `masslineHud.js`
in Swarm: the rope, the release diamond, and at most one plain word at the target (`GRAB`,
`TOO HEAVY`). No mass numbers, payload plate, detail panel or telemetry line.

### Task 4: target card, incoming sentences, readout

No target card in Swarm (the aimed target keeps its ring). "INCOMING — Sidestep or send it back"
becomes one red edge chevron per threat. The top-left readout becomes a top-center block: chain
number ≥ 64 px at 1280×800, a progress bar ≤ 6 px × 280 px (killed / quota), `ROUND 3` in small
caps. No `SCORE`, `CR`, `LV` during the round.

**Done when:** tests green; `node --test test/crucible-swarm-*.test.mjs` green; round 1 at
5/30/60 s shows only README §4's persistent set + ≤ 3 callouts of ≤ 3 words; Adventure flight
screenshot unchanged.

**How you will get this wrong:**
- Rewording jargon into "nicer" jargon ("LINE OUT — CLEAN") instead of removing it. If a spectator can't read it, it does not draw.
- Hiding things with CSS while their DOM updates every frame. Unmount/skip the update.
- Adding a "Swarm HUD" alongside the old one. Replace; don't stack.
- Silencing at `barkDirector` → Adventure loses its voice. Gate at the glass.
- Forgetting the voice path: lines vanish from the screen but still play as audio.

## S3 — Fair credit

**Player outcome:** the chain and every PILE-UP/DOUBLE callout reflect only what the player
caused; idling earns nothing.

**Observed:** ship at rest, no input, no ship dead → `CHAIN 9 COLLISION`, `PILE-UP ×2`,
`ARENA: SHUNTED ×9`, `+12 SHUNTED`. The Brood engine already separates credited from
environmental deaths (`creditedCount` vs `environmentalCount`, `rockCredited`, `movCredited`,
`creditUntil`), so the leak is elsewhere. Suspects in order: (1) `swarmJuice._onBroodKills` pile-up
window built from receipts with `count === 0`; (2) `stuntCallout.js` shunt counter counting any
body the arena shoves; (3) a `COLLISION` chain caption fed by something other than credited kills
(`grep -rn "COLLISION" src/ui src/systems/swarm*.js`); (4) `rockCredited[r]` initialised true for
arena-authored rocks/plates.

**Allowed paths:** `src/systems/swarmChain.js`, `src/systems/swarmJuice.js`,
`src/systems/swarmBrood.js` (credit flags only), `src/ui/stuntCallout.js`, the readout owner,
`test/swarm-fair-credit.test.mjs`.

1. **Reproduce first.** Fixture from `test/crucible-swarm-chain.test.mjs` +
   `crucible-swarm-arena.test.mjs`: start round 1 (seed `2438149869`, arena `helios_core`), step
   600 ticks, no input; record `swarm:announce`, `swarm:killPopup`, `run:awardRequested` and the
   chain. Assert nothing happened. It must FAIL naming the leaking event; if it passes, the leak is
   UI-side — mount the suspect owner and replay the recorded bus.
2. **Fix at the leaking owner.** Receipts with `count === 0` produce nothing. Shunt counters count
   only bodies the player moved within `BROOD_CREDIT_WINDOW_S` (reuse it; no second window). An
   enemy killed by another enemy or by machinery the player didn't trigger does not step the chain.
3. **Positive cases still pay**: shove a Wasp into a rock; bomb a Brood cluster (pile-up when ≥ 5
   credited in the window); throw a body into the pack within 3 s.

**Done when:** both tests green; live: 30 s idle → chain 0, no callouts; a shove-into-rock → chain
step + callout.

**How you will get this wrong:**
- "Fixing" it by raising the pile-up threshold. The bug is attribution, not the number.
- Making credit stricter until thrown-body kills stop counting. Throws are the game; test them.

## S4 — One press to the fight

**Player outcome:** from launch, **SWARM** on the title starts round 1 in under 15 s warm; the
first-run prompts never repeat on this machine; the full setup stays one click away.

**Allowed paths:** `src/data/swarmQuickStart.js` (new), `src/ui/screens/mainMenu.js`,
`src/ui/screens/motionAsk.js`, `src/ui/accessibility.js` ("First light"), the splash owner
(`grep -rn "CLICK OR PRESS ANY KEY" src`), `src/ui/screens/crucible.js` (extract the launch
function only), `src/ui/crucibleLaunch.js`, the run-state creation owner, `test/swarm-quick-start.test.mjs`.

1. **Quick-start record** (pure, frozen): ruleset `swarm`, arena `helios_core` (confirm id in
   `src/data/survivalArenas.js`), stake `contender`, starter build `ricochet_runner` (confirm id
   in the Ship & Kit data), `openArmoryBeforeRound1: false`. Test that every id exists.
2. **Launch path**: extract the minimum shared launch from `crucible.js` (`launchCurrent`) so the
   title and Quick play call the same function — no duplicate launch code. Round 1 starts in
   flight, not in the armory.
3. **SWARM button** on the title, second item, same style as its neighbours.
4. **First-run prompts once**: splash, motion ask and First light record a per-machine "seen"
   flag in the settings/profile store they already use (not the save). Settings → Access still
   reaches every option.

**Route check (twice):** fresh profile → prompts once → title → SWARM → fighting; relaunch → title
→ SWARM → fighting. Time launch click → first controllable frame; record it.

**How you will get this wrong:**
- A "skip intro" dev query param. It must be the real title button.
- Copy-pasting `launchCurrent`. Extract it.
- Removing the accessibility prompt entirely. It shows once; its options stay reachable.

## S5 — Swarm controls

**Player outcome:** Swarm plays on a compact, arcade control set; nothing on the keyboard does
an Adventure-only thing; the power bar is six readable icons.

**Why:** AUDIT U1–U2. `src/ui/bindings.js` notes "every letter already owns a flight verb"; the
rail shows `DRIVE F8` (travel drive) and words for every power.

**Allowed paths:** `src/data/swarmControls.js` (new), `src/ui/bindings.js` (a Swarm context
lookup only), the input router (`grep -rn "BINDINGS" src/systems/input*.js src/ui/*.js`),
`src/ui/orrery/flightCluster.js`, `power-railLayouts.js`, `hudAdapter.js` (**coordinate — others
were editing them**), the Help/controls card, `test/swarm-controls.test.mjs`.

1. **The set** (keyboard + mouse; mirror on gamepad from the existing pad map): WASD move · mouse
   aim · LMB fire · RMB Line (fire/release) · 1–5 Pull/Shove/Pin/Bomb/Rig (**owner ruling: keep**)
   · Space boost/dash · Q call-in · F interact (shop pods, Fortify sockets) · Tab scoreboard ·
   Esc pause. Confirm against today's bindings and keep any key that already matches.
2. **Context**: in a live Swarm run, bindings outside the set are inert (no travel drive, no
   dock, no map, no comms radial, no photo). Rebinds the player saved still apply to the keys in
   the set.
3. **Power bar**: six icons in a row bottom center with key number and radial cooldown; no
   words; `aria-label` keeps names. No `DRIVE` row.
4. **Help card**: in Swarm, Help shows only this set.

**Test:** every action in the set resolves; every Adventure-only action resolves to nothing in a
Swarm state and to today's action in Adventure.

**How you will get this wrong:**
- Moving the five powers off 1–5. Owner ruling 2026-10-22 — don't.
- Deleting bindings instead of contexting them → Adventure breaks.
- Building a new rail component next to ORRERY's. Change the existing one in Swarm.

---

# Phase B — character and spectacle

## S6 — A readable horde

**Player outcome:** with the HUD hidden, a watcher can tell the player, the Brood horde, the
dangerous ships, and the things you can throw — and the horde visibly fills the screen.

**Allowed paths:** `src/render/broodPresentation.js`, `src/data/swarmBrood.js` (family colours and
the profile population curve), `src/render/camera.js`/`cameraGlide.js` (Swarm framing only), the
hostile rim/IFF material owner, `src/combat/masslineTargetScoring.js` (read-only use),
`test/swarm-readable*.test.mjs`.

**Colour language (fixed — do not improvise):**

| Who | Colour | Shape |
|---|---|---|
| Player | cyan hull light + gold trim (today's) | the hull |
| Brood | acid green, violet, hot pink, white-gold, electric orange — one per family, saturated emissive | small darts; family silhouette stretch |
| Hostile ships | warm: each archetype its own hue in red/orange/magenta/amber + red-orange engine glow | per-archetype silhouette (S7) |
| Throwable | faint white outline when inside Line range | — |
| Danger telegraph | pure red line/ring | — |

1. Brood draw scale ×1.5 (`buildBroodBodyGeometry(scale)`; collisions unchanged); saturated
   emissive per family; a death pop (reuse the existing instanced spark pool, ≤ 0.25 s).
2. Profile population curve: ~150 at wave 1 → ~300 by wave 6 → 400 by wave 12. Land the curve only
   if the laptop A/B shows no worse frame interval in waves 1–6; otherwise land (1) alone and record
   the cost.
3. Throwable outline for the ≤ 8 nearest eligible bodies, from the Line scoring pass's own
   candidate list (no second scan).
4. Camera: Swarm framing shows ~1.6× today's area, player hull ≥ 28 px long at 1280×800; punch-in
   (≤ 0.5 s in, ≤ 0.6 s out) only on pile-up, boss entrance, boss death; Line moves don't change
   zoom; reduced motion = no punch.

**Done when:** round 1 and round 6 before/after screenshots; a "what is that?" check from the
screenshot by three different readers (agents or people) recorded in the commit body.

**How you will get this wrong:**
- Making the Brood bigger by scaling collision radius. Draw only.
- Using cyan/gold for anything that isn't the player.
- Outlines on everything (visual noise). Only Line-eligible bodies in range, ≤ 8.
- A zoom-out that makes the player's ship a speck. Keep the 28 px floor.

## S7 — Enemy character

**Player outcome:** every enemy type is recognisable from across the room and has one thing it
does that you learn to fear or exploit. A new type debuts alone so you learn it.

**Why:** AUDIT C3–C5, E3. Ships are one template today; the Brood families already have attack
language but nobody can see it.

**Allowed paths:** `src/data/swarmCharacter.js` (new: the sheet below as data),
`src/systems/waveMaterialization.js` (profile overrides: size/speed/mass/protection), the doctrine
and ability owners each row names (find them before editing), enemy render/material owners,
`test/swarm-character*.test.mjs`.

**The character sheet (ships).** For each row: if the behaviour exists in code, *surface it*
(silhouette, colour, tell); if it doesn't, implement the smallest version through existing owners
(fields, mines, tethers, impulse charges, shields). Never a new combat system.

| Archetype (debut wave) | Silhouette / size / speed | The one thing | Tell (≥ 0.6 s) | Counter / exploit |
|---|---|---|---|---|
| Wasp Swarmer (1) | small dart, r 12, 120 WU/s, amber | packs of 5, strafing passes | none (fodder) | mow it; throw it |
| Reaver Pirate (2) | medium wedge, r 18, red | pack leader: calls 2 Wasps; when it dies its Wasps **scatter in panic** for 3 s | red flare when calling | kill it first |
| Choir Zealot (4) | tall narrow, magenta | links a shield beam to one packmate | visible beam | shove it off the link |
| Detonator Dart (5) | tiny spike, r 8, 170 WU/s, white-hot | rams and explodes, hurting everything | brightening fuse + rising beep | throw it into the pack — it's your bomb |
| Mine-Layer Jackal (6) | squat, orange | drops visible mines in its wake that hurt anyone | mine blink | lure enemies through its mines |
| Lancer Sniper (8) | long needle, slow, far | charged rail shot | a red line to you for 1 s | break line of sight with a rock; throw a rock at it |
| Warden Escort (9) | wide shield-bearer | projects a bubble on a packmate | visible bubble | kill the warden, the bubble drops |
| Corsair Raider (10) | sleek, crimson | wing dash attack | charge line on the ground | sidestep; it hits whatever's behind you |
| Quiet Ghost (12) | shimmer | cloaks, decloaks to strike | shimmer ripple + sound | fields reveal it (it's affected by Pull) |
| Customs Cutter (13) | boxy, amber-white | EMP pulse disables your powers for 2 s | expanding ring | leave the ring |
| PD Screen (14) | turret pod | shoots down your bombs and thrown bodies | tracer stream | kill it before you bomb |
| Patrol Lawman (15) | plated duelist | too plated to throw easily; presses you | — | wear it down, crush it |
| Tether-Control Raider (16) | hook ship | **physics weapon #1**: tows you toward hazards | a rope shot telegraph | cut it by boosting; tow it into its own hazard |
| Bruiser Brawler (18) | big, r 34, mass ≥ 150, 75 WU/s, dark red | a moving wall that rams | charge line | throw things *into* it; bait it into crushers |
| Anchor Controller (22) | ring ship | **physics weapon #2**: drops an enemy gravity anchor that pulls you | anchor ring | use its anchor against the pack |

**Brood** (already designed — surface them): Mite (fodder), Spitter (target ring then acid lob,
pool), Spore Drift, Charger (charge line then dash — sidestep and it hits a rock), Lantern Cyst,
Leecher (latches and slows; scrape it off on a wall), Glassback (shatters into shards), Wake Eel
(whips), Bellows. Each family needs its tell **visible at the gameplay camera** (S6 scale and
colours) and one sound.

Tasks:
1. Encode the sheet in `swarmCharacter.js` (silhouette scale, hue, speed, radius, mass,
   protection layers per AUDIT C4, ability id, tell id). Test: every roster id has a row; no two
   ships share a hue + silhouette pair; heavy ids have mass ≥ `HEAVY_AS_TERRAIN_MASS`.
2. Apply the overrides at materialisation through the S1 profile.
3. For each row, verify or implement its ability and tell; one commit per archetype with a 5–10 s
   capture of the tell → the ability → the counter.
4. **Debut rule**: the wave a type debuts, it arrives as its own small group with a one-line name
   callout (`NEW: SNIPER`), never mixed into a crowd.

**How you will get this wrong:**
- Giving enemies more HP to make them "formidable". Formidable = a dangerous ability with a fair tell.
- Abilities without tells, or tells that are text. The tell is in the world.
- Fifteen custom AI systems. Each ability is an existing owner (field, mine, tether, charge, shield) pointed by doctrine.
- Recolouring by tinting the whole mesh red. Hue goes on emissive accents and engines; the hull stays readable.

## S8 — Explosions, deaths and impacts

**Player outcome:** kills pop instantly; big kills come apart with weight; bombs and pile-ups are
spectacular **in the world** — rings, debris, fire, light — and never blind you.

**Why:** AUDIT P6, V1–V4. Observed: a bomb flash covering ~40% of the screen.

**Allowed paths:** `src/render/vfx/explosionPresentationVfx.js`, `bombDetonationVfx.js`,
`weaponImpactVfx.js`, `combatContactVfx.js`, `fragmentFamilies.js`, `woundSmoke.js`,
`src/render/feel.js`, `src/systems/dyingHull.js` (Swarm presentation inputs), the hull-burst
fragment spawner (find it: `grep -rn "fragment" src/systems/aftermath*.js`), audio cue owners for
kills/impacts, `test/swarm-spectacle*.test.mjs`.

**The ladder (fixed):**

| Event | Picture | Sound |
|---|---|---|
| Light kill (≤ 32 t) | instant burst along the killing impulse, 4–8 sparks, small smoke puff | short pop, pitch by size |
| Medium kill | burst + 1–2 tumbling chunks + brief fire trail | crunch + pop |
| Heavy kill | the dying window (keep), then break-up into 3–6 throwable chunks, shockwave ring that **shoves nearby bodies**, lingering fire 2 s | deep boom + debris rattle |
| Bomb | expanding ring, debris, dynamic light pulse; flash ≤ 15% area, ≤ 0.2 s (**global**) | boom with tail |
| Impact (thrown body hits) | spark spray at the contact, crumple, camera kick scaled by momentum | metal crunch scaled by mass |
| Pile-up (≥ 5 credited in 1 s) | S13's hit-stop + punch | S13's sting |

Tasks: (1) global flash cap with a pure test on the largest bomb's beat; (2) light-kill instant
burst under S1's dying profile; (3) heavy break-up chunks as ordinary throwable bodies (reuse the
existing wreck/fragment body path; no new physics body type) + shockwave impulse through the
existing impulse membrane; (4) audio pitch/mass terms; (5) captures of each ladder row.

**How you will get this wrong:**
- "Bigger" = brighter and whiter. Bigger = more world: debris, rings, light, smoke.
- Particles that hide the next enemy. Effects must not occlude telegraphs (red lines/rings draw above VFX).
- A new particle pool or per-kill allocation. Reuse pools; measure.

## S9 — The arena is friend and foe

**Player outcome:** each arena has one signature hazard you can use against the swarm and that
can kill you; the round looks like the arena's picture.

**Why:** AUDIT V6. The Ricochet Foundry played as open space next to a flat painted planet.

**Allowed paths:** `src/data/survivalArenas.js`, `src/data/swarmArenaLadder.js`,
`src/data/swarmOpticArenas.js`, `src/data/swarmOpeningTerrain.js`, `src/systems/swarmArena.js`,
`src/data/environmentalMachinery.js` (reuse), arena backdrop/lighting owners, menu arena images,
`test/swarm-arena*.test.mjs`.

1. **Inventory first**: list each Swarm arena (Ricochet Foundry `helios_core`, Lagrange Crucible,
   Cinder Sluice, Cryo Drift, Storm Lattice, Asteroid Mill, The Hive — confirm ids) with what the
   code actually spawns (props, plates, machinery, fields, backdrop). Write the table into this
   plan's commit body.
2. **One signature hazard each** (use what exists — bank plates, crushers, heat lanes, shard
   ricochet, resonance, spawn sacs, mill grinders): it kills enemies thrown into it **and** kills
   you if you drift in. It must be visible and telegraph its cycle (lights, sound) ≥ 1 s ahead.
3. **Look**: the round uses the arena's own props, lighting and backdrop; hide the generic
   Helios backdrop (the ringed planet) in arenas that aren't open space. Re-shoot the menu image
   from the real round so the picture matches.
4. **Bounds**: a visible edge (machinery walls, a field fence with glow) — never an invisible wall.

**How you will get this wrong:**
- Adding scenery that doesn't do anything. Every big prop is a weapon, a hazard or cover.
- Hazards that only hurt the player (or only enemies). Friend *and* foe.
- Painting a new menu image instead of making the round match.

---

# Phase C — the loop

## S10 — The shape of a round

**Player outcome:** each round is 60–90 s of escalating pressure that ends cleanly — groups arrive
visibly, the last few come to you, a title opens the round.

**Allowed paths:** `src/data/swarmMode.js` (profile tuning), `src/systems/swarmArena.js`,
`src/systems/survivalWave.js` (last-enemies rule), `src/ui/hud.js` (pointer reuse),
`test/swarm-round-shape.test.mjs`.

1. **Arrivals**: groups enter through `GATES` with a 1 s gate flare; never materialise within 1.3
   screens of the player (AUDIT E4); one gate per group on waves 1–3.
2. **Last three**: ≤ 3 hostile ships left and none on screen → edge pointers + `pack_pursuit`.
   Test: 3 parked at 400 WU → all within 200 WU of the player in ≤ 8 s.
3. **Round title**: `ROUND 3` center for 1.2 s (static in the readout on reduced motion).
4. **Tune** wave lengths to 60–90 s for a competent player with `src/data/waveRecipeSimulator.js`,
   then confirm in two live runs; record lengths.
5. **Special rounds** (S12) slot in at waves 4, 8, 13…

**How you will get this wrong:** tuning length by adding HP; making the last three teleport.

## S11 — Pick one

**Player outcome:** between rounds, three big exciting cards; one click picks and fits; the shop
takes ~10 s; the 107-row catalog is behind "Browse all".

**What exists:** `offerDraft()` (`src/data/survivalDraft.js`) returns three seeded offers with
rerolls; Swarm's pool = authored cards (~42) **plus** the generated catalog
(`swarmCatalogOffers`). The screen (`src/ui/screens/crucibleDraft.js`) shows the catalog.

**Allowed paths:** `src/data/survivalDraft.js` (pool option), `src/data/swarmDraft.js`
(blurbs/icons), `src/ui/screens/crucibleDraft.js`, its stylesheet, `test/swarm-pick-one.test.mjs`.

1. `offerDraft({ …, pool: 'authored' })` skips the catalog; without the option the result is
   byte-identical to today.
2. **Cards**: ~360×480 at 1920×1080; big icon; one-word verb; one plain sentence (rewrite any
   blurb a spectator can't read; no percentages, no +stat); a looping animated schematic of the
   effect. Below: Reroll (R) + price, Repair + price, Browse all, Launch round N (Enter).
3. Click → auto-fit (`fits`; else replace the weakest number card) → the card flies into the ship
   schematic → Launch focused.
4. **Snowball weighting**: from round 3, when the player owns half of a combo (S15), one offer is
   its partner if legal (seeded).
5. **Legendaries** (Domino, Graviton Heart) appear as a rare golden card, ≤ 1 before round 5.
6. Fortify (S12) is a fourth tab-free button here, not a separate flow.

**Done when:** `ui-bench --shot=crucible-draft --walk` before/after; live clear → pick → launch in
≤ 15 s; keyboard-only and mouse-only both work.

**How you will get this wrong:**
- Keeping the catalog as the default with cards "on top". Cards are the screen.
- Cards that are stat parts with nice names. Only authored verb cards and legendaries.
- Previews as paragraphs of text. Show the effect.

## S12 — Zombies staples, with ceremony

**Player outcome:** drops, call-ins, perks, special rounds and Fortify feel like events you look
forward to, not hidden menu rows.

**What exists:** `swarmSupply.js` (drops), `swarmCallins.js` (smart bomb, orbital lance, turret
drop, drone wing, shield dome), `swarmPerks.js` (two-slot perks earned by stars), `swarmEvents.js`
(seeded event cards: hot fields, pulse fields, mine drifts, supply pods), `swarmFortify.js` (four
build types, repair, rearm, weak-link sieges).

**Allowed paths:** those five owners (presentation and pacing only), their UI, VFX and audio
cues, `test/swarm-staples*.test.mjs`.

| Staple | Make it feel like |
|---|---|
| Drops | a glowing pod with a beacon column, a distinct pickup sound; 1–2 per round from credited kills |
| Call-ins | bought in the shop as charges; Q fires; a big world telegraph (orbital lance paints for 0.8 s), a named callout (`LANCE!`) |
| Special rounds | waves 4, 8, 13…: one rule change announced in 2 words (`DART RUSH`, `MINE TIDE`, `DARK ROOM`), different music layer |
| Perks | two chosen before the run (existing Hangar); shown as two icons beside the hull ring |
| Fortify | from the shop: place a build on a lit socket in the arena; it fights visibly; enemies go for weak links — the tower-defense flavour |

**How you will get this wrong:** adding new staples. Use these five; make them visible and timed.

## S13 — The payoff ladder and the sound of Swarm

**Player outcome:** every kill feels good, multi-kills better, a pile-up is a show-stopper; the
music rises with the wave and drops in the shop.

**Allowed paths:** `src/systems/swarmJuice.js`, `src/ui/swarmJuiceHud.js`, `src/render/feel.js`
(hit-stop beat), Swarm audio/music owners (`grep -rn "swarm:announce\|waveStarted" src/audio`),
`test/swarm-payoff.test.mjs`.

| Event (credited only — S3) | Picture | Sound | Words |
|---|---|---|---|
| Kill | S8 pop | click/pop | none |
| 2–4 in 1 s | bigger burst | pitch up per kill | `DOUBLE`/`TRIPLE`/`QUAD` |
| ≥ 5 from one cause in 1 s | 0.15 s hit-stop, shake (slider), camera punch | boom + rising sting | `PILE-UP!` |
| Chain milestone | chain number pulses | chime | none |

- Hit-stop is **presentation-only** (render/VFX clock), never a sim freeze. Reduced motion: none.
- ≤ 1 pile-up presentation per 1.5 s; a second extends the count only.
- Music: intensity stems tied to live pressure (ships + Brood alive), drop to a calm layer in the
  shop, a boss layer. If no new music can be authored, drive the existing score engine (phases,
  keys, bar quantisation) from wave state.

**How you will get this wrong:** juice on everything (it stops meaning anything); hit-stop on every
kill; music that never changes.

---

# Phase D — the showpiece

## S14 — Bosses

**Player outcome:** the first boss arrives at wave 5 with ceremony, is beaten by throwing things
into it, and dies into chunks you keep using as ammunition.

**Allowed paths:** `src/data/swarmMode.js` (boss cadence), `src/systems/swarmArena.js`,
`src/systems/capitalBossRuntime.js` (death → chunks), `src/data/encounters/capital-boss/*.js`
(callout text), boss name-card UI, Run Over victory variant in `src/ui/screens/crucible.js`,
`test/swarm-boss*.test.mjs`.

1. **Cadence**: first boss at wave 5, then every 10 (15, 25, …) — Iron Maw, Foreman, Regent
   rotation. Versioned references (Rule 5).
2. **Entrance**: 2 s name card + one ≤ 6-word subtitle; camera punch; Brood held at minimum.
3. **Phases**: weak plates glow while targetable; one 3-word callout per act (`CROSS ITS BOW`,
   `RIP ITS RUDDER`, `THROW THE BALLAST`); authored lesson sentences move to Run Over.
4. **Death into ammunition**: 4–6 large chunks as ordinary throwable bodies (S8's break-up) that
   last the rest of the run, outlined when in Line range.
5. **First boss victory**: a victory variant of Run Over (`IRON MAW DOWN`), with "Keep going"
   (focused), "Run it again", "Main menu".

**How you will get this wrong:** a boss with a big HP bar you shoot for 90 s — the vision forbids
it (VISION "not from making every enemy absorb thirty seconds of damage").

## S15 — Combo cards

**Player outcome:** owning two specific verbs unlocks a named super-card that visibly transforms
the build.

**Allowed paths:** `src/data/swarmEvolutions.js` (new), `src/data/survivalDraft.js` (offer when
legal), `src/ui/screens/crucibleDraft.js` (golden card), the runtime owners each evolution reuses,
`test/swarm-evolutions.test.mjs`.

```js
export const SWARM_EVOLUTIONS = Object.freeze([
  { id: 'bolas',      name: 'Bolas',      needs: ['snarl', 'whip'],              blurb: 'Tied enemies swing as one heavy mass.' },
  { id: 'meteor',     name: 'Meteor',     needs: ['ram', 'burner'],              blurb: 'Your hull at full burn breaks whatever it hits.' },
  { id: 'storm',      name: 'Storm',      needs: ['relay', 'fork'],              blurb: 'Every split shot arcs to the next enemy.' },
  { id: 'black_hole', name: 'Black Hole', needs: ['gravity_payload', 'tractor'], blurb: 'Your hits drag the swarm into one ball.' },
]);
```

The file header must say exactly which existing modules/legendaries each evolution combines
(e.g. Black Hole = Graviton Heart's well attached to tagged targets). An evolution that can't be
built from existing parts is dropped. Tests: needs exist in the authored pools; offered once, only
when both owned. Capture each in a live round.

**How you will get this wrong:** evolutions that are +50% numbers. Each must change what you *do*.

## S16 — Full-run rehearsal (and the reserved new thing)

1. Fresh profile on the laptop, pane visible: title → SWARM → through the first boss and two
   rounds past it. Record the screen.
2. Score it against README §4 minute by minute: "what is that?" moments, jargon, idle stretches
   > 10 s, flashes, credit for nothing, enemies without a visible tell, arena props that do nothing.
   Write `.devshots/swarm/S16/REHEARSAL.md`.
3. Fix material findings in the owning plan's files.
4. Spend the **one reserved new thing** only on the single biggest remaining gap, with the owner's OK.
5. Repeat until one full run has no finding; keep that capture as the reference.

**Done when:** one recorded full run with an empty findings list, reviewed by an independent agent.
