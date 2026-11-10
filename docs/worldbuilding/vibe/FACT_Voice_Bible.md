# FACT Voice Bible

This style guide establishes the narrative registers and dialogue rules for all in-game text (NPC barks, mission briefings, station comms, and commodity flavor) in *SpaceFace*. 

Every writer and procedural text generator must adhere to the rules outlined below.

---

## The Voice Law
1. **One Voice at a Time:** Comms are serialized. Space is silent; channels are clear. The engine never prints simultaneous dialogue.
2. **Bark Length:** Absolute maximum of **12 words** per comms block. Terse, radio-clipped, and functional.
3. **Radio Callsign Read:** Callsigns/names at the beginning of a line must be in **ALL CAPS** (e.g., `CONCORD:`, `REACH:`). 
4. **No Shouting:** Never use ALL CAPS in the body of the message. No exclamation marks are permitted unless there is a genuine physical emergency (such as a hull breach, reactor failure, or distress loop).
5. **Space-Radio Texture:** Professional, dry, and somatic. Speak in physical coordinates, ledger accounts, and mechanical friction. No fantasy high-speech, no anime melodrama, and no modern slang.
6. **Auditory Distinction:** Factions must sound instantly recognizable from the grammar and syntax alone.

---

## faction_scn — Solar Concord Navy
*   **ID:** `faction_scn`
*   **Short Name:** Concord
*   **Personality:** Lawful (Bureaucratic/Procedural)

### 1. Persona
The thin, authoritarian line keeping the core sectors under administrative lock. They see themselves as the stewards of order, but operate a system of legal extortion—willing to accept bribes, only to fine the pilot for the same infraction at the next gate. They are motivated by quotas, regulatory protocols, and total control of the lanes.

### 2. Voice Rules
*   **Syntax:** Short, clipped, declarative sentences.
*   **Vocabulary:** High-formal, bureaucratic, code-heavy. Use administrative jargon.
*   **Contractions:** Strictly forbidden. Do not use *don't*, *isn't*, *it's*, or *we're*.
*   **Tone:** Absolute professional detachment. Speak with the indifference of a machine.
*   **Signature Words:** *Ref 44-C*, *non-compliance*, *logged*, *protocol*, *verification*.
*   **Never Say:** Slang, warnings without referencing a code, casual greetings, or direct physical threats (e.g., "I will destroy you").

### 3. Comms Greetings
*   `CONCORD: Stand by for transponder verification. Ref 44-C.`
*   `CONCORD: Vessel identified. Comply with sensor sweep.`
*   `CONCORD: Lawful transit acknowledged. Safe passage.`

### 4. Threat/Aggro Lines
*   `CONCORD: Resistance noted. Escalating to enforcement action.`
*   `CONCORD: You are non-compliant. Ordnance authorized.`
*   `CONCORD: Filing use-of-force report. Weapons free.`

### 5. Motto
"Order through written protocol."

### 6. Color & Typography Identity
*   **Hex Color:** `#3A78FF`
*   **Typography:** Bold weight, geometric sans-serif (e.g., *Inter Bold*). 
*   **Descriptor:** Military-bureaucratic authority.

---

## faction_mts — Meridian Transit Syndicate
*   **ID:** `faction_mts`
*   **Short Name:** Meridian
*   **Personality:** Corporate (Mercantile/Transactional)

### 1. Persona
The massive corporate conglomerate owning the jump networks, cargo routes, and major trade exchanges. They view the entire galaxy as a single balance sheet where every pilot is either an asset or a liability. They hide predatory tariffs and hostile takeovers behind customer service politeness and administrative processing fees.

### 2. Voice Rules
*   **Syntax:** Smooth, measured, grammatically complete sentences.
*   **Vocabulary:** Middle-to-high, saturated with financial, trade, and ledger terminology.
*   **Contractions:** Allowed but limited. Use them only to sound artificially familiar.
*   **Tone:** Passive-aggressive politeness. Never scream; threaten only through financial consequence or liquidation.
*   **Signature Words:** *account*, *invoice*, *markup*, *settle*, *investment*, *friend*.
*   **Never Say:** Street slang, unprovoked vulgarity, moralizing, or uncalculated threats.

### 3. Comms Greetings
*   `MERIDIAN: Pinging your registry for market research.`
*   `MERIDIAN: Confirming your account is in good standing.`
*   `MERIDIAN: Trade lane secured. Keep credits handy.`

### 4. Threat/Aggro Lines
*   `MERIDIAN: You should have paid. The markup applies.`
*   `MERIDIAN: Regrettable. This encounter will be itemized.`
*   `MERIDIAN: Bad for business. We must settle accounts.`

### 5. Motto
"Accounts must be balanced."

### 6. Color & Typography Identity
*   **Hex Color:** `#F2B233`
*   **Typography:** Medium weight, clean neo-grotesque sans-serif (e.g., *Helvetica Neue*).
*   **Descriptor:** Cold corporate efficiency.

---

## faction_dmc — Drift Mining Collective
*   **ID:** `faction_dmc`
*   **Short Name:** Drift
*   **Personality:** Lawful (Blue-Collar/Industrial)

### 1. Persona
A rough, legitimate union of asteroid miners, station riggers, and refinery crews. Descended from the original convicts sent into the deep rock, they view themselves as the hard, honest backbone of the sectors. They are tired, fatalistic, and fiercely protective of their active claims against claim-jumpers and corporate auditors.

### 2. Voice Rules
*   **Syntax:** Short, blunt, conversational fragments.
*   **Vocabulary:** Low-to-middle, heavily industrial. Clogged with mining terminology.
*   **Contractions:** Common and expected (e.g., *ain't*, *don't*, *you're*, *we've*).
*   **Tone:** Tired, gruff, and fatalistic. They speak like people at the end of a double shift.
*   **Signature Words:** *rig*, *claim*, *shift*, *rock*, *belt*, *ore*, *cycles*.
*   **Never Say:** Corporate jargon, legal citations, high-formal greetings, or deferential language.

### 3. Comms Greetings
*   `DRIFT: State your business. Keep it short.`
*   `DRIFT: Drift collective. Mind the debris, friend.`
*   `DRIFT: Just working the belt. You do you.`

### 4. Threat/Aggro Lines
*   `DRIFT: That claim is ours. Back off.`
*   `DRIFT: Didn't want this fight. I'll finish it.`
*   `DRIFT: Claim jumper. You want it the hard way.`

### 5. Motto
"The rock remembers the blood."

### 6. Color & Typography Identity
*   **Hex Color:** `#C9772E`
*   **Typography:** Extra-bold weight, slab-serif (e.g., *Roboto Slab*).
*   **Descriptor:** Weathered industrial labor.

---

## faction_reach — Outer Reach
*   **ID:** `faction_reach`
*   **Short Name:** Reach
*   **Personality:** Hostile (Predatory Outlaws)

### 1. Persona
Violent pirate clans, outlaws, and ambush-lane scavengers operating in the lawless fringes. They are former prisoners who refused the final headcount and chose to live in the dark. They survive through toll checkpoints, raids, and selling ship hulls for scrap, compensating for their light armor with extreme aggression.

### 2. Voice Rules
*   **Syntax:** Direct, short, fragmented commands.
*   **Vocabulary:** Low, coarse, and predatory.
*   **Contractions:** High frequency.
*   **Tone:** Mocking, hostile, and direct. They do not negotiate; they dictate terms based on force.
*   **Signature Words:** *hull*, *scrap*, *prey*, *lane*, *pack*, *slow*.
*   **Never Say:** Formal pleasantries, corporate concessions, or legal justifications.

### 3. Comms Greetings
*   `REACH: Nice hull. Bet it carries nice things.`
*   `REACH: Keep moving. Maybe we let you.`
*   `REACH: The Reach owns this stretch. Pay up.`

### 4. Threat/Aggro Lines
*   `REACH: Cargo or your life. We take both.`
*   `REACH: Cut your engines. You worth more slow.`
*   `REACH: Light him up. No radio calls.`

### 5. Motto
"The dark belongs to us."

### 6. Color & Typography Identity
*   **Hex Color:** `#D8334A`
*   **Typography:** Distressed, wide sans-serif (e.g., *Impact* or *Druk*).
*   **Descriptor:** Raw violent friction.

---

## faction_quiet — The Quiet
*   **ID:** `faction_quiet`
*   **Short Name:** Quiet
*   **Personality:** Mystery (Smugglers/Anomaly Researchers)

### 1. Persona
A highly secret network of contraband runners, data-thieves, and deep-space researchers. They have survived the systems by becoming ghosts, moving through the cracks in corporate lanes. They speak only when necessary, treating any spoken word as a tracking vector.

### 2. Voice Rules
*   **Syntax:** Minimalist to the extreme. Single words or fragments. Never write a compound sentence.
*   **Vocabulary:** Simple, flat, stark.
*   **Contractions:** N/A (sentences are too short to contain them).
*   **Tone:** Monolithic, silent, and cold. Completely devoid of small talk or emotion.
*   **Signature Words:** *seen*, *logged*, *leave*, *quiet*, *gone*.
*   **Never Say:** Greetings, nicknames, threats of anger, explanations, or callsigns in their lines.

### 3. Comms Greetings
*   `QUIET: Seen. Pass. Say nothing.`
*   `QUIET: We know your face now.`
*   `QUIET: Keep it quiet.`

### 4. Threat/Aggro Lines
*   `QUIET: Wrong route. Leave now.`
*   `QUIET: No more words.`
*   `QUIET: Done talking.`

### 5. Motto
"The walls are not real."

### 6. Color & Typography Identity
*   **Hex Color:** `#7A5FB0`
*   **Typography:** Light-weight, widely letterspaced monospaced (e.g., *Fira Code Light*).
*   **Descriptor:** Silent electronic ghost.

---

## faction_vael — Vael Syndicate
*   **ID:** `faction_vael`
*   **Short Name:** Vael
*   **Personality:** Hostile (Inscrutable / Contract-Obsessed)

### 1. Persona
A culturally insular faction from the Veil Nebula region specializing in hazardous salvage, engine modifications, and black-market deals. They are human-descended but behave like legal aliens, wrapping every deal in incomprehensible twelve-page contract addenda. They enforce compliance through leverage, claiming ship-titles and reactor parts from debtors.

### 2. Voice Rules
*   **Syntax:** Rhythmic, formal, and heavily structured.
*   **Vocabulary:** Highly legalistic, technical, and dry.
*   **Contractions:** Strictly forbidden.
*   **Tone:** Remote, transactional, and legal. They refer to themselves as *this-vessel* or *this-kind*.
*   **Signature Words:** *Clause*, *this-vessel*, *accord*, *terms*, *consensus*, *ledger*.
*   **Never Say:** Casual slang, physical threats outside of contractual clauses, or emotional barks.

### 3. Comms Greetings
*   `VAEL: Consensus observes. Await disposition.`
*   `VAEL: Clause 1: your presence is registered.`
*   `VAEL: State your standing under standard terms.`

### 4. Threat/Aggro Lines
*   `VAEL: Clause 9 invoked. Penalty is enacted.`
*   `VAEL: You voided the accord. Comply.`
*   `VAEL: The terms permit correction. Hold still.`

### 5. Motto
"Read the addendum first."

### 6. Color & Typography Identity
*   **Hex Color:** `#2FCFA0`
*   **Typography:** Thin weight, condensed sans-serif (e.g., *Din Alternate*).
*   **Descriptor:** Cold alien contract.

---

## faction_free — Free Belters
*   **ID:** `faction_free`
*   **Short Name:** Frontier
*   **Personality:** Independent (Frontier Spacers)

### 1. Persona
Independent colonists, scavengers, and deep-space freighters who live outside the control of the Navy or the Corporations. They see themselves as survivors who keep their ships running on spit and prayers, and just want to be left alone. They protect their stations and neighbors, but remain highly suspicious of Core politics.

### 2. Voice Rules
*   **Syntax:** Loose, natural, and conversational.
*   **Vocabulary:** Simple, plainspoken, regional.
*   **Contractions:** Heavy, natural usage.
*   **Tone:** Neighborly but defensive. They sound like survivors who know they are on their own.
*   **Signature Words:** *friendly*, *neighbor*, *watch*, *easy*, *advice*, *hassle*.
*   **Never Say:** Navy codes, corporate jargon, contract clauses, or cold robotic silence.

### 3. Comms Greetings
*   `FRONTIER: Reading your beacon. You friendly?`
*   `FRONTIER: Free Frontier. Carry on, traveler.`
*   `FRONTIER: Just neighbors keeping watch. Safe travels.`

### 4. Threat/Aggro Lines
*   `FRONTIER: Didn't want this fight. Peeling off.`
*   `FRONTIER: You asked for it. Bad call.`
*   `FRONTIER: Back off before things get messy.`

### 5. Motto
"Live and let live."

### 6. Color & Typography Identity
*   **Hex Color:** `#4ECBE0`
*   **Typography:** Regular weight, rounded sans-serif (e.g., *Comfortaa* or *Varela Round*).
*   **Descriptor:** Pragmatic spacer community.

---

## faction_choir — Ascendant Choir
*   **ID:** `faction_choir`
*   **Short Name:** Choir
*   **Personality:** Zealot (Ritual Relic Hunters)

### 1. Persona
A religious movement born inside the prison blocks, now controlling relic shrines and fortified sectors. They believe pre-human artifacts are active antennas tuning the galaxy to a divine "Pattern," and view non-believers as noise to be corrected or unified. They trade relics through the black market, but use tracking scripts hidden within them to locate and reclaim pilgrim tributes.

### 2. Voice Rules
*   **Syntax:** Poetic, rhythmic, and chant-like.
*   **Vocabulary:** High, ritualistic, religious, but combined with spacer terms.
*   **Contractions:** Strictly forbidden.
*   **Tone:** Eerie, serene, and absolutely unyielding. 
*   **Signature Words:** *the Pattern*, *ascent*, *unascended*, *resonance*, *shrine*, *pilgrim*.
*   **Never Say:** Slang, financial terms, navy regulatory codes, or emotional panic.

### 3. Comms Greetings
*   `CHOIR: The Choir observes. Hold and be known.`
*   `CHOIR: A signal in the dark. Welcome, pilgrim.`
*   `CHOIR: We measure the resonance of your passage.`

### 4. Threat/Aggro Lines
*   `CHOIR: You choose the fall. We deliver you.`
*   `CHOIR: The Pattern demands your correction.`
*   `CHOIR: Unmade and remade cleaner. Hold still.`

### 5. Motto
"The Pattern gathers all."

### 6. Color & Typography Identity
*   **Hex Color:** `#E85FD0`
*   **Typography:** High-contrast serif with slight flare, medium weight (e.g., *Playfair Display*).
*   **Descriptor:** Archaic religious ritual.
