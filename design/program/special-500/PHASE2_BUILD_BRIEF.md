<!-- LIFETIME: CAMPAIGN -->
# special-500 Phase 2 — build brief (every build agent reads this first)

You are building ONE slice of the 500-unit campaign. Your slice is the set of ledger units with
your batch number(s) in `design/program/special-500/BUILD_LEDGER.json` (fields: `id`, `title`,
`kind`, `size`, `family`, `legs`, `followup`, `sectors`). Full authored context per entry is in
`design/program/special-500/CONSENSUS_500.json` (`build` + `bench` arrays; find by `id`; fields
`where/trigger/sees/payoff/seam` are the design intent — the `followup` marker in the ledger is
the build instruction).

## Read first, in order

1. `design/program/special-500/PHASE2_PLAN.md` — the campaign decision and verification bar.
2. `src/systems/special500Director.js` — what already fires; flags; memory records.
3. `src/data/special500/index.js` — entry schema (do NOT edit entries unless your unit is their leg).
4. `src/data/AGENTS.md` — pure-data rules for catalog files.
5. Your family's owner files (below) and their nearest `AGENTS.md`.

## Leg-family contracts

- **mail** — append letter rows to `src/data/mail.js` (pure data, stable `mail_*` ids, the file's
  header documents the trigger vocabulary). Trigger on `{type:'flag', flag:'special500.<id>'}`
  (verified: `src/systems/mail.js:88` evaluates story flags) plus any state conjuncts the design
  needs. The letter is the player-facing deliverable; keep the house voice, 80–160 words.
- **codex** — codex lore lands as an overlay row in the matching section's overlay table in
  `src/data/codexPages.js` (COMMODITY_OVERLAYS / HULL_OVERLAYS / ... — match the section the
  entry names). Scan/interaction hooks go in `src/data/discoveryPresentation.js` following its
  existing row pattern. A leg may also write one plain-named story flag (`incident7741_shield`-style,
  no `special500.` prefix — that namespace belongs to the director).
- **encounter** — ONE new self-registering file per encounter in `src/data/encounters/`, numbered
  **1310 upward** (`1310-<kebab-name>.js`), modeled on `010-pirate-toll.js` + `catalog.js`
  (`defineEncounter`). Gate the special-500 context through
  `crSituationKit.priorOutcome(state,'special500.<id>')` / story flags — never on wall time.
  After adding files run `node scripts/build-encounter-index.mjs` (generated index; then
  `npm run check:encounter-index` must be green).
- **choice** — a player decision on a live seam (comms radial `src/ui/commsRadial.js`, popup
  choices, invoice/deadline chains on comms+mail+flags). Persist the decision as a plain-named
  story flag; every branch must deliver its authored consequence (a line, a bill, a rep tick).
- **vendor** — buy/sell/serve mechanics on existing systems (market profile, station services,
  rookBooth pattern). No new currency; credits flow through the economy owner's existing paths.
- **spectacle** — rows on the presentation registry `src/data/special500/spectacleLegs.js`
  (built by the INFRA unit): each row maps an entry id to a template + params + optional audio
  recipe. Templates render through the existing VFX/lamp/look owners so `vfxAccessibility`
  reduced-motion/flash profiles apply automatically. Never spawn a second render pipeline.
- **counter** — flag/counter chains with a real reader (a UI row, a letter, a bark) — a counter
  nothing reads is not done.
- **dormant/world/spawn/minigame** — per the entry's followup; locate the live owner with grep;
  the followup's file hints may be stale — the live owner is the truth.

## The bar (from PHASE2_PLAN §Verification — all mandatory)

- Player-facing on the ordinary route; deterministic (`state.simTime`/`state.rng`/seeded hash);
  single writers; pure data modules; goldens untouched.
- One focused behavior test per unit in `test/`, named `test/special500-<kebab>.test.mjs`,
  house style (`node:test`, English behavior sentences, seeded fixtures, adversarial cases:
  refire/no-refire, stale save, missing anchor, duplicate event).
- Copy in the game voice: gritty lived-in working space, dry wit, physics-as-spectacle, forecastable
  by an attentive pilot, no memes, no external IP.
- **Already-true check:** before building, grep for the leg (it may have landed since the marker
  was written). If it already exists live, do not rebuild — report `already-true` with evidence.

## Shared-checkout rules (hard)

- `git status --short` first; if a file you must edit is dirty or owned by another worker
  (currently: `drill.js`, `asteroidSites.js`, `worldSiteRuntime.js`, `laneSystemFacades.js`,
  `screens.js`, `prompt-deck.css`, `contactMarks.js`, the new `*ReadModel.js` files), STOP and
  report the conflict instead of editing.
- Do not commit. Do not `git add`. Leave new files untracked. You build; the controller
  reviews, verifies and lands exact paths.

## Report back (per unit)

`<id> | size | landed-files | focused test result (N/N green) | player-facing sentence (one line,
present tense — what the player now encounters/does) | anything already-true, deferred, or blocked.`
