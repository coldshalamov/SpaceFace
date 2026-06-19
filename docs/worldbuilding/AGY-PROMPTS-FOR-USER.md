# AGY COLLABORATION PROMPTS — SpaceFace Story Development

These are the questions to run with `agy --print` (or interactively) when you have a logged-in session.
Each prompt includes context so agy can respond without needing to read the files.
Run them in order — each builds on the previous.

---

## PROMPT 1 — The Graffiti Prophecy Problem

```
You are helping develop the story of SpaceFace, a gritty space-western crime game. 

CONTEXT: The game has a mechanic where graffiti on station walls "knows things the player hasn't done yet." A station bulkhead will show graffiti referencing a job the player hasn't taken, or a contract outcome the player hasn't experienced. This is the game's most distinctive narrative element and is currently under-explained.

Three possible in-world explanations under consideration:

A) The dead wrote it. The graffiti is written by workers who ran the same contracts before and died. They knew what comes next because the pattern repeats. The Pit has been running the same contracts with different names for decades. The graffiti is operational wisdom from the dead, written on a loop.

B) Folk memory. The Pit has a distributed oral/graffiti tradition that circulates knowledge faster than official channels. The graffiti "knows" because someone else already knows and the network propagates faster than the bureaucracy. This is empirical, not mystical.

C) Leave it unexplained. Conrad's "Heart of Darkness" never explains Kurtz. McCarthy's "The Road" never explains the apocalypse. The graffiti's knowledge is simply a given. The player never learns how. The game trusts the reader to not need it resolved.

QUESTION: Which approach serves the tone best, given literary influences of Le Carré, Conrad, McCarthy, and Bacigalupi? And is there a fourth option we're missing? What's the version that would make these authors specifically nod rather than wince?
```

---

## PROMPT 2 — The Guy Ritchie Crime Structure

```
You are helping develop the story of SpaceFace, a gritty space-western crime game.

CONTEXT: The game has 8 recurring NPCs who are all corrupt in their own lanes: Kessler (scales/weights), Voss (mining claims), Mira (sealed freight), Rook (bounties/double-billing), Slate (bad welds), Drift (ore ledgers), Hale (customs clearance), Quinn (currency exchange). They don't meet. They don't coordinate. They all learned the same lesson in the same prison colony.

I want to add a Guy Ritchie structural element: the player doesn't realize until late that they've been in multiple overlapping crime stories simultaneously. The 'all one story' reveal.

QUESTION: In a Guy Ritchie structure (Lock Stock, Snatch, The Gentlemen), the reveal works because every character's separate problem turns out to be the same problem from a different angle. Which of these 8 NPCs should be the structural center — the thread that, when pulled, shows all 8 are involved in the same underlying transaction? And what is that transaction? Give me the Ritchie-style reveal: what does the player see if they look at all 8 NPC contracts side by side and realize they were moving the same thing all along?
```

---

## PROMPT 3 — The Conrad Structure (Journey Inward)

```
You are helping develop the story of SpaceFace, a gritty space-western crime game.

CONTEXT: The game has 10 sectors arranged as a core-to-frontier gradient. The player starts at Helios Prime (safe, high-security, warm, full lighting) and can travel outward to Ashfall Reach (no infrastructure, radiation, complete lawlessness). This is structurally identical to Marlow's journey up the river in Heart of Darkness.

At Ashfall Reach, I've added a character called "the Administrator" (Kurtz equivalent) — a former Concord official who has been off-grid for 11 years, maintaining a handwritten ledger of every fraudulent transaction in the solar system. They're not hostile. They're not raving. They just have the complete record.

QUESTION: What Conrad element is missing from this setup? In Heart of Darkness, the horror isn't Kurtz's madness — it's Marlow's recognition of himself in Kurtz. What is the specific moment where the SpaceFace player should recognize themselves in the Administrator? What is the player carrying that the Administrator also carried? And what is the game's equivalent of "The horror. The horror."?
```

---

## PROMPT 4 — Bacigalupi's Environmental Layer

```
You are helping develop the story of SpaceFace, a gritty space-western crime game.

CONTEXT: The game world has air recyclers that fail first on the lowest decks. Rich stations have warm air and full-spectrum lighting. Poor stations (and the player's starting location, The Pit) run at 60% light and 14 degrees Celsius. The Pit's lower decks have slightly elevated CO2, slightly reduced oxygen — not lethal, just metabolic. Everyone who lived there is slightly slower, slightly more tired than they should be, and doesn't know why.

This is inspired by Bacigalupi's work (The Windup Girl, The Water Knife) where environmental collapse is economic before it's catastrophic.

QUESTION: What Bacigalupi element should be added to deepen this layer? He always had a specific scarce resource that everything else was built around (calories, water, wind energy). What is SpaceFace's equivalent resource — the one thing the system is actually organized around acquiring and controlling, that everyone is pretending isn't the point? And how should that resource appear in the game's commodity tables, the faction behaviors, and the graffiti?
```

---

## PROMPT 5 — Dialog Audit

```
You are helping develop the story of SpaceFace, a gritty space-western crime game.

CONTEXT: The game's tone is Le Carré moral rot + Shalamov frozen indifference + McCarthy spare prose. The player character is a Pit survivor — not quippy, not heroic, not particularly funny. They endure things flatly.

I have fixed two specific dialog problems (removed "Buddy, I've been destroyed since Tuesday" and "Story of my life, sweetheart" as too Whedon-esque), but I need a broader audit.

Here is the game's complete set of player character voice samples for review:

SAMPLE 1: [after ship damage] Nothing. The HUD updates. The player doesn't comment.
SAMPLE 2: [after kill] Kill feed takes a second to catch up.
SAMPLE 3: [bounty hunter comms] Player closes the channel. Then after: "Tell your employer the rate went up."
SAMPLE 4: [reactor failure] Player keeps hands on controls. Waits.
SAMPLE 5: [finding graffiti about themselves] Nothing. Player reads it and docks.

QUESTION: For a character who has spent years in a labor colony where complaint was not useful, what IS the correct voice? Give me 5-8 sample player character lines for different in-game situations (combat, docking, finding a body, getting paid, getting stiffed, interacting with a comms popup) that would pass the McCarthy/Le Carré test. Not silence — that's also a choice. What does this character actually say, and what makes it feel earned rather than performed?
```

---

## PROMPT 6 — The Endgame

```
You are helping develop the story of SpaceFace, a gritty space-western crime game.

CONTEXT: I have designed three possible endgame choices, replacing the original "Sector Baron" title reward:

A) THE CLEAN UNIFORM — Player joins Concord. Record expunged. They are now the institution they hated. The first mission under their new title is a "routine customs operation" that turns out to be exactly what they used to run against.

B) THE SAME SILENCE — Player becomes a routing coordinator for the smuggler syndicate. Their identity disappears from public records. They profit from every transaction without appearing on any kill feed.

C) THE ONLY HONEST OPTION — Player flies into the wormhole with no destination. The reactor fails at the threshold. The HUD's last line: "CARGO: STABLE." Then black.

QUESTION: Is this the right set of choices, given the tone? Le Carré's endings are usually about survival without dignity rather than death or victory. McCarthy's endings tend to be about continuing or not continuing. Are any of these choices too dramatic, too neat, or too merciful? And is there a fourth choice that none of the above covers — the choice that is most distinctly SpaceFace's own?
```

---

## HOW TO RUN THESE:

```bash
# One at a time, save output to files:
agy --print "$(cat docs/worldbuilding/AGY-PROMPTS-FOR-USER.md)" > agy-session-01.md

# Or interactively, paste each prompt into the session:
agy
# Then paste PROMPT 1, get response, paste PROMPT 2, etc.
```

After running, bring the responses back and we'll incorporate the best ideas into the canonical documents.
