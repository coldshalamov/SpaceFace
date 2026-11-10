<!-- LIFETIME: ACTIVE_PROGRAM -->
# SWARM — two lanes

The sixteen plans in [`PLANS.md`](./PLANS.md) split into two lanes **by file**, so the two agents
never edit the same file. Read [`README.md`](./README.md) first; it is the taste bar for both.

| | **Lane F — THE FIGHT** | **Lane S — THE SHOW** |
|---|---|---|
| In one line | how Swarm *plays*: physics, enemies, arenas, waves, bosses, staples | what Swarm *looks, sounds and reads like*: screen, controls, effects, feedback, shop |
| Plans | S1 · S7 (sheet, stats, abilities, tells logic) · S8-sim (break-up bodies, shockwave impulse) · S9 · S10 (logic) · S12 · S14 (logic) | S2 · S3 · S4 · S5 · S6 · S8-look (VFX, flash cap, audio) · S11 · S13 · S14-UI · S15 · S16 |
| Order | S1 → S7 task 1 (the sheet) → S10 → S8-sim → S7 rest → S9 → S12 → S14 | S2 + S3 → S4 → S5 → S6 → S11 → S13 → S8-look → S15 → S14-UI → S16 |

## File ownership (exact)

**Lane F owns:** `src/data/swarmFeelProfile.js` (new) · `src/data/swarmCharacter.js` (new) ·
`src/data/swarmMode.js` · `src/data/swarmBrood.js` (data: population curve only) ·
`src/data/survivalArenas.js` · `src/data/swarmArenaLadder.js` · `src/data/swarmOpticArenas.js` ·
`src/data/swarmOpeningTerrain.js` · `src/data/environmentalMachinery.js` ·
`src/data/encounters/capital-boss/*` · `src/core/sg02DynamicBodyOwner.js` · the field deploy owner
· `src/combat/lifecycle.js` · `src/systems/dyingHull.js` · `src/systems/waveMaterialization.js` ·
`src/systems/swarmArena.js` · `src/systems/survivalWave.js` · `src/systems/capitalBossRuntime.js`
· the hull-burst / fragment **body** spawner · `src/systems/swarmSupply.js` ·
`src/systems/swarmCallins.js` · `src/data/swarmPerks.js` · `src/systems/swarmEvents.js` ·
`src/systems/swarmFortify.js` · enemy doctrine/ability owners named in S7 · arena backdrop and
lighting owners · `src/core/simLaneMain.js` / `wholeSimBrowserWorker.js` (profile transport only)
· their tests and versioned Swarm references.

**Lane S owns:** `src/ui/swarmGlass.js` (new) · `src/data/swarmQuickStart.js` (new) ·
`src/data/swarmControls.js` (new) · `src/data/swarmEvolutions.js` (new) · `src/ui/hudAttention.js`
· `src/ui/comms.js` · `src/ui/captions.js` · `src/ui/toasts.js` · `src/ui/stuntCallout.js` ·
`src/ui/masslineHud.js` · `src/ui/targetPanel.js` · `src/ui/discoveryPlate.js` · `src/ui/hud.js` ·
`src/ui/bindings.js` · `src/ui/orrery/*` · `src/ui/screens/mainMenu.js` ·
`src/ui/screens/motionAsk.js` · `src/ui/accessibility.js` · `src/ui/screens/crucible.js` ·
`src/ui/screens/crucibleDraft.js` · `src/ui/crucibleLaunch.js` · `src/ui/swarmJuiceHud.js` ·
`src/systems/swarmChain.js` · `src/systems/swarmJuice.js` · `src/systems/swarmBrood.js` (system:
credit flags only) · `src/data/survivalDraft.js` · `src/data/swarmDraft.js` ·
`src/systems/swarmLegendaries.js` · `src/render/broodPresentation.js` · `src/render/camera.js` /
`cameraGlide.js` · `src/render/feel.js` · `src/render/vfx/*` · hostile rim/IFF material owner ·
audio and music owners · their tests and stylesheets.

**Anything not listed:** whoever needs it first claims it in `design/program/NOW.md` before
editing. Other agents outside this program also edit this checkout (on 2026-11-05 Codex was on
performance, and `src/ui/orrery/*`, many `src/render/*` files were dirty) — read the live diff
first and preserve their hunks.

## Hand-offs between the lanes

| From → to | What crosses | Rule |
|---|---|---|
| F → S | `swarmCharacter.js` (hue, silhouette scale, tell ids per archetype) | F lands S7 task 1 early; S renders from it (S6) and never edits it — ask F |
| F → S | `swarmFeel(state)` profile (`dying.instantBelowMassT` etc.) | S reads it for instant kill bursts (S8-look); F owns the values |
| F → S | "last three" flag on the run (S10) and boss phase/callout data (S14) | F publishes on the run or bus; S draws pointers, name card, victory screen |
| F → S | heavy break-up chunk bodies (S8-sim) | F spawns the bodies + shockwave; S draws fire, rings, light, sound |
| S → F | perk icons beside the hull ring, Fortify button in the shop (S12 touchpoints) | F publishes perk/Fortify state; S builds the two UI pieces inside S2/S11 |
| both | S16 rehearsal | S runs it after both lanes land; findings go to the owning lane |

A hand-off is a **message in `design/program/NOW.md`** (one line: date, lane, what is ready / what
is needed). Don't wait idle on a hand-off — take your next plan.

---

## Prompt — Lane F (THE FIGHT)

```text
You are the Lane F agent of the SpaceFace SWARM program: THE FIGHT.

Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout that other agents edit at the same time).

WHAT THE OWNER WANTS (2026-11-05, his words condensed): Swarm is the mode to perfect — "like
Zombies was to Black Ops". Waves of different enemies; the environment is a physics playground,
your friend AND your enemy, and it's the key; powers like gravity guns; enemies with powers and
behaviours that make them recognisable and formidable; big impressive explosions and reactions;
it must feel cool and professional. Performance is NOT your job (another agent owns it) — but you
may add no per-frame cost without a matched before/after on this laptop.

READ FIRST, IN THIS ORDER, ALL OF EACH:
1. design/program/finish/swarm/README.md — the vision, the diagnosis, the TASTE BAR (§4). The
   taste bar is your acceptance standard. Look at every picture in swarm/baseline/ — that is
   what "wrong" looks like today.
2. design/program/finish/swarm/AUDIT.md — every setting to change, why it was set that way, how to
   measure. The "why" column is what a reviewer will cite to revert you; respect it.
3. design/program/finish/swarm/LANES.md — your plans, your files, your hand-offs.
4. design/program/finish/swarm/PLANS.md — your plans in full, including each "How you will get
   this wrong" section. Read that section BEFORE starting each plan.
5. design/FEEL_CONTRACT.md §A — the physics problems already fixed in September. Do not
   re-propose them.
6. AGENTS.md and ARCHITECTURE.md — the technical contracts.
Do not sweep other design folders, archives or old plans.

YOUR PLANS, IN ORDER: S1 (Swarm feel profile) → S7 task 1 (the character sheet as data — land it
early, Lane S renders from it) → S10 (round shape) → S8 sim half (heavy break-up chunks as real
throwable bodies + shockwave impulse) → S7 remaining tasks (stats, abilities, tells, debut rule)
→ S9 (arenas: friend and foe) → S12 (Zombies staples: drops, call-ins, special rounds, perks,
Fortify) → S14 logic (first boss at wave 5, phases, death into ammunition).

YOUR FILES: exactly the "Lane F owns" list in LANES.md. Never edit a Lane S file — post what you
need as one line in design/program/NOW.md. Anything unlisted: claim it in NOW.md first.

HOW YOU WORK:
- Swarm-only by default. Every change goes through the S1 profile (swarmFeel(state)) or a live
  Swarm-run gate. Adventure must not change; prove it with a test where you add a gate.
- Never edit a shared constant (fields.js, physics.js, enemies.js, MAX_CONTACT_DV) to tune Swarm.
- Determinism: state.rng / state.simTime only. Swarm references will change under S1 — add
  versioned references beside the old ones (precedent commit d79f80309801). Never overwrite old
  references; Adventure references must not move.
- Test first for logic (node --test <file>). For anything you can see, prove it live: start the
  `spaceface` preview, show the Browser pane (a hidden pane runs at ~1 fps and stalls loading at
  87.8%), title → Crucible → Quick play (or the SWARM button once Lane S lands it). Save captures
  to .devshots/swarm/<plan>/ and judge them against README §4 line by line in the commit body.
- The numbers in the plans are STARTING POINTS. Play, tune, and record what you felt and changed.
  Never relax a test's bar to pass (e.g. the 0.5 s fodder kill time) — change the profile value.
- One independent review per plan: a different agent judges your before/after captures against
  README §4 and the plan's "Done when". Fix material findings before landing.
- Enemy abilities built through existing owners (fields, mines, tethers, impulse charges,
  shields, doctrines) are NOT "new things". A new system, currency, menu or item tier is — don't.
- Formidable means a dangerous ability with a fair, visible tell (>= 0.6 s). Never more HP.

GIT (shared checkout — follow exactly):
- Before editing: git status --short; read design/program/NOW.md; read the live diff of any file
  you touch. Preserve other agents' hunks.
- git add -- <exact paths>; git commit -- <exact paths>. Never -A, commit -a, reset, stash, clean,
  rebase or force-push. Never create a worktree or second checkout.
- Publish: git fetch; if local master carries other agents' unpublished commits, publish ONLY your
  paths: build a tree from origin/master plus your paths (GIT_INDEX_FILE temp index, git read-tree
  origin/master, git ls-tree -r HEAD -- <your paths> | git update-index --index-info, git
  write-tree, git commit-tree -p origin/master), push that commit to master, then git merge
  origin/master locally. End commit messages with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every plan in your list meets its "Done when", and NOW.md tells Lane S each hand-off is
ready. If something is truly blocked, finish everything else, then name the blocker in one plain
sentence. Report to the owner in plain words: done / not done, what changed for the player — no
file paths or jargon.
```

## Prompt — Lane S (THE SHOW)

```text
You are the Lane S agent of the SpaceFace SWARM program: THE SHOW.

Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch
master, ONE shared checkout that other agents edit at the same time).

WHAT THE OWNER WANTS (2026-11-05, his words condensed): Swarm is the mode to perfect — "like
Zombies was to Black Ops". Waves of different enemies blasted in a physics playground; powers like
gravity guns; enemies that are recognisable and formidable; big impressive VFX, animations,
reactions and explosions — "all those things that lend to a professional experience". It must
feel cool and professional; this is a taste audit. Performance is NOT your job (another agent owns
it) — but you may add no per-frame cost without a matched before/after on this laptop.

READ FIRST, IN THIS ORDER, ALL OF EACH:
1. design/program/finish/swarm/README.md — the vision, the diagnosis, the TASTE BAR (§4). The
   taste bar is your acceptance standard. Look at every picture in swarm/baseline/ — that is
   what "wrong" looks like today.
2. design/program/finish/swarm/AUDIT.md — sections D (controls and UX) and E (presentation)
   especially.
3. design/program/finish/swarm/LANES.md — your plans, your files, your hand-offs.
4. design/program/finish/swarm/PLANS.md — your plans in full, including each "How you will get
   this wrong" section. Read that section BEFORE starting each plan.
5. docs/UI_VISUAL_ITERATION.md — how to shoot real screens (node scripts/ui-bench.mjs
   --shot=<id> [--walk]) and judge them.
6. design/frontend/ORRERY.md — the frontend design direction; AGENTS.md and ARCHITECTURE.md.
Do not sweep other design folders, archives or old plans.

YOUR PLANS, IN ORDER: S2 (quiet glass) + S3 (fair credit) → S4 (one press to the fight: a SWARM
button on the title) → S5 (Swarm controls; keep the five powers on 1-5 — owner ruling) → S6
(readable horde: Brood size/colour/death pop, enemy hues from Lane F's character sheet, throwable
outlines, spectator camera) → S11 (pick one of three cards) → S13 (payoff ladder, sound, music
that rises and falls) → S8 look half (instant kill bursts, heavy break-up fire/rings/light, global
flash cap, impact audio) → S15 (combo cards) → S14 UI (boss name card, victory screen) → S16
(full-run rehearsal, after both lanes land).

YOUR FILES: exactly the "Lane S owns" list in LANES.md. Never edit a Lane F file (including
swarmCharacter.js and swarmFeelProfile.js — read them, ask Lane F for changes by one line in
design/program/NOW.md). Anything unlisted: claim it in NOW.md first. src/ui/orrery/* was being
edited by other work on 2026-11-05 — read its live diff before S5.

HOW YOU WORK:
- Swarm-only by default (gate on a live Swarm run; S2's isSwarmGlass is the one gate for UI).
  Marked "global" only where a plan says so (the flash cap). Adventure screens must not change;
  shoot an Adventure before/after when you touch a shared UI owner.
- Remove, don't stack: replace the old HUD piece in Swarm, never add a Swarm widget beside it.
  If a spectator can't read a word, it doesn't draw — don't reword jargon into nicer jargon.
- "Big" effects mean big in the world (debris, shockwave rings, dynamic light, lingering fire and
  smoke) — never a white flash over more than ~15% of the screen or longer than ~0.2 s. Effects
  never hide a red danger telegraph.
- Colour language is fixed (README §4 / PLANS S6): cyan+gold are the player's only; Brood get
  saturated toxic colours; hostile ships get warm hues; red lines/rings are danger.
- Test first for logic (node --test <file>). For screens: ui-bench before/after, --walk every
  control you changed. For the live round: start the `spaceface` preview and SHOW the Browser pane
  (a hidden pane runs at ~1 fps and stalls loading at 87.8%). Save captures to
  .devshots/swarm/<plan>/; open every one; judge it against README §4 line by line in the commit
  body.
- New words go through the localization catalog the surrounding code uses; regenerate catalogs.
- One independent review per plan: a different agent judges your before/after captures against
  README §4 and the plan's "Done when". Fix material findings before landing.
- No new currency, menu layer, item tier or meta system. The allowed new things are named in the
  plans (combo cards; boss break-up visuals; one reserved for S16 with the owner's OK).

GIT (shared checkout — follow exactly):
- Before editing: git status --short; read design/program/NOW.md; read the live diff of any file
  you touch. Preserve other agents' hunks.
- git add -- <exact paths>; git commit -- <exact paths>. Never -A, commit -a, reset, stash, clean,
  rebase or force-push. Never create a worktree or second checkout.
- Publish: git fetch; if local master carries other agents' unpublished commits, publish ONLY your
  paths: build a tree from origin/master plus your paths (GIT_INDEX_FILE temp index, git read-tree
  origin/master, git ls-tree -r HEAD -- <your paths> | git update-index --index-info, git
  write-tree, git commit-tree -p origin/master), push that commit to master, then git merge
  origin/master locally. End commit messages with:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

FINISH: every plan in your list meets its "Done when"; S16 ends with one recorded full run that
has no findings. If something is truly blocked, finish everything else, then name the blocker in
one plain sentence. Report to the owner in plain words: done / not done, what changed for the
player — no file paths or jargon.
```
