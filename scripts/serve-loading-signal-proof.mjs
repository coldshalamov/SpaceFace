import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/')path='/scripts/loading-signal-tableaux-proof.html';const full=resolve(root,'.'+path);if(full!==root&&!full.startsWith(root+sep)){res.writeHead(403).end();return;}const data=await readFile(full);res.writeHead(200,{'Content-Type':types[extname(full)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end('Not found');}});
const port=Number(process.env.PORT)||8765;server.listen(port,'127.0.0.1',()=>console.log(`SpaceFace witness: http://127.0.0.1:${port}/scripts/loading-signal-tableaux-proof.html`));
