**SPACEFACE — COMMS MICRO-POPUPS (CANONICAL EXAMPLES)**

The comms channel is a constant low-grade migraine. These are the lines that scroll past. Most are noise. Some are traps. The best pilots learn to read them the way old sailors read clouds.

Popups appear during flight, during docking, during jump charging. They are not addressed to the player by name. They arrive on shared channels. They are not all for the player. The player is picking up other people's noise, which sometimes contains the only warning they'll get.

---

**AMBIENT NOISE (appears early game, random cycle):**

MERIDIAN EXCHANGE — COMMODITY ALERT: ORE PRICES ADJUSTED. EFFECTIVE IMMEDIATELY.
*(The adjustment is downward. The adjustment was made four cycles ago. The alert is for the old price.)*

CONCORD GATE 3 — NOTICE: INSPECTION PROTOCOL UPDATED. REF 44-C. *(Ref 44-C is the regulation Hale uses to file the second fine.)*

OUTPOST 9 — BAR COMMS: QUINN'S PLACE UNDER NEW MANAGEMENT. SAME RATES. *(Quinn's rates have never changed. Quinn has never not been the management.)*

TYCHO RELAY — WEIGHT VARIANCE NOTICE: SHIPMENT 47-A UNDER REVIEW. CONTACT KESSLER. *(47-A is always under review. Contact Kessler has never resolved anything.)*

DRIFT MINERS COLLECTIVE — CLAIM FILING SUSPENDED: HOLLOW STATION. BACKLOG 22 CYCLES. *(The backlog exists because filed claims are contested by claims filed the same shift by a second crew.)*

BOURSE FREIGHT — CARGO INSURANCE REMINDER: VERIFY SEAL CODES BEFORE TRANSIT. *(The seal code verification system logs to a database Mira has write access to.)*

CONCORD LOGISTICS OVERSIGHT — SECTOR MAINTENANCE ADVISORY: ATMOSPHERIC RECYCLER SERVICE SCHEDULED. SECTORS NOT MEETING VIABILITY THRESHOLD INELIGIBLE. REVIEW REQUIREMENTS UNDER REF 44-C. *(REF 44-C — the same regulation code Hale uses for customs infractions and the same reference number on Vale's contract authorizations — is also the administrative framework for atmospheric viability scoring. The Pit's viability score fell below threshold in year 3. The Pit has not been on this advisory list since year 3.)*

---

**TRAPS (appears mid-game, during jump charging or transit):**

CONCORD PATROL — RANDOM INSPECTION IN PROGRESS. PLEASE HOLD POSITION. *(Inspections are never random. The randomization algorithm was calibrated against a list of ships that paid bribes. Ships that didn't pay are inspected on rotation.)*

MERIDIAN TRANSIT HUB — ACCOUNT ALERT: YOUR LAST SHIPMENT HAS BEEN FLAGGED FOR AUDIT. PLEASE DOCK FOR REVIEW. *(The audit is real. The resolution fee is the bribe amount the shipper declined to pay when the cargo was originally logged.)*

CINDER BOUNTY BOARD — TARGET UPDATE: BOUNTY TAG 7713 EXTENDED. NEW EXPIRY: 72 HOURS. *(Tag 7713 is the player's ship identifier, assigned during a previous Rook transaction. The player's tag is 7714. The difference is one digit. This is either a data error or it isn't.)*

FREE FRONTIER RELAY — DISTRESS SIGNAL: COORDINATES ATTACHED. REWARD POSTED. *(The coordinates are in the contested corridor where Crimson Reach accepts payment to disable drives mid-transit. The reward is posted to a Reach-affiliated account.)*

---

**PERSONAL (appears mid-game, tied to story beats):**

[UNKNOWN ORIGIN] — GOOD HAUL LAST CYCLE. THE BOARD NOTICED. *(The origin traces to Concord Relay 3, forwarded through four stations. This is how Director Vale communicates.)*

CONCORD ADMIN — CONTRACT 47-A: PAYMENT PENDING. PLEASE ADVISE AVAILABILITY. *(This is the first run. This message arrives in B6. The payment amount is correct.)*

[UNDELIVERED — RETURN TO SENDER] — TO: SLATE / PIT SHIPYARD / RE: BERTH 4 / WE KNOW WHICH SEAM. *(Return-to-sender means either Slate moved or the sender didn't survive to check delivery.)*

HOLLOW STATION CLAIM OFFICE — VOSS FILING SUSPENDED: DISPUTE PENDING. NEW CREW ADVISE. *(The second crew. They filed in time. The suspension will be lifted by next cycle. The original claim will be reinstated. The second crew will not be notified.)*

---

**LATE GAME (Phase 3 HUD, B6–B7):**

[CHANNEL UNAVAILABLE] — SENDER BLOCKED. *(The blocked sender is in a log the player can access. The log shows the sender is the player's own ship transponder, from a message the player sent 14 cycles ago. The channel the player sent it on no longer exists. Neither does the intended recipient, per the record.)*

CONCORD REGISTRY — VESSEL STATUS UPDATE: [PLAYER SHIP ID] / STATUS: ACTIVE / OPERATOR: UNKNOWN. *(The player's name has been removed from the vessel registry. Not deleted — the field reads "UNKNOWN." The removal date is the same date as the B5 cargo audit.)*

ASHFALL REACH — SIGNAL DETECTED: LONG-FORM TRANSMISSION. SOURCE: DERELICT STATION. CONTENTS: ADMINISTRATIVE LOG — 11 YEARS. RECEIVING? *(This is the first contact with the Kurtz figure's station. It arrives as a comms popup, not a mission. The player can dismiss it. It comes back next cycle. And the next.)*

---

**THE RULE:**

Most popups are not for the player. Some are.
The ones that are for the player are the ones that don't address them by name.
The ones that do address them by name are the traps.
The ones that contain reference numbers the player has seen before are the warnings.
The best pilots learn to tell the difference.
The best pilots also know that learning to tell the difference is how you end up knowing too much.

---

**Design notes:**

- Popups should fire on timer + conditional (e.g., CONCORD INSPECTION fires when player has contraband AND is in a high-security sector AND has been in that sector for more than 90 seconds)
- The CONTRACT 47-A payment popup should fire exactly once, during B6. If dismissed, it does not return. If accepted, it marks the player on the Vale roster.
- The VESSEL STATUS UPDATE ("OPERATOR: UNKNOWN") should be a Phase 3 HUD popup that appears after B6 completion and stays in the notification log even when cleared.
- The Ashfall Reach transmission popup should persist across sessions until the player flies to that sector.
