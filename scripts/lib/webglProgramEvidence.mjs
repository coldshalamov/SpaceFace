export function findLinkedProgramActiveAttributes(gl, programs, requiredNames) {
  if (!gl || !Array.isArray(programs) || !Array.isArray(requiredNames)) return [];

  for (const candidate of programs) {
    const handle = candidate && candidate.program ? candidate.program : candidate;
    if (!handle) continue;

    const names = [];
    const count = gl.getProgramParameter(handle, gl.ACTIVE_ATTRIBUTES);
    for (let index = 0; index < count; index++) {
      const info = gl.getActiveAttrib(handle, index);
      if (info && typeof info.name === 'string') names.push(info.name);
    }
    if (requiredNames.every((name) => names.includes(name))) return names;
  }

  return [];
}
