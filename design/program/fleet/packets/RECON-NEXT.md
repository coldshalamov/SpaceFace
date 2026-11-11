# RECON-NEXT — Draft the next missing packet (read-only reconnaissance, repeatable)

**Tier:** D. **Size:** small. **You edit no game code.** You write one draft file.

`design/program/fleet/QUEUE.md` has rows whose State is `NEEDS-PACKET`: the lead has not written
their job yet. Writing a job well needs two things: the design (already written, in the docs each
row names) and the code facts (which files, which functions, which tests). You supply the code facts
so the lead only has to add names and numbers.

## Pick your row
In `design/program/fleet/QUEUE.md`, Lane 1, take the first row whose ID starts with **`WRITE `** and
whose draft file does not exist yet: `design/program/fleet/drafts/<ID without "WRITE ", spaces → ->.md`
(e.g. `WRITE G20 the Rig` → `drafts/G20-the-Rig.md`). **Immediately** create that file with one line
(`# <ID> — draft in progress`) and commit it alone, so no other worker takes the same row. If every
`WRITE` row has a draft, take the first `NEEDS-PACKET` row in any lane instead.

## Read
- The row's spec. Docs live on another branch; read them without switching branches:
  `git show origin/experience-commissions/EC-G13-integration-director:design/program/experience-commissions/<NN_NAME>.md`
  (list: `git ls-tree --name-only origin/experience-commissions/EC-G13-integration-director design/program/experience-commissions/`).
  Commission briefs: `git ls-tree -r --name-only origin/experience-commissions/<EC-branch> design/program/experience-commissions/commissions`
  then `git show <branch>:<path>`. Branch names: `git branch -r | grep EC-`.
- Two finished packets for the format: `design/program/fleet/packets/G19-01-class-up-moment.md` and
  `design/program/fleet/packets/C01-01-swarm-can-be-won.md`.

## Write `design/program/fleet/drafts/<ID>.md` with these headings
1. **What the player must see** — copy the exact names, numbers and lines from the spec (quote them;
   say which doc and section). Do not invent any.
2. **Code facts** — for each thing to build: the existing files and functions that own it today
   (path:line), what they do now, and the seam where the change goes. Existing data tables to extend.
   Existing UI components or styles to reuse (`src/ui/`, `styles/`).
3. **Files a builder may edit** — the smallest list; for each, the output of `git diff --stat -- <file>`
   (empty means clean).
4. **Existing tests** that cover these files (`grep -rln "<module>" test | head`) and one focused test
   to write.
5. **How to see it** — the `node scripts/ui-bench.mjs --list` shot ids, `?swarmRound=N`, or
   player-truth flags that would show the result.
6. **Split** — if this is more than ~6 files or ~400 lines, propose 2–3 slices, each shippable alone.
7. **Questions for the lead** — design gaps only (not code questions you could answer by reading).

Commit only the draft: `git add -- design/program/fleet/drafts/<ID>.md && git commit -m "fleet: recon draft <ID>" -- design/program/fleet/drafts/<ID>.md`.
