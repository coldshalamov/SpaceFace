// Load the operation-specific presentation once, including lazy screen entrypoints.
// No mutation observer, animation loop, or per-frame screen decoration is allocated here.
export function installExperienceStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('sf-command-experience')) return;
  const link = doc.createElement('link');
  link.id = 'sf-command-experience';
  link.rel = 'stylesheet';
  link.href = new URL('../../../styles/command-journey.css', import.meta.url).href;
  doc.head.appendChild(link);
}
installExperienceStyles();
