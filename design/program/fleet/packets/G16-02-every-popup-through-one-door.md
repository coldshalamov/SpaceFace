# G16-02 — Every popup through one door: migrate the stragglers onto the Stage

**Lane 3** (mechanical once G16-01 exists). **Do after G16-01 is BUILT.**
**Spec:** `design/program/fleet/drafts/G16-one-glass.md` §2 "The worklist: popups that still build
their own frame, style, and mount point" (16 files) and §6 "G16-02". Lead answers to its questions are in
`packets/G16-01-the-stage-exists.md`.

## The rule for every file on the worklist
Each popup **keeps its trigger and its text**, and **loses** its own `<style>` block, its own mount point
and its own z-index. It **gains** the kit frame (the shared style §2 "One style" names) and a Stage slot
(via the G16-01 API). Change nothing else: no rewording, no new behaviour.

Do the files in two commits: **flight popups** first (hail, sector postcard, dock-deny banner, tutorial
card, …), then **comms/contact** popups. For each file, take a ui-bench shot before and after
(`node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=<id>`) and list the shot ids in
your receipt. Refresh the UI budget digest after `src/ui/**` changes (`scripts/lib/uiBudgets.mjs`).

Commits: `fleet(G16-02): flight popups use the Stage and the kit frame` and
`fleet(G16-02): comms popups use the Stage and the kit frame`.
