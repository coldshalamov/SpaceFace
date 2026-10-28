<!-- LIFETIME: RECEIPT -->
# PQ-187.01 — The decision and the direction sheet — RESULT: DONE (2026-09-06)

## The owner's words (verbatim, 2026-09-06, this session)

> I'm not going to go over these endless stylesheets with short descriptions of styles that don't
> really tell me at all what the eventual result is going to be like and then bottleneck the
> development at the stage of me just having to choose one at random
>
> You're being brought in for your design taste, your job is to make a bold expressive interface for
> this game, I'd prefer if we didn't have to gut out everything completely but maybe that's what's
> needed to get a good interface out of this game, I don't know
>
> I'm really not sure what to make of these "directions" / none of them look like games, it's just a
> title, and I guess the titles are different colors / I have no clue what the eventual game results
> are going to be from these / I guess I like cinematic minimal, but I have no clue what that would
> turn out in the game itself
>
> You'll just have to decide what the game being described in the docs would look best like, and
> make it into a series of frontend tasks we could tackle

## What was decided

**Cinematic Minimal, tuned for SpaceFace — the world is the interface.** Decided by the agent under
the delegation above, leaning where the owner leaned. Recorded in
`design/frontend/direction/DIRECTION_SHEET.md` (the authority) and `design/FRONTEND_DIRECTION.md`
§13. The three-direction comparison round (`PQ-187.01` as previously scoped) is void: no comps are
built; the first real frame is the title screen in `PQ-187.03`, which the owner sees in the game.

## What changed

- The mechanism: no owner pick, no owner sign-off forms, no contact-sheet yes. A leaf closes when its
  actual capture matches the sheet under a hash-bound visual review by a memoryless vision reviewer
  and the integrator accepts; the owner's veto stays open, exercised by looking at the game.
- `PQ-187` re-scoped (`.01` decision, `.02` kit, `.03` title live = the gate, `.04` proof);
  `PQ-181.00` no longer rebuilds the title; the surface packets cite the sheet.
- The reading screens (missions, codex, help, tech tree) gained a packet, `PQ-192`.
- "Gut everything?" — no. The bones stay (three-anchor HUD, Power Rail, the station OS and its six
  instruments, the instruments' verbs, the icon set, the crests, the hangar-rig hull render, the
  screen manager). What retires is the skin: Saira and the Plex trio, mono as a look, boxed panels,
  the menu plate, chips as decoration — each screen sheds its old CSS as it migrates.

## Checks

`node scripts/check-program-docs.mjs` green; `git diff --check` clean. No code changed under this leaf.
