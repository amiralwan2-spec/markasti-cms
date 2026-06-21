const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const text = fs.readFileSync(htmlPath, 'utf8');
const openTags = [];
const closeTags = [];
const lines = text.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('<script')) openTags.push(i + 1);
  if (line.includes('</script>')) closeTags.push(i + 1);
}
console.log('open tags:', openTags.length, openTags.slice(0, 20));
console.log('close tags:', closeTags.length, closeTags.slice(0, 20));
console.log('first open tag line:', openTags[0], 'first close tag line:', closeTags[0]);
const rx = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;
while ((match = rx.exec(text))) {
  count++;
  const prefix = text.substr(0, match.index);
  const startLine = prefix.split(/\r?\n/).length;
  const block = match[0];
  const endLine = startLine + block.split(/\r?\n/).length - 1;
  console.log(`script ${count}: starts ${startLine}, ends ${endLine}, length ${endLine - startLine + 1}`);
}
if (count === 0) {
  console.error('no script blocks found');
  process.exit(1);
}
