// scratch-brace-scan.cjs — locate the first structural mismatch in a JS source file.
const s = require('fs').readFileSync(process.argv[2], 'utf8');
const stack = [];
let line = 1;
let inStr = null, inBlockComment = false, inLineComment = false;
let prev = '';
const closer = { '(': ')', '{': '}', '[': ']' };
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  const n = i + 1 < s.length ? s[i + 1] : '';
  if (c === '\n') { line++; inLineComment = false; prev = c; continue; }
  if (inLineComment) { prev = c; continue; }
  if (inBlockComment) { if (c === '*' && n === '/') { inBlockComment = false; i++; } prev = c; continue; }
  if (inStr) {
    if (c === '\\') { i++; prev = c; continue; }
    if (c === inStr) inStr = null;
    prev = c; continue;
  }
  if (c === '/' && n === '/') { inLineComment = true; prev = c; continue; }
  if (c === '/' && n === '*') { inBlockComment = true; i++; prev = c; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = c; prev = c; continue; }
  if (closer[c]) { stack.push({ c, line }); prev = c; continue; }
  if (c === ')' || c === '}' || c === ']') {
    const top = stack[stack.length - 1];
    if (top && closer[top.c] === c) stack.pop();
    else {
      console.log(`MISMATCH line ${line}: '${c}' closes nothing (top is '${top ? top.c : 'none'}' from line ${top ? top.line : '-'})`);
      process.exit(0);
    }
  }
  prev = c;
}
if (stack.length) console.log(`UNCLOSED: ${stack.slice(-5).map((x) => `'${x.c}' from line ${x.line}`).join(', ')}`);
else console.log('BALANCED');
