// Release-only identity hydration for accepted whole-ship Blender exports.
// Source bytes remain untouched: one canonical scene-root node must already carry the contract.
export function ensureWholeshipAssetContractMetadata(document) {
  const root = document && typeof document.getRoot === 'function' ? document.getRoot() : null;
  if (!root) throw new Error('wholeship release identity requires a glTF document root');
  const asset = root.getAsset();
  if (asset.extras?.spacefaceAsset) return { source: 'asset' };

  const scenes = root.listScenes();
  const sceneRoots = new Set(scenes.flatMap((scene) => scene.listChildren()));
  const carriers = root.listNodes().filter((node) => node.getExtras()?.spacefaceAsset);
  if (carriers.length !== 1 || !sceneRoots.has(carriers[0])) {
    throw new Error(
      'wholeship release requires exactly one scene-root spacefaceAsset contract '
      + `when asset-level metadata is absent; found ${carriers.length}`,
    );
  }
  const contract = carriers[0].getExtras().spacefaceAsset;
  if (typeof contract.assetId !== 'string' || !contract.assetId.trim()) {
    throw new Error('wholeship release contract requires a non-empty assetId');
  }
  if (contract.slot !== 'hull' || contract.category !== 'wholeships') {
    throw new Error(
      'wholeship release contract must declare slot=hull and category=wholeships; '
      + `got slot=${String(contract.slot)} category=${String(contract.category)}`,
    );
  }
  if (!/^lod[012]$/.test(String(contract.lod || ''))) {
    throw new Error(`wholeship release contract requires lod0, lod1, or lod2; got ${String(contract.lod)}`);
  }

  asset.extras = {
    ...(asset.extras || {}),
    spacefaceAsset: structuredClone(contract),
  };
  return { source: 'canonical-scene-root' };
}
