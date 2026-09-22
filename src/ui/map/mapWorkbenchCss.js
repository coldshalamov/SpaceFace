/** Chart workbench — the flight HUD structural kit, scoped to the map. */
export const MAP_WORKBENCH_CSS = `
#sf-galaxymap {
  --sf-map-accent: var(--dp-lamp);
  --sf-accent: var(--sf-map-accent);
  --sf-accent-rgb: 242 185 80;
  --so-accent: var(--sf-map-accent);
  --k-signal: var(--sf-map-accent);
}
#sf-galaxymap :is(.gm-right-inspector, .gm-apron, .gm-ribbon) {
  border: 14px solid transparent;
  border-image: url("/assets/ui/deckplate/hw/bezel.svg") 30 / 30px / 0 stretch;
  border-radius: 0;
  background-color: var(--dp-metal-2);
  box-shadow: none;
}
#sf-galaxymap button[data-sf-role="primary"] {
  -webkit-appearance: none;
  appearance: none;
  border-style: solid;
  border-color: transparent;
  border-width: 10px 10px 12px;
  border-image: url("/assets/ui/deckplate/hw/keycap.svg") 10 10 12 / 10px 10px 12px / 0 stretch;
  border-radius: 0;
  background-color: var(--dp-metal-3);
  color: var(--sf-map-accent);
}
`;
