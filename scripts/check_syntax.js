const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const outPath = path.join(__dirname, '..', 'public', 'tmp_extracted.js');
const text = fs.readFileSync(htmlPath, 'utf8');
const rx = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const scripts = [];
let m;
while ((m = rx.exec(text))) {
  scripts.push(m[1]);
}
const combined = scripts.join('\n');
fs.writeFileSync(outPath, combined, 'utf8');
console.log('blocks', scripts.length);
try {
  new Function(combined);
  console.log('js syntax valid');
} catch (err) {
  console.error(err);
  process.exit(1);
}
