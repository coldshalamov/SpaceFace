# Station taste review - Kimi K3, 2026-08-23

Commissioned as a TASTE review, not a defect hunt: the structural faults (content destroyed off the
fold, footer collisions, a tab strip that lied about selection) were already fixed and measured, and
the reviewer was told explicitly not to report layout bugs.

Eight frames at 1440x900, captured from the running game immediately before the review:
`.devshots/station-restore/review-now/`.

The owner's standard for this pass: "obvious cheap implementations, need better visual hierarchy,
colour coordination, elimination of vibe-coding antipatterns."

---

# Station screens — taste review

## 1. Cheapest screen

**`tab-industry.png`, and the element is the recipe-chip grid.** Fifteen chips ("REFINED METALS ×2", "SHIELD BOOS…", "MINING B…", "HOLD EXP…", "PELICAN", "MULE") and nearly every one truncates: "REQUIRES REFI…", "TECH L…", "TEC…". Truncated ellipses in a static grid is the single strongest vibe-coding tell in the set — the layout is admitting it doesn't fit its own content. Worse, a T1 refinery recipe and a T4 capital ship ("DRIFTER") are the *same chip* — same size, same color, same weight. There is no visual difference between crafting glue and buying a ship. The giant muddy-brown "REQUIRES REFINERY STATION" disabled button (a brown that appears nowhere else in the UI) and the mostly-empty OUTPUT card with acres of dead navy around it complete the impression of an unfinished screen.

Runner-up: `tab-bar.png`'s transcript area — roughly 40% of the screen is an empty dark box containing one italic sentence and a decorative quote mark the size of a fist.

## 2. Where the eye goes first

- **`00-station-default.png` / `tab-contracts.png`:** the full-width orange ACCEPT + BIND ROUTE slab, fighting the orange RESUPPLY pill in the header. Two orange shouts; the actual contract (title, 420 CR reward, risk) is *third*. The decision should lead; the button should follow. The header resupply warning should not be competing with the page's own content.
- **`tab-market.png`:** CONFIRM PURCHASE, then the big green chart. The chart is the largest element on screen and carries almost no information (a gently rising line). The commodity cards — the actual choice the player makes — are small and identical.
- **`tab-shipworks.png`:** "HITCH" and then the italic joke line "Turns wide. Sluggish under load. Stops badly." — a flavor sentence rendered larger and brighter than every spec on the screen. The center, where the ship should be, is a dashed-cyan crosshair node graph that reads as a debug view.
- **`tab-industry.png`:** the two orange input cards (orange = loud) and the brown disabled button. The pipeline — the actual content — is a wall of same-looking truncated chips at the top.
- **`tab-factions.png`:** the rainbow standing dial. It is the highest-chroma object on the screen and it communicates "0, Neutral." Maximum salience, minimum information — backwards.
- **`tab-bar.png`:** the portrait — correct — but then the eye falls into the transcript void. And "CONTACT ACQUIRED" is stamped in white caps across the bottom of the one piece of real art, cheapening it.
- **`tab-shipworks-focus.png`:** the bright panel against the dimmed background — focus works. But *inside* the panel the eye lands on the red "200 SHORT" / "6,000 SHORT" price blocks, which outrank the module names and stats. Affordability is metadata; it's reading as the headline.

## 3. Colour: accumulated, not coordinated

The base palette (dark navy, teal, orange, white) is fine. The discipline is gone:

- **Orange is doing at least four jobs.** Primary CTA (ACCEPT + BIND ROUTE, CONFIRM PURCHASE), currency/reward (420 CR, 1,577 CR, 85,716 CR), warning (RESUPPLY pill, DISLIKED standings, missing industry inputs), and notification (the "1" badge on MISSIONS, TRACKED). When the loudest color means everything, it means nothing — which is exactly why the ACCEPT button and the RESUPPLY pill fight on the default screen.
- **Green and teal are doing the same job.** ROUTINE is green, ROUTE CLEAR is green, EQUIPPED is green — but ACCEPTED is teal, ACTIVE is teal, and "SOURCE IN MARKET" is teal. Two hues, one meaning ("this is fine / this is on").
- **Orange and red are also doing the same job.** RESUPPLY (orange) and SHORT (red) are both "you have a problem."
- **One-off colors:** the rainbow arc on the factions dial (full spectrum, appears nowhere else), the teal→purple gradient bar under the ship selector in `tab-shipworks.png` (purple exists only there and in Neve Varek's avatar), the olive-khaki GETTING STARTED band, and the brown disabled button in Industry. Four hues used exactly once each — that's accumulation.
- The active tab is marked by **three** simultaneous signals: lighter background, teal underline, orange badge. One fact, three encodings.

## 4. Typography: sizes, not hierarchy

- **Contract cards** (`00-station-default.png`): card title, faction line, and reward figure are all within ~2px of each other, separated only by color. "FIRST TRADE: 8U FUEL CELLS TO CERES" vs "SOLAR CONCORD NAVY · S…" vs "420 CR" — three levels wearing the same size.
- **Shipworks stat bars** (`tab-shipworks.png`): "Agility" and "22.71" are nearly the same size; the value is just brighter. Same for "Top speed / 145". Label and data are peers when data should win.
- **The italic flavor lines outrank data everywhere.** "Turns wide. Sluggish under load. Stops badly." is bigger and higher-contrast than every readout on the ship screen; "They look up as you approach…" in the bar is larger than the dialogue options that are the actual interaction. Flavor text should be the quietest thing on the screen; here it's top-three loudest.
- **Industry chips:** "REFINED METALS ×2" and "T1 · REQUIRES REFI…" are two near-identical lines — name and status indistinguishable.
- The rotated vertical "OUTCOME" label on the contracts screen is a style-over-legibility choice; sideways caps in a data row is a hobbyist flourish.
- The underlined mission title ("First trade: 8u Fuel Cells to Ceres") reads as a hyperlink, not a heading.

## 5. Density

- **Too busy: `tab-market.png`.** Eight category chips (one truncated), three commodity cards carrying six micro-facts each, four explanation columns, a chart, four price stats, a full trade panel, and a ticker. And it's *redundant* busy: "TIGHT CORE" appears three times in the cards and again in the detail column; the 79 CR price appears four times on one screen; "NO CONFLICT" is on every card. Half the pixels are repeats.
- **Too empty: `tab-bar.png`** (the transcript void) and **`tab-industry.png`** (the entire center-bottom: a giant sparse OUTPUT card, then nothing). The bar screen in particular has a portrait, a sentence, and three buttons floating in a hangar of empty navy.

## 6. Three highest-value changes, in order

**1. Ration orange to one job: the primary action.** On `00-station-default.png`, make the reward "420 CR" large *white* numerals (it should outrank "Solar Concord Navy · CARGO DELIVERY", which currently reads louder because it's on the brighter line) and leave orange exclusively on ACCEPT + BIND ROUTE. Demote the header RESUPPLY pill from a filled orange bar to a small outlined chip with an icon. Turn the MISSIONS "1" badge and TRACKED to neutral/teal. Net effect: one orange thing per screen, and it's always the thing you click.

**2. Ban ellipsis in card grids.** Industry chips, contract cards, faction chips, and the relation-field nodes ("CRIMSON RE…", "TRANSPORT A PASSENGER TO…", "REQUIRES REFI…") all truncate. Give these grids two-line cells or wider columns so no label ever cuts. While in there, differentiate by tier: Industry chips should carry a tier color/treatment so T1 recipes and T4 ships aren't identical rectangles, and contract cards should put the reward in a consistent right-aligned column instead of buried in the text stack.

**3. Give Shipworks a ship.** The dashed-cyan constellation with crosshair circles (`tab-shipworks.png`, center) is the most "debug build" element in all eight captures — this is the ship screen and the ship is invisible. Replace the abstract node graph with a hull-shaped schematic (top-down silhouette with hardpoint markers at the actual slot positions); the fitted-module labels already exist, they just need to hang on a ship instead of a constellation. If a rendered hull is out of scope for this pass, even a flat authored silhouette behind the existing nodes removes the single cheapest-looking element in the set.

Immediate cheap wins folded into the above: recolor the factions dial from rainbow to the existing teal↔orange scale; demote all italic flavor lines one step below data values; drop "CONTACT ACQUIRED" off the portrait art and into the INTEL row where it belongs.