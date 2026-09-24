<!-- LIFETIME: STABLE -->
# INFERENCE hygiene playbook — the game is here; make it better

Parent contract: [`INFERENCE_LANES.md`](./INFERENCE_LANES.md) (execution law) and
[`INFERENCE_GOAL.txt`](./INFERENCE_GOAL.txt) (operator prompt). This file is the
mindset and memory that make repeated "make it better" batches converge instead
of polishing the same corner forever.

You are the developer on duty. If [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md)
has an OPEN catalog line, that line is what needs you: do it, leave the note,
and take a line from another group. If the catalog is empty, look at the state
of the game, improve one thing completely, leave a note so the next session
starts smarter, and go somewhere else next. Open feelings are `build_map.md`
§23; this pass does not invent them.

## 1. Progressive disclosure (read little, know enough)

| Layer | File | When |
|---|---|---|
| Mindset + loop | this file, `INFERENCE_LANES.md` | always |
| Whole-game state | `node scripts/inference-ledger.mjs` (~30 lines) | always, at batch start |
| One domain's notes | the ledger's `WF-XX` entry (printed by the same command with `--wf`) | only the domain you touch |
| The domain's standard | that WF file's "One production unit" + failure modes | when grading or finishing |
| Grunt assignment | [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) catalog | when any line is OPEN — do the line, do not invent |

Never read all domain entries. Never sweep `design/`, archives, or transcripts
for an ordinary unit. If the ledger grows past what fits on one screen, it is
broken — prune it, do not route around it.

## 2. The loop

```text
READ the ledger → PICK → INSPECT → GRADE → IMPROVE → RECORD → ROTATE
```

**READ.** Run the ledger. It shows every domain's grade, last touch, whether
its inspection is still valid, open gaps, and one suggested next move.

**PICK.** If the directed catalog has an OPEN line, take that line (lanes
§0.1). Otherwise take the weakest or stalest domain you can *verify by looking*
— an uninspected domain, a stale inspection, a C/D grade, an open gap. The
ledger suggests three; looking beats the suggestion. Never pick what you
just polished because it is familiar.

**INSPECT.** Read the live owner and the ordinary route. Play the thing in
your head (or the bench on a fixed seed). Name the deficit in player words.
Inspecting is not judging from memory: if the ledger's note is stale, the
note is a rumor — look again.

**GRADE.** Score the domain against its standard (the WF file's depth bar).
If the standard is missing or wrong for what the game needs now, developing
it is part of the work: a short checklist an agent can grade against, no
taste allowlists, one-line rationale, versioned by git like everything else.

**IMPROVE.** Fix one thing completely through live owners. Improve means any
of: build the missing thing, polish the weak thing, simplify the
overcomplicated thing, optimize the slow thing, delete the thing that misses
the point. The first green draft is a draft — play it, judge it, iterate
inside the unit, ship the second or third attempt.

**RECORD.** Update the ledger row in place: grade, inspection (~5 lines:
what you looked at, what you found), gaps opened/closed, next move. Record
the production unit in `inference-memory.json` as usual. Small notes or none.

**ROTATE.** Next unit is a different kind of value (parent §3.4). Over
batches, rotation plus the ledger's dates is what rounds out the game: a
fresh A means go elsewhere; an old C means come back.

A directed catalog line in [`INFERENCE_IDEAS.md`](./INFERENCE_IDEAS.md) is not
expanded. Execute it (lanes §0.1). An owner one-liner that is not a catalog
row (`INFERENCE 3 — <idea>`) still enters at PICK: EXPAND it into fantasy,
verbs, place, people, script, density, consequence, and live owners, then run
the loop. An idea never excuses a thin row and never waives the standards basis
(`ARCHITECTURE.md`, `build_map.md` §1.3 craft floors, single writers,
determinism, perf and accessibility rules). If the idea fights the vision,
keep the fantasy and change the mechanism, and say so in one line.

## 3. Staleness law (things change)

Every inspection records the commit it stood on and the paths it covered.
An inspection dies the moment those paths change — other agents work here
constantly, and a note about code that moved is worse than no note. The
ledger computes this from git and marks rows `STALE`; never build on a
stale note without re-inspecting (re-inspecting is cheap; building on a
rumor is how regressions ship). An inspection that names a commit git no
longer knows is stale by definition.

## 4. Anti-bloat law (small or it does not exist)

- Ledger rows update **in place**. Three inspections and five open gaps per
  domain, maximum; the script prunes on write.
- No new documents per unit. A unit's record is its ledger lines plus its
  `inference-memory.json` entry. If you need more than five lines to say
  what you found, you have not understood it yet.
- Gaps close or die: a gap fixed is marked done with the unit id; a gap
  that stops mattering is deleted with one causal line, not carried.
- Owner-dropped raw lines cap at 20; untouched raw lines older than 60 days
  are deleted, not curated. The directed catalog in `INFERENCE_IDEAS.md` is
  the grunt assignment and is not that cap. A catalog line leaves when it
  ships or is cut. Do not add a vague line to the catalog.

## 5. Finishing questions (judgment, not a script)

Ask these like the developer on duty before you close. They are
`build_map.md` §1.6's spirit for inference work — iterate until the answers
are yes:

- Is it complete (the workflow's depth bar, filled with play, not stubs)?
- Is it dense enough to go wrong (or exactly-one-thing-well, if that is
  what the thing is)?
- Would a stranger read cause, motion, and why at the shipping camera?
- Does it route consequences through current owners instead of evaporating?
- Is it wired on the default route — listener, bind, or spawn inspected?
- Is it measured in player units on a fixed seed (before/after for changes)?
- Is its growth (entities, queries, draws, save) declared and bounded?
- Is it kind (reduced motion, reachability, legibility, localizable text)?

## 6. Convergence (how we know it is working)

- Within a batch: N complete units, kinds rotated, ledger rows updated.
- Across batches: UNKNOWN domains get inspected and graded; C/D rows rise;
  stale rows refresh; gaps close faster than they open.
- Game-level: the weakest fresh surface keeps rising while the
  representative route matrix stays green. Convergence is a rising floor,
  not an empty backlog.

When the loop is healthy, any batch — owner ideas, bare look-and-rotate, or
a mix — leaves the game strictly better on every axis it touched, and the
next session can see exactly where to go in thirty lines.
