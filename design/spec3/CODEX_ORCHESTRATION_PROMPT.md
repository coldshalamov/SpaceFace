ACTIVATION SCOPE: This is a manual orchestration prompt. It applies only when a user/lead explicitly dispatches a SPEC3 campaign. Finding this file does not activate its waves, model routing, or ownership lanes. Ordinary feature work follows the scoped AGENTS.md and activated spec, and may touch every required integration seam.

GOAL: Implement SpaceFace SPEC3 (design/spec3/) wave by wave, orchestrating terminal subagents by strength. The lead coordinates integration and obtains independent review for consequential work.

READ FIRST: design/spec3/_context/06_PLANNING_CONSTITUTION.md, design/spec3/INDEX.md, and SPEC3-42 (in SPEC3-F10: diagnosis, wave order, review protocol). ARCHITECTURE.md is the technical contract. Avoid simultaneous writers in overlapping files; lane ownership is temporary coordination, not a permanent integration ban.

WAVES (SPEC3-42 §5): W1 truth-gates F10-41, ship stability F8-33, flight+tether F3. W2: F4-19/20/21, F1-10/11, F2-13, F8-34/36, F9-39. W3: F6-26/27, F5-23/24, F2-14/15, F9-37, F8-35. W4: F7 all, F6-28, F4-22, F5-25, F1-12, F9-38. Gate each wave on check:ci + regression floor.

AGENTS (exact commands):
- codex subagents: primary fit for difficult architecture, sim/backend, checks, bug hunts, integration, and review/fix work. They may implement frontend or visual integration when that is the coherent task; obtain actual player-facing review for visual claims.
- opencode run "..." (kimi k2.7, default provider): med-high code AND frontend. Owns UI screens, HUD 2.0, market charts, overview strip, uiRoot/hud.js. Also your EYES (best vision): send .devshots screenshots for five-second-test verdicts + visual regression review. No imagegen.
- agy -p "..." --dangerously-skip-permissions (gemini 3.5 flash; on quota rerun with sonnet 4.6 thinking): code + nanobanana imagegen. Owns SPEC3-38 image lane and mixed code/asset tasks; generation technique and palette are open to the strongest coherent result.
- grok --prompt-file brief.md --always-approve --check (composer 2.5): primary fit for Blender MCP, asset production, long-running builds, visual research, and bounded implementation. Core-sim work requires a precise brief and independent technical review; capability routing is not a permanent file ban.

EVERY BRIEF MUST SAY: "Read the relevant planning brief, then implement the behavior and player-facing result it requires. Acceptance = the named check plus screenshot/evidence review. Touch the files needed for a coherent result. git add -N every new file immediately (this env deletes untracked files). Never edit test/*.expected.json. Runtime and build-time dependencies are allowed when they materially improve quality and have documented license, bundle/perf, determinism/save, and maintenance impact. Print a 10-line summary."

Historical taste documents may inform behavior and release intent, but they do not impose mandatory palette, glow, radius, shell, texture, triangle, or technique ceilings. Current player-facing evidence and professional quality decide visual direction; visual checks and screenshot review remain required.

REVIEW GATE per task — transcripts are NOT evidence: 1) inspect the whole shared tree, then attribute the task's changes without sweeping foreign work. 2) Run the named check plus relevant deterministic/runtime checks. 3) Visual work: review representative current player-route captures, not token compliance. 4) Reject determinism, save/load, accessibility, asset-contract, or measured-performance failures. Integrate and repair within the task's coherent scope; re-brief only when that is the fastest safe route. Deviating from a spec number: document the reason in the same change.
