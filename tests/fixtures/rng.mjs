// Local deterministic TEST stream, not a claim of matching the native RNG sequence.
export function hash32(...parts) {
 let h=2166136261;
 for(const c of parts.join('|')) h=Math.imul(h^c.charCodeAt(0),16777619);
 return h>>>0;
}
export function mulberry32(seed) {
 let a=seed>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function drawSeeded(owner,key,fallback) {
 const a=((owner[key] || fallback)+0x6D2B79F5)>>>0;owner[key]=a;
 let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
 return ((t^(t>>>14))>>>0)/4294967296;
}
