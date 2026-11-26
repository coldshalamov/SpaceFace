# CAM-PILOT-TREE-1 — make pilot progression truthful and readable

Surface: Grok implementation. Model: grok-4.7-high. Do not commit.

Mission: repair the pilot-tree/progression interface as a player-facing system. INFERENCE says the tree is high leverage: progression must explain what is earned, what is available, what is locked, what changed, and why. Remove hollow or misleading rows. Do not redesign progression wholesale and do not touch Swarm teaching files or Adventure law files.

Scope:
- src/ui/screens/pilotTree.js and its layout/presenter/helpers
- progression/xp/level presentation helpers directly owned by that screen
- focused tests and ui-bench evidence

Required outcomes:
1. A fresh player sees an honest empty/start state, not fake progress or empty NOT YET noise.
2. Every visible node states a real effect, cost, prerequisite, and owned/locked/available state.
3. Swarm read-only run progression and Adventure persistent progression are clearly distinguished.
4. No internal IDs/codenames; plain player language; type floor and narrow viewport hold.
5. Controls are reachable and walked at desktop and phone sizes.

Verification: focused tests, check:plain-words, ui screen import checks, ui-bench shots plus --walk at 1280x720 and 390x844. Open the PNGs and judge them. Do not boot full game unless using game lock. Report files, checks, screenshots, remaining defects. Do not commit.
