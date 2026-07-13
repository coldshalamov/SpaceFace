GOAL: Implement SpaceFace SPEC3 (design/spec3/) wave by wave, orchestrating terminal subagents by strength. You (codex) are lead engineer + sole reviewer.

READ FIRST: design/spec3/_context/06_PLANNING_CONSTITUTION.md, design/spec3/INDEX.md, and SPEC3-42 (in SPEC3-F10: diagnosis, wave order, review protocol). ARCHITECTURE.md is the technical contract. One agent per thread-file lane; never two in the same files.

WAVES (SPEC3-42 §5): W1 truth-gates F10-41, ship stability F8-33, flight+tether F3. W2: F4-19/20/21, F1-10/11, F2-13, F8-34/36, F9-39. W3: F6-26/27, F5-23/24, F2-14/15, F9-37, F8-35. W4: F7 all, F6-28, F4-22, F5-25, F1-12, F9-38. Gate each wave on check:ci + regression floor.

AGENTS (exact commands):
- codex subagents (yours): ALL sim/backend (economy, encounterDirector, tetherSystem, siege, saves/migrations), check scripts, bug hunts, golden re-records. Best backend; never frontend or vision judgment. Your GPT-Image covers overflow imagegen.
- opencode run "..." (kimi k2.7, default provider): med-high code AND frontend. Owns UI screens, HUD 2.0, market charts, overview strip, uiRoot/hud.js. Also your EYES (best vision): send .devshots screenshots for five-second-test verdicts + visual regression review. No imagegen.
- agy -p "..." --dangerously-skip-permissions (gemini 3.5 flash; on quota rerun with sonnet 4.6 thinking): code + nanobanana imagegen. Owns SPEC3-38 image lane and mixed code/asset tasks; generation technique and palette are open to the strongest coherent result.
- grok --prompt-file brief.md --always-approve --check (composer 2.5): med/low code, good imagen, Blender MCP, huge quota. Owns SPEC3-37 Blender pipeline (spaceface_export.py, whole-ship GLB contract repair, part queue) + nebula/prop/portrait gen. Never core sim code; batch its work.

EVERY BRIEF MUST SAY: "Read the relevant planning brief, then implement the behavior and player-facing result it requires. Acceptance = the named check plus screenshot/evidence review. Touch the files needed for a coherent result. git add -N every new file immediately (this env deletes untracked files). Never edit test/*.expected.json. Runtime and build-time dependencies are allowed when they materially improve quality and have documented license, bundle/perf, determinism/save, and maintenance impact. Print a 10-line summary."

Historical taste documents may inform behavior and release intent, but they do not impose mandatory palette, glow, radius, shell, texture, triangle, or technique ceilings. Current player-facing evidence and professional quality decide visual direction; visual checks and screenshot review remain required.

REVIEW GATE per task — transcripts are NOT evidence: 1) git status: lane files only. 2) YOU run the named check + the relevant deterministic/runtime checks. 3) Visual work: demand .devshots pairs and judge the player-facing result, not just token compliance. 4) Reject determinism, save/load, accessibility, asset-contract, or measured-performance failures. Patch small fixes yourself; re-brief structural failures to the same agent with the failure pasted. Deviating from a spec number: document the reason in the same change.
