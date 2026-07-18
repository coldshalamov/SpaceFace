# MAP_DATA_HANDOFF — content/data tasks for a second agent

**Why this exists:** the map refactor (`MAP_UX_PLAN.md`) makes the chart a strategy surface. Some of
its value depends on content/data the map does not own. Those tasks are queued here for a grunt-work
agent so the map work stays UX-only. Each task lists the exact contract the map already reads (or
will read with a graceful fallback), so no map code changes are required to land the content.

**Rules for the picking agent:** voice is "crews talk like riggers, not like marketing" — terse,
dry, working-space. ≤ 90 chars per line. Player-facing strings must pass
`npm run check:player-facing-labels`. Never edit the map to fit content; fit content to these shapes.

---

## H1. Mission chart briefs (highest value)

**Today:** the inspector renders `missionSummary(mission)` — per-type progress strings
(`Sell 0/37 units`) plus `mission.name`. Functional, terse, but no sense of *what this leg is for*.

**Add:** an optional authored field on mission definitions/instances the map can print under the
mission title in the inspector and (later) on the canvas goal label:

```js
mission.brief        // string ≤ 90 chars — one dry line, e.g. "Ore's already aboard. Vesta pays, Drift asks no questions."
mission.stepBriefs   // optional { [stepId]: string } for multi-step contracts
```

- Reader seam (map side, already defensive): `mission.brief || missionSummary(mission)` — no
  fallback breakage if a mission lacks the field.
- Where: `src/data/missions.js` (definitions) and any generator that stamps instances
  (`src/systems/` economy-born missions). Generated missions may compose briefs from template +
  commodity/destination names instead of hand-authoring.
- Proof: focused test that one authored and one generated mission surface a `brief`; labels check.

## H2. Station chart notes

**Add:** optional `chartNote` on station records in `src/data/sectors.js` (`sector.stations[]`):

```js
{ id, name, services, chartNote: "Refinery row — buys ore dear, sells plates cheap." }
```

- Map reader (defensive): station inspector prints `chartNote` under the services chips when present.
- One line each, only where a station has a distinct economic/social role; skip generic docks.

## H3. Remembered-contact decay (parity gap 3)

**Today:** `galaxyMap.buildLocalModel` reads raw live entities; the legacy localmap tracked
`LocalSpaceIntel` remembered contacts with confidence/age decay (bright = fresh, faint = stale).

**Task:** port the decay track into the unified map's LOCAL level:
- Source: `src/ui/navigation/localSpaceMapModel.js` (`LocalSpaceIntel`) + legacy usage in
  `src/ui/screens/localmap.js`.
- Target: `buildLocalModel` gains an optional `intel` reader; contacts carry `{ remembered, ageS,
  confidence }`; canvas dims remembered contacts by age band (mirror `memoryTint` bands).
- Constraint: model builders stay pure (no DOM, no mutation); intel state lives outside the model.

## H4. Multi-point mission geometry (parity gap 8)

**Today:** the map draws the single `activeMapGoal`. Missions with several live targets
(`mission.targetEntityIds`, `params.samplePos`) render only one point.

**Task:** expose a pure reader `missionMapGeometry(state, mission)` (suggested home:
`src/ui/missionLog.js` or a new `src/ui/missionGeometry.js`) returning
`[{ id, kind, x, z, label, done }]`; map draws each as a small keyed mark when the mission layer is
on. Requires per-mission audit of which params actually carry world positions — that audit is the
grunt work.

## H5. Territory overlay data check (parity gap 7 — partial in map)

The map now tints nodes by `state.world.sectors[].owner` when the faction layer is on. **Task:**
verify owner values exist and move for all 24 sectors in live play (not just sectorSim fixtures);
if ownership lags, the fix is in the owner writer (factions/war systems), not the map.

---

## H6. Other-screen unification recipe (after the map ships)

Low-risk, high-coherence order. Each screen: add `panel sf-menu` + `data-stamp`, delete its
runtime-injected style block, move only true exceptions into a scoped rule. Do **not** touch the
station (explicitly out of scope) or the two good menu behaviors (pause's live frozen frame; main
menu's cinematic still + attract drift).

1. **`src/ui/screens/missionLog.js`** (`.sf-mlog`) — biggest surface still on blue plastic; shares
   the map's mission vocabulary, so unifying it makes the mission → map handoff feel like one tool.
2. **`src/ui/screens/gameOver.js`** (`.sf-gameover`) — small; death screen should read as the same
   machine stamping `FLIGHT RECORD / TERMINATED`.
3. **`src/ui/screens/base.js`** (`#sf-base`) — scoped blue variant; align tokens only, keep layout.
4. Legacy `starmap.js` / `localmap.js` — registered for tools/checks only, not on the player route.
   Reskin **only** if a tools route is player-visible; otherwise leave (deletion is a separate,
   riskier decision with parity-check fallout).

Suggested stamps: missionLog `CONTRACT LEDGER / ACTIVE`, gameOver `FLIGHT RECORD / TERMINATED`,
base `CLAIM REGISTRY / OPERATIONS`.

**Station polish (recommendations only — highest regression risk, do not fold into grunt work
without a visual gate):** the station is the strongest surface; unify at the *token* level only
(confirm `styles/station-workbench.css` and `styles/menu.css` §1 values still mirror), then polish
motion (`.sx-enter` stagger), focus visibility, and empty states. Any structural change needs
`npm run check:station-shell` + representative screenshots before/after.

---

## Verification for the picking agent

Per task: the owning focused check (`check:player-facing-labels`, mission/data tests) +
`npm run check:map-authority` smoke. Content tasks must not touch `src/ui/galaxyMap.js`; if a
reader seam is missing, file it back to the map owner instead of patching around it.
