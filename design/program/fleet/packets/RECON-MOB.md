# RECON-MOB — Map the code for the four mobile jobs (read-only, one draft)

**Tier:** D. **Size:** small-medium. You edit no game code. Follow `RECON-NEXT.md`'s draft headings,
but write ONE draft covering rows MOB-01..04 at `design/program/fleet/drafts/MOB.md`.

## The owner's report (iPhone, the Vercel deployment, 2026-11-10)
"I can't pinch to zoom out at all and the HUD takes up most of the screen; it's slow and hitchy on my
iPhone; I don't know if tapping the screen shoots or something; it looks like there's just a tether
button; maybe the HUD is too dark; I can't tell what's going on half the time; zoomed in too far."
Finish lines (`PLAYBOOK.md` §3C): pinch zooms out to the desktop framing; flight HUD ≤ 25 % of a
390×844 screen; every touch control labelled on first use and what a tap does is shown; phones
default to the low quality tier and hold 30 fps in the opening.

## Find and write down (path:line for each)
- **MOB-01 zoom:** the flight camera's zoom/framing owner; whether pinch/wheel zoom exists on desktop;
  how touch events reach the game (`grep -rln "touchstart\|pointerdown\|gesture" src/ui src/systems src/input* | head`);
  whether the page or the canvas blocks pinch (`touch-action`, viewport meta in `index.html`).
- **MOB-02 HUD:** the phone HUD layout (memory: an ORRERY "phone deck" pass shipped stick/wheel/keys;
  `node scripts/ui-bench.mjs --list | grep -i phone` and `--phone`); shoot the flight HUD at 390×844
  (`node scripts/ui-bench.mjs --shot=<id> --phone`), open the PNG and estimate the % of screen the HUD
  covers; list the elements and their sizes.
- **MOB-03 touch controls:** every on-screen touch control, what each does, whether a tap on the open
  canvas fires/aims/latches, and whether anything labels them.
- **MOB-04 quality:** how the quality tier is chosen (`grep -rn "tier" src/render/renderer.js | grep -i
  "gpu\|mobile\|ios\|tier:" | head`), what the phone gets today, and what `tools/probe-ios-safari.mjs`
  measures.
- Anything that explains the past "main menu loops back to the beginning" on Vercel (search
  `vercel.json`, COOP/COEP headers, `crossOriginIsolated`, SharedArrayBuffer fallbacks).

Commit only the draft: `fleet: recon draft MOB`.
