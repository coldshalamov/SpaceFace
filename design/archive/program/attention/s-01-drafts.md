# S-01 drafts — Helios Prime

Three persona drafts. They argue different grounds: the Drifter wants the working shift made
visible, the Archivist wants the sector's own memory to reach back at the player, the Set
Dresser wants the corridors themselves to read.

## The Drifter — "the shift you never see"

Grounds: Helios is where the player sleeps between jobs; the people who keep it running are
invisible. Make third-shift physical and give the lane's anonymous workers a voice.

1. **Departure-furniture POIs on all three gate legs.** A shift-bell buoy on the Ceres leg
   ("Shift Bell 3" — the horn that ends third shift; nobody on first shift has ever heard
   it), a misdeclaration buoy on the Tethys leg ("Misdeclared Marker 12-K" — the manifest
   that named the wrong mass and was never corrected), a lost-freight rack on the Vesta leg
   ("Lost Freight Apron" — unclaimed crates orbit their paperwork).
2. **SCN bark fill** — the working voice behind the stamp: patrols who apologize for the
   form, a dispatcher who knows your manifest is wrong before you do. Six lines into
   `barkSituationFill.js` `faction_scn` scan / patrol-greeting cells.
3. **Ad-board third-shift notices** — the desk advertising to the people it employs:
   locker-room notices, the canteen that only opens at shift change.

Schema: POI rows in `sectors.js` pois[] (inline `pos`, `landmarkGlb`, `discoveryPlate`);
`BARK_SITUATION_FILL.faction_scn` appended lines; `ad_pulse_3xx` entries in `020-ad-board.js`.
Cost: pure data, all three patterns proven in-file.

## The Archivist — "the harbour keeps the list"

Grounds: Helios is the only sector the player will know well enough to *notice it
remembering*. The Pit Line, the Candle Fleet, SPAN-HOLD, Bay 7 — the sector already accretes
memory. Lean into the manifest-wrong register: the record that contradicts itself.

1. **A misfiled-memorial POI** — "Berth 44-C Register Buoy" on the Coalition chord: a transit
   register still recording arrivals for hulls lost at the Pit. The discoveryPlate names the
   contradiction; the Candle Fleet already taught the player why it matters.
2. **Concord Bulletin lines** — six `concord_61..66` ticker entries in the channel's own
   deadpan (manifests filed wrong, corrected, refiled wrong), each tying to a physical thing
   the player can fly past (Bay 7, Checkpoint Niner, the locker).
3. **Maera callback** — she already has a Helios line; leave it. Her coverage is a campaign
   edge, not the surface.

Schema: `sectors.js` POI row; `040-band.js` concord_bulletin line appends. Cost: trivial;
risk: the bulletin's register is so dry that six more of the same shape is wallpaper — needs
the *wrongness*, not just more procedure.

## The Set Dresser — "the corridor is the exhibit"

Grounds: the player spends most Helios time *flying*, not scanning POIs. Dressing that only
exists as a discoveryPlate is radar content; the lane itself should carry the story at
thrust speed.

1. **Gate-leg furniture trio** — same three POIs as the Drifter but chosen for silhouette:
   the tally post, the container rack, the transponder gate — bodies that already draw at
   2-9 WU read against the void on the flown corridor, positioned ON the station→gate
   chords where the camera actually looks.
2. **A worklight cluster near the station apron** — "Third-Shift Stand" — the only lit
   thing on the night side of the ring; the place you dock at 04:00 smells of it.
3. **Skip the bark/ads entirely** — the lane, not the ledger.

Schema: same POI mechanism; explicit `pos` + `landmarkGlb` + `visualRadius` (Tally
precedent). Rejects: text-heavy surfaces — a line the player never opens is not dressing.
