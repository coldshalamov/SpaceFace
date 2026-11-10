# SPACEFACE — CUTSCENE SCRIPTS (video-generation prompts)

*Eight cinematics as self-contained video-gen prompts. Feed each SHOT paragraph to a video
model with the MASTER PROMPT's style block inlined. The Vethari are always off-frame.*

*Authority: `CREATIVE-DIRECTION.md`. Protected dialogue transcribed exactly. End on the number.*

---

## GLOBAL STYLE (inline into every shot)

Found-footage body-cam and fixed security-camera angles. Industrial science fiction, lived-in,
unmaintained. Lighting is interrogation-bright (harsh full-spectrum white) OR ambush-dark
(emergency orange / low-spectrum). Default: 60%-spectrum sick light. Palette: coolant-teal,
sodium-orange, chalk-gray, wrong-green phosphor. Film grain, lens breathing, occasional frame
stutter. NO clean hero shots, NO beauty passes, NO lens flares, NO orchestral swells. On-screen
text is diegetic industrial stencil or terminal mono. Wren: early thirties, worn flight suit,
left hand slightly stiff; prefer hands, back, helmeted silhouette. Audio: ship hum, wrong air
recyclers, distant klaxons; silence is a sound. Format refs: 1970s industrial documentary, CCTV,
Soviet-era factory photography, archival NASA.

**GLOBAL NEGATIVE:** no aliens, no Vethari, no creatures, no gore lingering, no hero framing,
no clean Apple-store sci-fi, no neon cyberpunk, no smiles in terminal zones, no orchestral score,
no beauty lighting, no lens flare.

---

## CS-01 COLD START (B0) — 45s — 16:9 — 24fps

**Logline.** The crate was already aboard; the mass leaves; the wall knew.

**MASTER PROMPT.** Security-cam and body-cam hybrid of a small freighter pre-flight at a bright
Helios industrial dock, then ambush-dark transit, then Pit docking bay arrival. Industrial SF,
60% spectrum, grain, no hero shots. Manifest and HUD text exact. Tone: procedural dread.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–6s | Fixed security cam, Helios dock, interrogation-bright. Freighter Tessera at berth. Loading arm retracts from hold. On-screen mono: `MANIFEST: SLOT01 TITANIUM ALLOY 12400KG` and below `SLOT99 UNCLASSIFIED COMPOSITE — 3.1 KG [PERSONAL EFFECTS — DO NOT TRANSFER]`. | Dock clanks, recyclers |
| 2 | 6–12s | Over-shoulder cockpit, hands on controls (left hand slightly stiff). Terminal: `CONTRACT 47-A ACCEPTED. ALLOY RUN. MASS 12.4T.` Then `DEPARTURE CLEARED.` Auth line visible if zoomed: `APPROVED: VALE, D. / MID-SECTOR ADMIN / REF 44-C` and `CO-AUTH: [FIELD REDACTED — REF 44-C]`. | Soft UI beeps |
| 3 | 12–22s | Ambush-dark transit. External cam, grainy. Distant flashes. Killfeed mono overlays, one per beat: `ESCORT-02 ELIMINATED` / `ESCORT-01 ELIMINATED` / `CARGO DRONE 03 LOST` / `UNKNOWN VESSEL DEPARTED`. No ships clearly identified. | Static, cut thrusters |
| 4 | 22–30s | Cockpit HUD: `RETURN VECTOR SET.` Then docking clamps. Exterior: Pit bay, chalk-gray air, sodium lights. | Clamp thud |
| 5 | 30–38s | Body-cam airlock interior. Manifest updates: `SLOT01 TITANIUM ALLOY 00000KG`. HUD: `CONTRACT 47-A CLOSED.` / `PAYMENT WITHHELD.` | Airlock cycle |
| 6 | 38–45s | Airlock door interior, stencil paint. Exact text: `THEY KNEW THE MASS.` Hold. End on the stencil. No music. | Recyclers only |

**Dialogue / text table:** all strings above exact. No spoken dialogue.

**Continuity:** Helios → Pit (R14). Fragment 3.1 KG, six months. Mass 12.4t → 0.

---

## CS-02 THE VARIANCE (B1) — 30s

**Logline.** The horror is a thumb.

**MASTER PROMPT.** Tycho Relay scale room, interrogation-bright industrial, body-cam close on
a weigher's hands. No violence. Procedural.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–8s | Scale platform, crate seal. Kessler's hands (50s, work-worn). Thumb presses seal twice. | Scale hum |
| 2 | 8–16s | Terminal close: manifest logs BEFORE scan bar completes. Text: `WEIGHT MATCHES PRIOR HAUL` then later flicker `VARIANCE ADJUSTMENT`. | Beep, beep |
| 3 | 16–24s | Wide: scale housing graffiti stencil: `THE SCALE LIES WHEN THE THUMB IS ON IT.` | Footsteps |
| 4 | 24–30s | Second visit match-cut: different hand graffiti: `KESSLER. SCALE 4. TYCHO. TWENTY-TWO MONTHS. LOOK IT UP.` Hold on LOOK IT UP. | Silence |

**Negative add:** no action, no weapons, no chase.

---

## CS-03 FIRST BLOOD (B2) — 40s

**Logline.** Half a second of civilian; a lifetime of bounty collected.

**MASTER PROMPT.** Cockpit combat, ambush-dark, HUD-forward. Airless. No music. The flicker is
one dropped frame. Do not linger on wreckage.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–8s | HUD lock: `TARGET ACQUIRED. TAG: UNKNOWN.` IFF blank: `IFF: —` | Target tone |
| 2 | 8–14s | Weapons discharge (muzzle only, no glory). Shields drop, hull breach at distance. | Burst, vent |
| 3 | 14–16s | **One dropped frame:** IFF resolves `CIVILIAN VESSEL — REGISTERED.` Hold ≤0.5s. | Hard silence beat |
| 4 | 16–24s | Killfeed overwrites: `BOUNTY COLLECTED.` / `TARGET NEUTRALIZED.` Civilian line gone. | UI confirm |
| 5 | 24–32s | Secondary feed line appears small: `They were carrying medicine.` Glitches to `Contraband detected.` Dies. | Static |
| 6 | 32–40s | Dock airlock stencil: `THEY WERE CARRYING MEDICINE.` Payment cleared same cycle on a side terminal: amount standard. End on stencil. | Airlock |

**Negative add:** no close-up corpse, no blood hero shot, no celebration.

---

## CS-04 THE REUNION (B5) — 70s

**Logline.** Two people who never answer the question asked.

**MASTER PROMPT.** Meridian Exchange floor, bright commercial-industrial, futures tickers
moving behind a broker booth. Two men. Camera never gets between them. Side angle / over-shoulder
only. Protected dialogue exact.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–8s | Wide booth: Callum (clean clothes, prosperous, mildly inconvenienced) at futures screen. Wren approaches, worn suit. Ticker numbers tick on news. | Exchange murmur |
| 2 | 8–55s | Side two-shot. Dialogue exact, no cuts that break lines: | Low murmur |

**Dialogue (exact, protected):**
- Callum: "Wren."
- Wren: "Callum."
- Callum: "You look different."
- Wren: "I was frozen for four years."
- Callum: "I heard something about that."
- Wren: "Who'd you sell it to?"
- Callum: "That's not a conversation for the floor."
- Wren: "I'm not on the floor. I'm at your booth."
- Callum: "You're at my booth with a question I'm not going to answer where the exchange can hear it."
- Wren: "The exchange can hear whatever it wants. Who bought the fragment?"
- Callum: "A man who paid well and didn't give a name. That's the whole story."
- Wren: "That's not the whole story. That's the part of the story you're willing to tell while the exchange can hear it."
- Callum: "That's the same thing, Wren."

| 3 | 55–62s | Below counter line: data chip changes hands. No faces. | Soft plastic click |
| 4 | 62–70s | Callum already back to futures before Wren leaves frame. Wren exits. Callum does not watch him go. | Ticker beep |

**Negative add:** no dramatic music swell, no tears, no handshake hero moment.

---

## CS-05 THE SMELL TICKET — 35s

**Logline.** Forty thousand people went gray; the destination filed a smell complaint.

**MASTER PROMPT.** Helios Bay 7 warehouse, full-spectrum clean light (the only clean room in the
game). Comic-horror via bureaucracy. No quips. The form is the joke.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–10s | Wide clean warehouse. Dusty 12.4t catalyst grid on rack. Tag: `RECEIVED YEAR 3 / INSTALL PENDING`. | HVAC perfect |
| 2 | 10–18s | Closer tag addendum: `ISSUED YEAR 17`. Dust line where a second grid never sat. | Footsteps clean |
| 3 | 18–28s | Maintenance terminal queue. Only ticket referencing grid: lounge air "smelled faintly of machine oil for a week." Status: `CLOSED — NO ACTION REQUIRED.` Filer: `WEX`. | Soft key |
| 4 | 28–35s | Hold on `NO ACTION REQUIRED`. Warehouse remains very clean. End. | HVAC |

**Negative add:** no laughing character, no slapstick, no dirt except grid dust.

---

## CS-06 THE DRAWER (B6) — 30s

**Logline.** Nineteen years of chits; the drawer was never locked.

**MASTER PROMPT.** Tycho annex night shift, ambush-dark sodium, close on hands and paper.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–8s | Hallway, third drawer left, second row, yellowed tape label with code. Drawer unlocked. | Fluorescent buzz |
| 2 | 8–18s | Hands open drawer. Chits: berth fees, REG 44-C initials, moisture-loss copies. Depth of paper = years. | Paper rustle |
| 3 | 18–24s | Player's hand adds one chit. | Soft place |
| 4 | 24–30s | Match-cut later visit: a new paper that was not there — callsign on a roster. End on the new paper. | Silence |

---

## CS-07 THE LEDGER ROOM (B7) — 55s

**Logline.** The edge smells like home; the double is a desk.

**MASTER PROMPT.** Ashfall Reach derelict admin station, 14°C, hydraulic-over-organic air (visible
haze). Witness: hands and shoulders, back to camera, never face as subject. Ledger is the subject.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–10s | Approach corridor. Breath visible. Condensation. Same chalk taste as Pit (visual: same particulate). | Wrong recyclers |
| 2 | 10–20s | Room: wall chart VIABILITY SCORE / ADMINISTRATIVE CLOSURE columns. Desk. Twenty years one handwriting. | Page turn |
| 3 | 20–32s | Witness silhouette against chart, back to camera. Mutter barely audible, not performed: "Filed it myself. Eleven years." / "The count never ends." | Dry whisper |
| 4 | 32–45s | Ledger page: COUNTERPARTY column includes player's prior transponder. Elroy: DECEASED (B2). | Page stop |
| 5 | 45–55s | Pull back to ledger, not the man. End on open page. | Silence |

**Negative add:** no face hero close-up of Witness, no throne imagery, no dark-lord framing.

---

## CS-08 THE LOOP (Choice C) — 30s

**Logline.** The door led back.

**MASTER PROMPT.** Jump from Ashfall; emergence at Pit same bay same date. No music. Loop, not death.

| # | t | SHOT PROMPT | Audio |
|---|---|---|---|
| 1 | 0–8s | Ashfall jump charge. Cockpit instruments climb. Vale line optional VO (flat): "Good work. Keep it clean." | Charge whine |
| 2 | 8–16s | Tunnel that is not a tunnel — instrument snow, no wormhole spectacle. | Drop to hum |
| 3 | 16–24s | Pit docking bay. Same clamps. Terminal date unchanged. | Clamp thud |
| 4 | 24–28s | Airlock stencil unchanged: `THEY KNEW THE MASS.` | Airlock |
| 5 | 28–30s | HUD: `CONTRACT 47-A: STATUS: PENDING.` Killfeed one line: `+1 UNKNOWN.` End. No name. The count continues. | Single UI tick |

**Negative add:** no death, no explosion, no white-light afterlife, no "game over" card.

---

## Production notes

- CS-04 dialogue is LITERARY-AUDIT protected — zero paraphrase.
- CS-05 is the only comic-horror cutscene; comedy = form design, not performance.
- CS-08 implements R7 (loop). Never render reactor death.
- Wire order priority: CS-01, CS-03, CS-04, CS-08, CS-05, CS-07, CS-02, CS-06.

> **Canon refs:** `CREATIVE-DIRECTION.md`, `chapter-00-cold-start.md`, `chapter-02-first-blood.md`,
> `STORY-STRUCTURE.md` (reunion), `ENDGAME-B7-REDESIGN.md`, `SIDE-STORIES.md` §5.
