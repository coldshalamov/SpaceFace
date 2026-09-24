/** Chart workbench -- the flight HUD structural kit, scoped to the map. Printed, not machined
 *  (owner, 2026-09-22): a panel is a flat field, the primary control is the lamp with the cut.
 *  Only the inspector is a field. The foot (route, cargo deck, the navigation answers) is words
 *  on hairlines over the chart: a field across the whole foot printed over the answers. */
export const MAP_WORKBENCH_CSS = `
#sf-galaxymap {
  --sf-map-accent: var(--dp-lamp);
  --sf-accent: var(--sf-map-accent);
  --sf-accent-rgb: 242 185 80;
  --so-accent: var(--sf-map-accent);
  --k-signal: var(--sf-map-accent);
}
#sf-galaxymap .gm-right-inspector {
  border: 14px solid transparent;
  border-image: none;
  border-radius: 0;
  background: var(--dp-field);
  box-shadow: none;
}
#sf-galaxymap button[data-sf-role="primary"] {
  -webkit-appearance: none;
  appearance: none;
  border-style: solid;
  border-color: transparent;
  border-width: 10px 10px 12px;
  border-image: none;
  border-radius: 0;
  background: linear-gradient(225deg, transparent calc(var(--dp-cut) * .7071), var(--dp-lamp) 0);
  color: var(--dp-metal-0);
}
#sf-galaxymap button[data-sf-role="primary"]:is(:disabled, [aria-disabled="true"]) {
  background: linear-gradient(0deg, var(--dp-lamp-dim) 1px, transparent 0);
  color: var(--dp-ink-mute);
}
`;
