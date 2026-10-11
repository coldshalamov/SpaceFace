// Synchronous codec used only by writer recovery/last-chance quota compaction. Normal loads
// retain the worker/DecompressionStream path. Three's installed fflate is MIT licensed.
import { gzipSync, Inflate, strToU8 } from '../../node_modules/three/examples/jsm/libs/fflate.module.js';
import { SAVE_GZIP_FORMAT } from './saveWorker.js';

const CRC_TABLE = new Uint32Array(256);
for(let i=0;i<256;i++){
  let crc=i;
  for(let bit=0;bit<8;bit++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;
  CRC_TABLE[i]=crc>>>0;
}
function crcUpdate(crc,bytes){
  for(let i=0;i<bytes.length;i++)crc=CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
  return crc;
}
function little32(bytes,at){return (bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16|bytes[at+3]<<24)>>>0;}
function badGzip(){throw new Error('Invalid gzip generation');}

export function gzipSaveEnvelopeSync(raw,envelope){
  const compressed=gzipSync(strToU8(raw),{level:1,mtime:0});
  let binary='';
  for(let i=0;i<compressed.length;i+=0x8000)binary+=String.fromCharCode(...compressed.subarray(i,i+0x8000));
  return JSON.stringify({fmt:SAVE_GZIP_FORMAT,gz:1,version:envelope.version,
    savedAt:envelope.savedAt||null,checksum:envelope.checksum||null,payload:btoa(binary)});
}

/** Decode one canonical gzip generation, bounding output as it arrives (never trust ISIZE).
 * Noncanonical concatenated members are conservatively refused for backup rotation; the
 * ordinary async import/Continue decoder retains its existing behavior for those files. */
export function decodeSaveEnvelopeForWriter(raw,maxBytes,preflight){
  try{
    const wrapper=JSON.parse(raw);
    if(!wrapper||wrapper.fmt!==SAVE_GZIP_FORMAT||typeof wrapper.payload!=='string')return {ok:false,reason:'bad_format'};
    const bounded=preflight?.(wrapper);if(bounded&&!bounded.ok)return bounded;
    const binary=atob(wrapper.payload),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const end=bytes.length-8;
    if(end<10||bytes[0]!==31||bytes[1]!==139||bytes[2]!==8||(bytes[3]&0xe0))badGzip();
    const expectedSize=little32(bytes,end+4);
    if(expectedSize>maxBytes)return {ok:false,reason:'import_too_large',limit:maxBytes,actual:expectedSize};
    const flags=bytes[3];let start=10;
    if(flags&4){if(start+2>end)badGzip();start+=2+(bytes[start]|bytes[start+1]<<8);}
    if(start>end)badGzip();
    for(const flag of [8,16])if(flags&flag){while(start<end&&bytes[start]!==0)start++;if(start>=end)badGzip();start++;}
    if(flags&2){
      if(start+2>end||((crcUpdate(-1,bytes.subarray(0,start))^-1)&65535)!==(bytes[start]|bytes[start+1]<<8))badGzip();
      start+=2;
    }
    if(start>=end)badGzip();
    const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let total=0,crc=-1;
    const inflater=new Inflate((chunk)=>{
      total+=chunk.length;
      if(total>maxBytes){const error=new Error('Decoded save exceeds import limit');error.reason='import_too_large';throw error;}
      crc=crcUpdate(crc,chunk);parts.push(decoder.decode(chunk,{stream:true}));
    });
    // Tiny input slices bound one inflater callback even for a forged gzip size trailer.
    // DEFLATE cannot expand a 256-byte input slice into an unbounded output allocation.
    for(let at=start;at<end;at+=256)inflater.push(bytes.subarray(at,Math.min(at+256,end)),at+256>=end);
    // fflate deliberately ignores bytes after BFINAL. Its consumed-bit cursor must leave
    // only the current padding byte; otherwise a corrupt tail could pass CRC/size while
    // the ordinary gzip decoder refuses it. No second member is accepted by this lane.
    if(!inflater.s.f||inflater.s.l||inflater.p.length>(inflater.s.p?1:0))badGzip();
    if(total!==expectedSize||((crc^-1)>>>0)!==little32(bytes,end))badGzip();
    parts.push(decoder.decode());
    return {ok:true,text:parts.join(''),profile:wrapper.profile};
  }catch(error){return {ok:false,reason:error.reason||'gz_decode_failed'};}
}
