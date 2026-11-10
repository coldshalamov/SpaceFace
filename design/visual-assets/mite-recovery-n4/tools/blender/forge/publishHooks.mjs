// Explicit hook contracts are validated against real exported geometry before
// the normal publisher installs them in the parts manifest.
export function resolveForgePublishHooks(entry, source) {
  if (!Object.hasOwn(entry, 'hooks')) return entry.layout === 'place' ? [] : ['HOOK_DRIVE_CORE'];
  const hooks = entry.hooks;
  if (!Array.isArray(hooks)
    || hooks.some(hook => typeof hook !== 'string' || !/^(?:LOD[012]_)?HOOK_[A-Za-z0-9_]+$/.test(hook))
    || new Set(hooks).size !== hooks.length) {
    throw new Error('Explicit Forge hooks must be a nonempty, unique list of exact hook node names.');
  }
  if (hooks.length === 0) {
    // Explicit, sealed zero-emissive Brood anatomy is different from omitting a
    // required engine/weapon hook. Sockets, including SIGNAL, remain separate.
    const body = source.asset?.extras?.broodBody;
    const declaredNone = body?.schema === 'spaceface.broodBody.v1'
      && Object.hasOwn(body, 'hooks') && Array.isArray(body.hooks) && body.hooks.length === 0;
    const actualHook = (source.nodes || []).some(node => /(?:^|_)HOOK_[A-Za-z0-9_]+/.test(node.name || ''));
    const actualEmission = (source.materials || []).some(material =>
      material.emissiveTexture || (material.emissiveFactor || []).some(value => value > 0));
    if (!declaredNone || actualHook || actualEmission) {
      throw new Error('Explicit Forge hooks must be a nonempty, unique list; empty hooks require an explicit zero-emissive Brood hook contract and no actual hook geometry.');
    }
  }
  for (const hook of hooks) {
    const nodes = (source.nodes || []).filter(node => node.name === hook);
    const primitives = source.meshes?.[nodes[0]?.mesh]?.primitives || [];
    if (nodes.length !== 1 || nodes[0].extras?.nonRender === true || nodes[0].extras?.collision === true
      || !primitives.length || primitives.some(primitive => {
        const position = source.accessors?.[primitive.attributes?.POSITION];
        const elements = source.accessors?.[primitive.indices] || position;
        return !position || !(position.count >= 3) || !(elements?.count >= 3);
      })) {
      throw new Error(`Explicit Forge hook ${hook} must name one real render mesh.`);
    }
  }
  for (const channel of source.asset?.extras?.ceresWorkfleet?.propulsion?.channels || []) {
    if (!Array.isArray(channel.coreMeshes) || channel.coreMeshes.length !== 3
      || channel.coreMeshes.some((name, lod) => name !== `LOD${lod}_${channel.coreHook}_glow_drive` || !hooks.includes(name))) {
      throw new Error(`Explicit Forge hooks omit an authored LOD core for channel ${channel.id}.`);
    }
  }
  return [...hooks];
}
