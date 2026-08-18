# Frontend program — live checkpoint

**This file is the handoff. Update it at the end of every working session, before you run out of
context.** It exists because the program is 7 packets / 16 jobs and no single thread has the context
budget to finish them. Work is resumed across threads, so the state has to live on disk.

It is a CHECKPOINT, not a lock board. Nothing here is a reason to stop. Compare it against
`git log` and reality; recent commits beat this file.

Program spec: `CANONICAL_BUILD_MAP.md` §11.12 and `design/frontend/NEXT_JOBS.md` (J01–J16).

---

## Status

| Packet | Jobs | State |
|---|---|---|
| 1 | J04 snapshot lab, J01 data-state adoption | **DONE** |
| 2 | J05 iconography + 14 faction crests | **DONE** |
| 3 | J06 Power Rail | **DONE** |
| 3 | J07 HUD overhaul | **NOT STARTED** |
| 4 | J08 combat reticle + threat halo | NOT STARTED |
| 5 | J09–J13 strategic screens | NOT STARTED |
| 6 | J14–J15 haptics, comms, hail radial | NOT STARTED |
| 7 | J16 visual regression matrix | NOT STARTED — **must go last** |

Landed: `e23a9ba9` `f1cbaf04` `6e0e4037` `79e56c06`.

**Packet 7 goes last.** It commits golden reference images. Taken before packets 3–6 change the UI,
every one of them needs re-baselining. Note `.devshots/` is git-ignored — committing references
needs a negated ignore rule or it silently commits nothing.

---

## Order, and what can run in parallel

Sequential (shared seam — all land on `src/ui/hud.js`): **J07 → Packet 4**.

Independently parallelisable (disjoint seams, safe in their own threads):
- **Packet 5** — station/screen modules
- **Packet 6** — comms + audio
- **Packet 7** — `scripts/`, but only after 3–6 land

---

## Resolve these BEFORE building (packet prompts cite paths that do not exist)

- `src/ui/audio.js` — **does not exist.** Find the real audio module before authoring:
  `grep -rln "AudioContext\|playSfx" src/`. Creating a second audio module beside an existing one
  is the failure mode.
- `src/ui/screens/footprint.js`, `src/ui/screens/range.js` — **do not exist.** Find the screen
  registry first: `grep -rn "SCREEN_MODULES" src/`.

**Packet prompts state premises that are sometimes false. Verify before acting.** Packet 2 claimed
two images were "unreferenced"; one was load-bearing in two places and deleting it blind would have
broken the build. Packet 3's stated measurements (232px dock stagger, 180px radar) DID verify —
check each claim, don't assume either way.

`assets/ui/hud/ship-condition-scout.png` is **referenced twice** in `hud.js` (~1076–1078). J07 says
to kill it — that means replacing those two `<img>` tags with vector hull art, not deleting a file.

---

## Traps this program has already paid for

1. **`SEMANTIC_PALETTE` has two icon channels.** `.icon` is PLAIN TEXT — `hud.js` writes it via
   `setText()`/`textContent`. Assigning SVG markup prints a literal `<svg …>` across the combat HUD,
   **and `check:ui-identity` stays green while it happens.** `.glyph` is the vector/`innerHTML`
   channel. Match the channel to how you write to the DOM.
2. **A green check is not proof.** Confirm *what* it looked at. One verification here searched a
   directory that is deleted on build failure — it passed by inspecting nothing.
3. **Boot the real game.** Three real defects in the Power Rail (collided with the existing bottom
   deck, labels clipped off-screen, wrong colour throughout) were invisible to every check and every
   lab fixture. Recipe: `scripts/lib/load-playwright.mjs`, real `page.mouse.click` for the splash
   (a scripted `.click()` is swallowed), then New Game → Launch, then measure
   `getBoundingClientRect`. The in-app Browser pane cannot screenshot here ("not compositing").
4. **`el.dataset.x = ''` still matches `[data-x]`.** Use `delete el.dataset.x`.
5. **CSS inside a JS template literal must contain NO backticks** — even in a comment. It closes the
   string. `node --check` EVERY touched file.
6. **CRLF.** A formatter rewrote a file LF→CRLF and turned a 46-line diff into 736. Check line
   endings before staging.
7. **Concurrent lane.** `src/ui/hud.js` and others carry another agent's uncommitted hunks.
   `git add <path>` scopes to the FILE, not to your hunks. Recipe that works:
   `git show HEAD:<path> > base`, re-apply only your edits, `git hash-object -w`,
   `git update-index --cacheinfo 100644,<sha>,<path>`. Verify both directions afterward.
8. **Cross-file constants drift.** A CSS keyframe duplicating a JS constant must be pinned by a test
   that reads both. A comment has never prevented that drift here.
9. **Mutation-test your checks.** Break the code deliberately and confirm the check goes red. Two
   assertions written this session passed against correct code for the wrong reason.

---

## Known-red, NOT yours

- `sim-v3` in `check:baseline` — the concurrent lane has `test/47a.telemetry.v3.expected.json`
  uncommitted. Red before this work started. Baseline is **11/12** green; treat that as the target.
- `check:bundle` — fails on `kestrel.glb` package provenance, an uncommitted ship model from the
  concurrent lane. Unrelated to frontend work.
- `check:assets:live` fails whenever the tree is dirty. `check-helios-sky-kit` fails on cycle 10.

---

## Definition of done, per packet

1. The feature is **wired and reachable in the running game**, not just authored. An unmounted
   module is the "authored but never promoted" failure this repo keeps repeating.
2. Booted in real flight and looked at. Screenshot or measured rects.
3. Focused checks green, plus `check:baseline` back to its 11/12 baseline.
4. Committed, scoped to your own hunks.
5. **This file updated** before the thread ends.
