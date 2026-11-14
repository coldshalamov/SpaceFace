# SpaceFace — three owner-level creative decisions, with safe interim assumptions

These are **style/interaction design forks**, not permission to stop implementation while waiting for the owner. Source and current `design/VISION.md` remain the default authority. Decisions should be applied to all affected EC commissions after the owner answers; do not ask the same question 52 times. The existing X1 art-direction approval gate remains separate and binding.

## 1. What counts as physically entering a place?

**Fork:** (A) Ship-scale inhabited districts: the pilot remains inside the ship, hails specific people/working craft, docks in visible bays, uses ship-scale tools and contact screens when needed; **or** (B) add or deliberately plan full on-foot avatar/interior navigation as an additional gameplay scale.

**Provisional choice:** A, for the current 52 commissions. It aligns with the current core game, recent owner priority that gameplay is unstable, and the cost of inventing person-scale navigation, collision, NPC animation and camera/control modes. It still requires *real-feeling inhabited places*: identifiable residents, clear mission and hand-in affordances, physical approaches and a sense of scale. If owner wants B eventually, reserve believable airlocks/doors/berths now but **do not silently build the entire on-foot game inside a sector PR**.

**Affected:** EC-G01, G02, G10, S01–S25, especially S02 interiors, S04 garrisons, S09 inhabited wrecks and S11 manufactured terrain.

## 2. What should the world look like before the combat spectacle starts?

**Fork:** A materially convincing, lived-in industrial world with structural shadows, practical light, believable surfaces, warm signs of habitation and restrained ambient post effects; versus intentionally graphic arcade environments with bright emissive outlines and simplified physical materials.

**Provisional choice:** Physics/world environments favor the first; combat attacks, momentum, powers and Swarm feedback may be aggressively saturated and stylized provided causes remain legible. Neither brown-gray realism nor a neon filter is the default. Color/lighting identity is local, material/shader grammar is global. **The final look is subject to X1 visual lineup and explicit owner approval.** Agents should create side-by-side real gameplay-camera examples, measure GPU and compare before choosing any expensive renderer change.

**Affected:** EC-G03 and G08, all 25 sectors and 7 arena visuals, especially EC-S01 Helios and EC-A01 Foundry.

## 3. How radically should the player be able to transform settlements and stations?

**Fork:** A modular, curated set of persistent outpost/settlement upgrades (new functional docks, refinery machinery, faction garrison, signs, services, recovery and ecological states) integrated into authored geometry, versus unconstrained freeform player-placed structures and widespread fully dynamic geometry/physics changes.

**Provisional choice:** Curated modular growth with **real utility and visible structural consequences**. The player accumulates infrastructure and options and may shift local control without character resets. Fungal spread/damage changes real facilities and selected navigation/collision only at meaningful bounded thresholds, not through per-frame unbounded mesh growth. Each state remains recoverable or honestly contested; preserve one canonical world/ownership/contamination ledger.

**Affected:** EC-G05, G06, G12, S09 Charon, S07 Sker, S04 Dione, S11 Ashfall, and cross-sector ownership/economy.

## Applying decisions

1. Update the affected complete commission briefs and native art/interaction owners after an owner answer. Keep unchanged files on other draft PRs.
2. If the choice crosses current scope/architecture, update the current native parent, establish a new explicit owner/interface and cost test before implementation. Do not smuggle an extra engine into a content PR.
3. Show at least one before/after *normal-camera* scene and a measured quality/performance comparison for the selected fork.
4. Do not mark decisions or X1 approval as settled by merely writing this file.
