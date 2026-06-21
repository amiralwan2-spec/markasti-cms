const fs = require('fs');
const path = require('path');
const [,, startArg, endArg] = process.argv;
const start = parseInt(startArg, 10) || 1;
const end = parseInt(endArg, 10) || start + 30;
const text = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const lines = text.split(/\r?\n/);
for (let i = start; i <= Math.min(end, lines.length); i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
