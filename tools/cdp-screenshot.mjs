// CDP screenshot using only Node.js built-ins (no ws package needed)
import * as net from 'net';
import * as crypto from 'crypto';
import { writeFileSync } from 'fs';

const HOST = '127.0.0.1';
const PORT = 55139;
const PATH = '/devtools/page/A3DB11CD43B7F5CF6A156D65FA9D34FC';
const OUT = 'tools/antigravity-state.png';

function buildHandshake(host, port, path) {
  const key = crypto.randomBytes(16).toString('base64');
  return {
    request: `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    key
  };
}

function encodeFrame(payload) {
  const data = Buffer.from(payload);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
  const header = data.length < 126
    ? Buffer.from([0x81, 0x80 | data.length, ...mask])
    : Buffer.from([0x81, 0xFE, data.length >> 8, data.length & 0xff, ...mask]);
  return Buffer.concat([header, masked]);
}

let buf = Buffer.alloc(0);
let handshakeDone = false;
let chunks = [];

const { request } = buildHandshake(HOST, PORT, PATH);
const sock = net.connect(PORT, HOST, () => sock.write(request));

function parseFrames(b) {
  while (b.length >= 2) {
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); offset = 4; }
    if (b.length < offset + len) break;
    const payload = b.slice(offset, offset + len);
    b = b.slice(offset + len);
    if (opcode === 1) {
      chunks.push(payload.toString());
      if (fin) {
        const text = chunks.join('');
        chunks = [];
        try {
          const msg = JSON.parse(text);
          if (msg.result?.data) {
            writeFileSync(OUT, Buffer.from(msg.result.data, 'base64'));
            console.log('Screenshot saved to', OUT);
            sock.destroy();
            process.exit(0);
          }
        } catch {}
      }
    }
  }
  return b;
}

sock.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  if (!handshakeDone) {
    const str = buf.toString();
    const end = str.indexOf('\r\n\r\n');
    if (end !== -1) {
      handshakeDone = true;
      buf = buf.slice(end + 4);
      sock.write(encodeFrame(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png', quality: 85 } })));
    }
  } else {
    buf = parseFrames(buf);
  }
});

sock.on('error', e => { console.error(e.message); process.exit(1); });
setTimeout(() => { console.error('timed out'); process.exit(1); }, 8000);
