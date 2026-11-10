You are a READ-ONLY auditor inside the SpaceFace repo (a Three.js space game; 60 Hz fixed-timestep sim decoupled from rendering; flat GameState + event bus + system registry).

Your assigned workflow (build_map.md §1.8 coverage table): **Menus, HUD and text — functional defects only**
Cover: title/new game/load/settings/pause, map, station/market/outfitting, jobs screens, Swarm draft/refit/results. Check code paths for narrow/default/wide layout branching, long names/numbers, populated/empty/error states, scrolling and focus management. Bar: no dead control, unreachable state, stuck modal, missing feedback, or state leak between screens.

SCOPE LIMIT — READ CAREFULLY:
- The ORRERY frontend lane owns all REDESIGN. You are hunting FUNCTIONAL defects only: a button whose handler throws or does nothing, a screen that can't be exited, state that survives a screen close and corrupts the next screen, a settings value that doesn't apply, a list that can't scroll to a real item, focus trapped, a code path that renders stale/wrong data.
- Do NOT file style, spacing, color, font, or "looks cheap" findings — those are another lane's job.
- `src/ui/screens/{flightFootage,footageVideoCodec}.js` are foreign-dirty — audit them read-only and tag findings there "foreign-lane file dirty".

HARD RULES — violate none:
- You may READ any file and run `node --test test/<file>.test.mjs` and non-browser `node scripts/check-*.mjs` / `npm run check:*` scripts (check:ui:* family are non-browser mostly — verify before running; skip anything that launches Chrome/Electron).
- NEVER edit/create/delete files. NEVER run mutating git commands (status/diff/log/show only).
- NO browser/Electron/GPU probes.

METHOD:
1. Read root AGENTS.md and build_map.md §1.8 for the bar.
2. Owners: `src/ui/screens/*`, `src/ui/` screen manager/router, `src/ui/orrery/` kit, modal/focus handling, settings application path.
3. Hunt: unhandled promise on action, missing null-guard on empty station/contract list, modal stack leaks, keyboard/gamepad focus never restored, settings applied to wrong bus key, dead `onclick`/`onAction` wiring (grep for handler names that have no listener).
4. Report findings as markdown on stdout — your ONLY output.

FINDING FORMAT (repeat per finding, max 8, only real ones):
```
### F-MENUS-NN
- symptom: <what the player hits>
- severity: crash|softlock|major|minor|polish
- route: <screen + action>
- owner: <file:function/line>
- evidence: <code path>
- suggested_fix: <bounded functional fix, ORRERY-consistent>
- confidence: high|medium|low
```
Clean verdict is a valid result. End with `VERDICT: <N findings / clean>` on its own line.
