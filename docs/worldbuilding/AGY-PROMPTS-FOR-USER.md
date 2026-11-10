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

---

## CURRENT WORKING ANSWERS (developed before agy session — compare to agy's response):

**Prompt 1:** Working answer was Option C (leave unexplained). **agy response upgraded this to a 3-layer hybrid (Option D):**

*Layer 1 — The Leak (Le Carré/Bacigalupi):* Every contract that appears on a station board has already cleared weeks of administrative approvals, cargo routing, and atmospheric tax allocations. Low-level hackers, clerks, and dock workers see the database allocations before they're public. The graffiti isn't prophetic — it's a leaked database. The machine's decisions are made long before the player encounters them.

*Layer 2 — Recurrent Typology (McCarthy):* The Pit has run the same contracts for decades. Voss always leaves his crew in Ashfall; the guild always cuts oxygen when quotas drop. The graffiti isn't predicting the player's future — it's recording a historical pattern so structural and economic that the player's future is indistinguishable from predecessors' pasts. "The loop isn't temporal; it is economic."

*Layer 3 — Toxic Dissociation (Conrad/Bacigalupi):* The graffiti written in the player's own hand while they slept is the result of their subconscious processing subtle clues (IFF glitches, cargo mass discrepancies, dock whispers) during micro-episodes of oxygen-deprived sleepwalking. The environment is rotting their brain.

**Synthesis:** "The HUD lies, but the graffiti is the only honest narrator." The graffiti knows because: (a) the system's database already wrote your doom, (b) the environment is rotting your brain, and (c) your predecessors already walked this exact path to the grave. The game never explains which of the three is true. All three are simultaneously true. The player is never told.

**Prompt 2:** Working answer was DRIFT as structural center. **agy upgraded this to MIRA (physical pivot) + HALE (systemic anchor):**

The dual-center is more Le Carré: Mira is where the physical goods change hands (extraction → laundering), while Hale is the non-corrupt system mechanism that makes the whole thing legal. Hale doesn't open the container. He applies REG 44-C. The double fine is paid. The log says "CLEARED." That's what makes it unkillable as a conspiracy — the mechanism is legal.

**The underlying transaction (new, from agy):** The 8 NPCs collectively stole the Pit's primary atmospheric recycler catalyst grid. The grid weighs 12.4 tons — exactly the mass that disappeared in Contract 47-A. The player's opening run was carrying the stolen recycler components, labeled "TITANIUM ALLOY 12400KG." The manifest code is VALE-ALA-47A (Vale's Atmospheric Logistics Allocation, Contract 47-A).

**Chief Engineer Elroy (new):** The Pit's chief engineer filed a report when the recycler disappeared. Rook double-billed his bounty tag as a "pirate threat." The player killed him in B2 (First Blood). "THEY WERE CARRYING MEDICINE." What Elroy was carrying was the only evidence the Pit's air was being stolen. The player is the reason the Pit never found out.

**The Ritchie punchline:** The 12.4 tons in B0's opening contract = the weight in Mira's manifest = the weight on Kessler's scale = the recycler catalyst grid that stopped running on the Pit's lower decks in year 3. The player was the muscle in a machine that stole the Pit's air. They were in the story before they knew it was a story.

**Prompt 3:** Working answer upgraded with full agy synthesis:

**The missing Conrad element:** Self-recognition. In *Heart of Darkness*, the horror isn't Kurtz's external savagery — it's Marlow's recognition of Kurtz as his own reflection. The player's journey from core to frontier is not an escape from corruption but a journey inward to confront the mechanism that already marked them. They are not independent contractors operating outside the system. They are the physical enforcement of it.

**The recognition happens two ways simultaneously:**

(1) *The Ledger Entry:* The player finds their own callsign in the COUNTERPARTY column, six weeks before their first contract, filed under the ship's transponder ID (the ID the ship had before they got it). They were a pre-allocated asset in Vale's system before they stepped into the cockpit. The entry exists. It was made by someone who knew the ship's routing before the player was ever in the seat.

(2) *The Atmospheric Resonance:* Ashfall Reach — the furthest point from the lit core — runs at 14°C and smells of hydraulic fluid over something organic the undersized scrubbers can't clear. This is the exact temperature and smell of the Pit's lower decks. The darkness at the end of the river isn't alien. It's home. Conrad's Marlow arrived at Kurtz's station to feel recognition of the already-known in a new context. The player arrives at the edge of lawlessness and breathes the air they left behind.

**What the player carries (that the Administrator also carried):**

*The Weight of the Recycler Catalyst Grid:* The player carried 12.4t in B0 without knowing what it was. The Administrator carried the record of it for eleven years and knew everything. Both are complicit in the same transaction: the Administrator went off-grid to record the complicity on paper; the player executed it on the board.

*The Physical Record:* Choice D makes the ledger a permanent cargo item: PERSONAL EFFECTS — 1 UNIT / 0.4t. The player literally carries the documentation of the system's rot. The mass never changes, even if they jettison it. The manifest still shows it.

**The game's equivalent of "The horror. The horror.":**

*The Administrator's parting words:* "The count never ends. You know that. That's why you're here."

*The bulkhead graffiti at Ashfall Reach, written in the player's own hand while docked:* "THEY KNEW THE MASS. THEY ALWAYS KNEW THE MASS."

The second line is the Conrad element: "always" is the recognition of pre-existing complicity. The player didn't enter the system at B0. The system had them slotted before B0. The mass was always going to be 12.4t. Only the manifest was going to change.

**Prompt 4:** Working answer upgraded with agy naming the core substance:

**agy's contribution:** The scarce resource is **Catalytic Silt** ("Silt") — a dense, dark-gray silicate slurry that lines the channels of recycler grids and splits CO2 back into breathable oxygen when electrically stimulated. Silt degrades over time (human breath, industrial fumes, organic contaminants poison it). Degraded Silt turns inert and pale — "Chalk." When recyclers run on Chalk, CO2 rises and residents enter the "Slow Gray": chronic non-lethal carbon dioxide poisoning causing metabolic lethargy, headaches, and cognitive decline.

**Jargon layer (from agy):**
- "Breathing gray" / "Silt-headed" — experiencing Slow Gray; said about someone who seems off today
- "The chalk" — dead Silt; symbol of deferred maintenance; "the filters in Shaft 7 are nothing but chalk"
- "Vale's Breath" — perfectly scrubbed air from Core stations; said by Pit workers who've been to Helios Prime, not approvingly
- "Dry scrubbers" — out of Silt, running on reserve tanks
- "The slurry run" — The Quiet's primary high-margin business: smuggling refined Silt canisters

**Commodity board** (from agy analysis): Raw Silt Ore (mined in S6-S7, low value), Refined Slurry / canisters (high value, requires REG 44-C license), Spent Silt / Chalk (waste, near-zero value), ATMO Tokens (digital derivatives tracking sector debt), ATMO Debt (the negative balance accumulated by failing sectors).

**Connection to the Ritchie reveal:** The 12.4t in B0 was the recycler catalyst grid pre-loaded with high-grade Refined Silt. Removing it triggered the Pit's ATMO DEBT spiral. The theft caused the debt, not the other way around. The Pit's lower decks have been in the Slow Gray for fourteen years. The residents call it being tired.

**Hale's dialog sample** (perfect register): "The manifest says titanium. The scan says 12,400 kilograms. The seal is Concord ALA. Under REG 44-C, I don't break Concord seals. If the Pit is short of Silt this cycle, they can file an appeal with Logistics Oversight. I don't change the numbers on the sheet. I just sign it." — Hale is describing the recycler catalyst grid in the B0 manifest. Hale doesn't know what's inside. Hale doesn't break Concord seals.

**Prompt 5:** Working answer upgraded with agy's specific lines:

**The floor (working samples — these are the minimum):**
- Combat (three enemies): "Three left." Status to nobody.
- Docking: Nothing. Or "Confirmed."
- Finding a body: "Log it." Operational. Stranger: "Another mouth closed. Log the air."
- Getting paid: "Good." Or "Correct." (After being stiffed before: "Correct" is colder.)
- Getting stiffed: See upgraded line below.
- Comms: "Wrong frequency." Or closed. Customs: see upgraded line below.

**agy's upgraded lines:**

*Getting stiffed:* "You will pay the difference to someone else. The sector does not leave ledgers open." — McCarthy-register. In a world where ATMO DEBT is traded, a debt is a physical asset. The player isn't threatening the client; they're stating the math. The ledger has an entry. Someone will collect it.

*Late-game catalyst grid reveal:* "The air in Shaft 7 was heavy when I left. Now I know the weight." — The best line in this set. Connects somatic memory (breathing Slow Gray Silt) with manifest accounting (12.4t). No moral crisis. No vow of vengeance. Flat testimony.

*Finding a body (stranger):* "Another mouth closed. Log the air." — Operational. The air just got fractionally cleaner because one fewer person is breathing it.

*Moral betrayal:* "The fuel was already in the tanks. We had to go somewhere." — Reframes moral choice as inventory calculation.

*Customs interception:* "The seal is Concord. If the weight is off, talk to Tycho." — Le Carré bureaucratic defense. Passes administrative liability back to the relay that logged the cargo.

*Discovering their name in the Kurtz ledger:* Nothing said. But if the Kurtz figure says "Year 3" — the character looks at the year 3 entry and back, and says: "That was the first run." Not a question. Confirmation.

*Late game, after full reveal:* "I was carrying it." Three words. The sentence isn't finished. Doesn't need to be.

**The "rate went up" line:** Passes ONLY with its frame. Said to a dead channel, nobody answers, "That's fine." Strip those three words and it's a quip. Keep them and it's Le Carré: the functionary sends the memo regardless of whether there's anyone left to act on it. The frame is the difference between register and Whedon.

**Prompt 6:** Working answer upgraded with agy's full critique and fifth choice:

**agy's verdict on existing choices:**
- A (Clean Uniform): PERFECT. Keep as is. Le Carré.
- B (Same Silence): Slightly too neat — feels like shadow-mastermind power fantasy. Fix: de-emphasize "better insulation," add paranoia/isolation layer. The coordinator is an algorithm in a windowless room terrified of unexpected pings. They can never spend the profits because their identity has been erased.
- C (Only Honest Option): TOO DRAMATIC AND TOO MERCIFUL. Reactor death is a classic video game "tragic sacrifice" exit that lets the player escape moral consequences. Fix: the wormhole doesn't kill you. You emerge at Sector 1. CONTRACT 47-A is PENDING. The system filed the jump as a return. There is no escape. McCarthy: the relentless thing isn't the job, it's the inevitability.
- D (The Ledger Continues): Too romantic. "THIS ONE STAYED" reads as too heroic for this world. The witness ending is the most comfortable graffiti line in the game.

**agy's proposed fifth choice: THE NEXT RUN**
- Player declines all four board entries
- Vale's courier at Ashfall Reach: "Contract settled. New one's open."
- +1,200 credits. CONTRACT 47-A: STATUS: CLOSED.
- Immediately: CONTRACT 47-B: STATUS: PENDING.
- Player flies back to standard sector loops. Not a Baron. Not a coordinator. Not a witness. Just a tired pilot who needs to pay for reactor fuel.
- They know whose air is being cut off by the cargo they carry. They click Accept anyway.
- Graffiti: "YOU KNEW THE MASS AND YOU TOOK THE COIN."
- This is the ending the game most specifically deserves. Continuation without redemption. The moral weight is not resolved. It is carried forward.

**All five choices integrated:** A (authority), B (invisibility), C (loop-back), D (witness), E (continuation).

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
