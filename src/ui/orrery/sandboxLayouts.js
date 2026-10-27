// sandboxLayouts — the Sandbox dev-harness screen's ORRERY composition home (src/ui/AGENTS.md:
// screen composition lives in src/ui/orrery/*Layouts.js). One injected, idempotent sheet that
// repaints the harness on the Deckplate token root (--dp-*): the old sheet in screens/sandbox.js
// carried the retired --sf-* menu palette and cold blue-grey rest light; this is warm bone at
// rest, the amber Hand on the chosen ladder row, one Lamp Key, and dp-field rails on every input.
// Values reuse the shell's own tokens (ORRERY.md §3.3); the literals are the bone rgb triple the
// library itself prints (src/ui/orrery/lampKey.js BONE) for alphas no token names, plus the
// bone-hot reference var(--orr-bone-hot, #fffdf6) — the token styles/asteroid-ops.css names, the
// literal as fallback because this screen does not sit under .ast-screen.
export const SANDBOX_LAYOUTS_STYLE_ID = 'sf-sandbox-layouts-style';

const SANDBOX_LAYOUTS_CSS = `
/* ── The plate ──────────────────────────────────────────────────────────────────────────────
   One layout model in the game AND on the bench: screenManager writes an inline display:grid on
   every .dp-frame root, which turned this frame into the head/body/foot grid and let the apron
   paint over the ladder. Pin the grid here (the !important outranks the inline grid but not the
   hide path's inline important none): the crest, then the stage as the only scroller, ending at
   the dock band. The frame never scrolls, so the fixed Launch key never moves and nothing in the
   stage can sit under it, at first paint or at any scroll offset. */
.screen.sf-sandbox {
  /* --sf-sandbox-dock is the ONE number for the Launch key's band: key height + its floor gap +
     air above it. The frame reserves it below the stage scroller, the foot scrim covers it, and
     nothing else may restate it. */
  --sf-sandbox-key: 44px; --sf-sandbox-key-floor: 25px;
  --sf-sandbox-dock: calc(var(--sf-sandbox-key) + var(--sf-sandbox-key-floor) + 16px);
  --sf-sandbox-fade: 36px;   /* the stage's own bottom fade, just above the dock band */
  --sf-sandbox-peek: 128px;  /* rail foot + COMBAT LAB tick + the panel's first row, under the ladder */
  max-width: 760px; color: var(--dp-ink); font-family: var(--dp-face-read);
}
.screen.sf-sandbox.dp-frame--screen {
  display: grid !important; grid-template-rows: auto minmax(0, 1fr); grid-template-areas: none;
  overflow: hidden; padding-bottom: var(--sf-sandbox-dock);
  /* The plate's own fill melts into the hero art over its last 120px. Only the background fades —
     the type on it stays at full weight. */
  background: linear-gradient(90deg, var(--dp-metal-0) 0, var(--dp-metal-0) calc(100% - 120px), transparent 100%);
}
/* The stage is the scroller: as a plain flex child it shrank to the leftover space and its
   overflow painted UNDER the apron, slicing scenario cards mid-row. The root carries the 64px
   deckplate margin: the stage adds no left gutter of its own, so the ladder rail lands exactly on
   x64 with the Lamp Key below it. Its last --sf-sandbox-fade px sit under the foot scrim, so
   "more below" always reads; the bottom padding lets the last row scroll clear of that fade. */
.sf-sandbox .sf-stage {
  min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
  padding: 8px 40px var(--sf-sandbox-fade) 0; scroll-padding-bottom: var(--sf-sandbox-fade);
}
/* The foot scrim covers the reserved dock band plus the stage's fade, in the plate's own tone:
   the stage's last rows dissolve into it, and the key stands on a clean field. */
.screen.sf-sandbox.dp-frame--screen::after {
  content: ""; position: fixed; left: 0; bottom: 0; width: min(100%, 760px);
  height: calc(var(--sf-sandbox-dock) + var(--sf-sandbox-fade));
  pointer-events: none; z-index: 4;
  background: linear-gradient(0deg, var(--dp-metal-0) 0, var(--dp-metal-0) var(--sf-sandbox-dock), transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 120px), transparent 100%);
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 120px), transparent 100%);
}

/* ── The crest: the nameplate + the choice dial ─────────────────────────────────────────────
   The crest stacks eyebrow, name, status tick, reading line — one head, not four blocks. The
   dial (the screen's instrument) rides the name row's right end. */
.sf-sandbox .sf-crest {
  display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start;
  gap: calc(var(--dp-u) * 1.5); padding: calc(var(--dp-u) * 7) 40px calc(var(--dp-u) * 3) 0;
}
.sf-sandbox .sf-crest .dp-title__eyebrow {
  letter-spacing: .18em; color: var(--dp-ink-mute); text-shadow: var(--dp-etch-shadow);
}
/* The name row: the display name left, the choice dial right. */
.sf-sandbox .sf-sandbox-namebar {
  display: flex; align-items: center; gap: calc(var(--dp-u) * 4);
  width: 100%; min-width: 0;
}
.sf-sandbox .sf-sandbox-name {
  margin: 0;
  font-family: var(--dp-face-display); font-variation-settings: "wght" 780, "wdth" 100;
  font-size: var(--dp-fs-title); line-height: .92; letter-spacing: -.005em; text-transform: none;
  color: var(--dp-ink); text-shadow: var(--dp-text-legible);
}
.sf-sandbox .sf-sandbox-now {
  font-family: var(--dp-face-label); font-stretch: 112%; font-weight: 600;
  font-size: var(--dp-fs-etch); letter-spacing: .12em; text-transform: uppercase;
  display: inline-flex; align-items: center; gap: calc(var(--dp-u) * 2);
  color: var(--dp-ink); transition: color var(--dp-d-cut) var(--dp-ease-lamp);
}
/* The READY dot is the word's own bone — one light, not a dimmer second state. */
.sf-sandbox-now::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: var(--dp-ink); transition: background var(--dp-d-cut) var(--dp-ease-lamp);
}
/* Invalid keeps the threat channel: it is the form's error state, and the word beside the dot —
   never hue alone — carries the meaning. */
.sf-sandbox-now.is-foe { color: var(--dp-danger-hot); }
.sf-sandbox-now.is-foe::before { background: var(--dp-danger); box-shadow: 0 0 7px var(--dp-danger-bloom); }
.sf-sandbox .sf-menu-save-summary {
  display: block; margin: 0; font-family: var(--dp-face-read);
  font-size: var(--dp-fs-data); line-height: 1.45; color: var(--dp-ink-dim); max-width: 60ch;
}
/* The choice dial: the chosen setup index as an arc gauge (a quantity is an arc). Bone light —
   the amber on this screen is spent on the Hand and the Lamp Key. */
.sf-sandbox-dial { position: relative; width: 112px; height: 112px; flex: none; margin-left: auto; }
.sf-sandbox-dial__svg { display: block; width: 100%; height: 100%; }
.sf-sandbox-dial .orr-lit, .sf-sandbox-dial .orr-lit-bloom { transition: stroke-dasharray var(--dp-d-settle) var(--dp-ease-settle); }
.sf-sandbox-dial__beadg {
  transform-box: view-box; transform-origin: 56px 56px;
  transition: transform var(--dp-d-settle) var(--dp-ease-settle);
}
.sf-sandbox-dial__read {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: calc(var(--dp-u) * 1); pointer-events: none;
}
.sf-sandbox-dial__num {
  font-size: var(--dp-fs-num); color: var(--dp-phos);
  text-shadow: 0 0 10px var(--dp-phos-halo);
}
.sf-sandbox-dial__of {
  font-family: var(--dp-face-label); font-stretch: 112%; font-weight: 600;
  font-size: var(--dp-fs-etch); letter-spacing: .12em; text-transform: uppercase;
  color: var(--dp-ink-mute);
}

/* ── Section heads: major ticks on a rail, not ruled web headings ─────────────────────────── */
.sf-sandbox .sf-section-h {
  margin: calc(var(--dp-u) * 7) 0 calc(var(--dp-u) * 3); color: var(--dp-ink-dim);
  font-family: var(--dp-face-etch); font-variation-settings: "wght" 620, "wdth" 72;
  font-size: var(--dp-fs-etch); letter-spacing: .18em; text-transform: uppercase;
  display: flex; align-items: center; gap: calc(var(--dp-u) * 3);
  text-shadow: var(--dp-etch-shadow);
}
.sf-sandbox .sf-section-h::after, .sf-sandbox .sf-section-h::before { content: none; }
/* Group labels sit ON the ladder's spine: the tick straddles it and the label starts where the
   tick ends. Plain form headers (fine-tune, live tools) keep the bare label: they hang off no rail. */
.sf-sandbox .sf-section-h--rail { position: relative; padding-left: 26px; }
.sf-sandbox .sf-section-h--rail::before {
  content: ""; position: absolute; left: -12px; top: 50%; width: 38px; height: 2px;
  transform: translateY(-50%); background: var(--dp-line-hi);
}

/* ── The ladder: the thirteen setups hang off one vertical scale ────────────────────────────
   The rail sits at the stage's 64px gutter; every row carries its own tick. The ladder is its
   own scroll region ending one peek short of the stage, so the rail foot, the COMBAT LAB tick
   and the top of its panel stay on first paint as the cue that the lab sits below. 160px floor
   = two rows. */
.sf-sandbox-tiles {
  display: flex; flex-direction: column; position: relative; margin: calc(var(--dp-u) * 6) 0 0 -14px;
  padding: 0 0 0 42px;
  max-height: max(160px, calc(100% - var(--sf-sandbox-peek)));
  overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin; scrollbar-color: var(--dp-metal-4) transparent;
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 60px), transparent 100%);
  mask-image: linear-gradient(180deg, #000 calc(100% - 60px), transparent 100%);
}
/* The rest spine: an instrument rail at --dp-rule-hi. The box overhangs the gutter by 14px so
   the scroller never clips the bead or the major ticks' left reach; the spine stays on x64. */
.sf-sandbox-tiles::before {
  content: ""; position: absolute; left: 14px; top: 14px; bottom: 14px; width: 2px;
  background: var(--dp-rule-hi);
}
.sf-sandbox-tiles__group { margin: calc(var(--dp-u) * 4) 0 calc(var(--dp-u) * 0.5) -28px; }
.sf-sandbox-tiles__group:first-child { margin-top: calc(var(--dp-u) * 0.5); }
.sf-sandbox-tile {
  position: relative; flex: 0 0 auto; text-align: left; cursor: pointer;
  border: none; border-radius: 0; outline: none;
  background: transparent; color: var(--dp-ink); padding: 20px 8px 12px 0;
  font-family: var(--dp-face-read);
  transition: color var(--dp-d-cut) var(--dp-ease-lamp), opacity var(--dp-d-cut) var(--dp-ease-settle);
}
.sf-sandbox-tile::before {
  content: ""; position: absolute; left: -28px; top: 50%; width: 12px; height: 2px;
  transform: translateY(-50%); background: var(--dp-line);
  transition: width var(--dp-d-cut) var(--dp-ease-settle), background var(--dp-d-cut) var(--dp-ease-lamp);
}
/* The tick answers the pointer: it grows along the rail and comes up to hi. */
.sf-sandbox-tile:is(:hover, :focus-visible, :focus)::before {
  width: 20px; background: var(--dp-line-hi);
}
/* Press answers too: the row dips while the pointer is down, then the launch fires. */
.sf-sandbox-tile:active { opacity: .8; }
/* The chosen row wears a bone bead on the title centerline plus a 24px amber arm on the title
   cap line — bead + arm, the Hand of this screen, the one warm pointer. */
.sf-sandbox-tile[aria-pressed="true"]::before {
  width: 7px; height: 7px; border-radius: 50%; left: -31px; top: 25px; transform: none;
  background: var(--dp-ink); box-shadow: 0 0 8px color-mix(in srgb, var(--dp-ink) 50%, transparent);
}
.sf-sandbox-tile[aria-pressed="true"]::after {
  content: ""; position: absolute; left: -28px; top: 16px; height: 24px; width: 3px;
  background: var(--dp-hand); box-shadow: 0 0 12px var(--dp-lamp-bloom);
}
.sf-sandbox-tile[aria-pressed="true"] { color: var(--dp-ink); }
/* Nothing just appears (ORRERY.md §3.5): the Hand arm swings down onto the chosen row —
   a short settle from the cap line, reversed instantly by the reduce-motion blanket below. */
@keyframes sf-sandbox-arm-in {
  from { opacity: 0; transform: scaleY(.3); }
  to { opacity: 1; transform: none; }
}
.sf-sandbox-tile[aria-pressed="true"]::after {
  transform-origin: top;
  animation: sf-sandbox-arm-in var(--dp-d-cut) var(--dp-ease-settle);
}
/* Focus is a vertical bone light segment on the title, never a box; the chosen row's amber arm
   already shows where focus sits. Scripted focus matches :focus even where :focus-visible does
   not, so the walk can prove it. */
.sf-sandbox-tile:focus:not([aria-pressed="true"])::after,
.sf-sandbox-tile:focus-visible:not([aria-pressed="true"])::after {
  content: ""; position: absolute; left: -28px; top: 16px; height: 24px; width: 3px;
  background: var(--dp-line-hi); box-shadow: 0 0 12px color-mix(in srgb, var(--dp-ink) 50%, transparent);
}
.sf-sandbox-tile__title {
  font-family: var(--dp-face-label); font-stretch: 104%; font-weight: 700;
  font-size: 15px; letter-spacing: .08em; text-transform: uppercase;
  margin-bottom: 4px; color: inherit;
  transition: color var(--dp-d-cut) var(--dp-ease-lamp);
}
/* Hot rest names the bone-hot token (styles/asteroid-ops.css --orr-bone-hot); the literal is
   the fallback for every host that does not carry the .ast-screen scope. */
.sf-sandbox-tile:is(:hover, :focus-visible, :focus) .sf-sandbox-tile__title { color: var(--orr-bone-hot, #fffdf6); }
.sf-sandbox-tile__desc {
  font-family: var(--dp-face-read); font-size: var(--dp-fs-data); line-height: 1.45;
  text-transform: none; letter-spacing: 0; color: var(--dp-ink-dim);
}
/* The rail foot sits below the fold-limited ladder — a count reading plus a bone position bead
   riding a short scale, so the fold is never a silent cut. The bead follows the chosen row. */
.sf-sandbox-railfoot {
  position: relative; display: flex; align-items: center; gap: calc(var(--dp-u) * 3);
  margin: calc(var(--dp-u) * 3) 0 0; padding-left: 26px;
  font-family: var(--dp-face-label); font-stretch: 112%; font-weight: 600;
  font-size: var(--dp-fs-etch); letter-spacing: .14em; text-transform: uppercase;
  color: var(--dp-ink-mute);
}
.sf-sandbox-railfoot::before {
  content: ""; position: absolute; left: -12px; top: 50%; width: 38px; height: 2px;
  transform: translateY(-50%); background: var(--dp-line-hi);
}
.sf-sandbox-railfoot__track {
  position: relative; width: 64px; height: 2px; flex: none; background: var(--dp-line);
}
.sf-sandbox-railfoot__bead {
  position: absolute; top: 50%; left: 0; width: 5px; height: 5px; border-radius: 50%;
  background: var(--dp-ink); transform: translate(-50%, -50%);
  transition: left var(--dp-d-settle) var(--dp-ease-settle);
}

/* ── Forms: words on rails (dp-field), no boxed inputs ────────────────────────────────────── */
.sf-sandbox-finetune, .sf-sandbox-lab-form {
  align-items: center;
}
.sf-sandbox-finetune { display: grid; grid-template-columns: max-content 1fr; gap: var(--dp-gap) var(--dp-pad); }
.sf-sandbox-finetune label, .sf-sandbox-lab-form label, .sf-sandbox-picker__label {
  color: var(--dp-ink-dim); font-family: var(--dp-face-label); font-stretch: 112%;
  font-weight: 600; font-size: var(--dp-fs-etch); letter-spacing: .1em; text-transform: uppercase;
}
.sf-sandbox-finetune input[type=number],
.sf-sandbox-lab-form input[type=text],
.sf-sandbox-lab-form input[type=number] {
  box-sizing: border-box; width: 100%;
  background: linear-gradient(0deg, var(--dp-rule-hi) 2px, transparent 0);
  border: 0; border-radius: 0; outline: none;
  color: var(--dp-ink); font-family: var(--dp-face-read);
  font-size: var(--dp-fs-data); font-variant-numeric: tabular-nums;
  padding: calc(var(--dp-u) * 2) calc(var(--dp-u) * 2.5); min-height: 34px;
  transition: background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.sf-sandbox-finetune input[type=number]:hover,
.sf-sandbox-lab-form input[type=text]:hover,
.sf-sandbox-lab-form input[type=number]:hover {
  background: linear-gradient(0deg, var(--dp-line-hi) 2px, transparent 0);
}
.sf-sandbox-finetune input[type=number]:focus,
.sf-sandbox-lab-form input[type=text]:focus,
.sf-sandbox-lab-form input[type=number]:focus {
  background: linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0);
  box-shadow: 0 8px 12px -10px var(--dp-lamp-bloom);
}
.sf-sandbox-finetune input[type=number]:disabled,
.sf-sandbox-lab-form input[type=text]:disabled,
.sf-sandbox-lab-form input[type=number]:disabled {
  color: var(--dp-ink-mute); background: linear-gradient(0deg, var(--dp-rule) 2px, transparent 0);
  cursor: default;
}
.sf-sandbox-finetune input[type=number]::-webkit-inner-spin-button,
.sf-sandbox-finetune input[type=number]::-webkit-outer-spin-button,
.sf-sandbox-lab-form input[type=number]::-webkit-inner-spin-button,
.sf-sandbox-lab-form input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.sf-sandbox-finetune input[type=number], .sf-sandbox-lab-form input[type=number] { -moz-appearance: textfield; appearance: textfield; }
/* Seeds and build digests are codes: Spline Sans Mono, codes only (ORRERY.md §3.4). */
.sf-sandbox-lab-form input[type=text], .sf-sandbox .sf-sandbox-lab-digest { font-family: var(--dp-face-code); letter-spacing: .02em; }
.sf-sandbox-finetune input::placeholder, .sf-sandbox-lab-form input::placeholder { color: var(--dp-ink-mute); opacity: 1; }
/* The sf-select widget, borderless on this screen: a quiet field with a bottom rail, the lamp on
   focus — the shared widget's boxed look repaints here, scoped. */
.sf-sandbox .sf-select__field {
  background: linear-gradient(0deg, var(--dp-rule-hi) 2px, transparent 0);
  border: 0; border-radius: 0; color: var(--dp-ink);
  font-family: var(--dp-face-read); font-size: var(--dp-fs-data);
  padding: calc(var(--dp-u) * 2) calc(var(--dp-u) * 2.5); min-height: 34px; box-sizing: border-box;
  transition: background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.sf-sandbox .sf-select__field:hover {
  background: linear-gradient(0deg, var(--dp-line-hi) 2px, transparent 0);
}
.sf-sandbox .sf-select__field:focus-visible {
  outline: none;
  background: linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0);
  box-shadow: 0 8px 12px -10px var(--dp-lamp-bloom);
}
.sf-sandbox .sf-select__field:disabled {
  color: var(--dp-ink-mute); opacity: 1; cursor: default;
  background: linear-gradient(0deg, var(--dp-rule) 2px, transparent 0);
}
.sf-sandbox .sf-select__field svg { color: var(--dp-ink-mute); }
.sf-sandbox .sf-select__opt { color: var(--dp-ink-dim); }
.sf-sandbox .sf-select__opt.is-selected, .sf-sandbox .sf-select__opt.is-active { color: var(--dp-ink); }
/* The open listbox: a solid plate, machined corners — no bordered card, no bleed-through. */
.sf-sandbox .sf-select__list {
  background: var(--dp-metal-0); border: 0; border-radius: 0;
  box-shadow: 0 18px 44px rgb(0 0 0 / .55);
  padding: calc(var(--dp-u) * 1);
}
/* styles/ui.css carries a global *:focus-visible bone ring (!important) — the a11y floor for
   screens with no authored focus. Where this screen AUTHORS its focus (the ladder's light bar,
   the fields' lamp rail, the sf-select field) the ring doubles into a full-width rectangle
   around the row, so the authored replacement outranks it here, scoped; focus stays visible. */
.sf-sandbox .sf-sandbox-tile:focus-visible, .sf-sandbox .sf-sandbox-tile:focus {
  outline: none !important;
}
.sf-sandbox .sf-select__field:focus-visible, .sf-sandbox .sf-select__field:focus {
  outline: none !important;
}
.sf-sandbox .sf-sandbox-finetune input:focus-visible,
.sf-sandbox .sf-sandbox-finetune input:focus,
.sf-sandbox .sf-sandbox-lab-form input:focus-visible,
.sf-sandbox .sf-sandbox-lab-form input:focus,
.sf-sandbox .sf-sandbox-checks input[type=checkbox]:focus-visible {
  outline: none !important;
}
/* Checkboxes: the shared kit repaints every checkbox with the retired accent blue (styles/ui.css
   input[type=checkbox]:checked → background: var(--accent)), and accent-color no-ops under its
   appearance:none. Authored here on the deck instead: a hairline bone frame at rest, the lamp
   field with the kit's dark check when chosen — chosen reads as the screen's one warm state. */
.sf-sandbox .sf-sandbox-checks input[type=checkbox] {
  appearance: none; display: inline-grid; place-content: center;
  width: 14px; height: 14px; margin: 0; padding: 0; border: 0; border-radius: 0;
  background: transparent; box-shadow: inset 0 0 0 1px var(--dp-rule-hi); cursor: pointer;
  transition: box-shadow var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp);
}
.sf-sandbox .sf-sandbox-checks input[type=checkbox]:hover {
  box-shadow: inset 0 0 0 1px var(--dp-line-hi);
}
.sf-sandbox .sf-sandbox-checks input[type=checkbox]:checked {
  background: var(--dp-lamp); box-shadow: inset 0 0 0 1px var(--dp-lamp);
}
.sf-sandbox .sf-sandbox-checks input[type=checkbox]:focus-visible { outline: 2px solid var(--dp-line-hi) !important; outline-offset: 2px; }
.sf-sandbox .sf-select__opt {
  border-radius: 0; padding: calc(var(--dp-u) * 1.5) calc(var(--dp-u) * 2.5);
}
.sf-sandbox .sf-select__opt:hover,
.sf-sandbox .sf-select__opt.is-active {
  background: var(--dp-field-ink-hi); color: var(--dp-ink);
}
.sf-sandbox .sf-select__opt.is-selected { background: var(--dp-field-ink); color: var(--dp-ink); }

/* Toggles: the lamp answers when a box is checked — a small state light, not a second leader.
   (The box itself is authored above; the label carries the row height and hit target.) */
.sf-sandbox-checks { display: flex; flex-wrap: wrap; gap: var(--dp-gap) var(--dp-pad); margin: var(--dp-gap) 0 0; }
.sf-sandbox-checks label {
  display: inline-flex; align-items: center; gap: calc(var(--dp-u) * 2); cursor: pointer;
  color: var(--dp-ink); font-family: var(--dp-face-read);
  font-size: var(--dp-fs-data); min-height: var(--dp-row);
}

/* ── The Combat Lab panel: content on a hairline rail, no boxed panel ─────────────────────── */
.sf-sandbox-lab {
  position: relative; margin: 0 0 var(--dp-gap); padding: calc(var(--dp-u) * 1) 0 0 28px;
  border: none; border-radius: 0; background: none; box-shadow: none;
}
.sf-sandbox-lab::before {
  content: ""; position: absolute; left: 0; top: calc(var(--dp-u) * 2); bottom: calc(var(--dp-u) * 2); width: 2px;
  background: var(--dp-line-faint);
}
.sf-sandbox-lab-form { display: grid; grid-template-columns: max-content 1fr; gap: var(--dp-gap) var(--dp-pad); }
.sf-sandbox-lab-seed { display: flex; gap: var(--dp-gap); align-items: center; min-width: 0; }
.sf-sandbox-lab-seed input { flex: 1; min-width: 0; }
.sf-sandbox-lab-status {
  font-size: var(--dp-fs-etch); grid-column: 1 / -1; display: flex; flex-wrap: wrap;
  gap: var(--dp-gap); align-items: center; min-height: var(--dp-row);
}
.sf-sandbox-lab-status .sf-chip {
  font-size: var(--dp-fs-etch); background: none; border: none; border-radius: 0;
  padding: 0; display: inline-flex; align-items: center; gap: calc(var(--dp-u) * 1.5);
  font-family: var(--dp-face-label); font-stretch: 112%; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase; color: var(--dp-ink);
}
.sf-sandbox-lab-status .sf-chip .sf-chip__dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--dp-ink); box-shadow: none; flex: none;
}
.sf-sandbox-lab-status .sf-chip--danger { color: var(--dp-danger-hot); }
.sf-sandbox-lab-status .sf-chip--danger .sf-chip__dot { background: var(--dp-danger); box-shadow: 0 0 7px var(--dp-danger-bloom); }
.sf-sandbox-lab-issues { font-size: var(--dp-fs-etch); color: var(--dp-danger-hot); line-height: 1.4; }
.sf-sandbox-lab-digest {
  font-size: var(--dp-fs-etch); color: var(--dp-ink-mute);
  grid-column: 1 / -1; line-height: 1.5; word-break: break-all;
}
.sf-sandbox-lab-actions { display: flex; flex-wrap: wrap; gap: var(--dp-pad); grid-column: 1 / -1; margin-top: var(--dp-gap); }

/* ── Kit words on this screen: etched bone, the underline answers on hover/focus ────────────
   (styles/kit.css owns .k-word's behaviour; the palette here is the deck's.) */
.sf-sandbox .k-word {
  color: var(--dp-ink-dim);
  font-family: var(--dp-face-label); font-stretch: 108%; font-weight: 650;
  letter-spacing: .12em; text-transform: uppercase;
}
.sf-sandbox .k-word:is(:hover, :focus-visible, [aria-current="true"], [aria-pressed="true"]) { color: var(--orr-bone-hot, #fffdf6); }
.sf-sandbox .k-word::after { background: var(--dp-line-hi); }
.sf-sandbox .k-word:disabled, .sf-sandbox .k-word[aria-disabled="true"] {
  color: var(--dp-ink-mute); opacity: .55; cursor: default;
}
.sf-sandbox .k-word--danger { color: var(--dp-danger-hot); }
.sf-sandbox .k-word--danger::after { background: var(--dp-danger); }
.sf-sandbox .k-word--primary { color: var(--dp-ink); }

/* Lab runtime + telemetry rows (mounted by crucibleLabControls/Telemetry, kit markup): repaint
   the row rules and type roles onto the deck tokens; classes and behaviour stay the kit's. */
.sf-sandbox .k-rows .k-row { border-bottom: 1px solid var(--dp-rule); }
.sf-sandbox .sf-lab-runtime__hint { color: var(--dp-ink-mute); font-family: var(--dp-face-read); }
.sf-sandbox .k-caps {
  color: var(--dp-ink-mute); font-family: var(--dp-face-label); font-stretch: 112%;
  font-weight: 600; font-size: var(--dp-fs-etch); letter-spacing: .14em; text-transform: uppercase;
}
.sf-sandbox .sf-lab-tel-row .k-row__num, .sf-sandbox .sf-lab-speed-now { color: var(--dp-ink); }
.sf-sandbox .sf-lab-tel-v.is-foe, .sf-sandbox .k-bad { color: var(--dp-danger-hot); }

/* ── Live tools ───────────────────────────────────────────────────────────────────────────── */
.sf-sandbox .sf-apron { padding: 0; margin-top: calc(var(--dp-u) * 3); }
.sf-sandbox-livehint {
  font-size: var(--dp-fs-etch); color: var(--dp-ink-mute); font-style: italic;
  margin-bottom: var(--dp-gap); font-family: var(--dp-face-read);
}
.sf-sandbox-live { display: flex; flex-direction: column; gap: var(--dp-gap); }
.sf-sandbox-picker { display: grid; grid-template-columns: 70px 1fr max-content; gap: var(--dp-gap); align-items: center; }

/* ── The Lamp Key: docked in the reserved band the ladder can never enter ─────────────────── */
.sf-sandbox-launch.sf-sandbox-launch {
  position: fixed; left: var(--dp-margin); bottom: var(--sf-sandbox-key-floor); z-index: 5;
  width: 200px; margin: 0;
  font-size: 15px; letter-spacing: .16em;
}
.sf-sandbox-launch .orr-lampkey__word { width: 100%; text-align: center; }

/* ── Arrival choreography (ORRERY.md §3.5): the crest, then rows tick in, then the key ────── */
.sf-sandbox .orr-rise { animation-delay: var(--orr-delay, 0ms); }

/* ── Responsive: condense, never shrink ───────────────────────────────────────────────────── */
@media (max-width: 1366px) {
  .screen.sf-sandbox { max-width: 600px; }
  .sf-sandbox-dial { width: 96px; height: 96px; }
  .sf-sandbox .sf-sandbox-name { font-size: calc(var(--dp-fs-title) * .82); }
}
@media (max-width: 560px) {
  .sf-sandbox-finetune { grid-template-columns: 1fr; }
  .sf-sandbox-picker { grid-template-columns: 1fr; }
  .sf-sandbox-lab-form { grid-template-columns: 1fr; }
  .sf-sandbox-tile { min-height: 0 !important; height: auto !important; padding: 14px 8px 10px 0; }
  .sf-sandbox-dial { display: none; }
}
/* Touch / phone deck (data-sf-mobile, any width): the global 44px touch floor crushed each
   title+desc tile and stacked them, so the tiles opt out of it and keep their own height. */
html:root[data-sf-mobile="1"] .sf-sandbox-tile {
  flex: 0 0 auto; min-height: 0 !important; height: auto !important;
}
/* The phone deck pads every .screen's foot with an !important 20px; restate the dock band over
   it (plus the home-indicator inset) so the stage still ends above the key on 390x844. */
html:root[data-sf-mobile="1"] .screen.sf-sandbox.dp-frame--screen {
  --sf-sandbox-key: 44px;
  padding-bottom: calc(var(--sf-sandbox-dock) + env(safe-area-inset-bottom, 0px)) !important;
}
/* Short frames (desktop 960x540, landscape phone 844x390): the crest gives back its top air, and
   below 500px of stage height the ladder drops its own bound — the stage alone scrolls. */
@media (max-height: 640px) {
  .screen.sf-sandbox.dp-frame--screen { padding-top: 16px; row-gap: 8px; }
  .sf-sandbox .sf-crest { padding-top: 8px; }
  .sf-sandbox-dial { width: 84px; height: 84px; }
  .sf-sandbox .sf-sandbox-name { font-size: calc(var(--dp-fs-title) * .6); }
}
@media (max-height: 500px) {
  .sf-sandbox-tiles {
    margin-top: 8px; max-height: none; overflow-y: visible;
    -webkit-mask-image: none; mask-image: none;
  }
  .sf-sandbox-dial { display: none; }
}

/* ── Reduced motion and forced colours ────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .sf-sandbox *, .sf-sandbox-dial .orr-lit, .sf-sandbox-dial .orr-lit-bloom, .sf-sandbox-dial__beadg,
  .sf-sandbox-railfoot__bead, .sf-sandbox-tile[aria-pressed="true"]::after { transition: none !important; animation: none !important; }
}
html.sf-reduce-motion .sf-sandbox, html.sf-reduce-motion .sf-sandbox *,
html.sf-reduce-motion .sf-sandbox-tile[aria-pressed="true"]::after,
html.sf-reduce-motion .sf-sandbox-dial .orr-lit, html.sf-reduce-motion .sf-sandbox-dial .orr-lit-bloom,
html.sf-reduce-motion .sf-sandbox-dial__beadg, html.sf-reduce-motion .sf-sandbox-railfoot__bead {
  animation: none !important; transition: none !important;
}
@media (forced-colors: active) {
  .sf-sandbox-tile, .sf-sandbox-lab { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
  .sf-sandbox-launch.sf-sandbox-launch { clip-path: none; }
  .sf-sandbox-launch.sf-sandbox-launch::before { background: ButtonFace !important; }
  .sf-sandbox-tiles::before, .sf-sandbox-tile::before, .sf-sandbox-lab::before,
  .sf-sandbox .sf-section-h--rail::before, .sf-sandbox-railfoot::before,
  .sf-sandbox-railfoot__track { background: CanvasText; }
  .sf-sandbox-tile[aria-pressed="true"]::before, .sf-sandbox-tile[aria-pressed="true"]::after,
  .sf-sandbox-tile:focus:not([aria-pressed="true"])::after,
  .sf-sandbox-railfoot__bead { background: Highlight; box-shadow: none; }
  .sf-sandbox-finetune input, .sf-sandbox-lab-form input, .sf-sandbox .sf-select__field {
    background: Field; color: FieldText; border: 1px solid CanvasText;
  }
  .sf-sandbox-dial__num { color: CanvasText; text-shadow: none; }
}
`;

/** Idempotent: the screen may mount repeatedly; the sheet lands once per document. */
export function injectSandboxLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(SANDBOX_LAYOUTS_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = SANDBOX_LAYOUTS_STYLE_ID;
  s.textContent = SANDBOX_LAYOUTS_CSS;
  doc.head.appendChild(s);
}
