const fs = require('fs');
const path = require('path');
const start = parseInt(process.argv[2], 10) || 1;
const end = parseInt(process.argv[3], 10) || start + 20;
const lines = fs.readFileSync(path.join(__dirname, '..', 'live_site.html'), 'utf8').split(/\r?\n/);
for(let i = start; i <= Math.min(end, lines.length); i++) {
  console.log(i + ': ' + lines[i-1]);
}
