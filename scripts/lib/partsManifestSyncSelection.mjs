export function partsManifestSyncSelection(args, parts) {
  const flags = args.filter(arg => arg === '--only' || arg.startsWith('--only='));
  if (!flags.length) return null; // Preserve existing full-sync behavior.
  if (!args.includes('--sync')) throw new Error('--only requires --sync');
  if (flags.length !== 1 || flags[0] === '--only') throw new Error('Supply one unambiguous --only=id[,id] selection');
  const ids = flags[0].slice('--only='.length).split(',').map(id => id.trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('--only must contain nonempty, distinct IDs');
  const available = new Set(parts.map(part => part.id));
  for (const id of ids) if (!available.has(id)) throw new Error(`Unknown --only part id: ${id}`);
  return new Set(ids);
}

export function shouldSyncPart(selection, id) {
  return selection === null || selection.has(id);
}
