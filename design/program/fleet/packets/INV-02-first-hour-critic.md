# INV-02 — Play the first hour as a first-time player and say what's wrong (READ-ONLY critic)

**You change no tracked file.** You may create files only under `.devshots/fleet/inv02/`. Your output is
your RECEIPT.md.

## Who you are
You are a demanding critic for a modern 2026 action game. The bar is a major studio release. You are
playing SpaceFace for the first time. The design intent is in `design/game/20*.md` (the first hour) and
`design/game/18*.md` (the ten-minute card); skim them first so you know what the game is trying to be.

## Do this
1. Run both demo routes, one at a time, through the lock. They play from the title screen with real
   input and save frames plus a `report.md`:
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --out=.devshots/fleet/inv02/swarm --max-min=8`
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --out=.devshots/fleet/inv02/adventure --max-min=8`
   The lock may make you wait a long time; that is fine. Do not run anything else that starts the game.
2. Read each `report.md` and `demo-route.json`, then LOOK at every saved PNG frame.
3. For each frame, judge it as a player: what do I see, what am I supposed to do, is it clear, does
   it look expensive or cheap, is anything cut off, overlapping, unreadable, placeholder-looking,
   empty, too busy, or ugly? Is there a clear single "what next"? Does the moment feel exciting?

## The receipt
Under **What the player now sees or feels** write:
- **Top 15 problems, ranked by how much they hurt a first impression.** Each one: the frame file name,
  where on screen (e.g. "top-centre", "around x 900, y 540"), what exactly is wrong in one sentence, and
  why a player would care. No vague items ("polish UI"). Only what you can actually see in a frame or
  read in the report.
- **Dead time:** every stretch where the player waits or has nothing to do, with seconds from the report.
- **Top 5 things that already look or feel great** (so we keep them).
- **Errors:** any page errors or console errors in the JSON, copied exactly.
Do not propose code. Do not guess at causes. Describe what is seen.
