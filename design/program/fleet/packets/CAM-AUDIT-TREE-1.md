# CAM-AUDIT-TREE-1 — shared-tree triage and landing-order audit

**For:** Gemini Neon 1. **Kind:** READ-ONLY investigation. Change no tracked file, create no worktree, do not delete anything, do not commit. Write findings only to your RECEIPT.md.

The shared checkout has a large amount of foreign half-finished work. Before more implementation lanes run, the controller needs a precise map of what is already in progress, what appears valuable, what is risky, and what order it can be integrated without collisions. The owner explicitly does **not** want more worktrees or forgotten branches.

## Read first

1. `AGENTS.md`
2. `design/overhaul/17_AGENTIC_CAMPAIGN.md`
3. `design/overhaul/16_DEMO_HANDOFF.md`
4. `.devshots/director/demo/RESUME.md` if present
5. recent receipts in `.devshots/fleet/runs/` for `DEMO-XR-FIX-2`, `DEMO-GATES-CLEAN-1`, `XR-DEMO-SWARM-TUTOR-1`, `XR-DEMO-FRAME-1-C`, and `DEMO-LOAD-2` where present

## Audit the live tree

Run and inspect:

- `git status --short --branch`
- `git diff --stat`
- targeted `git diff -- <file>` for clusters you classify
- `git log --oneline -30`

Do not treat file dirtiness as proof of value or correctness. Use receipts and tests where available.

## Classify every dirty or untracked cluster

At minimum cover these known clusters:

1. render/performance batch files under `src/render/` and `scripts/bench-sim-fight.mjs` / related probes;
2. Swarm teaching files: `src/data/swarmTeaching.js`, `src/ui/swarmTeaching.js`, `src/systems/survivalAnnounce.js`, `src/ui/survivalHud.js`, `src/ui/orrery/hudAdapter.js`, `src/ui/uiRoot.js`, `test/swarm-one-teaching-card.test.mjs`, `scripts/look-swarm-teaching.mjs`;
3. controller/input files and tests;
4. tactical AI / phased-thinking files and tests;
5. save/loading/test-health files;
6. station cleanup files;
7. pause/menu/station/screen/test files not obviously in another cluster;
8. temporary scripts such as `scripts/.tmp-*.mjs`, `test/tmp-*`, `test/__probe_witness.mjs`;
9. fleet packet markdown files.

For each cluster report:

- likely owner/packet or unknown;
- player-facing purpose;
- evidence that it works;
- evidence that it is broken/disputed;
- overlapping files with other clusters;
- recommended disposition: integrate now / repair then integrate / split / hold as foreign / safe to delete after evidence capture / leave untouched;
- exact next controller action.

Do not delete or modify anything yourself. Do not run the full test suite or boot the game.

## Receipt format

Use the normal receipt headings, and inside **What the player now sees or feels** write "READ-ONLY audit; no player-facing change." Add these sections before **What is left**:

```
## Cluster table
## Collision map
## Recommended landing order
## Cleanup candidates
## Evidence gaps
```

Be concrete. The controller should be able to act from your table without rereading every diff.
