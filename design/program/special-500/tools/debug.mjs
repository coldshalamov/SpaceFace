import fs from 'node:fs';
const text = fs.readFileSync('design/program/special-500/round3/debater-a-final.md', 'utf8');
console.log('has heading via includes:', text.includes('## FINAL-BALLOT'));
const re = new RegExp('^##\s+FINAL-BALLOT\s*$', 'mi');
const m = text.match(re);
console.log('regex match:', !!m, m && m.index);
const simple = text.match(/^## FINAL-BALLOT$/m);
console.log('simple match:', !!simple, simple && simple.index);
