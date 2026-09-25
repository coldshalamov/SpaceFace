// Worker for src/render/renderPackageDigest.js: the SHA-256 of one render package per message, so hashing
// streamed GLB bytes never runs on the game's main thread.
// Protocol: in { id, buffer } (the buffer is transferred), out { id, hex } or { id, error }.
// With { keep: true } the buffer is transferred back on either reply ({ id, hex, buffer } /
// { id, error, buffer }) so the caller keeps its bytes without the main thread ever copying them.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const id = data.id;
  Promise.resolve()
    .then(() => self.crypto.subtle.digest('SHA-256', data.buffer))
    .then((digest) => {
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      if (data.keep === true && data.buffer) self.postMessage({ id, hex, buffer: data.buffer }, [data.buffer]);
      else self.postMessage({ id, hex });
    })
    .catch((error) => {
      const message = String((error && error.message) || error);
      if (data.keep === true && data.buffer && data.buffer.byteLength > 0) {
        self.postMessage({ id, error: message, buffer: data.buffer }, [data.buffer]);
      } else {
        self.postMessage({ id, error: message });
      }
    });
});
