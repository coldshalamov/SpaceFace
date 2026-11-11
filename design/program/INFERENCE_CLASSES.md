<!-- LIFETIME: ACTIVE_PROGRAM -->
# INFERENCE defect classes — the list that makes polish compound

A **class** is a defect a player notices that can occur in more than one place. It is fixed once,
everywhere, through one shared helper or component, and guarded by a check that fails when it comes
back. This list is how one agent's fix becomes every later agent's floor.

Rules (law: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) §0.0):

- Read this before choosing a unit. **OPEN** classes come first.
- A class is **CLOSED** only when its check runs in `npm run test:fast` or `npm run check` and
  passes on the whole game.
- If you meet an instance of a **CLOSED** class, the check has a hole. The unit is to fix the check.
- Add a row when you find a new class. One row, plain words, the player's view first.

| Class | What the player sees | The everywhere-fix | The check | State |
|---|---|---|---|---|
| Counts and plurals | "1 units", "2 crate(s)" | One shared `counted()`/`pluralWord()` in `src/core/numberFormat.js`; per-screen copies deleted | `test/player-counts.test.mjs` fails on a raw number glued to a noun in player text | **CLOSED** — SHIPPED 448fef1; six sites in foreign-claimed files (hud.js, missionPreflight.js, missionObjectiveOps.js, missions.js, missionShared.js, missionStoryOps.js) fixed in-tree and ride their owners' commits |
| Money | Credits written three different ways | One shared money formatter | Lint that fails on a credit amount not passed through it | **OPEN** |
| Raw ids | `sector_tethys_junction` or a part id on screen | Every player-facing label resolves through the name table | Bench walk fails on text matching an internal-id pattern | **OPEN** |
| Cut-off or spilling text | A word clipped, or text running out of its box, at some window size | The owning component declares wrap or ellipsis (EC-G16) | `ui-bench --walk` at three sizes with worst-case text; zero clipped | **OPEN** — worst-case text mode is missing |
| Panel without its frame | A box with no border or padding (22 separate "hairline card" fixes so far) | The Panel and Card components own the frame (EC-G16) | Bench fails on a panel not built from the kit | **OPEN** |
| Popup from outside the interface | An off-style, borderless or overlapping popup in flight | Everything that pops up goes through the Stage (EC-G16) | Fails on a page element created outside `src/ui/` | **OPEN** — check is missing |
| Focus you cannot see or reach | Keyboard or controller lands on nothing, or cannot reach a control | The Button, Row and Tabs components own focus | Accessibility sweep on every bench screen | **OPEN** |
| Defined but never appears | A ship, enemy, job or prop that exists in data and is never met in play | Wire it into the ordinary route, or remove it | Census: every data-defined thing seen at least once on a scripted tour (EC-G17) | **OPEN** — check is missing |
| Moving on the wrong clock | Something keeps animating while the ships are held | It advances from the presented clock, not frame time (EC-G11) | Lint list of frame-time users in the renderer shrinks to zero | **OPEN** |
